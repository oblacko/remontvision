# История работ (что сделано)

Дата сборки: 2026-10-26. Статус: приложение работает локально и на VPS, автодеплой настроен.

## Инфраструктура

- **Репозиторий**: https://github.com/oblacko/remontvision (private), автор коммитов `Oblacko <yaoblacko@gmail.com>`.
- **VPS**: `root@77.222.38.7` (Ubuntu 24.04, Docker 29.9 + compose v5.6). Проект: `/root/remontvision`. Доступ по ключу `~/.ssh/rv_vps` (локально у разработчика и в секретах GitHub Actions), git pull — read-only deploy-key `rv_deploy`.
- **Автодеплой**: пуш в `main` → GitHub Actions (`.github/workflows/deploy.yml`) → SSH → `git pull` + `docker compose up -d --build` + `docker image prune -f`. Секреты репо: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`. `.env` на сервере деплоем не трогается.
- **Postgres 16** в compose (том `pgdata`), миграции из `migrations/*.sql` накатываются при старте app-контейнера (учёт в `_migrations`). Файлы (загрузки/рендеры/фото товаров) — в томе `appdata`, есть слой S3 (`src/storage.js`, reg.cloud `https://s3.regru.cloud`), включается переменными `S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY` в `.env`.
- **Важно про окружение**: переменная БД называется `RV_DATABASE_URL`, не `DATABASE_URL` — стандартное имя глобально экспортировано в `~/.bashrc` другим проектом (paperclip) и перебивает `--env-file`. На машине разработчика чужой `DATABASE_URL` указывает на Postgres проекта paperclip — никогда не использовать.
- **Прокси**: OpenRouter WAF блокирует диапазон IP хостера VPS (`403 Access denied by security policy`). На сервере в `.env` задан `HTTPS_PROXY=http://<user>:<pass>@95.164.203.249:9367` (тот же хост принимает и socks5). Код читает его в `src/openrouter.js` через undici ProxyAgent (undici v6 — v7 требует Node 22+).
- **Прод-доступ**: `https://www.remontvision.ru` — nginx (HTTP/2, gzip, HSTS, security-заголовки) проксирует на `127.0.0.1:3000`; TLS — Let's Encrypt, автопродление `certbot.timer` (дважды в сутки, dry-run проверен). `APP_URL` на сервере — `https://www.remontvision.ru`. Порт приложения наружу закрыт (`127.0.0.1:3000` в compose).
- **SEO**: title/description/keywords, canonical, Open Graph/Twitter, JSON-LD (`WebSite`, `Organization`, `WebApplication`, `FAQPage`), видимый блок «О сервисе» с FAQ, `robots.txt`, `sitemap.xml`, SVG-favicon.

## Функциональность (сделано)

- Рендер ремонта по фото через OpenRouter: `chat/completions` с модальностью image, фолбэк на `/images`; таймаут 120 с + экспоненциальный бэкофф (`fetchWithRetry`); ретрай на `RENDER_MODEL_FALLBACK` с суммированием затрат.
- Валидация slug'ов моделей при старте (`assertConfig`) — падение до приёма трафика при неверном `RENDER_MODEL`.
- **Новое ядро каталога**: товары отбираются ДО генерации (`src/curate.js`: бюджет раскладывается по категориям + теги стиля), до 4 фото товаров уходят в генерацию как `input_references`, смета = отобранные товары. Итерации наследуют смету родителя. Если каталог пуст — фолбэк на vision-разбор + словесный матчинг.
- Aspect ratio рендера = реальные пропорции фото (`src/imagesize.js`, без зависимостей; вертикальные фото не портятся).
- Полное логирование себестоимости: `cost_image_usd` + `cost_vision_usd` = `cost_usd` в json-логе и в `renders`. Фактически ~$0.069/рендер (картинка $0.0688 + vision $0.0024).
- Аутентификация по e-mail (OTP 6 цифр, 10 мин, 5 попыток; без `SMTP_URL` код падает в лог). Сессии httpOnly-кука. Таблица `auth_identities` — заделка под OAuth (yandex/vk/mailru), склейка аккаунтов по e-mail.
- Оплата ЮKassa: пакеты `2×99₽ / 5×229₽ / 15×599₽` (`src/payments.js`), кредиты-ledger (`credit_txn`, баланс = SUM), атомарное списание (блокировка строки users), идемпотентный webhook (переспрашивает статус у ЮKassa, начисляет однократно). Регистрация даёт 1 кредит. Итерации стоят 1 кредит (401 анониму, 402 при нуле).
- Админка каталога: `GET/POST/PUT/DELETE /api/admin/products` с заголовком `X-Admin-Key`, загрузка фото файлом (`image=`) или `image_url`; UI на `#admin` (ключ хранится в localStorage браузера).
- UI: вход/регистрация, баланс в шапке, покупка кредитов (редирект на ЮKassa, после возврата поллинг баланса), обработка 401/402 в чате правок, фото товара и ссылка в смете.
- Rate limit in-memory (5 задач/час/IP на `POST /api/rooms`, `/iterate`, коды auth; `RATE_LIMIT_MAX=0` выключает).

## Исправленные баги (важно помнить)

- **Двойная генерация**: воркер не менял статус queued при старте — два слота брали одну задачу, каждый рендер оплачивался дважды. Лечится атомарным `UPDATE ... RETURNING` в `claimNextRender`.
- Модель возвращала JPEG, сохранялся как `.png` — теперь расширение определяется по сигнатуре байтов (`detectImageExt`).
- `npm start` игнорировал `.env` (нет dotenv) — исправлено через `--env-file` (Node ≥ 20.6).
- `spendCredit`: `FOR UPDATE` с агрегатом невалиден в Postgres — блокируем строку `users`.

## Не сделано (очередь)

- Вотермарка на бесплатных рендерах (sharp, вшивать в файл на сервере).
- Импорт каталога с сайтов поставщиков (таблица `suppliers` готова; LLM-нормализация; правило свежести цен: ответ LLM > сайт > старое, с датой и источником; фильтр по сайтам в матчинге).
- Матчинг на эмбеддингах (SigLIP/CLIP) вместо пересечения ключевых слов.
- Оценка размеров комнаты (metric depth — отдельный GPU-сервис).
- PDF-смета (pdfkit/puppeteer), переключатель версий рендера в UI (`parent_render_id` уже пишется), TTL-чистка `data/`, аналитика воронки, рефералка.
- Прод-конфиг VPS: `YUKASSA_SHOP_ID/SECRET`, `SMTP_URL`, опционально отключить SSH по паролю.

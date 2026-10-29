# Эксплуатация

## Окружения

| | Local | Prod |
|---|---|---|
| URL | `http://localhost:3000` | `https://www.remontvision.ru` |
| БД | Docker Postgres `127.0.0.1:5434` | Docker Postgres, том `pgdata` |
| Файлы | `data/` | том `appdata` или S3 |
| Модели | `.env` / mock | `app_settings` |
| Секреты | `.env` | `/root/remontvision/.env` |

## Переменные окружения

Значения — только placeholder; реальные секреты не коммитить.

```bash
# Core
PORT=3000
APP_URL=https://www.remontvision.ru
RV_DATABASE_URL=postgres://user:pass@host:5432/db
ADMIN_KEY=<admin-key>

# OpenRouter
OPENROUTER_API_KEY=<key>
RENDER_MODEL=black-forest-labs/flux-3-image
VISION_MODEL=google/gemini-3-flash-preview
RENDER_RESOLUTION=1K
RENDER_ASPECT_RATIO=auto
OPENROUTER_TIMEOUT_MS=120000
HTTPS_PROXY=<optional-proxy-url>

# Auth/mail
RESEND_API_KEY=<key>
RESEND_TEMPLATE_ID=<id>
MAIL_FROM=<from>
MAIL_REPLY_TO=support@remontvision.ru
SESSION_DAYS=365

# Payments
PAYMENTS_ENABLED=true
REFUNDS_ENABLED=false
PAYMENT_PROVIDER=robokassa
ROBOKASSA_LOGIN=<merchant-login>
ROBOKASSA_PASSWORD_1=<password-1>
ROBOKASSA_PASSWORD_2=<password-2>
ROBOKASSA_PASSWORD_3=<password-3>
ROBOKASSA_TEST=0
ROBOKASSA_HASH_ALGO=md5
ROBOKASSA_RECEIPT_ENABLED=1
# YUKASSA_SHOP_ID=<id>
# YUKASSA_SECRET_KEY=<key>

# Catalog import
PRODUCT_IMPORT_DOMAINS=market.yandex.ru,leroymerlin.ru,...

# Storage (optional)
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=
```

Особенности:

- `RV_DATABASE_URL`, не `DATABASE_URL` — стандартная переменная может быть занята другим проектом.
- `APP_URL` нужен для платёжных return/webhook и share-ссылок.

## Robokassa

В кабинете Robokassa → «Технические настройки» укажите:

| Поле | Значение |
|---|---|
| ResultURL | `${APP_URL}/api/payments/robokassa/result` |
| SuccessURL | `${APP_URL}/cabinet/paid` |
| FailURL | `${APP_URL}/cabinet/fail` |
| Метод ResultURL / Success / Fail | GET или POST (обрабатываются оба) |

ResultURL — только серверное уведомление Robokassa (начисление кредитов). SuccessURL/FailURL — возврат браузера пользователя на страницы приложения без query-параметров, чтобы Robokassa могла безопасно добавить свои GET-параметры.

- Алгоритм подписи в кабинете должен совпадать с `ROBOKASSA_HASH_ALGO` (по умолчанию `md5`).
- `ROBOKASSA_PASSWORD_1` — подпись платежа и SuccessURL, `ROBOKASSA_PASSWORD_2` — ResultURL и OpStateExt, `ROBOKASSA_PASSWORD_3` — возвраты.
- `ROBOKASSA_TEST=1` включает `IsTest=1`; используйте тестовую пару паролей, иначе Robokassa вернёт ошибку подписи. В тестовом режиме OpStateExt недоступен — подтверждение приходит только на ResultURL.
- `ROBOKASSA_RECEIPT_ENABLED=1` (по умолчанию) передаёт `Receipt` с номенклатурой: `Доступ к онлайн-сервису генерации дизайна интерьера — пакет на N генераций`, `quantity=1`, `sum=цена пакета`, `payment_method=full_payment`, `payment_object=service`, `tax=none`. Это нужно для Робочеков СМЗ и требований 54-ФЗ. `Receipt` участвует в подписи и передаётся дважды URL-кодированным, как в официальном SDK. Если фискализация ещё не подключена и Robokassa отклоняет чек, временно поставьте `0`.
- Отдельный `RECEIPTS_WEBHOOK_URL` — альтернативный путь чеков. Не включайте его одновременно с Робочеками, иначе будут дубли.
- `PAYMENT_PROVIDER=robokassa` принудительно выбирает провайдера; без переменной Robokassa выбирается автоматически, если заданы её ключи.
- `InvId` = локальный `payments.id`; `provider_payment_id` хранит его же строкой. Начисление кредитов идемпотентно по ResultURL/синхронизации.
- Автоматический возврат Robokassa использует `OpKey` из OpStateExt (миграций не требует). Без `OpKey`/`ROBOKASSA_PASSWORD_3` доступен только ручной возврат.
- Прокси нужен, если OpenRouter блокирует IP VPS; настраивается и в админке.

## Деплой

1. Пуш в `main`.
2. GitHub Actions: SSH на VPS, `git pull`, `docker compose up -d --build`, prune.
3. При старте: миграции → сид каталога → сид style refs → загрузка моделей → прокси → prompt rules → listen.
4. Smoke: `/api/health`, `/`, `/app`.

Откат: `git revert`/предыдущий коммит + пуш; миграции append-only, не удалять.

## Миграции

- Файлы `migrations/NNN_name.sql`, применяются по порядку, учёт в `_migrations`.
- Не редактировать применённые миграции; добавлять новую.
- Перед рискованными изменениями — `pg_dump` на VPS.

## Домен и TLS

- `www.remontvision.ru` — основной, `remontvision.ru` → 301 → www.
- Сертификат Let's Encrypt на оба домена, автопродление `certbot.timer`.
- Nginx: HTTP/2, HSTS, security headers, proxy на `127.0.0.1:3000`.
- Проверка: `certbot renew --dry-run`, `curl -I` apex/www.

## Файлы

- `uploads/` — фото комнат и референсы.
- `renders/` — результаты.
- `products/` — картинки товаров.
- `style-images/` — hero/board.
- S3 включается переменными; иначе диск.
- EXIF/GPS удаляются при загрузке.

## Бэкапы

Сейчас автоматических бэкапов нет. Минимум:

```bash
# на VPS
docker compose exec -T db pg_dump -U remont -d remontvision | gzip > backup-$(date +%F).sql.gz
# файлы
tar czf appdata-$(date +%F).tar.gz /path/to/appdata
```

Хранить вне VPS. Восстановление — в отдельную БД, проверить `_migrations` и ключевые таблицы.

## Мониторинг

Сейчас: Docker logs + `/api/health`. Нет Prometheus/алертов.

Проверять:

- `docker compose ps`
- `docker compose logs app --tail=200`
- `/api/health`
- `render_error`/`config_warning` в логах
- стоимость рендеров (`renders.cost_usd`)

## Типовые проблемы

| Симптом | Причина | Что делать |
|---|---|---|
| `403 Access denied by security policy` | OpenRouter WAF блокирует IP VPS | проверить прокси, `HTTPS_PROXY` или админку |
| `/images 400` | неподдерживаемый параметр/модель | проверить `modelcaps`, у FLUX нет resolution |
| `chat/completions 404` | image-only модель + fallback | не использовать chat fallback для Seedream/FLUX |
| content moderation | FLUX/BFL блокирует фото | переключить на другую модель или препроцессить фото |
| cleanup_error | очистка не удалась | дизайн продолжится с исходника; проверить модель/промт очистки |
| нет сметы | каталог отключён/пуст | проверить `use_catalog`, товары, curated |
| нет approved refs | стиль без approved | админка → стили → approve |
| 402 | нет кредитов | пополнить |
| 409 | рендер ещё идёт | подождать |
| сайт не открывается | DNS/прокси клиента | проверить apex/www, сертификат, локальный DNS |

## Безопасность

- Не логировать ключи/пароли/прокси.
- `ADMIN_KEY` только в заголовке; не в URL.
- Owner-check на комнаты/файлы.
- SSRF-защита в `remoteimage.js`.
- Rate limit на OTP, комнаты, share.
- Не включать возвраты без state machine.

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [API.md](API.md)
- [ROADMAP.md](ROADMAP.md)

## Подбор товаров

Сервис «Найти товары» использует Yandex Search API и allowlist магазинов, а не демо-каталог.

```bash
PROCUREMENT_ENABLED=1
PROCUREMENT_REGION=213
YANDEX_SEARCH_API_KEY=<key>
YANDEX_FOLDER_ID=<folder-id>
PROCUREMENT_DOMAINS=divan.ru,askona.ru,stoolgroup.ru,divanboss.ru,sonum.ru,wooden-world.ru,mebelion.ru,mnogosna.ru,leoparquet.ru,poli24.ru,profiplitka.ru,sanok.ru
PROCUREMENT_MIN_SCORE=80
PROCUREMENT_ALT_SCORE=65
PROCUREMENT_MAX_RUN_COST_USD=0.5
```

- Ключ должен иметь scope `yc.search-api.execute`; нужен активный платёжный аккаунт Yandex Cloud.
- Один запуск стоит 1 кредит. Повторное открытие уже готового списка бесплатно. При ошибке или нуле проверенных товаров кредит возвращается.
- Яндекс Маркет отдаёт серверу SmartCaptcha, поэтому он исключён из allowlist. Discovery идёт по обычной выдаче, карточки проверяются только в магазинах из allowlist.
- Цены и наличие сохраняются на момент проверки. Это список товаров, не смета: количества и итог появятся отдельным этапом.
- Если нужно временно выключить: `PROCUREMENT_ENABLED=0` и пересоздать контейнер.

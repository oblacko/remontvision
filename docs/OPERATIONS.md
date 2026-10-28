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
YUKASSA_SHOP_ID=<id>
YUKASSA_SECRET_KEY=<key>

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

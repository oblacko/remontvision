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

```bash
# Core
PORT=3000
APP_URL=https://www.remontvision.ru
RV_DATABASE_URL=postgres://user:pass@host:5432/db
ADMIN_KEY=<admin-key>

# OpenRouter
OPENROUTER_API_KEY=<key>
RENDER_MODEL=black-forest-labs/flux-3-image
VISION_MODEL=google/gemini-3.1-pro-preview
ART_DIRECTOR_MODEL=deepseek/deepseek-v4.1-flash-1017
LAYOUT_MODEL=deepseek/deepseek-v4.1-flash-1017
RENDER_RESOLUTION=1K
RENDER_ASPECT_RATIO=auto
OPENROUTER_TIMEOUT_MS=120000

# Очередь и скорость
WORKER_CONCURRENCY=6              # 1–8
IMAGE_MIN_GAP_MS=0                # пауза между image-вызовами
PARSE_AUTO=0                      # 1 — авто-разбор после раннего done (платно)
# Direction кэшируется в room_analysis; отдельного DIRECTION_CACHE_* нет

# Auth/mail
RESEND_API_KEY=<key>
MAIL_FROM=<from>
SESSION_DAYS=365
OTP_RESEND_SECONDS=60

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

# Storage (optional; иначе диск)
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=
```

`RV_DATABASE_URL` — не `DATABASE_URL` (стандартная переменная может быть занята другим проектом). Node ≥ 20.19.

## CI и деплой

1. Пуш в `main`.
2. GitHub Actions `ci`: backend unit + integration (Postgres service), web lint/build, catalog pytest.
3. `deploy`: job `test` → SSH на VPS → `git pull` → `docker compose up -d --build` → prune.
4. При старте: миграции → сиды → конфиги → listen.
5. Smoke: `/api/health`, `/`, `/app`, `/offer`.

Деплой не запускается без зелёного `test`. Откат: revert/предыдущий коммит + пуш; миграции append-only. [ops/ROLLBACK.md](ops/ROLLBACK.md).

## Миграции

- `migrations/NNN_name.sql`, по порядку, учёт в `_migrations`.
- Применённые не редактировать; только новые файлы.
- Текущий диапазон: `001–061`; файла `048` нет (историческое переименование `046/047 → 048/049`).
- Перед рискованными изменениями — `pg_dump` на VPS.

## Очередь рендеров

| Параметр | Значение |
|---|---|
| Claim | `FOR UPDATE SKIP LOCKED`, lease 5 мин, `claimed_by` |
| Heartbeat | каждые 30 с |
| Requeue | только истёкшие lease; раз в 5 мин |
| Reaper | queued > 24 ч или processing > 60 мин → error + refund |
| Параллелизм | `WORKER_CONCURRENCY` (1–8) |
| Image-слот | семафор в процессе: система/провайдер/пользователь (`imageslot.js`) |
| Cleanup | асинхронно на первом enqueue; статус в `rooms.cleanup_status`, shell в `rooms.precleaned_shell_path`, до 3 попыток |

Проверка очереди:

```sql
SELECT status, count(*) FROM renders GROUP BY status;
SELECT count(*) FROM renders WHERE status='queued';
SELECT id, status, started_at, lease_expires_at FROM renders
WHERE status='processing' ORDER BY started_at LIMIT 20;
```

Проверка cleanup:

```sql
SELECT cleanup_status, count(*) FROM rooms GROUP BY cleanup_status;
SELECT id, cleanup_status, cleanup_attempts, cleanup_started_at, cleanup_error
FROM rooms WHERE cleanup_status IN ('processing','error') ORDER BY cleanup_started_at LIMIT 20;
```

Кэш анализа комнаты можно сбросить вручную: `DELETE FROM room_analysis;` (только по команде владельца). Метрики и canary: [ops/QUEUE-CAPACITY.md](ops/QUEUE-CAPACITY.md).

## Платежи (Robokassa)

| Поле | Значение |
|---|---|
| ResultURL | `${APP_URL}/api/payments/robokassa/result` |
| SuccessURL | `${APP_URL}/cabinet/paid` |
| FailURL | `${APP_URL}/cabinet/fail` |
| Метод | GET или POST |

- `ROBOKASSA_PASSWORD_1` — платёж и SuccessURL, `_2` — ResultURL/OpStateExt, `_3` — возвраты.
- `ROBOKASSA_TEST=1` — тестовая пара паролей.
- `ROBOKASSA_RECEIPT_ENABLED=1` — чек 54-ФЗ; при проблемах временно `0`.
- `InvId` = локальный `payments.id`; начисление идемпотентно.
- Возвраты: `REFUNDS_ENABLED=false`; ручной режим.
- ЮKassa — fallback.

## Файлы

- `uploads/` — фото и референсы; `renders/` — результаты; `products/`, `style-images/`.
- S3 включается переменными; иначе диск.
- EXIF/GPS удаляются при загрузке.

## Бэкапы

Процедура: [ops/BACKUP-RESTORE.md](ops/BACKUP-RESTORE.md), скрипт `scripts/ops/backup.sh`.

**Текущий статус (2026-11-11):** последний бэкап 45 ч назад, в manifest **нет `db_dump`**, off-site не настроен. Это CRIT — до запуска нужно восстановить регулярный дамп и копию вне VPS.

```bash
cd /root/remontvision
./scripts/ops/backup.sh                 # БД + файлы
./scripts/ops/backup.sh --db-only       # перед миграцией
./scripts/ops/restore-verify.sh --latest
```

## Мониторинг

Процедура: [ops/MONITORING.md](ops/MONITORING.md). Инциденты: [ops/RUNBOOK.md](ops/RUNBOOK.md).

**Текущий статус:** Docker logs + `/api/health` + `scripts/ops/daily-check.sh` вручную; внешнего монитора и алертов нет.

```bash
cd /root/remontvision
./scripts/ops/daily-check.sh
./scripts/ops/smoke.sh
```

Daily-check от 2026-11-11: здоровье/контейнеры OK; **диск 91% CRIT**, бэкап 45 ч CRIT, нет `db_dump` CRIT.

## Типовые проблемы

| Симптом | Причина | Что делать |
|---|---|---|
| `403 Access denied by security policy` | OpenRouter WAF блокирует IP VPS | проверить прокси (`HTTPS_PROXY`/админка) |
| `/images 400` | неподдерживаемый параметр/модель | проверить `modelcaps`; FLUX 2 Pro без resolution |
| content moderation | BFL блокирует фото | другая модель/препроцессинг |
| рендер висит `processing` | воркер/сеть зависли | ждать reaper (60 мин) или `requeueProcessing` после lease |
| два воркера обрабатывают одно | старый код без `claimed_by` | проверить миграцию `053`, версию app |
| нет сметы | design-first/демо-каталог | это ожидаемо для новых рендеров |
| нет approved refs | режим `text`/стиль без approved | режим `reference` + approve в админке |
| 402 | нет кредитов | пополнить |
| 409 | рендер ещё идёт | подождать |
| `/app` 301 | старый редактор удалён | использовать `/` |

## Безопасность

- Не логировать ключи/пароли/прокси.
- `ADMIN_KEY` только в заголовке.
- Owner-check на комнаты/файлы.
- SSRF-защита в `remoteimage.js`; внешние картинки — только `fetchRemoteImage`.
- Rate limit на OTP, комнаты, share.
- Не включать возвраты без state machine.

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [STATUS.md](STATUS.md)
- [ROADMAP.md](ROADMAP.md)
- [ops/README.md](ops/README.md)

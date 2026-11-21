# docs/ops — эксплуатация

Операционные документы и скрипты для прода `https://www.remontvision.ru`.
Задача REM-14, gates **G4** (восстановление данных) и **G8** (мониторинг).

## Состав

| Файл | Назначение |
|---|---|
| [BACKUP-RESTORE.md](BACKUP-RESTORE.md) | бэкапы БД/файлов, хранение вне VPS, протокол restore |
| [MONITORING.md](MONITORING.md) | внешний uptime, алерты, ежедневная проверка, `render_error` |
| [ROLLBACK.md](ROLLBACK.md) | откат релиза и БД, smoke после отката |
| [RUNBOOK.md](RUNBOOK.md) | действия при инцидентах |
| [CHECKLIST-G4-G8.md](CHECKLIST-G4-G8.md) | чек-лист готовности и текущий статус |

Скрипты: `scripts/ops/backup.sh`, `restore-verify.sh`, `daily-check.sh`, `smoke.sh`.

## Быстрые команды (на VPS)

```bash
cd /root/remontvision

# бэкап БД + файлов (после настройки remote уходит вне VPS)
./scripts/ops/backup.sh

# только БД (быстро, перед миграцией/деплоем)
./scripts/ops/backup.sh --db-only

# проверка восстановления последнего бэкапа в чистую БД
./scripts/ops/restore-verify.sh --latest --report /root/rv-backups/restore-$(date +%F).md

# ежедневная проверка: health, диск, контейнеры, бэкапы, ошибки
./scripts/ops/daily-check.sh

# smoke после деплоя/отката
./scripts/ops/smoke.sh
```

## Статус на 2026-11-21

| Проверка | Статус | Доказательство |
|---|---|---|
| Дамп БД снимается | ✅ | `/root/rv-backups/20261121-031501/db-remontvision-*.dump`, sha256 = manifest |
| Restore БД в чистую БД | ✅ PASS | 49 таблиц, users=6, rooms=132, renders=204, payments=16, products=110, migrations=64 |
| Архив файлов снимается | ✅ | `20261121-031501`, 341 MB, 1048 записей |
| Архив файлов читается | ✅ PASS | gzip + sha256 + путей вне каталога нет, `.env` не входит |
| Расписание cron | ✅ | бэкап `15 3 * * *`, `daily-check --strict` каждый час |
| Копия **вне VPS** | ❌ нет | rclone не установлен, `RV_BACKUP_REMOTE` не задан |
| Внешний uptime-алерт | ❌ нет | нет аккаунта/канала алертов |
| Ежедневный `render_error` / платежи | ⚠️ отчёт есть | `daily-check` пишет в `check.log`; доставки и разбора автоматом нет |
| Runbook | ✅ | [RUNBOOK.md](RUNBOOK.md) |
| Smoke на проде | ✅ PASS | `scripts/ops/smoke.sh`, 2026-11-21 |

**Вывод:** бэкап, restore, расписание и smoke проверены. G4 не закрыт без копии вне VPS
(владелец отложил 2026-11-21 — принятый риск) и escrow `.env`, G8 — без внешнего
монитора, Telegram-канала и тестового алерта.

## Ограничения

- Диск VPS на 2026-11-21 занят на **39%** (свободно ~23 GB); 7 локальных копий — 2.3 GB.
  Глубокое хранение всё равно должно быть на remote, а не на VPS.
- `.env` и секреты в ежедневный бэкап **не входят**: их резервная копия должна храниться отдельно у владельца (менеджер паролей / зашифрованный архив).
- Каталог `catalog-db` (≈900 MB, 36k офферов + эмбеддинги) — восстанавливаемый, но дорогой: дампится в weekly-бэкап, не в daily.
- Автоматического мониторинга 429/платежей и APM/Sentry нет; ежедневная проверка — минимальный уровень.

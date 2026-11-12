# Мониторинг и алерты (G8)

Цель G8: падение `/api/health` даёт алерт **≤ 5 минут**, а `render_error` и платежи
кто-то смотрит каждый день. Сейчас есть только Docker logs и ручной health-check.

## Уровни

| Уровень | Что | Реакция |
|---|---|---|
| P1 | сайт/health недоступен, БД лежит, диск 100% | поднять немедленно, [RUNBOOK.md](RUNBOOK.md) |
| P2 | доля `render_error` > 25%, платежи не начисляются, бэкапа нет > 26 ч | в течение дня |
| P3 | диск > 80%, TLS < 14 дней, 429, единичные ошибки | плановая задача |

## 1. Внешний uptime-чек (обязательно)

Монитор должен быть **вне VPS**: если сервер/сеть/nginx упали, локальный cron ничего
не отправит.

Рекомендуемый вариант — **Better Stack** (интервал 3 мин, бесплатный тариф) или
**UptimeRobot** (интервал 5 мин). Настроить:

- URL: `https://www.remontvision.ru/api/health`
- метод: GET, ожидать HTTP 200;
- keyword: `"ok":true` (ловит «200, но приложение нездорово»);
- интервал: 3–5 мин, alert после **1** неудачной проверки (иначе SLO > 5 мин);
- контакты: e-mail владельца + Telegram (см. ниже);
- второй монитор (опционально): `https://www.remontvision.ru/` с keyword `id="root"` —
  ловит падение фронта/nginx при живом API.

После создания монитора нажать **Test notification** и сохранить скрин/запись.

### Канал алертов

Нужен один рабочий канал (выбрать с владельцем):

1. **Telegram-бот** — лучший по скорости: создать бота у `@BotFather`, получить token,
   узнать `chat_id`, добавить в Better Stack/UptimeRobot интеграцию Telegram.
2. **E-mail** — на `support@remontvision.ru` или личный адрес владельца. На VPS уже есть
   `RESEND_API_KEY` и `MAIL_FROM`, но для внешнего монитора проще встроенная почта сервиса.
3. **SMS** — платно, не требуется на старте.

Секреты бота/сервиса хранить у владельца, не в репозитории.

### План Б без внешнего аккаунта

GitHub Actions по расписанию (`*/5 * * * *`) дергает health и при ошибке открывает issue
в репозитории. Это внешняя проверка, но GitHub может задерживать cron на 5–15 минут,
поэтому SLO ≤ 5 мин не гарантируется. Использовать только как временный fallback.
Workflow должен попасть в `main`, а пуш в `main` запускает деплой — нужно разрешение.

## 2. Внутренняя ежедневная проверка

`scripts/ops/daily-check.sh` (только чтение) проверяет:

- `/api/health` локально и публично, `ok:true`;
- контейнеры `app`, `db`, `catalog`, `catalog-db`, unhealthy/restarting;
- диск и inodes (`warn 80%`, `crit 90%`);
- свежесть бэкапа (`> 26 ч` — CRIT), наличие `db_dump`, `files_archive`, `remote=`;
- TLS-сертификат (`< 14 дн` — WARN, `< 7` — CRIT);
- логи за 24 ч: `render_done`, `render_error`, `render_timeout`, `credit_restored`,
  `payment_created`, `webhook_error`, строки с `429`;
- доля `render_error` от `done+error`: WARN ≥ 10%, CRIT ≥ 25%;
- топ `stage` ошибок и последние 5 ошибок (обрезаны до 300 символов).

Запуск вручную:

```bash
cd /root/remontvision
./scripts/ops/daily-check.sh
```

Cron (после разрешения): `15 9 * * *` с `--strict` и логом в
`/var/log/remontvision-daily.log`. `--strict` возвращает код 1 и на WARN, чтобы сбой
был заметен в cron-почте/логе.

Порог доли ошибок меняется переменными `RV_RENDER_ERROR_WARN` / `RV_RENDER_ERROR_CRIT`.

## 3. Ежедневный просмотр `render_error`

Раз в день (утром) открыть отчёт `daily-check` и разобрать:

```bash
docker compose logs --since 24h app | grep '"event":"render_error"' | tail -20
docker compose logs --since 24h app | grep -o '"stage":"[^"]*"' | sort | uniq -c
```

Что смотреть:

- `stage` — на каком этапе падает (cleanup / image / vision / product QA);
- `error` — 429, content moderation, таймаут, 400 модели;
- `credit_restored` — кредит вернулся пользователю;
- `cost_usd` — не тратим ли деньги на повторяющиеся ошибки.

Действия: при 429 — проверить прокси/`IMAGE_MIN_GAP_MS`; при moderation — сменить модель
или предупредить пользователя; при 400 — сверить `modelcaps`; при росте доли — P2,
см. [RUNBOOK.md](RUNBOOK.md).

## 4. Очистка комнат и кэш анализа

```bash
docker compose logs --since 24h app | grep -E '"event":"room_cleanup_(error|wait_timeout)"' | tail -20
docker compose logs --since 24h app | grep -c '"event":"room_analysis_cache_hit"'
```

```sql
SELECT cleanup_status, count(*) FROM rooms GROUP BY cleanup_status;
SELECT id, cleanup_status, cleanup_attempts, cleanup_error FROM rooms
WHERE cleanup_status = 'error' ORDER BY cleanup_finished_at DESC LIMIT 20;
```

Рост `cleanup_status=error` — смотреть OpenRouter/прокси; больше 3 попыток не будет, пока не изменить `cleanup_attempts` вручную или не добавить новую комнату. Кэш анализа сбрасывается `DELETE FROM room_analysis;` только по команде владельца.

Ограничение: Docker logs хранят 10 MB × 3 на контейнер. При интенсивном трафике сутки
могут не помещаться — тогда нужен внешний сбор логов (не настроен).

## 4. Платежи

Смотреть ежедневно:

```bash
docker compose logs --since 24h app | grep -E '"event":"(payment_created|webhook_error|refund_error)"'
```

- `webhook_error` > 0 — проверить подпись/URL Robokassa и повторно синхронизировать платёж;
- `payment_created` без начисления — сверить `payments` и `credit_txn` в БД;
- возвраты выключены (`REFUNDS_ENABLED=false`) — делать вручную.

Автоматического алерта на «платёж не начислился» нет: это ручная сверка.

## 5. Проверка алерта (приёмочный тест G8)

Делать только в согласованное окно, не на живом трафике:

1. Убедиться, что монитор зелёный, канал алертов подключён.
2. `cd /root/remontvision && docker compose stop app`
3. Ждать ≤ 5 минут (интервал монитора + 1 проверка).
4. Зафиксировать время и текст алерта (скрин/пересланное сообщение).
5. `docker compose start app`
6. `./scripts/ops/smoke.sh` — PASS.
7. Записать результат в [CHECKLIST-G4-G8.md](CHECKLIST-G4-G8.md).

Остановка `app` не трогает БД и файлы; после `start` контейнер поднимается за ~20 с.
Тест занимает 5–10 минут и требует разрешения владельца.

## 6. Чего пока нет

- APM/Sentry, метрики Prometheus, дашборды.
- Алертов на 429/платежи/бэкап в реальном времени.
- Dead-man's switch для бэкапов (Healthchecks.io) — полезно добавить после выбора
  внешнего хранилища.
- Ротации и централизованного хранения логов.

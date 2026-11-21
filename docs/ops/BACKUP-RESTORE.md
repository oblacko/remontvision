# Бэкапы и восстановление (G4)

Цель: иметь ежедневную копию БД и файлов **вне VPS** и уметь доказать, что из неё
восстанавливается рабочий сайт. Бэкап без проверенного restore не считается бэкапом.

## Что бэкапим

| Объект | Где | Размер (2026-11-09) | Частота |
|---|---|---|---|
| БД `remontvision` | том `remontvision_pgdata` | 16 MB (дамп 1.9 MB) | daily |
| Файлы `appdata` | том `remontvision_appdata` | ≈360 MB (архив 341 MB) | daily |
| БД `catalog` | том `remontvision_catalogdata` | 898 MB | weekly |
| `.env`, TLS-ключи | `/root/remontvision/.env`, `/etc/letsencrypt` | — | отдельно, у владельца |

`.env` в ежедневный архив **не кладём**: иначе секреты уезжают в объектное хранилище.
Владелец хранит `.env` в менеджере паролей/зашифрованном архиве. TLS восстанавливается
через `certbot`; разовая копия `/etc/letsencrypt` уже лежит в `/root/rv-backups/`.

## Как устроено

`scripts/ops/backup.sh`:

1. `pg_dump -Fc` основной БД + проверка `pg_restore --list` (дамп читается).
2. `tar.gz` каталога `/app/data` (uploads, renders, products, style-images, …).
3. `manifest.txt`: дата, коммит, размеры, sha256, счётчики таблиц, версия `pg_dump`.
4. Копирование каталога в rclone-remote (вне VPS) и проверка `rclone check`.
5. Локальная ротация: храним последние `RV_BACKUP_LOCAL_KEEP` каталогов.

`--weekly` дополнительно дампит `catalog-db`. `--pre-deploy` делает только БД (быстро,
перед миграцией). `--dry-run` показывает план без записи.

Скрипт не читает и не печатает секреты: `pg_dump` идёт через локальный сокет контейнера.

## Куда складывать вне VPS

Нужен один из вариантов (выбрать и согласовать с владельцем):

1. **Yandex Object Storage** — рекомендуется: проект уже использует Yandex Cloud.
   Приватный bucket `remontvision-backups`, versioning, lifecycle 30 дней, SSE.
2. **Другой сервер** (например, второй VPS) через `rclone sftp:` или `rsync`.
3. **S3-совместимое хранилище** (Selectel, VK Cloud, MinIO) через `rclone s3:`.

Пример настройки rclone (**ключи не коммитить**):

```bash
apt-get install -y rclone
rclone config create rv-s3 s3 \
  provider=Other env_auth=false \
  access_key_id='<key-id>' secret_access_key='<secret>' \
  endpoint='https://storage.yandexcloud.net' region='ru-central1' acl=private
rclone lsd rv-s3:remontvision-backups
```

Проверка, что remote пишется и читается:

```bash
RV_BACKUP_REMOTE=rv-s3:remontvision-backups/daily RV_BACKUP_REQUIRE_REMOTE=1 \
  /root/remontvision/scripts/ops/backup.sh --db-only
rclone lsf rv-s3:remontvision-backups/daily
```

## Расписание (установлено 2026-11-21)

Cron root на VPS (`crontab -l`). Часовой пояс VPS — MSK.

```cron
# ежедневно: БД + файлы; локально храним 7 копий
15 3 * * * cd /root/remontvision && RV_BACKUP_LOCAL_KEEP=7 ./scripts/ops/backup.sh >> /root/rv-backups/backup.log 2>&1

# проверка эксплуатации каждый час (CRIT → код 1)
7 * * * * cd /root/remontvision && ./scripts/ops/daily-check.sh --strict >> /root/rv-backups/check.log 2>&1
```

Целевая конфигурация после появления remote (требует разрешения владельца): добавить
`RV_BACKUP_REMOTE=rv-s3:remontvision-backups/daily RV_BACKUP_REQUIRE_REMOTE=1` к
ежедневной строке, weekly-строку для `catalog-db` и уменьшить `RV_BACKUP_LOCAL_KEEP`
до 1–2.

`flock` внутри скрипта не даёт двум бэкапам пересечься. Сейчас logrotate **не**
настроен: логи растут в `/root/rv-backups/*.log`. Добавить:

```bash
# /etc/logrotate.d/remontvision
/root/rv-backups/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
```

Хранение на remote (после настройки): 14 daily + 8 weekly (bucket lifecycle).
Локально — 7 каталогов (2.3 GB при диске 39%).

## Проверка восстановления (обязательно раз в месяц и после смены схемы)

```bash
cd /root/remontvision
./scripts/ops/restore-verify.sh --latest \
  --report /root/rv-backups/restore-$(date +%F).md
```

Скрипт поднимает **отдельный** `postgres:16-alpine` с `--network none`, восстанавливает
дамп в чистую БД, сверяет счётчики с manifest, проверяет архив файлов и удаляет контейнер.
Прод-БД не затрагивается.

Критерий PASS:

- `pg_restore` без ошибок;
- таблиц в `public` больше 20;
- `users/rooms/renders/payments/products/migrations` совпадают с manifest;
- `_migrations` не пуста, последняя миграция совпадает;
- sha256 дампа и архива совпадают.

### Протокол от 2026-11-09

| Проверка | Результат |
|---|---|
| Дамп | `db-remontvision-20261109-165346.dump`, 1.3 MB |
| Временная БД | `postgres:16-alpine`, `--network none`, удалена |
| `pg_restore` | OK |
| Таблиц в `public` | 42 |
| `users` | 6 |
| `rooms` | 119 |
| `renders` | 156 |
| `payments` | 15 |
| `products` | 110 |
| `_migrations` | 44, последняя `042_oauth_states.sql` |
| Архив файлов | 254 MB, 952 записи, gzip/sha256 OK, путей вне каталога нет |
| **Итог** | **PASS** |

Отчёты на VPS: `/root/rv-backups/restore-drill-20261109.md`,
`/root/rv-backups/restore-drill-files-20261109.md`. Копии — в
[docs/ops/drills/2026-11-09.md](drills/2026-11-09.md).

### Протокол от 2026-11-21 (прод, cron-бэкап)

| Проверка | Результат |
|---|---|
| Дамп | `db-remontvision-20261121-031501.dump` (cron 03:15 MSK), sha256 = manifest |
| Временная БД | `postgres:16-alpine`, `--network none`, удалена |
| `pg_restore` | OK |
| Таблиц в `public` | 49 |
| `users` / `rooms` / `renders` / `payments` / `products` | 6 / 132 / 204 / 16 / 110 |
| `_migrations` | 64, последняя `063_render_queue.sql` |
| Архив файлов | 341 MB, 1048 записей, gzip/sha256 OK, `.env` не входит |
| **Итог** | **PASS** |

Отчёт на VPS: `/root/rv-backups/restore-drill-20261121.md`. Копия —
[docs/ops/drills/2026-11-21.md](drills/2026-11-21.md).

### Перепроверка инструментов 2026-11-21 (dev, не прод)

На текущей схеме локально прогнаны `backup.sh --db-only` и
`restore-verify.sh --latest`: дамп снят, sha256 совпал, `pg_restore` в чистый
`postgres:16-alpine` без ошибок, 49 таблиц, счётчики совпали с manifest, последняя
миграция `064_articles_updated_at.sql`. Это подтверждает, что скрипты не устарели;
приёмка G4 по-прежнему требует бэкап **с прода** и копию **вне VPS** (первое уже
подтверждено протоколом выше).

## Полное восстановление на новом сервере

1. Установить Docker + Compose, клонировать репозиторий в `/root/remontvision`.
2. Положить `.env` из хранилища владельца (права `600`).
3. Поднять только БД: `docker compose up -d db`.
4. Восстановить БД (дамп с remote):
   ```bash
   rclone copy rv-s3:remontvision-backups/daily/<stamp> /root/rv-backups/<stamp>
   docker compose exec -T db pg_restore -U remont -d remontvision \
     --clean --if-exists --no-owner --no-privileges \
     < /root/rv-backups/<stamp>/db-remontvision-<stamp>.dump
   ```
5. Восстановить файлы в том `appdata`:
   ```bash
   docker compose run --rm --no-deps -T app \
     tar -xzf - -C /app/data < /root/rv-backups/<stamp>/files-<stamp>.tar.gz
   ```
6. Поднять стек: `docker compose up -d --build`; миграции догонятся сами.
7. Smoke: `./scripts/ops/smoke.sh`; проверить `_migrations`, счётчики, открытие рендера.
8. Каталог: восстановить weekly-дамп `catalog` или переимпортировать фид.

Перед восстановлением **поверх текущей** БД: остановить `app`, снять свежий дамп,
только потом `pg_restore`. Миграции append-only — откат схемы только через restore.

## Риски и ограничения

- Диск на 2026-11-21 — 39% (свободно ~23 GB), локально 7 копий (2.3 GB); следить за
  `daily-check`. Глубокое хранение — только на remote.
- Нет шифрования client-side: защита — приватный bucket + SSE + TLS. Для PII можно
  добавить `gpg --symmetric` перед upload (ключ хранить отдельно у владельца).
- Нет проверки «бэкап за вчера есть на remote» отдельным алертом: `daily-check` проверяет
  свежесть локального manifest и наличие `remote=`; внешний монитор сюда не смотрит.
- Нет автоматического бэкапа перед каждым деплоем: делать `--pre-deploy` вручную перед
  рискованными миграциями (или добавить шаг в `deploy.yml` после согласования).

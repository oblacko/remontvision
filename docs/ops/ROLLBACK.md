# Откат релиза и smoke

Прод обновляется пушем в `main`: GitHub Actions → SSH на VPS → `git pull` →
`docker compose up -d --build` → smoke (`/api/health`, `/`, `/app`).
Отдельных тегов/релизов нет, поэтому «предыдущая версия» — это коммит в `main`.

## Перед рискованным деплоем

1. Зафиксировать текущий коммит: `git -C /root/remontvision rev-parse --short HEAD`.
2. Снять бэкап БД: `./scripts/ops/backup.sh --pre-deploy`.
3. Убедиться, что `https://www.remontvision.ru/api/health` зелёный.
4. После деплоя: `./scripts/ops/smoke.sh` + `daily-check.sh`.

## Откат релиза (штатный, предпочтительный)

Откат — это **новый коммит**, а не переписывание истории. Так `main` остаётся правдой,
а деплой проходит обычным путём.

```bash
cd /path/to/app
git log --oneline -10                 # найти плохой коммит
git revert <bad-sha>                  # или несколько: git revert --no-commit <old>..<new>
git push origin main                  # запускает deploy.yml
```

Дождаться зелёного GitHub Actions. Затем на VPS:

```bash
cd /root/remontvision
git log -1 --oneline
./scripts/ops/smoke.sh
./scripts/ops/daily-check.sh
```

## Аварийный откат на VPS (GitHub/Actions недоступны)

```bash
cd /root/remontvision
git fetch origin
git checkout <good-sha>               # известный рабочий коммит
docker compose up -d --build
docker compose ps
./scripts/ops/smoke.sh
```

Важно:

- это detached HEAD; после инцидента вернуться: `git checkout main && git pull origin main`;
- `docker compose up -d --build` пересоздаст только изменившиеся сервисы; если сборка
  упала, старый контейнер может остаться — смотреть `docker compose ps` и
  `docker compose logs app --tail=100`;
- миграции уже применены и не откатываются вместе с кодом (append-only).

## Откат БД

Миграции только добавляются, применённые файлы не редактируются. Варианты по возрастанию
риска:

1. **Forward fix** — новая миграция исправляет схему. Предпочтительно.
2. **Restore из дампа** — только если данные повреждены. Потеряются записи после дампа.
3. **Новая БД + переключение** — создать чистую БД, восстановить дамп, поменять
   `RV_DATABASE_URL` в `.env` (нужно разрешение владельца, это изменение прода).

Перед любым restore:

```bash
cd /root/remontvision
docker compose stop app
./scripts/ops/backup.sh --db-only        # сохранить текущее состояние
```

Восстановление поверх текущей БД (разрушительно):

```bash
docker compose exec -T db pg_restore -U remont -d remontvision \
  --clean --if-exists --no-owner --no-privileges \
  < /root/rv-backups/<stamp>/db-remontvision-<stamp>.dump
docker compose start app
./scripts/ops/smoke.sh
```

Проверить: `_migrations`, счётчики `users/rooms/renders/payments`, вход в кабинет,
открытие существующего рендера.

## Smoke после отката

`scripts/ops/smoke.sh` проверяет:

- `/api/health` → 200, `ok:true`, `payments_enabled:true`, `refunds_enabled:false`;
- `/` содержит `id="root"`;
- `/app` и `/offer` отвечают 200.

Дополнительно вручную:

- `docker compose logs app --tail=100` — нет `render_error`/`config_warning` пачкой;
- админка открывается, модели/настройки на месте;
- при откате БД — тестовый вход и старая комната.

Живой платный рендер после отката не запускать без разрешения: он тратит кредит и деньги.

## Если откат не помог

Перейти в [RUNBOOK.md](RUNBOOK.md): «Сайт недоступен», «БД», «Диск», «Платежи».
Зафиксировать таймлайн, коммиты, дампы и решения в задаче/инциденте.

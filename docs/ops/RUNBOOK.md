# Runbook инцидентов

Правила: сначала остановить ущерб, потом чинить. Не удалять тома/данные, не менять
`.env`, не делать `docker compose down -v`, не запускать платные генерации без
разрешения владельца. Секреты не копировать в тикеты и чаты.

## Контакты

| Кто | Когда | Контакт |
|---|---|---|
| Владелец продукта | любой P1/P2, доступы, деньги | заполнить |
| Хостинг/VPS | сеть, диск, панель, снапшоты | заполнить |
| Регистратор/DNS | домен, NS, apex/www | заполнить |
| Robokassa | платежи, подпись, возвраты | кабинет провайдера |
| Yandex Cloud | Object Storage, Search API | консоль Yandex Cloud |

## Первые 5 минут P1

1. Проверить внешний health: `curl -fsS https://www.remontvision.ru/api/health`.
2. Зайти на VPS: `ssh root@<vps>`; `cd /root/remontvision`.
3. `docker compose ps` — кто не running/unhealthy.
4. `docker compose logs app --tail=200` — ошибка старта/БД/диска.
5. `df -h /` — не кончилось ли место.
6. Зафиксировать время начала и симптом; дальше — по разделу ниже.

## 1. Сайт недоступен / health не отвечает

Симптом: монитор/alerts, `curl` не получает 200 или `ok != true`.

```bash
docker compose ps
docker compose logs nginx 2>/dev/null || true          # nginx на хосте, не в compose
systemctl status nginx
curl -sS -m 5 http://127.0.0.1:3000/api/health
curl -sS -m 5 https://www.remontvision.ru/api/health
```

- Контейнер `app` не running → `docker compose up -d app`, смотреть логи.
- `app` healthy, но снаружи 502 → nginx/TLS: `nginx -t`, `systemctl reload nginx`,
  проверить `certbot certificates`.
- DNS/домен → `dig +short www.remontvision.ru`, срок домена, NS.
- БД недоступна → раздел 3.
- Диск 100% → раздел 4.

Проверка после: `./scripts/ops/smoke.sh`.

## 2. Приложение падает/5xx

```bash
docker compose logs app --tail=300
docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' $(docker compose ps -q app)
docker compose restart app
```

- Ошибка миграции при старте → `docker compose logs app | grep -i migration`;
  не редактировать применённые миграции; откат релиза ([ROLLBACK.md](ROLLBACK.md)).
- OOM (нет в логах, контейнер убит) → `dmesg | tail`, `free -m`; уменьшить нагрузку,
  поднять память у VPS.
- Цикл рестартов после деплоя → аварийный откат на предыдущий коммит.
- Ошибка конфигурации (`config_warning`) → проверить `app_settings`/`.env` по именам,
  не печатая значения.

## 3. БД недоступна или повреждена

```bash
docker compose ps db
docker compose exec -T db pg_isready -U remont -d remontvision
docker compose exec -T db psql -U remont -d remontvision -c 'select 1'
df -h /var/lib/docker
```

- `db` не запускается → `docker compose logs db --tail=200`; место/права на томе.
- «database system is in recovery» → ждать, не убивать процесс.
- Повреждение (`invalid page`, `could not read block`) → остановить `app`, снять дамп
  (`backup.sh --db-only`), восстановить последний бэкап ([BACKUP-RESTORE.md](BACKUP-RESTORE.md)).
- Перед restore обязательно сохранить текущее состояние (дамп может частично читаться).
- После restore: `daily-check.sh`, вход, открытие старого рендера.

## 4. Диск заполнен

На 2026-11-09 занято 86% (свободно ~1.4 GB). Полный бэкап — 254 MB.

```bash
df -h /
df -i /
docker system df
du -sh /var/lib/docker/volumes/* | sort -h | tail
du -sh /var/log/* | sort -h | tail
```

Безопасно (после подтверждения): `docker image prune -f`, ротация логов
(`logrotate -f /etc/logrotate.d/remontvision`), удаление старых каталогов
`/root/rv-backups/*` сверх одной копии.

Нельзя без разрешения: `docker volume rm`, `docker compose down -v`, `rm -rf` томов,
удаление `remontvision_pgdata`/`remontvision_appdata`.

Если места нет совсем: остановить `catalog` (не критичен для генерации),
временно `docker compose stop app`, освободить место, поднять обратно.

## 5. Всплеск `render_error`, 429, moderation

```bash
cd /root/remontvision
./scripts/ops/daily-check.sh
docker compose logs --since 1h app | grep '"event":"render_error"' | tail -20
docker compose logs --since 1h app | grep -o '"stage":"[^"]*"' | sort | uniq -c
```

- `429` → OpenRouter rate limit: проверить `HTTPS_PROXY`/IP, `IMAGE_MIN_GAP_MS`
  (по умолчанию 0 мс), повторы 10/20/40 с; при устойчивом 429 — сменить модель/прокси.
- `content moderation` → FLUX/BFL блокирует фото (часто спальни/кровати); предложить
  другую модель или попросить другое фото.
- `400` от `/images` → сверить `modelcaps`; FLUX.2 Pro не принимает `resolution`.
- Таймауты → `OPENROUTER_TIMEOUT_MS`, размер изображения, нагрузка.
- Проверить, что кредиты вернулись: `credit_restored` в логах; при сбое возврата —
  `credit_restore_error` и ручная корректировка через админку.
- Если доля ошибок > 25% — P2, остановить рекламу/наплыв, разобрать причину.

## 6. Платежи

Симптом: пользователь заплатил, кредиты не пришли; `webhook_error`; Robokassa шлёт ошибку.

```bash
cd /root/remontvision
docker compose logs --since 24h app | grep -E '"event":"(payment_created|webhook_error)"'
docker compose exec -T db psql -U remont -d remontvision -c \
  "select id,user_id,provider_payment_id,status,amount_kopecks,created_at from payments order by id desc limit 10"
```

- Проверить в кабинете Robokassa: ResultURL = `${APP_URL}/api/payments/robokassa/result`,
  подпись (`ROBOKASSA_HASH_ALGO`), тестовый/боевой режим.
- Начисление идемпотентно по `provider_payment_id`; повторный ResultURL безопасен.
- Синхронизировать платёж: `POST /api/payments/sync` из сессии пользователя или
  админский список `/api/admin/payments`; сверить `credit_txn`.
- Если кредит не начислен и синхронизация не помогает — не менять БД вручную без
  разрешения; зафиксировать payment id и сумму, эскалировать владельцу.
- Возвраты выключены (`REFUNDS_ENABLED=false`) — только ручная процедура.

## 7. Деплой упал / плохой релиз

- GitHub Actions красный → смотреть шаг; если сборка/SSH — прод мог остаться на старой
  версии, проверить `git log -1` и `docker compose ps`.
- Сайт сломан после деплоя → откат: [ROLLBACK.md](ROLLBACK.md).
- Не перезапускать деплой «на всякий случай»: сначала понять, какая версия на проде.
- Миграции не удалять и не править; только новая миграция или restore.

## 8. Бэкап не создался / нет свежего

```bash
cd /root/remontvision
tail -100 /var/log/remontvision-backup.log
ls -la /root/rv-backups | tail
./scripts/ops/backup.sh
```

- `flock` занят → предыдущий запуск завис: `ps aux | grep backup.sh`, убить только
  зависший процесс, повторить.
- Нет места → раздел 4.
- Remote недоступен → проверить `rclone lsd <remote>`, ключи/сеть; локальная копия
  остаётся, но G4 не закрыт без off-site.
- Регулярно (раз в месяц) — restore-учения: `restore-verify.sh --latest`.

## 9. Утечка секрета

1. Не публиковать значение и не пересылать его в чат.
2. Отозвать/перевыпустить ключ у провайдера (OpenRouter, Resend, Robokassa, Yandex,
   SSH, БД).
3. Обновить `.env` на VPS, перезапустить `app`; при утечке SSH — удалить ключ из
   `authorized_keys`, проверить входы.
4. Проверить логи на несанкционированные вызовы/платежи.
5. Зафиксировать инцидент и ротацию в задаче; сменить пароли, которые могли утечь.

## 10. TLS/домен

```bash
certbot certificates
certbot renew --dry-run
nginx -t && systemctl reload nginx
dig +short www.remontvision.ru
```

- Сертификат истёк → `certbot renew --force-renewal`, reload nginx.
- Apex/www → проверить 301 и DNS; HSTS не отключать.
- После — `smoke.sh` и `daily-check.sh`.

## 11. Каталог/поиск товаров

- `catalog`/`catalog-db` unhealthy → `docker compose logs catalog --tail=200`.
- Поиск не работает, генерация работает → это деградация, не P1; сообщить в UI/задаче.
- Не удалять `remontvision_catalogdata`: восстановление 36k офферов дорогое (weekly dump).

## После инцидента

Заполнить в задаче/инциденте:

- время начала/обнаружения/восстановления;
- симптом и влияние на пользователей;
- что сделали (команды/коммиты);
- корневая причина;
- что предотвратит повтор (задача, алерт, тест);
- ссылки на дампы/логи/протокол restore.

Обновить [CHECKLIST-G4-G8.md](CHECKLIST-G4-G8.md) и, если менялась процедура, этот runbook.

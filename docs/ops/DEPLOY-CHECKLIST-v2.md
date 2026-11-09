# Чек-лист после миграции на v2 (биллинг v2 + рефералка)

Проверки после деплоя ветки `remontvision-v2` (миграции `043_billing_v2.sql` и
`044_referral.sql`, итоговая волна ревью). Все команды — из `app/` на VPS.

## 1. Пакеты кредитов — 10/20/60

Миграция 043 меняет количество кредитов в существующих пакетах, но не цены:

| id | title | credits | цена |
|---|---|---|---|
| `room` | Одна комната | 10 | 399 ₽ |
| `flat` | Вся квартира | 20 | 599 ₽ |
| `house` | Весь дом | 60 | 1 499 ₽ |

```sql
SELECT id, title, credits, price_kopecks, active FROM credit_packs ORDER BY sort, id;
```

Ожидание: `room=10`, `flat=20`, `house=60`, все `active=true`.

> ⚠️ **Миграция 043 перезаписывает credits у пакетов `room`/`flat`/`house`.**
> Если владелец редактировал кредиты пакета через админку до миграции, его
> правки сбросятся на 10/20/60. После деплоя проверьте значения и при
> необходимости верните нужные кредиты в админке «Пакеты».

## 2. Дефолтная модель рендера совпадает с `app_settings`

Миграция 043 создаёт строку `render_models` `flux-3-image` с
`model_id = black-forest-labs/flux-3-image` — это же значение задаёт
`modelconfig.js` по умолчанию (`RENDER_MODEL`/`app_settings model.render`).

Проверьте, что строка-дефолт совпадает с runtime-моделью:

```sql
SELECT rm.id, rm.model_id, rm.credits, rm.active, rm.sort,
       s.value AS app_render
  FROM render_models rm
  LEFT JOIN app_settings s ON s.key = 'model.render';
```

Ожидание: строка, у которой `model_id = app_render`, существует, `active=true`
и имеет наименьший `sort`. Если после ручной смены модели в админке
«Модели» расхождение осталось — поправьте `model_id`/`sort` строки через
админку «Генерация → Модели», чтобы подсветка по умолчанию в генераторе
(`GET /api/models → default_key`) совпадала с реально списываемой моделью.

## 3. Арт-директор: env-потолок и per-model флаги

`render_models.art_direction_enabled` включает арт-директора per-model, а
`ART_DIRECTION_ENABLED=false` — глобальный «потолок»: выключает его для всех
моделей, даже если у строки флаг `true`.

- Если до v2 арт-директор был выключен глобально (`ART_DIRECTION_ENABLED=false`),
  после деплоя оставьте этот env-флаг `false` (или проставьте
  `art_direction_enabled=false` у всех строк `render_models` в админке), чтобы
  поведение не изменилось.
- Если он был включён — env можно не задавать, и решать будут per-model флаги.

```sql
SELECT id, model_id, art_direction_enabled, active FROM render_models ORDER BY sort;
```

## 4. Приватный режим — только при оплате

Право на приватный режим сервер проверяет по успешному платежу
(`payments.status='succeeded'`), а не по записи в `credit_txn`:

```sql
SELECT user_id, status, provider FROM payments WHERE status = 'succeeded' ORDER BY id DESC LIMIT 10;
```

- `GET /api/credits` отдаёт и `has_purchased` (запись `credit_txn` с
  `reason='purchase'`, как `/api/me`), и `has_succeeded_payment`
  (`payments.status='succeeded'`). Чекбокс «Приватный режим» в генераторе
  включает именно `has_succeeded_payment`.
- `POST /api/rooms` при `private` без успешного платежа возвращает 403.

## 5. Реферальная программа применена

Миграция 044 создаёт `referral_codes` и `referral_rewards`. Проверьте:

```sql
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_codes') AS codes,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_rewards') AS rewards;
```

Ожидание: обе `true`. Начисление `+2` обоим идёт атомарно при регистрации
по ссылке `GET /r/:code`.

## 6. Baseline скорости на VPS

Локальный baseline нерепрезентативен. Запустите реальный замер на VPS
(read-only, секреты не выводятся):

```bash
cd app && node --env-file=.env scripts/ops/speed-report.mjs --limit 50 --out docs/ops/speed-2026-11.md
```

## Smoke

```bash
curl -fsS https://www.remontvision.ru/api/health
curl -fsS https://www.remontvision.ru/ | grep -q 'id="root"'
```

## Откат

Миграции append-only, не удалять. Откат — `git revert` проблемного коммита.

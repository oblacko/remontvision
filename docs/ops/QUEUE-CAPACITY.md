# Ёмкость и скорость генерации — как мерить

Дата: 2026-11-11. Только чтение: запросы ниже не меняют данные.

## Что смотреть

| Метрика | Источник | Зачем |
|---|---|---|
| `ms`, `cost_usd` | JSON-лог `art_direction_ok` / `design_direction_ok` | задержка арт-директора и стоимость |
| cache hit rate | `room_analysis_cache_hit` vs `render_start` | эффективность кэша анализа комнаты |
| `renders.duration_ms` | таблица `renders` (status='done') | полное время рендера, p50/p90 |
| wait time | `started_at - created_at` | сколько задача ждала в очереди |
| queue depth | `count(*) WHERE status='queued'` | накопление очереди |
| 429 | логи `render_error` / ответы провайдера | предел провайдера |
| refunds | `credit_txn` reason `iterate_refund` | потери из-за ошибок/таймаутов |

## SQL

```sql
-- Время рендера по дням (p50/p90)
SELECT date_trunc('day', created_at) AS day,
       count(*) AS renders,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90_ms
FROM renders
WHERE status = 'done' AND duration_ms IS NOT NULL
GROUP BY 1 ORDER BY 1 DESC;

-- Ожидание в очереди (p50/p90)
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (started_at - created_at)) * 1000) AS p50_wait_ms,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (started_at - created_at)) * 1000) AS p90_wait_ms
FROM renders
WHERE started_at IS NOT NULL AND created_at > now() - interval '7 days';

-- Глубина очереди и ошибки
SELECT
  count(*) FILTER (WHERE status = 'queued') AS queued,
  count(*) FILTER (WHERE status = 'processing') AS processing,
  count(*) FILTER (WHERE status = 'error') AS errors
FROM renders;
```

## Логи

```bash
# Арт-директор: задержка и повтор
docker compose logs --since 24h app | grep '"event":"art_direction_ok"' | tail -200

# Попадания в кэш анализа комнаты
docker compose logs --since 24h app | grep -c 'room_analysis_cache_hit'
```

## Ожидаемый эффект

- `ms` p50 арт-директора: один vision-вызов вместо двух; на промахе room_analysis — полный проход, на попадании — 0.
- При прогретом кэше анализа большинство повторных рендеров комнаты не платят за vision.
- `WORKER_CONCURRENCY` увеличивает число рендеров в работе; одновременные image-вызовы ограничивает общий семафор (`imageslot.js`).

## Настройки и откат

| Переменная | По умолчанию | Откат |
|---|---|---|
| `WORKER_CONCURRENCY` | 100 | `1` — строго по одному рендеру |

Кэш анализа комнаты можно сбросить вручную: `DELETE FROM room_analysis;` (только по команде владельца).

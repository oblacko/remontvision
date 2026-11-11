# Ёмкость и скорость генерации — как мерить

Дата: 2026-11-11. Только чтение: запросы ниже не меняют данные.

## Что смотреть

| Метрика | Источник | Зачем |
|---|---|---|
| `direction_ms`, `retried` | JSON-лог `design_direction_call` | задержка direction и доля повторных вызовов |
| cache hit rate | `design_direction_cache_hit` vs `design_direction_call` | эффективность кэша |
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
# Задержка direction и retry
docker compose logs --since 24h app | grep '"event":"design_direction_call"' | tail -200

# Попадания в кэш
docker compose logs --since 24h app | grep -c 'design_direction_cache_hit'
docker compose logs --since 24h app | grep -c 'design_direction_call'
```

## Ожидаемый эффект

- `direction_ms` p50: было ~34 с (двойной вызов) → ожидается ~15–20 с на промахе и 0 на попадании.
- При прогретом кэше большинство рендеров не платят за direction вовсе.
- `WORKER_CONCURRENCY` увеличивает число рендеров в работе, но не число одновременных image-вызовов (их держит глобальный advisory-слот).

## Настройки и откат

| Переменная | По умолчанию | Откат |
|---|---|---|
| `WORKER_CONCURRENCY` | 2 | вернуть `2` |
| `DIRECTION_CACHE_ENABLED` | 1 | `0` — direction снова генерируется каждый раз |
| `DIRECTION_CACHE_VARIANTS` | 3 | `1` — один вариант на пару |
| `DIRECTION_CACHE_TTL_DAYS` | 30 | уменьшить TTL |

Кэш можно очистить вручную: `DELETE FROM generation_cache;` (только по команде владельца).

// Кэш дорогих AI-шагов: значения лежат в Postgres с TTL.
// Используется для layout-плана; direction теперь живёт в room_analysis.
import crypto from 'node:crypto';

// Размеры в том же виде, в котором они попадают в промт (округление до 0.1 м),
// чтобы ключ кэша не расходился с текстом, который видела модель.
export function dimensionsKey(dimensions) {
  if (!dimensions) return 'none';
  const round = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? String(Math.round(number * 10) / 10) : '';
  };
  const width = round(dimensions.width);
  const length = round(dimensions.length);
  const height = round(dimensions.height);
  if (!width || !length) return 'none';
  return `${width}x${length}x${height}`;
}

export async function cacheGet(kind, key, ttlDays) {
  if (!process.env.RV_DATABASE_URL) return null;
  const { q } = await import('./db.js');
  const row = await q.cacheGet(kind, key, ttlDays);
  return row?.value ?? null;
}

export async function cachePut(kind, key, value) {
  if (!process.env.RV_DATABASE_URL) return;
  const { q } = await import('./db.js');
  await q.cachePut(kind, key, value);
}

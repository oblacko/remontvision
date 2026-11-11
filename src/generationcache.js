// Кэш дорогих AI-шагов: значения лежат в Postgres с TTL.
// Сейчас используется для design_direction (текстовый вызов без фото).
import crypto from 'node:crypto';

// Округляем размеры в стабильные корзины, чтобы разные комнаты одного масштаба
// переиспользовали направление, но планировка не теряла точность (она в другом слое).
export function dimsBucket(dimensions) {
  if (!dimensions) return 'none';
  const round = (value, step) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? (Math.round(number / step) * step).toFixed(1) : '?';
  };
  const width = round(dimensions.width, 0.5);
  const length = round(dimensions.length, 0.5);
  const height = round(dimensions.height, 0.1);
  if (width === '?' || length === '?') return 'none';
  return `${width}x${length}x${height}`;
}

// Детерминированный выбор варианта: одна комната/рендер всегда получает один и тот же.
export function pickVariant(variants, seed) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const hash = crypto.createHash('sha256').update(String(seed || '')).digest();
  return variants[hash[0] % variants.length];
}

export function directionCacheKey({ styleId, conceptId, roomType, dimensions, promptVersion = 0 }) {
  return `${styleId}|${conceptId}|${roomType || 'Другое'}|${dimsBucket(dimensions)}|v${promptVersion}`;
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

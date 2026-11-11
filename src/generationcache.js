// Кэш дорогих AI-шагов: значения лежат в Postgres с TTL.
// Сейчас используется для design_direction (текстовый вызов без фото).
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

// Детерминированный выбор варианта: одна комната/рендер всегда получает один и тот же.
export function pickVariant(variants, seed) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const hash = crypto.createHash('sha256').update(String(seed || '')).digest();
  return variants[hash[0] % variants.length];
}

// Новизна без влияния на ключ кэша: выбираем вариант, не повторяющий
// последние focal_zone/main_move пользователя. Если все повторяют — обычный хэш.
export function pickVariantByNovelty(variants, seed, usedDirections = []) {
  const zones = new Set(usedDirections.map(item => item?.focal_zone).filter(Boolean));
  const moves = new Set(usedDirections.map(item => item?.main_move).filter(Boolean));
  const fresh = variants.filter(variant => {
    if (!variant) return false;
    const move = variant.mainMove?.action || variant.mainMove?.target || '';
    return !zones.has(variant.focalZone) && !moves.has(move);
  });
  return pickVariant(fresh.length ? fresh : variants, seed);
}

export function directionCacheKey({ styleId, conceptId, roomType, dimensions, promptVersion = 0 }) {
  return `${styleId}|${conceptId}|${roomType || 'Другое'}|${dimensionsKey(dimensions)}|v${promptVersion}`;
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

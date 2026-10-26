// In-memory rate limit: MAX запросов за WINDOW_MS на IP, скользящее окно.
// Без зависимостей. Ограничение: один инстанс = одна память (масштабирование — в Redis, см. п.14).

const MAX = Number(process.env.RATE_LIMIT_MAX || 5);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 3_600_000);
const BYPASS_EMAILS = new Set(
  String(process.env.RATE_LIMIT_BYPASS_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
);

const hits = new Map();

// раз в 10 минут выметаем мёртвые ключи, чтобы Map не рос от случайных IP
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) {
    if (!arr.some(t => now - t < WINDOW_MS)) hits.delete(k);
  }
}, 600_000);
sweeper.unref();

export function rateLimit(req, res, next) {
  if (!MAX || MAX <= 0) return next();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email && BYPASS_EMAILS.has(email)) return next();
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const arr = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX) {
    hits.set(key, arr);
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - arr[0])) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: `Слишком много запросов: лимит ${MAX} за ${Math.round(WINDOW_MS / 60000)} мин. Повторите через ${retryAfter} с.`,
    });
  }
  arr.push(now);
  hits.set(key, arr);
  next();
}

// для юнит-тестов
export function _resetHits() { hits.clear(); }

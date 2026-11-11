// «Товары в рендере»: опция добавлять референсы hero-товаров из каталога
// в базовый кадр (shoppable-рендер). По умолчанию выключено (design-first).
export const RENDER_CONFIG_KEY = 'render.product_refs.v1';

const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};

// Разумный потолок паузы между image-вызовами: больше двух минут не нужно.
export const IMAGE_MIN_GAP_MAX_MS = 120_000;
// Сколько image-запросов может идти одновременно (варианты одного пакета — параллельно).
// Пауза по умолчанию 0: раньше она была 10 с и вместе с глобальным локом
// превращала пять вариантов в последовательную очередь.
export const IMAGE_CONCURRENCY_MAX = 12;
export const IMAGE_CONCURRENCY_USER_MAX = 8;
const ENV_IMAGE_MIN_GAP_MS = clampInt(process.env.IMAGE_MIN_GAP_MS, 0, IMAGE_MIN_GAP_MAX_MS, 0);
const ENV_IMAGE_CONCURRENCY = clampInt(process.env.IMAGE_CONCURRENCY, 1, IMAGE_CONCURRENCY_MAX, 8);
const ENV_IMAGE_CONCURRENCY_USER = clampInt(process.env.IMAGE_CONCURRENCY_USER, 1, IMAGE_CONCURRENCY_USER_MAX, 5);
const ENV_IMAGE_CONCURRENCY_PROVIDER = clampInt(process.env.IMAGE_CONCURRENCY_PROVIDER, 1, IMAGE_CONCURRENCY_MAX, 6);

export const DEFAULT_RENDER_CONFIG = {
  product_refs_enabled: false,
  max_products: 3,
  // Подбор реальных товаров после генерации. Не влияет на базовый кадр.
  product_matching_enabled: true,
  // Минимальная пауза между вызовами image-модели (анти-429). 0 — без паузы.
  image_min_gap_ms: ENV_IMAGE_MIN_GAP_MS,
  // Одновременных image-вызовов в системе. Больше лимита — вызовы ждут в очереди.
  image_concurrency: ENV_IMAGE_CONCURRENCY,
  // Потолок на одного пользователя: один пакет не должен занимать всю очередь.
  image_concurrency_user: ENV_IMAGE_CONCURRENCY_USER,
  // Потолок на провайдера (сейчас один OpenRouter); при добавлении второго — делится.
  image_concurrency_provider: ENV_IMAGE_CONCURRENCY_PROVIDER,
};

let cache = { ...DEFAULT_RENDER_CONFIG };

const validate = (input = {}) => {
  const out = {};
  if ('product_refs_enabled' in input) out.product_refs_enabled = Boolean(input.product_refs_enabled);
  if ('product_matching_enabled' in input) out.product_matching_enabled = Boolean(input.product_matching_enabled);
  if ('max_products' in input) out.max_products = clampInt(input.max_products, 2, 4, DEFAULT_RENDER_CONFIG.max_products);
  if ('image_min_gap_ms' in input) out.image_min_gap_ms = clampInt(input.image_min_gap_ms, 0, IMAGE_MIN_GAP_MAX_MS, DEFAULT_RENDER_CONFIG.image_min_gap_ms);
  if ('image_concurrency' in input) out.image_concurrency = clampInt(input.image_concurrency, 1, IMAGE_CONCURRENCY_MAX, DEFAULT_RENDER_CONFIG.image_concurrency);
  if ('image_concurrency_user' in input) out.image_concurrency_user = clampInt(input.image_concurrency_user, 1, IMAGE_CONCURRENCY_USER_MAX, DEFAULT_RENDER_CONFIG.image_concurrency_user);
  if ('image_concurrency_provider' in input) out.image_concurrency_provider = clampInt(input.image_concurrency_provider, 1, IMAGE_CONCURRENCY_MAX, DEFAULT_RENDER_CONFIG.image_concurrency_provider);
  return out;
};

export function getRenderConfig() {
  return { ...cache };
}

// Пауза между image-вызовами, как её видит openrouter.js. Читает текущий кеш,
// поэтому не требует БД и безопасно импортируется из openrouter.js (без цикла).
export function getImageMinGapMs() {
  return clampInt(cache.image_min_gap_ms, 0, IMAGE_MIN_GAP_MAX_MS, DEFAULT_RENDER_CONFIG.image_min_gap_ms);
}

// Сколько image-вызовов разрешено одновременно, как это видит imageslot.js.
export function getImageConcurrency() {
  return clampInt(cache.image_concurrency, 1, IMAGE_CONCURRENCY_MAX, DEFAULT_RENDER_CONFIG.image_concurrency);
}

export function getImageConcurrencyUser() {
  return clampInt(cache.image_concurrency_user, 1, IMAGE_CONCURRENCY_USER_MAX, DEFAULT_RENDER_CONFIG.image_concurrency_user);
}

export function getImageConcurrencyProvider() {
  return clampInt(cache.image_concurrency_provider, 1, IMAGE_CONCURRENCY_MAX, DEFAULT_RENDER_CONFIG.image_concurrency_provider);
}

export function getRenderDefaults() {
  return { ...DEFAULT_RENDER_CONFIG };
}

export function setRenderConfigForTests(patch) {
  cache = { ...DEFAULT_RENDER_CONFIG, ...validate(patch) };
}

export async function loadRenderConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([RENDER_CONFIG_KEY]);
    const raw = rows.find(r => r.key === RENDER_CONFIG_KEY)?.value;
    const parsed = raw == null ? null : (typeof raw === 'string' ? JSON.parse(raw) : raw);
    cache = parsed ? { ...DEFAULT_RENDER_CONFIG, ...validate(parsed) } : { ...DEFAULT_RENDER_CONFIG };
  } catch {
    cache = { ...DEFAULT_RENDER_CONFIG };
  }
  return getRenderConfig();
}

export async function saveRenderConfig(patch) {
  const next = { ...cache, ...validate(patch) };
  const { q } = await import('./db.js');
  await q.setSetting(RENDER_CONFIG_KEY, JSON.stringify(next));
  cache = next;
  return getRenderConfig();
}

export async function resetRenderConfig() {
  const { q } = await import('./db.js');
  await q.setSetting(RENDER_CONFIG_KEY, JSON.stringify(DEFAULT_RENDER_CONFIG));
  cache = { ...DEFAULT_RENDER_CONFIG };
  return getRenderConfig();
}

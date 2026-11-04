// «Товары в рендере»: опция добавлять референсы hero-товаров из каталога
// в базовый кадр (shoppable-рендер). По умолчанию выключено (design-first).
export const RENDER_CONFIG_KEY = 'render.product_refs.v1';

export const DEFAULT_RENDER_CONFIG = {
  product_refs_enabled: false,
  max_products: 3,
  // Подбор реальных товаров после генерации. Не влияет на базовый кадр.
  product_matching_enabled: true,
};

let cache = { ...DEFAULT_RENDER_CONFIG };

const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};

const validate = (input = {}) => {
  const out = {};
  if ('product_refs_enabled' in input) out.product_refs_enabled = Boolean(input.product_refs_enabled);
  if ('product_matching_enabled' in input) out.product_matching_enabled = Boolean(input.product_matching_enabled);
  if ('max_products' in input) out.max_products = clampInt(input.max_products, 2, 4, DEFAULT_RENDER_CONFIG.max_products);
  return out;
};

export function getRenderConfig() {
  return { ...cache };
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

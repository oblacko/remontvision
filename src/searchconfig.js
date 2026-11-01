import crypto from 'node:crypto';
import { DEFAULT_PROCUREMENT_DOMAINS } from './yandexsearch.js';
import { modelCaps } from './modelcaps.js';

export const SEARCH_SETTINGS_KEY = 'search.v1';
export const DEFAULT_SEARCH_CONFIG = {
  enabled: true,
  vision_model: process.env.SEARCH_VISION_MODEL || 'google/gemini-3.1-pro-preview',
  grid_model: process.env.SEARCH_GRID_MODEL || 'black-forest-labs/flux-3-image-klein',
  grid_resolution: '1K',
  grid_aspect: '21:9',
  domains: [...DEFAULT_PROCUREMENT_DOMAINS],
  region: '213',
  search_limit: 30,
  max_objects: 10,
  max_run_cost_usd: 2.0,
  cache_ttl_hours: 24,
  visual_enabled: true,
};

const BOOLEAN_KEYS = ['enabled', 'visual_enabled'];
const MODEL_KEYS = ['vision_model', 'grid_model'];

let cache = clone(DEFAULT_SEARCH_CONFIG);

function clone(config) {
  return { ...config, domains: [...(config.domains || [])] };
}

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function normalizeDomains(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map(s => String(s).trim().toLowerCase().replace(/^www\./, '')).filter(Boolean))];
}

function validateModel(key, value) {
  const model = String(value ?? '').trim();
  if (!model) throw new Error(`Модель не задана: ${key}`);
  return model;
}

export function validateSearchConfig(input = {}, base = DEFAULT_SEARCH_CONFIG) {
  const out = {};
  for (const key of BOOLEAN_KEYS) {
    if (key in input) out[key] = bool(input[key], DEFAULT_SEARCH_CONFIG[key]);
  }
  for (const key of MODEL_KEYS) {
    if (key in input) out[key] = validateModel(key, input[key]);
  }
  const gridModel = String(out.grid_model || base?.grid_model || DEFAULT_SEARCH_CONFIG.grid_model);
  if ('grid_aspect' in input) {
    const aspect = String(input.grid_aspect ?? '').trim();
    const caps = modelCaps(gridModel);
    if (!caps.aspects.includes(aspect)) {
      throw new Error(`aspect_ratio для grid: ${caps.aspects.join(', ')}`);
    }
    out.grid_aspect = aspect;
  } else if (out.grid_model && base?.grid_aspect) {
    const caps = modelCaps(gridModel);
    if (!caps.aspects.includes(String(base.grid_aspect))) {
      throw new Error(`aspect_ratio для grid: ${caps.aspects.join(', ')}`);
    }
  }
  if ('grid_resolution' in input) {
    const resolution = String(input.grid_resolution ?? '').trim();
    const resolutions = modelCaps(gridModel).resolutions;
    if (resolution && resolutions.length > 0 && !resolutions.includes(resolution)) {
      throw new Error(`resolution для grid: ${resolutions.join(', ')}`);
    }
    out.grid_resolution = resolution;
  } else if (out.grid_model && base?.grid_resolution) {
    const resolution = String(base.grid_resolution ?? '').trim();
    const resolutions = modelCaps(gridModel).resolutions;
    if (resolution && resolutions.length > 0 && !resolutions.includes(resolution)) {
      throw new Error(`resolution для grid: ${resolutions.join(', ')}`);
    }
  }
  if ('domains' in input) out.domains = normalizeDomains(input.domains);
  if ('region' in input) out.region = String(input.region ?? '').trim() || DEFAULT_SEARCH_CONFIG.region;
  if ('search_limit' in input) out.search_limit = Math.max(1, Math.min(100, Math.round(num(input.search_limit, DEFAULT_SEARCH_CONFIG.search_limit))));
  if ('max_objects' in input) out.max_objects = Math.max(1, Math.min(20, Math.round(num(input.max_objects, DEFAULT_SEARCH_CONFIG.max_objects))));
  if ('max_run_cost_usd' in input) out.max_run_cost_usd = Math.max(0.01, Math.min(10, num(input.max_run_cost_usd, DEFAULT_SEARCH_CONFIG.max_run_cost_usd)));
  if ('cache_ttl_hours' in input) out.cache_ttl_hours = Math.max(1, Math.min(168, Math.round(num(input.cache_ttl_hours, DEFAULT_SEARCH_CONFIG.cache_ttl_hours))));
  return out;
}

export function getSearchConfig() {
  return clone(cache);
}

export function getSearchDefaults() {
  return clone(DEFAULT_SEARCH_CONFIG);
}

export async function loadSearchConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([SEARCH_SETTINGS_KEY]);
    const raw = rows.find(r => r.key === SEARCH_SETTINGS_KEY)?.value;
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = { ...DEFAULT_SEARCH_CONFIG, ...parsed };
      cache = clone({ ...DEFAULT_SEARCH_CONFIG, ...validateSearchConfig(parsed, base) });
    } else {
      cache = clone(DEFAULT_SEARCH_CONFIG);
    }
  } catch {
    cache = clone(DEFAULT_SEARCH_CONFIG);
  }
  return getSearchConfig();
}

export async function saveSearchConfig(patch) {
  const base = { ...cache, ...patch };
  const next = clone({ ...cache, ...validateSearchConfig(patch, base) });
  const { q } = await import('./db.js');
  await q.setSetting(SEARCH_SETTINGS_KEY, JSON.stringify(next));
  cache = next;
  return getSearchConfig();
}

export async function resetSearchConfig() {
  const { q } = await import('./db.js');
  await q.setSetting(SEARCH_SETTINGS_KEY, JSON.stringify(DEFAULT_SEARCH_CONFIG));
  cache = clone(DEFAULT_SEARCH_CONFIG);
  return getSearchConfig();
}

export function setSearchConfigForTests(patch) {
  const base = { ...cache, ...patch };
  cache = clone({ ...DEFAULT_SEARCH_CONFIG, ...validateSearchConfig(patch, base) });
}

export function searchConfigHash(config = getSearchConfig()) {
  return crypto.createHash('sha256').update(JSON.stringify({
    vision_model: config.vision_model,
    grid_model: config.grid_model,
    grid_resolution: config.grid_resolution,
    grid_aspect: config.grid_aspect,
    domains: [...(config.domains || [])].sort(),
    region: config.region,
    search_limit: config.search_limit,
    max_objects: config.max_objects,
    visual_enabled: config.visual_enabled,
  })).digest('hex').slice(0, 32);
}

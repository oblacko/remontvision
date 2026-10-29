import crypto from 'node:crypto';
import { DEFAULT_PROCUREMENT_DOMAINS, yandexConfigured } from './yandexsearch.js';
import { PROCUREMENT_TEMPLATE_VERSION } from './procurementtemplates.js';

export const PROCUREMENT_SETTINGS_KEY = 'procurement.settings.v1';
export const PROCUREMENT_LAYERS = ['hero', 'finish', 'builtin', 'textile', 'completeness'];

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const BASE = {
  enabled: true,
  enabled_layers: ['hero', 'textile'],
  region: '213',
  domains: DEFAULT_PROCUREMENT_DOMAINS,
  search_limit: 5,
  max_visual_items: 8,
  max_text_items: 12,
  max_candidates_per_item: 3,
  max_visual_candidates: 3,
  min_score: 80,
  alt_score: 60,
  max_run_cost_usd: 0.5,
  credit_cost: 1,
};

export const DEFAULT_PROCUREMENT_CONFIG = {
  ...BASE,
  domains: [...BASE.domains],
  enabled_layers: [...BASE.enabled_layers],
};

let cache = {
  ...DEFAULT_PROCUREMENT_CONFIG,
  domains: [...DEFAULT_PROCUREMENT_CONFIG.domains],
  enabled_layers: [...DEFAULT_PROCUREMENT_CONFIG.enabled_layers],
};

function normalizeDomains(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map(s => String(s).trim().toLowerCase().replace(/^www\./, '')).filter(Boolean))];
}

function validate(input = {}) {
  const out = {};
  if ('enabled' in input) out.enabled = Boolean(input.enabled);
  if ('enabled_layers' in input) {
    const layers = Array.isArray(input.enabled_layers) ? input.enabled_layers : [];
    out.enabled_layers = [...new Set(layers.filter(layer => PROCUREMENT_LAYERS.includes(layer)))];
  }
  if ('region' in input) out.region = String(input.region || '213').trim() || '213';
  if ('domains' in input) out.domains = normalizeDomains(input.domains);
  if ('search_limit' in input) out.search_limit = Math.max(1, Math.min(10, Math.round(num(input.search_limit, 5))));
  if ('max_visual_items' in input) out.max_visual_items = Math.max(1, Math.min(12, Math.round(num(input.max_visual_items, 8))));
  if ('max_text_items' in input) out.max_text_items = Math.max(1, Math.min(20, Math.round(num(input.max_text_items, 12))));
  if ('max_candidates_per_item' in input) out.max_candidates_per_item = Math.max(1, Math.min(8, Math.round(num(input.max_candidates_per_item, 3))));
  if ('max_visual_candidates' in input) out.max_visual_candidates = Math.max(1, Math.min(5, Math.round(num(input.max_visual_candidates, 3))));
  if ('min_score' in input) out.min_score = Math.max(50, Math.min(95, Math.round(num(input.min_score, 80))));
  if ('alt_score' in input) out.alt_score = Math.max(40, Math.min(90, Math.round(num(input.alt_score, 60))));
  if ('max_run_cost_usd' in input) out.max_run_cost_usd = Math.max(0.01, Math.min(5, num(input.max_run_cost_usd, 0.5)));
  if ('credit_cost' in input) out.credit_cost = Math.max(0, Math.min(10, Math.round(num(input.credit_cost, 1))));
  return out;
}

function envDefaults() {
  return {
    enabled: bool(process.env.PROCUREMENT_ENABLED, true),
    ...(process.env.PROCUREMENT_REGION ? { region: String(process.env.PROCUREMENT_REGION) } : {}),
    ...(process.env.PROCUREMENT_DOMAINS ? { domains: normalizeDomains(process.env.PROCUREMENT_DOMAINS) } : {}),
  };
}

export function getProcurementConfig() {
  const configured = yandexConfigured();
  return {
    ...cache,
    configured,
    enabled: Boolean(cache.enabled && configured),
    template_version: PROCUREMENT_TEMPLATE_VERSION,
  };
}

export function getProcurementDefaults() {
  return { ...DEFAULT_PROCUREMENT_CONFIG, domains: [...DEFAULT_PROCUREMENT_CONFIG.domains], enabled_layers: [...DEFAULT_PROCUREMENT_CONFIG.enabled_layers] };
}

export async function loadProcurementConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([PROCUREMENT_SETTINGS_KEY]);
    const raw = rows.find(r => r.key === PROCUREMENT_SETTINGS_KEY)?.value;
    cache = raw
      ? { ...DEFAULT_PROCUREMENT_CONFIG, ...validate(JSON.parse(raw)) }
      : { ...DEFAULT_PROCUREMENT_CONFIG, ...envDefaults() };
  } catch {
    cache = { ...DEFAULT_PROCUREMENT_CONFIG, ...envDefaults() };
  }
  return getProcurementConfig();
}

export async function saveProcurementConfig(patch) {
  const next = { ...cache, ...validate(patch) };
  const { q } = await import('./db.js');
  await q.setSetting(PROCUREMENT_SETTINGS_KEY, JSON.stringify(next));
  cache = { ...DEFAULT_PROCUREMENT_CONFIG, ...next };
  return getProcurementConfig();
}

export async function resetProcurementConfig() {
  const { q } = await import('./db.js');
  await q.deleteSetting(PROCUREMENT_SETTINGS_KEY);
  cache = { ...DEFAULT_PROCUREMENT_CONFIG, ...envDefaults() };
  return getProcurementConfig();
}

export function setProcurementConfigForTests(patch) {
  cache = { ...DEFAULT_PROCUREMENT_CONFIG, ...validate(patch) };
}

export function procurementConfigHash(config = getProcurementConfig()) {
  return crypto.createHash('sha256').update(JSON.stringify({
    template_version: config.template_version,
    enabled_layers: [...(config.enabled_layers || [])].sort(),
    region: config.region,
    domains: [...(config.domains || [])].sort(),
    search_limit: config.search_limit,
    max_visual_items: config.max_visual_items,
    max_text_items: config.max_text_items,
    max_candidates_per_item: config.max_candidates_per_item,
    max_visual_candidates: config.max_visual_candidates,
    min_score: config.min_score,
    alt_score: config.alt_score,
  })).digest('hex').slice(0, 32);
}

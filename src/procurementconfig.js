import crypto from 'node:crypto';
import { procurementDomains, yandexConfigured } from './yandexsearch.js';
import { PROCUREMENT_TEMPLATE_VERSION } from './procurementtemplates.js';

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function getProcurementConfig() {
  const configured = yandexConfigured();
  return {
    enabled: bool(process.env.PROCUREMENT_ENABLED, configured),
    configured,
    credit_cost: 1,
    region: String(process.env.PROCUREMENT_REGION || '213'),
    search_limit: Math.max(1, Math.min(10, num(process.env.PROCUREMENT_SEARCH_LIMIT, 5))),
    max_visual_items: Math.max(1, Math.min(12, num(process.env.PROCUREMENT_MAX_VISUAL_ITEMS, 8))),
    max_text_items: Math.max(1, Math.min(20, num(process.env.PROCUREMENT_MAX_TEXT_ITEMS, 12))),
    max_candidates_per_item: Math.max(1, Math.min(8, num(process.env.PROCUREMENT_MAX_CANDIDATES, 3))),
    max_visual_candidates: Math.max(1, Math.min(5, num(process.env.PROCUREMENT_MAX_VISUAL_CANDIDATES, 3))),
    min_score: Math.max(50, Math.min(95, num(process.env.PROCUREMENT_MIN_SCORE, 80))),
    alt_score: Math.max(40, Math.min(90, num(process.env.PROCUREMENT_ALT_SCORE, 60))),
    max_run_cost_usd: Math.max(0.01, num(process.env.PROCUREMENT_MAX_RUN_COST_USD, 0.5)),
    domains: procurementDomains(),
    template_version: PROCUREMENT_TEMPLATE_VERSION,
  };
}

export function procurementConfigHash(config = getProcurementConfig()) {
  return crypto.createHash('sha256').update(JSON.stringify({
    template_version: config.template_version,
    region: config.region,
    domains: [...config.domains].sort(),
    search_limit: config.search_limit,
    max_visual_items: config.max_visual_items,
    max_text_items: config.max_text_items,
    max_candidates_per_item: config.max_candidates_per_item,
    max_visual_candidates: config.max_visual_candidates,
    min_score: config.min_score,
    alt_score: config.alt_score,
  })).digest('hex').slice(0, 32);
}

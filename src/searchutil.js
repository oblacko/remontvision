import crypto from 'node:crypto';

const TRACKING_KEYS = new Set(['gclid', 'yclid', 'fbclid', 'from', 'ref']);

function isTrackingKey(key) {
  return key.startsWith('utm_') || TRACKING_KEYS.has(key);
}

export function canonicalUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return trimmed;
  }

  const host = parsed.host.toLowerCase().replace(/^www\./, '');
  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (isTrackingKey(key)) params.delete(key);
  }
  const search = params.toString();
  const query = search ? `?${search}` : '';

  return `https://${host}${parsed.pathname}${query}`;
}

export function extractPrice(text) {
  const match = String(text || '').match(/(\d[\d\s]{2,})\s*(?:₽|руб)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\s+/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function filtersHash(filters = {}) {
  const {
    query = null,
    domains = [],
    price_from = null,
    price_to = null,
    region = null,
    period = null,
    sort = null,
    source = null,
  } = filters || {};

  const payload = JSON.stringify({
    query,
    domains: [...domains].sort(),
    price_from,
    price_to,
    region,
    period,
    sort,
    source,
  });

  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function mergeResults(textResults = [], visualResults = [], { limit = 30, catalogResults = [] } = {}) {
  const merged = [];
  const seen = new Set();

  const append = (rows, source) => {
    for (const row of rows || []) {
      if (merged.length >= limit) return;
      const url = row.canonical_url || row.page_url || row.url;
      if (!url) continue;
      const canonical = canonicalUrl(url);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      merged.push({
        url: canonical,
        title: row.title || row.page_title || '',
        snippet: row.snippet || row.passage || '',
        source: row.source || source,
        provider: row.provider || (source === 'catalog' ? 'feed' : 'yandex'),
        image_url: row.image_url || null,
        price: row.price ?? null,
        currency: row.currency || 'RUB',
        availability: row.availability || null,
        affiliate_url: row.affiliate_url || null,
        erid: row.erid || null,
        store: row.store || null,
        match_score: row.match_score ?? null,
        raw: row.raw || row,
      });
    }
  };

  // Каталог первым: у него реальные URL/цены и партнёрская ссылка.
  append(catalogResults, 'catalog');
  append(visualResults, 'visual');
  append(textResults, 'text');

  return merged;
}

// Стабильно поднимает строки с ценой наверх, сохраняя порядок внутри групп.
export function sortPricedFirst(rows = []) {
  return [...rows].sort((a, b) => Number(a?.price == null) - Number(b?.price == null));
}

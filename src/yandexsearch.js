import { XMLParser } from 'fast-xml-parser';

const ENDPOINT = 'https://searchapi.api.cloud.yandex.net/v2/web/search';

export const DEFAULT_PROCUREMENT_DOMAINS = [
  'divan.ru',
  'stoolgroup.ru',
  'divanboss.ru',
  'askona.ru',
  'hoff.ru',
  'leroymerlin.ru',
  'vseinstrumenti.ru',
  'petrovich.ru',
  'mnogomebeli.ru',
  'lazurit.com',
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
});

const asArray = value => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith('@_'))
      .map(([, v]) => textOf(v))
      .join(' ');
  }
  return '';
}

const clean = value => textOf(value).replace(/\s+/g, ' ').trim();

export function normalizeSearchResults(xml) {
  const parsed = parser.parse(String(xml || '').replace(/<\/?hlword>/gi, ''));
  const grouping = asArray(parsed?.yandexsearch?.response?.results?.grouping);
  const results = [];
  for (const groupingNode of grouping) {
    for (const group of asArray(groupingNode?.group)) {
      for (const doc of asArray(group?.doc)) {
        const url = clean(doc?.url);
        if (!url) continue;
        const passages = asArray(doc?.passages?.passage).map(clean).filter(Boolean);
        results.push({
          url,
          title: clean(doc?.title),
          snippet: passages.join(' ').slice(0, 1000),
          passages,
          lang: clean(doc?.properties?.lang) || null,
          modtime: clean(doc?.modtime) || null,
        });
      }
    }
  }
  return results;
}

export function procurementDomains() {
  const raw = String(process.env.PROCUREMENT_DOMAINS || '');
  const list = raw ? raw.split(',') : DEFAULT_PROCUREMENT_DOMAINS;
  return list.map(s => s.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
}

export function isAllowedDomain(url, domains = procurementDomains()) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return domains.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function isLikelyProductUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/(^|\/)(search|category|categories|collections?|tags?|brands?)(\/|$)/.test(path)) return false;
    if (/[?&](text|q|search|query)=/.test(search)) return false;
    if (/\.(pdf|jpg|jpeg|png|webp|svg|zip|docx?)$/i.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

export function filterProductResults(results, { domains = procurementDomains(), limit = 5 } = {}) {
  const seen = new Set();
  const out = [];
  for (const row of results || []) {
    if (!isAllowedDomain(row.url, domains)) continue;
    if (!isLikelyProductUrl(row.url)) continue;
    const canonical = row.url.split('#')[0];
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push({ ...row, url: canonical });
    if (out.length >= limit) break;
  }
  return out;
}

export function yandexConfigured() {
  return Boolean(process.env.YANDEX_SEARCH_API_KEY && process.env.YANDEX_FOLDER_ID);
}

export async function searchWebSync({
  query,
  region = process.env.PROCUREMENT_REGION || '213',
  limit = 5,
  apiKey = process.env.YANDEX_SEARCH_API_KEY,
  folderId = process.env.YANDEX_FOLDER_ID,
  timeoutMs = 30_000,
} = {}) {
  if (!query || !String(query).trim()) throw new Error('Yandex Search: пустой запрос');
  if (!apiKey || !folderId) throw new Error('Yandex Search не настроен: YANDEX_SEARCH_API_KEY/YANDEX_FOLDER_ID');

  const body = {
    query: {
      searchType: 'SEARCH_TYPE_RU',
      queryText: String(query).trim(),
      familyMode: 'FAMILY_MODE_MODERATE',
      page: '0',
      fixTypoMode: 'FIX_TYPO_MODE_ON',
    },
    sortSpec: {
      sortMode: 'SORT_MODE_BY_RELEVANCE',
      sortOrder: 'SORT_ORDER_DESC',
    },
    groupSpec: {
      groupMode: 'GROUP_MODE_DEEP',
      groupsOnPage: String(Math.max(1, Math.min(10, Number(limit) || 5))),
      docsInGroup: '1',
    },
    folderId,
    responseFormat: 'FORMAT_XML',
    l10n: 'LOCALIZATION_RU',
    region: String(region || 213),
  };

  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Yandex Search ${response.status}: ${text.slice(0, 500)}`);
  let data = {};
  try { data = JSON.parse(text); } catch { throw new Error(`Yandex Search: некорректный JSON ${text.slice(0, 300)}`); }
  if (!data.rawData) return { results: [], latency_ms: Date.now() - started, request_id: data.requestId || null };
  const xml = Buffer.from(data.rawData, 'base64').toString('utf8');
  return {
    results: normalizeSearchResults(xml),
    latency_ms: Date.now() - started,
    request_id: data.requestId || null,
  };
}

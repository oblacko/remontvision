import { XMLParser } from 'fast-xml-parser';

const ENDPOINT = 'https://searchapi.api.cloud.yandex.net/v2/web/search';
const IMAGE_SEARCH_ENDPOINT = 'https://searchapi.api.cloud.yandex.net/v2/image/search';
const IMAGE_SEARCH_BY_IMAGE_ENDPOINT = 'https://searchapi.api.cloud.yandex.net/v2/image/search_by_image';

export const DEFAULT_PROCUREMENT_DOMAINS = [
  'divan.ru',
  'askona.ru',
  'stoolgroup.ru',
  'divanboss.ru',
  'sonum.ru',
  'wooden-world.ru',
  'mebelion.ru',
  'mnogosna.ru',
  'leoparquet.ru',
  'poli24.ru',
  'profiplitka.ru',
  'sanok.ru',
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
});

const asArray = value => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

const toNumberOrNull = value => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

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

export function buildSearchWebBody({
  query,
  region = '213',
  limit = 5,
  folderId,
  period = 'PERIOD_ALL_TIME',
  sortMode = 'SORT_MODE_BY_RELEVANCE',
  sortOrder = 'SORT_ORDER_DESC',
  groupMode = 'GROUP_MODE_DEEP',
  groupsOnPage = null,
  docsInGroup = 1,
  maxPassages = 2,
  l10n = 'LOCALIZATION_RU',
  page = '0',
  familyMode = 'FAMILY_MODE_MODERATE',
  fixTypoMode = 'FIX_TYPO_MODE_ON',
  userAgent = null,
} = {}) {
  if (!query || !String(query).trim()) throw new Error('Yandex Search: пустой запрос');
  const groups = Math.max(1, Math.min(100, Number(groupsOnPage ?? limit) || 1));
  return {
    query: {
      searchType: 'SEARCH_TYPE_RU',
      queryText: String(query).trim(),
      familyMode,
      page: String(page),
      fixTypoMode,
    },
    sortSpec: { sortMode, sortOrder },
    groupSpec: {
      groupMode,
      groupsOnPage: String(groups),
      docsInGroup: String(docsInGroup),
    },
    maxPassages: String(maxPassages),
    region: String(region || '213'),
    l10n,
    folderId,
    responseFormat: 'FORMAT_XML',
    period,
    ...(userAgent ? { user_agent: userAgent } : {}),
  };
}

export function buildSearchByImageBody({
  imageB64 = null,
  url = null,
  site = '',
  page = '0',
  familyMode = 'FAMILY_MODE_MODERATE',
  folderId,
} = {}) {
  return {
    ...(site ? { site } : {}),
    ...(folderId ? { folder_id: folderId } : {}),
    ...(imageB64 ? { data: imageB64 } : {}),
    ...(url ? { url } : {}),
    page: String(page),
    family_mode: familyMode,
  };
}

export function normalizeImageSearchResults(json) {
  return asArray(json?.images)
    .map(image => ({
      url: image?.url || null,
      format: image?.format || null,
      width: toNumberOrNull(image?.width),
      height: toNumberOrNull(image?.height),
      host: image?.host || null,
      pageUrl: image?.page_url ?? image?.pageUrl ?? null,
      pageTitle: image?.page_title ?? image?.pageTitle ?? null,
      passage: image?.passage || null,
    }))
    .filter(row => row.url || row.pageUrl);
}

function decodeXmlSource(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (raw.trim().startsWith('<')) return raw;
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  return decoded.includes('<') ? decoded : raw;
}

function collectImageNodes(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectImageNodes(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'image' || key === 'img') {
      for (const item of asArray(value)) {
        if (item && typeof item === 'object') out.push(item);
      }
      continue;
    }
    collectImageNodes(value, out);
  }
}

export function normalizeImageSearchXml(xml) {
  const source = decodeXmlSource(xml);
  if (!source) return [];
  const parsed = parser.parse(source.replace(/<\/?hlword>/gi, ''));
  const nodes = [];
  collectImageNodes(parsed, nodes);
  return nodes
    .map(node => ({
      url: clean(node?.url ?? node?.['@_url']) || null,
      format: clean(node?.format) || null,
      width: toNumberOrNull(node?.width ?? node?.['@_width']),
      height: toNumberOrNull(node?.height ?? node?.['@_height']),
      host: clean(node?.host) || null,
      pageUrl: clean(node?.pageUrl ?? node?.page_url) || null,
      pageTitle: clean(node?.pageTitle ?? node?.page_title) || null,
      passage: clean(node?.passage) || null,
    }))
    .filter(row => row.url || row.pageUrl);
}

function yandexKeys(apiKey, folderId) {
  if (!apiKey || !folderId) throw new Error('Yandex Search не настроен: YANDEX_SEARCH_API_KEY/YANDEX_FOLDER_ID');
}

export async function searchWeb({
  query,
  region = process.env.PROCUREMENT_REGION || '213',
  limit = 5,
  apiKey = process.env.YANDEX_SEARCH_API_KEY,
  folderId = process.env.YANDEX_FOLDER_ID,
  timeoutMs = 30_000,
  ...opts
} = {}) {
  if (!query || !String(query).trim()) throw new Error('Yandex Search: пустой запрос');
  yandexKeys(apiKey, folderId);

  const body = buildSearchWebBody({ query, region, limit, folderId, ...opts });

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

export async function searchWebSync({
  query,
  region = process.env.PROCUREMENT_REGION || '213',
  limit = 5,
  apiKey = process.env.YANDEX_SEARCH_API_KEY,
  folderId = process.env.YANDEX_FOLDER_ID,
  timeoutMs = 30_000,
} = {}) {
  return searchWeb({ query, region, limit, apiKey, folderId, timeoutMs });
}

export async function searchImagesByText({
  query,
  site = '',
  imageSpec = null,
  docsOnPage = 10,
  apiKey = process.env.YANDEX_SEARCH_API_KEY,
  folderId = process.env.YANDEX_FOLDER_ID,
  timeoutMs = 30_000,
} = {}) {
  if (!query || !String(query).trim()) throw new Error('Yandex Search: пустой запрос');
  yandexKeys(apiKey, folderId);

  const body = {
    query: {
      searchType: 'SEARCH_TYPE_RU',
      queryText: String(query).trim(),
      familyMode: 'FAMILY_MODE_MODERATE',
      page: '0',
    },
    ...(imageSpec ? { image_spec: imageSpec } : {}),
    ...(site ? { site } : {}),
    docs_on_page: String(docsOnPage),
    folder_id: folderId,
  };

  const started = Date.now();
  const response = await fetch(IMAGE_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Yandex image search ${response.status}: ${text.slice(0, 500)}`);
  let data = {};
  try { data = JSON.parse(text); } catch { throw new Error(`Yandex image search: некорректный JSON ${text.slice(0, 300)}`); }
  return {
    raw_base64: data.rawData || null,
    latency_ms: Date.now() - started,
    request_id: data.requestId || null,
  };
}

export async function searchImagesByImage({
  imageB64 = null,
  url = null,
  site = '',
  page = '0',
  familyMode = 'FAMILY_MODE_MODERATE',
  apiKey = process.env.YANDEX_SEARCH_API_KEY,
  folderId = process.env.YANDEX_FOLDER_ID,
  timeoutMs = 30_000,
} = {}) {
  if (!imageB64 && !url) throw new Error('Yandex image search: нужен imageB64 или url');
  yandexKeys(apiKey, folderId);

  const body = buildSearchByImageBody({ imageB64, url, site, page, familyMode, folderId });

  const started = Date.now();
  const response = await fetch(IMAGE_SEARCH_BY_IMAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Yandex image search ${response.status}: ${text.slice(0, 500)}`);
  let data = {};
  try { data = JSON.parse(text); } catch { throw new Error(`Yandex image search: некорректный JSON ${text.slice(0, 300)}`); }
  const rawData = data.rawData ?? data.raw_data;
  let images = [];
  if (Array.isArray(data.images)) {
    images = normalizeImageSearchResults(data);
  } else if (rawData) {
    images = normalizeImageSearchXml(rawData);
  }
  return {
    images,
    page: data.page ?? null,
    cbir_id: data.id ?? null,
    latency_ms: Date.now() - started,
  };
}

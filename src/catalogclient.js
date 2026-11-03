// Клиент отдельного каталог-сервиса: импорт фидов и векторный поиск по офферам.
const DEFAULT_TIMEOUT_MS = 15_000;

export function catalogBaseUrl(deps = {}) {
  return String(deps.baseUrl ?? process.env.CATALOG_SERVICE_URL ?? '').replace(/\/+$/, '');
}

export function catalogToken(deps = {}) {
  return String(deps.token ?? process.env.CATALOG_SERVICE_TOKEN ?? '');
}

async function request(path, { method = 'GET', body = null, deps = {} } = {}) {
  const baseUrl = catalogBaseUrl(deps);
  if (!baseUrl) throw new Error('Каталог-сервис не настроен (CATALOG_SERVICE_URL)');
  const fetchImpl = deps.fetchImpl || fetch;
  const timeoutMs = Number(deps.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const headers = { 'x-catalog-token': catalogToken(deps) };
  const init = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
  if (body != null) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, init);
  } catch (e) {
    throw new Error(`Каталог-сервис недоступен: ${String(e.message || e).slice(0, 200)}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Каталог-сервис вернул ${response.status}: ${String(detail).slice(0, 200)}`);
  }
  return response.json();
}

export async function searchCatalog({ image = null, text = null, filters = null, topK = null, minScore = null } = {}, deps = {}) {
  const body = {};
  if (image) body.image_b64 = Buffer.from(image).toString('base64');
  if (text) body.text = String(text);
  if (filters) body.filters = filters;
  if (topK != null) body.top_k = Number(topK);
  if (minScore != null) body.min_score = Number(minScore);
  if (!body.image_b64 && !body.text) throw new Error('Нужно изображение или текст для поиска');
  const data = await request('/search', { method: 'POST', body, deps });
  return { results: Array.isArray(data?.results) ? data.results : [] };
}

export async function listCatalogFeeds(deps = {}) {
  const data = await request('/feeds', { deps });
  return Array.isArray(data) ? data : [];
}

export async function syncCatalogFeed(feedId, deps = {}) {
  return request(`/feeds/${encodeURIComponent(feedId)}/sync`, { method: 'POST', deps });
}

export async function createCatalogFeed(feed, deps = {}) {
  return request('/feeds', { method: 'POST', body: feed, deps });
}

export async function catalogHealth(deps = {}) {
  return request('/health', { deps });
}

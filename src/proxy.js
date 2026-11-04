// Прокси нужен только для OpenRouter: остальные внешние сервисы (магазины, Yandex,
// картинки, почта, платежи) ходят напрямую. Раньше прокси подменял global fetch,
// из-за чего недоступный SOCKS5 ронял импорт товаров и отправку писем.
let currentUrl = '';
let lastTest = null;
const originalFetch = globalThis.fetch;

let undiciMod = null;
let nodeFetchMod = null;
let socksAgentMod = null;
let directDispatcher = null;
let proxyDispatcher = null;
let socksAgentCached = null;

const getUndici = () => undiciMod || (undiciMod = import('undici'));
const getNodeFetch = () => nodeFetchMod || (nodeFetchMod = import('node-fetch').then(m => m.default));
const getSocksAgent = () => socksAgentMod || (socksAgentMod = import('socks-proxy-agent').then(m => m.SocksProxyAgent));

function isSocks(url) {
  return /^socks5h?:/i.test(String(url || ''));
}

function normalize(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  let u;
  try { u = new URL(raw); } catch { throw new Error('Некорректный URL прокси'); }
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(u.protocol)) {
    throw new Error('Прокси должен быть http(s) или socks5://');
  }
  return raw;
}

export function maskProxy(url) {
  return String(url || '').replace(/\/\/[^/@]+@/, '//***@');
}

export function getProxyState({ masked = false } = {}) {
  const env = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  return {
    url: masked ? maskProxy(currentUrl) : currentUrl,
    has_url: Boolean(currentUrl),
    env_url: masked ? maskProxy(env) : env,
    status: lastTest,
  };
}

async function getDirectDispatcher() {
  if (!directDispatcher) {
    const { Agent } = await getUndici();
    directDispatcher = new Agent({ connect: { timeout: 15_000 } });
  }
  return directDispatcher;
}

// Прямой запрос в обход прокси: undici Agent игнорирует глобальный ProxyAgent.
// globalThis.fetch читаем на каждом вызове, чтобы тесты и патчи могли его подменять.
export async function directFetch(input, init = {}) {
  return globalThis.fetch(input, { ...init, dispatcher: await getDirectDispatcher() });
}

async function getProxyDispatcher() {
  if (isSocks(currentUrl)) {
    if (!socksAgentCached) {
      const SocksProxyAgent = await getSocksAgent();
      socksAgentCached = new SocksProxyAgent(currentUrl);
    }
    return socksAgentCached;
  }
  if (!proxyDispatcher) {
    const { ProxyAgent } = await getUndici();
    proxyDispatcher = new ProxyAgent(currentUrl);
  }
  return proxyDispatcher;
}

// Запрос через настроенный прокси. Используется только OpenRouter.
export async function proxyFetch(input, init = {}) {
  if (!currentUrl) return directFetch(input, init);
  if (isSocks(currentUrl)) {
    const nodeFetch = await getNodeFetch();
    return nodeFetch(input, { ...init, agent: await getProxyDispatcher() });
  }
  return originalFetch(input, { ...init, dispatcher: await getProxyDispatcher() });
}

export async function applyProxy(url) {
  const clean = normalize(url);
  currentUrl = clean;
  proxyDispatcher = null;
  socksAgentCached = null;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'proxy_applied', url: maskProxy(clean), protocol: isSocks(clean) ? 'socks5' : 'http', scope: 'openrouter' }));
  return getProxyState({ masked: true });
}

async function fetchThrough(clean, target, init = {}) {
  if (isSocks(clean)) {
    const nodeFetch = await getNodeFetch();
    const SocksProxyAgent = await getSocksAgent();
    return nodeFetch(target, { ...init, agent: new SocksProxyAgent(clean) });
  }
  const { ProxyAgent } = await getUndici();
  return originalFetch(target, { ...init, dispatcher: new ProxyAgent(clean) });
}

export async function testProxy(url) {
  const clean = normalize(url);
  const started = Date.now();
  let result;
  try {
    const r = clean
      ? await fetchThrough(clean, 'https://openrouter.ai/api/v1/models', {
          signal: AbortSignal.timeout(15_000),
          headers: { 'user-agent': 'remontvision-proxy-check/1.0' },
        })
      : await directFetch('https://openrouter.ai/api/v1/models', {
          signal: AbortSignal.timeout(15_000),
          headers: { 'user-agent': 'remontvision-proxy-check/1.0' },
        });
    result = { ok: r.ok, status: r.status, ms: Date.now() - started, at: new Date().toISOString() };
  } catch (e) {
    result = { ok: false, status: 0, ms: Date.now() - started, at: new Date().toISOString(), error: String(e.message || e).slice(0, 300) };
  }
  lastTest = result;
  return result;
}

export async function loadProxyConfig() {
  let stored = '';
  let hasStored = false;
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys(['proxy.url']);
    const row = rows.find(r => r.key === 'proxy.url');
    if (row) { stored = row.value || ''; hasStored = true; }
  } catch { /* таблицы может ещё не быть */ }
  await applyProxy(hasStored ? stored : (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''));
}

// Прокси для OpenRouter: http(s) через undici, socks5 через node-fetch + SocksProxyAgent.
// Значение хранится в app_settings (proxy.url), env HTTPS_PROXY — фолбэк.
let currentUrl = '';
let lastTest = null;
const originalFetch = globalThis.fetch;

async function undici() {
  return import('undici');
}

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

export async function applyProxy(url) {
  const clean = normalize(url);
  if (isSocks(clean)) {
    const { default: nodeFetch } = await import('node-fetch');
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    const agent = new SocksProxyAgent(clean);
    // undici не умеет SOCKS5: на время socks-режима подменяем global fetch.
    globalThis.fetch = (input, init = {}) => nodeFetch(input, { ...init, agent });
  } else {
    globalThis.fetch = originalFetch;
    const { ProxyAgent, Agent, setGlobalDispatcher } = await undici();
    if (clean) setGlobalDispatcher(new ProxyAgent(clean));
    else setGlobalDispatcher(new Agent());
  }
  currentUrl = clean;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'proxy_applied', url: maskProxy(clean), protocol: isSocks(clean) ? 'socks5' : 'http' }));
  return getProxyState({ masked: true });
}

export async function testProxy(url) {
  const clean = normalize(url);
  const started = Date.now();
  let result;
  try {
    if (isSocks(clean)) {
      const { default: nodeFetch } = await import('node-fetch');
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      const agent = new SocksProxyAgent(clean);
      const r = await nodeFetch('https://openrouter.ai/api/v1/models', {
        agent,
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'remontvision-proxy-check/1.0' },
      });
      result = { ok: r.ok, status: r.status, ms: Date.now() - started, at: new Date().toISOString() };
    } else {
      const { ProxyAgent, fetch: undiciFetch } = await undici();
      const dispatcher = clean ? new ProxyAgent(clean) : undefined;
      const r = await undiciFetch('https://openrouter.ai/api/v1/models', {
        dispatcher,
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'remontvision-proxy-check/1.0' },
      });
      result = { ok: r.ok, status: r.status, ms: Date.now() - started, at: new Date().toISOString() };
    }
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

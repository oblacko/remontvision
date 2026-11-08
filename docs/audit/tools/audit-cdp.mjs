// Сбор доказательств аудита через Chrome DevTools Protocol (без установки зависимостей).
// Запуск: node docs/audit/tools/audit-cdp.mjs
// Пишет JSON в docs/audit/raw/ и скриншоты в docs/audit/screenshots/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'google-chrome';
const PORT = 9333;
const BASE = 'https://www.remontvision.ru';
const ROOT = path.join(process.cwd(), 'docs', 'audit');
const RAW = path.join(ROOT, 'raw');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES = [
  { key: 'home', path: '/' },
  { key: 'prices', path: '/prices' },
  { key: 'offer', path: '/offer' },
  { key: 'privacy', path: '/privacy' },
  { key: 'cabinet-anon', path: '/cabinet' },
  { key: 'app-anon', path: '/app' },
  { key: 'admin-anon', path: '/admin' },
  { key: 'article-404', path: '/articles/nonexistent' },
  { key: 'notfound', path: '/nonexistent' },
  { key: 'share-invalid', path: '/s/invalid' },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

async function launchChrome() {
  const profile = `/tmp/audit-chrome-${Date.now()}`;
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return { proc, profile };
    } catch { /* not ready */ }
    await sleep(200);
  }
  throw new Error('Chrome не поднялся');
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
  }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else {
        for (const h of this.handlers) h(msg);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(fn) { this.handlers.push(fn); }
  off(fn) { this.handlers = this.handlers.filter(h => h !== fn); }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const EVAL = `(() => {
  const meta = name => document.querySelector('meta[name="' + name + '"]')?.content || '';
  const og = [...document.querySelectorAll('meta[property^="og:"]')].map(m => [m.getAttribute('property'), m.content]);
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource').map(r => ({ name: r.name, type: r.initiatorType, transfer: r.transferSize || 0, encoded: r.encodedBodySize || 0, duration: Math.round(r.duration) }));
  return JSON.stringify({
    url: location.href, title: document.title,
    description: meta('description'), robots: meta('robots'),
    og, h1: [...document.querySelectorAll('h1')].map(h => h.innerText.trim()),
    h2: [...document.querySelectorAll('h2')].map(h => h.innerText.trim()).slice(0, 20),
    buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 40),
    links: [...document.querySelectorAll('a')].map(a => ({ text: a.innerText.trim(), href: a.href })).filter(x => x.text).slice(0, 60),
    forms: document.querySelectorAll('form').length,
    inputs: [...document.querySelectorAll('input,select,textarea')].map(i => ({ tag: i.tagName, type: i.type, placeholder: i.placeholder || '', aria: i.getAttribute('aria-label') || '' })).slice(0, 30),
    images: [...document.querySelectorAll('img')].map(i => ({ src: i.currentSrc || i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight })).slice(0, 40),
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent.slice(0, 300)),
    bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 4000),
    nav: { ttfb: Math.round(nav.responseStart || 0), domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0) },
    resources: res,
  });
})()`;

async function audit(chromeWs, page, vp) {
  const url = `${BASE}${page.path}`;
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await r.json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();

  const consoleErrors = [];
  const exceptions = [];
  const responses = [];
  const failed = [];
  cdp.on(msg => {
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 500));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || '').slice(0, 500));
    }
    if (msg.method === 'Network.responseReceived') {
      const resp = msg.params.response;
      responses.push({ url: resp.url, status: resp.status, type: resp.mimeType, size: resp.encodedDataLength || 0 });
    }
    if (msg.method === 'Network.loadingFailed') {
      failed.push({ url: msg.params.requestId, error: msg.params.errorText, blocked: msg.params.blockedReason || '' });
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });

  const loaded = new Promise(res => {
    const h = msg => { if (msg.method === 'Page.loadEventFired') { cdp.off(h); res(); } };
    cdp.on(h);
  });
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(3000);
  // прокрутка для lazy-изображений
  try {
    await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0);})()`,
      awaitPromise: true,
    });
    await sleep(1200);
  } catch { /* ignore */ }

  const info = JSON.parse((await cdp.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })).result.value);

  let shotOk = false;
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
    fs.writeFileSync(path.join(SHOTS, `${page.key}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    shotOk = true;
  } catch (e) { /* ignore */ }

  const result = {
    page: page.key, path: page.path, viewport: vp.name, requestedUrl: url,
    finalUrl: info.url, shotOk,
    consoleErrors, exceptions,
    failedRequests: failed,
    badResponses: responses.filter(r => r.status >= 400),
    responses,
    ...info,
  };
  fs.writeFileSync(path.join(RAW, `${page.key}-${vp.name}.json`), JSON.stringify(result, null, 2));
  console.log(`${page.key}/${vp.name}: status=${responses.find(x => x.url === url)?.status ?? '?'} consoleErrors=${consoleErrors.length} bad=${result.badResponses.length} shot=${shotOk}`);

  cdp.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
  await sleep(300);
  return result;
}

const { proc, profile } = await launchChrome();
try {
  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      try { await audit(proc, page, vp); }
      catch (e) { console.error(`FAIL ${page.key}/${vp.name}: ${e.message}`); }
    }
  }
} finally {
  try { proc.kill('SIGKILL'); } catch { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log('DONE');

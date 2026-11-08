// Авторизованный проход (тестовый аккаунт) + read-only админка.
// Токены/ключи читаются из файлов, в вывод не печатаются.
// Запуск: node docs/audit/tools/auth-cdp.mjs user|admin
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'google-chrome';
const PORT = 9555;
const BASE = 'https://www.remontvision.ru';
const ROOT = path.join(process.cwd(), 'docs', 'audit');
const RAW = path.join(ROOT, 'raw');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const session = JSON.parse(fs.readFileSync('/tmp/test-session.json', 'utf8'));
const adminKey = fs.existsSync('/tmp/admin-key.txt') ? fs.readFileSync('/tmp/admin-key.txt', 'utf8').trim() : '';
const mode = process.argv[2] || 'user';

const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/auth-${Date.now()}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(200); }

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.handlers = []; }
  async open() { await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); this.ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else { for (const h of this.handlers) h(m); } }; }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

const EVAL = `(() => {
  const meta = n => document.querySelector('meta[name="' + n + '"]')?.content || '';
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return JSON.stringify({
    url: location.href, title: document.title, description: meta('description'),
    h1: [...document.querySelectorAll('h1')].map(h => h.innerText.trim()),
    h2: [...document.querySelectorAll('h2')].map(h => h.innerText.trim()).slice(0, 15),
    buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 60),
    inputs: [...document.querySelectorAll('input,select,textarea')].map(i => ({ tag: i.tagName, type: i.type, placeholder: i.placeholder || '', value: i.value || '' })).slice(0, 30),
    bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 6000),
    nav: { ttfb: Math.round(nav.responseStart || 0), load: Math.round(nav.loadEventEnd || 0) },
  });
})()`;

async function pageCdp(url, { token = null, admin = false, width = 1440, height = 900 } = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const target = await r.json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  const consoleErrors = [], exceptions = [], bad = [], responses = [];
  cdp.on(msg => {
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(String(msg.params.exceptionDetails?.text || '').slice(0, 300));
    if (msg.method === 'Network.responseReceived') { const res = msg.params.response; responses.push({ url: res.url, status: res.status }); if (res.status >= 400) bad.push({ url: res.url, status: res.status }); }
  });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  if (token) {
    await cdp.send('Network.setCookie', { name: 'rv_sid', value: token, domain: 'www.remontvision.ru', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
  }
  if (admin) {
    // ключ кладём в localStorage до загрузки SPA
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1500);
    await cdp.send('Runtime.evaluate', { expression: `localStorage.setItem('rv_admin_key', ${JSON.stringify(adminKey)})` });
  }
  await cdp.send('Page.navigate', { url });
  await sleep(4000);
  return { cdp, target, consoleErrors, exceptions, bad, responses };
}

async function snap(cdp, key, vp = 'desktop') {
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
    fs.writeFileSync(path.join(SHOTS, `${key}-${vp}.png`), Buffer.from(shot.data, 'base64'));
  } catch {}
}

async function save(key, vp, cdp, extra) {
  const info = JSON.parse((await cdp.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })).result.value);
  fs.writeFileSync(path.join(RAW, `${key}-${vp}.json`), JSON.stringify({ key, vp, ...extra, ...info }, null, 2));
  await snap(cdp, key, vp);
  console.log(`${key}/${vp}: ok consoleErrors=${extra.consoleErrors.length} bad=${extra.bad.length} url=${info.url}`);
}

async function closeAll(cdp) {
  cdp.close();
  try { await fetch(`http://127.0.0.1:${PORT}/json/close/${cdp._target}`); } catch {}
}

try {
  if (mode === 'user') {
    // 1) Кабинет (залогинен)
    {
      const p = await pageCdp(BASE + '/cabinet', { token: session.token });
      p.cdp._target = p.target.id;
      await save('auth-cabinet', 'desktop', p.cdp, p);
      p.cdp.close();
    }
    // 2) Лендинг залогинен
    {
      const p = await pageCdp(BASE + '/', { token: session.token });
      p.cdp._target = p.target.id;
      await save('auth-home', 'desktop', p.cdp, p);
      p.cdp.close();
    }
    // 3) Генератор (панель)
    {
      const p = await pageCdp(BASE + '/?panel=1', { token: session.token });
      p.cdp._target = p.target.id;
      await sleep(2000);
      await save('auth-generator', 'desktop', p.cdp, p);
      // мобильный вид генератора
      await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(800);
      await save('auth-generator', 'mobile', p.cdp, p);
      p.cdp.close();
    }
    // 4) Кабинет мобильный
    {
      const p = await pageCdp(BASE + '/cabinet', { token: session.token, width: 390, height: 844 });
      p.cdp._target = p.target.id;
      await save('auth-cabinet', 'mobile', p.cdp, p);
      p.cdp.close();
    }
  } else {
    const p = await pageCdp(BASE + '/admin', { admin: true });
    p.cdp._target = p.target.id;
    await sleep(2500);
    await save('admin-auth', 'desktop', p.cdp, p);
    const tabs = ['Пакеты кредитов', 'Комнаты', 'Стили', 'Модели', 'Очистка', 'Генерация', 'Статьи', 'Каталог'];
    for (const tab of tabs) {
      try {
        const clicked = await p.cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(tab)}); if(b){b.click();return true;} return false;})()`, returnByValue: true });
        if (!clicked.result.value) { console.log('tab not found:', tab); continue; }
        await sleep(2500);
        await snap(p.cdp, `admin-tab-${tab.replace(/\s+/g, '-')}`, 'desktop');
        const info = JSON.parse((await p.cdp.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })).result.value);
        fs.writeFileSync(path.join(RAW, `admin-tab-${tab.replace(/\s+/g, '-')}-desktop.json`), JSON.stringify({ tab, ...info }, null, 2));
        console.log('tab ok:', tab, '|', info.bodyText.slice(0, 120));
      } catch (e) { console.log('tab fail:', tab, e.message); }
    }
    p.cdp.close();
  }
} finally {
  try { proc.kill('SIGKILL'); } catch {}
}
console.log('DONE');

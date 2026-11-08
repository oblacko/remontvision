// Драйвер генерации на тестовом аккаунте (шаг 1: загрузка фото → шаг 2 → генерация).
// Запуск: node docs/audit/tools/gen-cdp.mjs inspect|run
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'google-chrome';
const PORT = 9666;
const BASE = 'https://www.remontvision.ru';
const ROOT = path.join(process.cwd(), 'docs', 'audit');
fs.mkdirSync(path.join(ROOT, 'raw'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
const session = JSON.parse(fs.readFileSync('/tmp/test-session.json', 'utf8'));
const PHOTO = path.join(process.cwd(), 'tmp', 'user-room.jpg');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mode = process.argv[2] || 'inspect';

const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/gen-${Date.now()}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(200); }

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.handlers = []; }
  async open() { await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); this.ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else { for (const h of this.handlers) h(m); } }; }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const cdp = new CDP(target.webSocketDebuggerUrl);
await cdp.open();
const logs = [];
const requests = [];
cdp.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + String(m.params.exceptionDetails?.text || '').slice(0, 200));
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
});
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
await cdp.send('Network.setCookie', { name: 'rv_sid', value: session.token, domain: 'www.remontvision.ru', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
await cdp.send('Page.navigate', { url: BASE + '/?panel=1' });
await sleep(4500);

const evalJson = async expr => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value);

async function inspect() {
  const data = await evalJson(`(() => {
    const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const files = [...document.querySelectorAll('input[type=file]')].map((el, i) => ({ i, visible: visible(el), accept: el.accept }));
    const buttons = [...document.querySelectorAll('button')].filter(visible).map(b => ({ text: b.innerText.trim().slice(0, 50), disabled: b.disabled }));
    const panels = [...document.querySelectorAll('[role=dialog], [data-state=open]')].map(p => p.innerText.replace(/\\s+/g, ' ').slice(0, 800));
    return JSON.stringify({ files, buttons, panels, panelText: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1200) });
  })()`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function uploadAndProceed() {
  const dom = await cdp.send('DOM.getDocument', { depth: -1 });
  const q = await cdp.send('DOM.querySelectorAll', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
  console.log('file inputs:', q.nodeIds.length);
  // выбираем видимый file input
  let chosen = null;
  for (const nodeId of q.nodeIds) {
    const desc = await cdp.send('DOM.describeNode', { nodeId });
    const box = await cdp.send('DOM.getBoxModel', { nodeId }).catch(() => null);
    if (box) { chosen = nodeId; break; }
  }
  if (!chosen) throw new Error('видимый file input не найден');
  await cdp.send('DOM.setFileInputFiles', { nodeId: chosen, files: [PHOTO] });
  console.log('photo set');
  await sleep(2000);
  // выбрать тип комнаты
  const roomClicked = await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Спальня' && x.offsetParent); if(b){b.click();return true;} return false;})()`, returnByValue: true });
  console.log('room clicked:', roomClicked.result.value);
  // ждать, пока бриф закончится и «Продолжить» станет активной
  for (let i = 0; i < 30; i++) {
    const st = await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Продолжить' && x.offsetParent); return b ? !b.disabled : false;})()`, returnByValue: true });
    if (st.result.value) { console.log('brief ready after', i, 's'); break; }
    await sleep(1000);
  }
  await sleep(800);
  const clicked = await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Продолжить' && x.offsetParent); if(b){b.click();return true;} return false;})()`, returnByValue: true });
  console.log('proceed clicked:', clicked.result.value);
  await sleep(3000);
}

try {
  if (mode === 'inspect') {
    await inspect();
  } else if (mode === 'upload') {
    const dom = await cdp.send('DOM.getDocument', { depth: -1 });
    const q = await cdp.send('DOM.querySelectorAll', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
    let chosen = null;
    for (const nodeId of q.nodeIds) {
      const box = await cdp.send('DOM.getBoxModel', { nodeId }).catch(() => null);
      if (box) { chosen = nodeId; break; }
    }
    if (!chosen) throw new Error('file input не найден');
    await cdp.send('DOM.setFileInputFiles', { nodeId: chosen, files: [PHOTO] });
    await sleep(4000);
    const text = (await cdp.send('Runtime.evaluate', { expression: `document.body.innerText.replace(/\\s+/g,' ')`, returnByValue: true })).result.value;
    const proceed = (await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Продолжить' && x.offsetParent); return b? b.disabled : null;})()`, returnByValue: true })).result.value;
    console.log('estimate-room requests:', requests.filter(u => u.includes('estimate-room')));
    console.log('brief UI present:', /Смотрим фото|Бриф комнаты|БРИФ/.test(text));
    console.log('proceed disabled:', proceed);
    console.log('panel snippet:', text.slice(Math.max(0, text.indexOf('ГЕНЕРАТОР')), Math.max(0, text.indexOf('ГЕНЕРАТОР')) + 400));
  } else {
    await uploadAndProceed();
    const evalStr = async expr => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    const evalJson = async expr => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value);
    const clickText = async (text, contains = false) => {
      const expr = contains
        ? `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(text)}) && x.offsetParent); if(b){b.click();return true;} return false;})()`
        : `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(text)} && x.offsetParent); if(b){b.click();return true;} return false;})()`;
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result.value;
    };
    console.log('style:', await clickText('Скандинавский'));
    console.log('more:', await clickText('Дополнительно', true));
    await sleep(900);
    console.log('catalog:', await clickText('Использовать каталог', true));
    await sleep(600);
    console.log('catalog aria-pressed:', await evalStr(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Использовать каталог')); return b? b.getAttribute('aria-pressed') : null;})()`));
    const shotExtras = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(ROOT, 'screenshots', 'gen-style-extras.png'), Buffer.from(shotExtras.data, 'base64'));
    console.log('generate:', await clickText('Сгенерировать'));
    let last = null;
    for (let i = 0; i < 90; i++) {
      await sleep(3000);
      try {
        const list = await evalJson(`fetch('/api/my/generations').then(r=>r.json()).then(j=>JSON.stringify(j))`);
        last = (Array.isArray(list) ? list : (list.generations || []))[0] || null;
        if (last && ['done', 'error', 'rejected'].includes(last.status)) { console.log('generation status:', last.status, 'after', (i + 1) * 3, 's'); break; }
        if (i % 5 === 0) console.log('...waiting', (i + 1) * 3, 's', last?.status || '?');
      } catch { /* ignore */ }
    }
    const me = await evalJson(`fetch('/api/me').then(r=>r.json()).then(j=>JSON.stringify(j))`).catch(() => null);
    console.log('me:', JSON.stringify(me));
    const final = await evalStr(`document.body.innerText.replace(/\\s+/g,' ').slice(0,1800)`);
    console.log('final:', final);
    const shotResult = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(ROOT, 'screenshots', 'gen-result.png'), Buffer.from(shotResult.data, 'base64'));
    fs.writeFileSync(path.join(ROOT, 'raw', 'gen-result.json'), JSON.stringify({ last, me, final }, null, 2));
    console.log('saved gen-result.png');
  }
  if (logs.length) console.log('LOGS:', logs.slice(0, 10));
} catch (e) {
  console.error('ERROR', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
}
process.exit(0);

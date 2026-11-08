// Полный end-to-end сценарий на тестовом аккаунте:
// фото → тип → стиль → опции → генерация → результат → поиск товаров → правка.
// Токен сессии берётся из /tmp/test-session.json, в вывод не печатается.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'google-chrome';
const PORT = 9777;
const BASE = 'https://www.remontvision.ru';
const ROOT = path.join(process.cwd(), 'docs', 'audit');
const RAW = path.join(ROOT, 'raw');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const session = JSON.parse(fs.readFileSync('/tmp/test-session.json', 'utf8'));
const PHOTO = path.join(process.cwd(), 'tmp', 'user-room.jpg');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/full-${Date.now()}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
const consoleErrors = []; const requests = [];
cdp.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
});
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
await cdp.send('Network.setCookie', { name: 'rv_sid', value: session.token, domain: 'www.remontvision.ru', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });

const evalStr = async expr => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const evalJson = async expr => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value);
const snap = async name => { const s = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(s.data, 'base64')); console.log('shot:', name); };
const text = async () => evalStr(`document.body.innerText.replace(/\\s+/g,' ')`);
const click = async (needle, contains = false) => (await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>${contains ? `x.innerText.includes(${JSON.stringify(needle)})` : `x.innerText.trim()===${JSON.stringify(needle)}`} && x.offsetParent); if(b){b.click();return true;} return false;})()`, returnByValue: true })).result.value;
const waitText = async (re, timeoutMs, label) => { const t0 = Date.now(); while (Date.now() - t0 < timeoutMs) { const body = await text(); if (re.test(body)) return body; await sleep(3000); } console.log('timeout waiting:', label); return await text(); };

try {
  await cdp.send('Page.navigate', { url: BASE + '/?panel=1' });
  await sleep(4500);

  // 1) фото
  const dom = await cdp.send('DOM.getDocument', { depth: -1 });
  const q = await cdp.send('DOM.querySelectorAll', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
  let fileInput = null;
  for (const nodeId of q.nodeIds) { const box = await cdp.send('DOM.getBoxModel', { nodeId }).catch(() => null); if (box) { fileInput = nodeId; break; } }
  if (!fileInput) throw new Error('file input не найден');
  await cdp.send('DOM.setFileInputFiles', { nodeId: fileInput, files: [PHOTO] });
  await sleep(2000);
  await snap('flow-01-upload');

  // 2) тип комнаты
  console.log('room type:', await click('Спальня'));
  await sleep(800);
  await snap('flow-02-type');
  console.log('proceed:', await click('Продолжить'));
  await sleep(2500);

  // 3) стиль
  console.log('style:', await click('Скандинавский'));
  await sleep(600);
  await snap('flow-03-style');

  // 4) опции: каталог
  console.log('advanced:', await click('Дополнительно', true));
  await sleep(900);
  console.log('catalog:', await click('Использовать каталог', true));
  await sleep(500);
  await snap('flow-04-options');

  // 5) генерация
  console.log('generate:', await click('Сгенерировать'));
  await sleep(1500);
  await snap('flow-05-generating');
  let gen = null;
  for (let i = 0; i < 90; i++) {
    await sleep(3000);
    const list = await evalJson(`fetch('/api/my/generations').then(r=>r.json()).then(j=>JSON.stringify(j))`);
    gen = (Array.isArray(list) ? list : (list.generations || []))[0] || null;
    if (gen && ['done', 'error', 'rejected'].includes(gen.status)) { console.log('gen status:', gen.status, 'after', (i + 1) * 3, 's'); break; }
    if (i % 5 === 0) console.log('...gen', (i + 1) * 3, 's', gen?.status || '?');
  }
  const afterGen = await text();
  fs.writeFileSync(path.join(RAW, 'flow-result.json'), JSON.stringify({ gen, panel: afterGen.slice(0, 4000) }, null, 2));
  await snap('flow-06-result');
  console.log('result has hints:', /Что видно на фото/.test(afterGen), '| has art brief:', /Авторский бриф/.test(afterGen));

  // 6) поиск товаров
  console.log('open procurement:', await click('Найти товары', true));
  await sleep(2000);
  await snap('flow-07-procurement-start');
  console.log('start search:', await click('Начать поиск', true));
  const procText = await waitText(/Подбор готов|Не удалось подобрать|Не хватает кредита|Кредит возвращён/, 8 * 60 * 1000, 'procurement');
  fs.writeFileSync(path.join(RAW, 'flow-procurement.json'), JSON.stringify({ text: procText.slice(0, 6000) }, null, 2));
  await snap('flow-08-procurement');
  console.log('procurement done:', /Подбор готов/.test(procText), '| error:', /Не удалось|Не хватает/.test(procText));

  // закрыть панель подбора
  await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Закрыть' && x.offsetParent); if(b){b.click();return true;} return false;})()`, returnByValue: true });
  await sleep(1500);

  // 7) правка: раскрыть историю и нажать пресет
  const roomId = gen?.room_id;
  const initialRenderId = gen?.id;
  const expanded = await cdp.send('Runtime.evaluate', { expression: `(()=>{const aside=[...document.querySelectorAll('aside')].find(a=>a.innerText.includes('История правок')); if(!aside) return false; const b=aside.querySelector('button[aria-expanded]'); if(b){b.click();return true;} return false;})()`, returnByValue: true });
  console.log('expanded history:', expanded.result.value);
  await sleep(1200);
  console.log('edit preset:', await click('Изменить цвет пола на тёмный дуб', true));
  let editDone = false;
  for (let i = 0; i < 90; i++) {
    await sleep(3000);
    const room = await evalJson(`fetch('/api/rooms/${roomId}').then(r=>r.json()).then(j=>JSON.stringify(j))`).catch(() => null);
    const latest = room?.render;
    if (latest && latest.id !== initialRenderId && ['done', 'error', 'rejected'].includes(latest.status)) {
      editDone = true;
      console.log('edit done after', (i + 1) * 3, 's', 'new render:', latest.id, latest.status);
      break;
    }
    if (i % 5 === 0) console.log('...edit', (i + 1) * 3, 's', 'render:', latest?.id || '?', latest?.status || '?');
  }
  await snap('flow-09-edit');
  const editText = await text();
  fs.writeFileSync(path.join(RAW, 'flow-edit.json'), JSON.stringify({ editDone, initialRenderId, text: editText.slice(0, 4000) }, null, 2));
  console.log('edit done:', editDone);

  fs.writeFileSync(path.join(RAW, 'flow-network.json'), JSON.stringify({ consoleErrors, estimateRequests: requests.filter(u => u.includes('estimate-room')), procurementRequests: requests.filter(u => u.includes('procurement')), iterations: requests.filter(u => u.includes('iterate')) }, null, 2));
  console.log('console errors:', consoleErrors.length, '| estimate-room calls:', requests.filter(u => u.includes('estimate-room')).length);
} catch (e) {
  console.error('FLOW ERROR', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
}
process.exit(0);

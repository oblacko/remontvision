// Проверка порядка фокуса с клавиатуры (Tab) на странице через CDP.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'google-chrome';
const PORT = 9444;
const URL = process.argv[2] || 'https://www.remontvision.ru/';
const TABS = Number(process.argv[3] || 25);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/kbd-${Date.now()}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(200); }
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(4000);
const focusAt = async () => {
  const r = await send('Runtime.evaluate', { expression: `(()=>{const a=document.activeElement;if(!a)return'';const t=(a.innerText||a.value||a.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim().slice(0,60);return a.tagName+' | '+(a.getAttribute('role')||'')+' | '+(a.getAttribute('href')||'')+' | '+t;})()`, returnByValue: true });
  return r.result.value;
};
const order = [];
for (let i = 0; i < TABS; i++) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await sleep(120);
  order.push(await focusAt());
}
const out = { url: URL, tabs: TABS, order };
fs.mkdirSync(path.join(process.cwd(), 'docs', 'audit', 'raw'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'docs', 'audit', 'raw', 'keyboard-focus.json'), JSON.stringify(out, null, 2));
console.log(order.map((x, i) => `${String(i + 1).padStart(2)}. ${x}`).join('\n'));
try { proc.kill('SIGKILL'); } catch {}
process.exit(0);

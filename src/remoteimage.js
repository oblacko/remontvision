// Безопасная загрузка картинки по URL для правок (референс «вот по этой ссылке»).
// Блокируем localhost/private IP, не image content-type, большие файлы и длинные редиректы.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice('::ffff:'.length));
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

export async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Некорректная ссылка'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ссылка должна быть http(s)');
  if (url.username || url.password) throw new Error('Ссылка с логином/паролем запрещена');
  if (!url.hostname) throw new Error('В ссылке нет домена');
  const addrs = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Ссылка ведёт на приватный адрес');
  return url;
}

export async function fetchRemoteImage(raw) {
  let url = await assertPublicUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'remontvision/1.0 (+https://www.remontvision.ru)' },
    });
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get('location');
      if (!location) throw new Error('Редирект без Location');
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!r.ok) throw new Error(`Ссылка вернула ${r.status}`);
    const mime = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(mime)) throw new Error('По ссылке не JPG/PNG/WebP');
    const length = Number(r.headers.get('content-length') || 0);
    if (length && length > MAX_BYTES) throw new Error('Картинка больше 12 МБ');
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error('Картинка больше 12 МБ');
    return { buffer, mime };
  }
  throw new Error('Слишком много редиректов');
}

export function firstImageUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;!?]+$/, '') : null;
}

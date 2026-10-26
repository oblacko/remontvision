import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, migrate } from './db.js';
import { startWorker, enqueueRender } from './jobs.js';
import { listImageModels, MOCK_MODE, assertConfig, log } from './openrouter.js';
import { rateLimit } from './ratelimit.js';
import { requestCode, verifyCode, sessionUser, setSessionCookie, clearSessionCookie, logout } from './auth.js';
import { PACKS, packById, createPayment, syncPayment, createRefund, refundQuote, yukassaConfigured } from './payments.js';
import { putBuffer, redirectUrl, resolveDisk } from './storage.js';
import { sanitizeImage } from './media.js';
import { LEGAL_VERSIONS, LEGAL_URLS, currentLegal, clientIp, requireConsents, recordAcceptances } from './legal.js';

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));
app.use('/assets', express.static('assets'));
app.use(sessionUser);

const LEGAL_PAGES = {
  '/prices': 'prices.html',
  '/offer': 'offer.html',
  '/delivery': 'delivery.html',
  '/contacts': 'contacts.html',
  '/privacy': 'privacy.html',
};
for (const [route, file] of Object.entries(LEGAL_PAGES)) {
  app.get([route, `${route}/`], (_req, res) => res.sendFile(path.join(process.cwd(), 'public', file)));
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const IMG_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
// файлы принимаем в память и складываем в storage (S3 или диск)
const memUpload = () => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = Object.keys(IMG_EXT).includes(file.mimetype);
    cb(ok ? null : new Error('Только JPG/PNG/WebP'), ok);
  },
});
const upload = memUpload();
const productUpload = memUpload();

async function saveUpload(file, dir) {
  const ext = IMG_EXT[file.mimetype] || '.jpg';
  const key = `${dir}/${crypto.randomUUID()}${ext}`;
  const clean = await sanitizeImage(file.buffer);
  await putBuffer(key, clean, file.mimetype);
  return key;
}

// async-обработчики: единая точка 500
const h = fn => (req, res, next) => fn(req, res, next).catch(next);

function requireAuth(req, res) {
  if (!req.user) { res.status(401).json({ error: 'Войдите, чтобы продолжить' }); return false; }
  return true;
}

function requireAdmin(req, res) {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    res.status(403).json({ error: 'Нет доступа' });
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mock: MOCK_MODE }));
app.get('/api/models', h(async (_req, res) => { res.json(await listImageModels()); }));
app.get('/api/legal', (_req, res) => res.json({ versions: LEGAL_VERSIONS, urls: LEGAL_URLS, documents: currentLegal() }));

// ---------- авторизация (e-mail код; заделка под OAuth yandex/vk/mailru) ----------
app.post('/api/auth/request-code', rateLimit, h(async (req, res) => {
  await requestCode(req.body?.email);
  res.json({ ok: true });
}));

app.post('/api/auth/verify', rateLimit, h(async (req, res) => {
  requireConsents(req.body?.consents);
  const { token, user, isNew } = await verifyCode(req.body?.email, req.body?.code);
  await recordAcceptances({
    userId: user.id,
    context: isNew ? 'signup' : 'login',
    req,
    documents: ['offer', 'privacy', 'cross_border'],
  });
  setSessionCookie(res, token, req);
  res.json({ ok: true, email: user.email, is_new: Boolean(isNew) });
}));

app.post('/api/auth/logout', h(async (req, res) => {
  const raw = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('rv_sid='));
  const token = raw ? decodeURIComponent(raw.slice('rv_sid='.length)) : null;
  await logout(token);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.get('/api/me', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const balance = await q.creditBalance(req.user.id);
  res.json({ email: req.user.email, balance });
}));

app.get('/api/my/rooms', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await q.myRooms(req.user.id));
}));

app.get('/api/credits', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json({ balance: await q.creditBalance(req.user.id), history: await q.creditHistory(req.user.id) });
}));

// ---------- оплата ----------
app.get('/api/packs', (_req, res) => {
  res.json(PACKS.map(p => ({ id: p.id, credits: p.credits, price_kopecks: p.price_kopecks, title: p.title })));
});

app.post('/api/payments/create', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.body?.accept_offer !== true) {
    return res.status(400).json({ error: 'Нужен отдельный акцепт оферты', legal_version: LEGAL_VERSIONS.offer });
  }
  const pack = packById(req.body?.pack_id);
  if (!pack) return res.status(400).json({ error: 'Неизвестный пакет' });
  const base = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  const payment = await createPayment({ userId: req.user.id, pack, returnUrl: `${base}/?paid=${pack.id}` });
  await recordAcceptances({
    userId: req.user.id,
    context: 'payment',
    req,
    paymentId: payment.local_payment_id,
    documents: ['offer'],
  });
  res.json({ confirmation_url: payment.confirmation?.confirmation_url, payment_id: payment.id });
}));

// webhook ЮKassa: типы payment.succeeded / payment.canceled / refund.succeeded
app.post('/api/payments/webhook', h(async (req, res) => {
  const event = String(req.body?.event || '');
  const obj = req.body?.object;
  const id = obj?.id;
  if (!id) return res.status(400).json({ error: 'no object id' });
  if (event.startsWith('refund.')) {
    // возвраты инициирует админ через /api/admin/refunds; событие только фиксируем
    log({ event: 'webhook_refund', provider_refund_id: id, status: event });
    return res.json({ ok: true });
  }
  try {
    const out = await syncPayment(id);
    log({ event: 'webhook', provider_payment_id: id, result: out });
  } catch (e) {
    // не 5xx — иначе ЮKassa уйдёт в агрессивные ретраи; разберёмся по логам
    log({ event: 'webhook_error', provider_payment_id: id, error: String(e.message || e).slice(0, 300) });
  }
  res.json({ ok: true });
}));

// ---------- каталог: админ ----------
app.get('/api/admin/products', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await q.allProducts());
}));

app.post('/api/admin/products', productUpload.single('image'), h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const f = { ...req.body };
  if (req.file) f.image_path = await saveUpload(req.file, 'products');
  if (typeof f.attrs === 'string') { try { f.attrs = JSON.parse(f.attrs); } catch { f.attrs = {}; } }
  f.price = Number(f.price);
  f.qty = f.qty !== undefined ? Number(f.qty) : 1;
  if (!f.category || !f.name || !f.price) return res.status(400).json({ error: 'Нужны category, name, price' });
  const row = await q.insertProduct(f);
  log({ event: 'product_added', product_id: row.id, name: row.name, has_image: Boolean(row.image_path || row.image_url) });
  res.status(201).json(row);
}));

app.put('/api/admin/products/:id', productUpload.single('image'), h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const f = { ...req.body };
  if (req.file) f.image_path = await saveUpload(req.file, 'products');
  if (typeof f.attrs === 'string') { try { f.attrs = JSON.parse(f.attrs); } catch { delete f.attrs; } }
  if (f.price !== undefined) f.price = Number(f.price);
  if (f.qty !== undefined) f.qty = Number(f.qty);
  const row = await q.updateProduct(Number(req.params.id), f);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  res.json(row);
}));

app.delete('/api/admin/products/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = await q.deleteProduct(Number(req.params.id));
  res.status(ok ? 204 : 404).end();
}));

// ---------- возвраты: только админ ----------
app.get('/api/admin/payments', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const userId = Number(req.query.user_id);
  if (!userId) return res.status(400).json({ error: 'Нужен user_id' });
  res.json(await q.paymentsByUser(userId));
}));

app.get('/api/admin/refunds/quote', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const paymentId = Number(req.query.payment_id);
  if (!paymentId) return res.status(400).json({ error: 'Нужен payment_id' });
  res.json({ ...(await refundQuote(paymentId)), yukassa_configured: yukassaConfigured() });
}));

app.post('/api/admin/refunds', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { payment_id, amount_kopecks, method, reason } = req.body || {};
  if (!payment_id) return res.status(400).json({ error: 'Нужен payment_id' });
  const out = await createRefund({
    paymentId: Number(payment_id),
    amountKopecks: Number(amount_kopecks),
    method: method || 'yukassa',
    reason: reason || '',
  });
  res.status(201).json(out);
}));

// ---------- комнаты ----------
app.post('/api/rooms', rateLimit, upload.single('photo'), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет фото' });
  const id = crypto.randomUUID();
  const style = req.body.style || 'Современный';
  const budget = Math.min(Math.max(Number(req.body.budget) || 150, 50), 500);
  const photoKey = await saveUpload(req.file, 'uploads');
  await q.createRoom(id, style, budget, photoKey, req.user?.id || null);
  await enqueueRender({ roomId: id });
  res.status(201).json({ id, status: 'queued' });
}));

app.get('/api/rooms/:id', h(async (req, res) => {
  const room = await q.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Не найдено' });
  const render = await q.latestRender(room.id);
  const items = render ? await q.itemsForRender(render.id) : [];
  const total = render ? await q.totalForRender(render.id) : 0;
  const pricesAsOf = render ? await q.pricesAsOfForRender(render.id) : null;
  res.json({
    id: room.id,
    style: room.style,
    budget: room.budget,
    status: room.status,
    error: room.error,
    photo_url: `/files/${path.basename(room.photo_path)}`,
    render: render ? { id: render.id, image: `/renders/${path.basename(render.image_path)}`, cost_usd: render.cost_usd, model: render.model } : null,
    items: items.map(p => ({
      name: p.name, brand: p.brand, attrs: p.attrs || {},
      price: p.price, unit: p.unit, qty: p.qty, source: p.source, match_score: p.match_score,
      price_date: p.price_date, price_updated_at: p.price_updated_at,
      url: p.url, image_url: p.image_path ? `/products/${path.basename(p.image_path)}` : p.image_url,
    })),
    total,
    prices_as_of: pricesAsOf,
  });
}));

// отдача файлов: с S3 — 302 на presigned URL, иначе с диска
async function serveStored(req, res, dir, name) {
  const key = `${dir}/${path.basename(name)}`;
  try {
    const url = await redirectUrl(key);
    if (url) return res.redirect(url);
  } catch { /* fallthrough на диск */ }
  const f = resolveDisk(key);
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).end();
}
app.get('/files/:name', (req, res) => serveStored(req, res, 'uploads', req.params.name));
app.get('/renders/:file', (req, res) => serveStored(req, res, 'renders', req.params.file));
app.get('/products/:file', (req, res) => serveStored(req, res, 'products', req.params.file));

// итерация: только для авторизованных, стоит 1 кредит
app.post('/api/rooms/:id/iterate', rateLimit, h(async (req, res) => {
  const room = await q.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Не найдено' });
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустой запрос' });
  if (room.status !== 'done') return res.status(409).json({ error: 'Подождите завершения текущей задачи' });
  const parent = await q.latestRender(room.id);
  if (!parent) return res.status(409).json({ error: 'Нет рендера для правки' });
  if (!requireAuth(req, res)) return;
  try {
    await enqueueRender({
      roomId: room.id,
      parentRenderId: parent.id,
      requestText: text,
      chargedUserId: req.user.id,
      requestIp: clientIp(req),
    });
  } catch (e) {
    if (e.status === 402) {
      return res.status(402).json({ error: 'Нужен кредит', buy_url: '/?buy=1', balance: await q.creditBalance(req.user.id) });
    }
    throw e;
  }
  res.status(202).json({ id: room.id, status: 'queued' });
}));

// единый обработчик ошибок async-обработчиков — отдаём json, не HTML
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) log({
    event: 'http_error',
    method: req.method,
    path: req.path,
    status,
    error: String(err.message || err).slice(0, 300),
    cause: String(err.cause?.message || '').slice(0, 300) || undefined,
  });
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка' : err.message });
});

// ---------- старт ----------
async function main() {
  await migrate();          // накат миграций Postgres
  await assertConfig();     // проверка slug'ов моделей до приёма трафика
  if (!ADMIN_KEY) console.log('[warn] ADMIN_KEY не задан — админка каталога открыта не будет');
  app.listen(PORT, () => {
    log({ event: 'listen', port: PORT, mock: MOCK_MODE });
    startWorker();
  });
}

main().catch(e => {
  console.error(`[remontvision] не запускаюсь: ${e.message}`);
  process.exit(1);
});

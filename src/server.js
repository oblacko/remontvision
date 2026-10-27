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
import { createPayment, syncPayment, createRefund, refundQuote, adjustCredits, yukassaConfigured } from './payments.js';
import { putBuffer, remove, redirectUrl, resolveDisk } from './storage.js';
import { sanitizeImage } from './media.js';
import { LEGAL_VERSIONS, LEGAL_URLS, currentLegal, clientIp, requireConsents, recordAcceptances } from './legal.js';
import { ROOM_TYPE_NAMES } from './roomtypes.js';
import { getModelConfig, loadModelConfig, saveModelConfig } from './modelconfig.js';

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PAYMENTS_ENABLED = String(process.env.PAYMENTS_ENABLED || 'false') === 'true';
const REFUNDS_ENABLED = String(process.env.REFUNDS_ENABLED || 'false') === 'true';
const app = express();
app.set('trust proxy', 1); // ровно один nginx перед приложением
app.use(express.json({ limit: '1mb' }));
// один canonical URL на документ: .html и слэш → чистый маршрут
const CANONICAL_REDIRECTS = {
  '/index.html': '/',
  '/app.html': '/app',
  '/prices.html': '/prices',
  '/offer.html': '/offer',
  '/delivery.html': '/delivery',
  '/contacts.html': '/contacts',
  '/privacy.html': '/privacy',
};
for (const [from, to] of Object.entries(CANONICAL_REDIRECTS)) {
  app.get(from, (_req, res) => res.redirect(301, to));
}
// слэш на конце — только точным regex, иначе Express матчит и /prices, получая петлю
for (const [from, to] of Object.entries({
  '/prices/': '/prices',
  '/offer/': '/offer',
  '/delivery/': '/delivery',
  '/contacts/': '/contacts',
  '/privacy/': '/privacy',
})) {
  app.get(new RegExp(`^${from}$`), (_req, res) => res.redirect(301, to));
}
app.use(express.static('public'));
app.use('/assets', express.static('assets'));
app.use(sessionUser);

// Новый лендинг (React/Vite) и старый полнофункциональный кабинет.
const WEB_DIST = path.join(process.cwd(), 'web', 'dist');
app.use('/images', express.static(path.join(WEB_DIST, 'images')));
app.use('/fonts', express.static(path.join(WEB_DIST, 'fonts')));
app.use('/web-assets', express.static(path.join(WEB_DIST, 'web-assets')));
app.get(['/app', '/app/'], (_req, res) => res.sendFile(path.join(process.cwd(), 'public', 'app.html')));
const webIndexPath = path.join(WEB_DIST, 'index.html');
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html')));
app.get(['/cabinet', '/cabinet/'], (_req, res) => res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html')));
app.get('/', (_req, res) => {
  res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html'));
});

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

// В каталоге может не быть прямой ссылки: не отдаём битый href, а ведём на поиск.
function productLink(p) {
  const raw = String(p.url || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(raw)) return `https://${raw}`;
  const query = [p.name, p.brand, p.source].filter(Boolean).join(' ');
  return `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
}

const STATIC_STYLE_KEYS = new Set(['modern', 'scandi', 'loft', 'japandi', 'neo', 'minimal', 'dark', 'boho', 'deco', 'country']);

function styleImageUrl(style) {
  if (style.preset_image_path) return `/style-images/${path.basename(style.preset_image_path)}`;
  return STATIC_STYLE_KEYS.has(style.key) ? `/images/style-${style.key}.webp` : '/images/style-modern.webp';
}

function styleDto(style) {
  return {
    id: style.id,
    key: style.key,
    name: style.name,
    accent: style.accent,
    description: style.description,
    image_url: styleImageUrl(style),
    active: style.active,
    sort: style.sort,
  };
}

function styleReferenceDto(ref) {
  return {
    id: ref.id,
    title: ref.title,
    sort: ref.sort,
    image_url: `/style-images/${path.basename(ref.image_path)}`,
  };
}

function styleProductDto(product) {
  return {
    id: product.id,
    category: product.category,
    name: product.name,
    brand: product.brand,
    attrs: product.attrs || {},
    price: product.price,
    unit: product.unit,
    qty: product.qty,
    source: product.source,
    url: productLink(product),
    image_url: product.image_path ? `/products/${path.basename(product.image_path)}` : product.image_url,
  };
}

function generationDto(g) {
  return {
    id: g.id,
    room_id: g.room_id,
    style: g.style,
    room_type: g.room_type,
    budget: g.budget,
    status: g.status,
    error: g.error,
    created_at: g.created_at,
    finished_at: g.finished_at,
    request_text: g.request_text,
    credits_spent: g.credits_spent,
    prompt: g.prompt || null,
    model: g.model || null,
    cost_usd: g.cost_usd ?? null,
    duration_ms: g.duration_ms ?? null,
    image_url: g.image_path ? `/renders/${path.basename(g.image_path)}` : null,
    photo_url: g.photo_path ? `/files/${path.basename(g.photo_path)}` : null,
  };
}

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  mock: MOCK_MODE,
  payments_enabled: PAYMENTS_ENABLED,
  refunds_enabled: REFUNDS_ENABLED,
}));
app.get('/api/models', h(async (_req, res) => { res.json(await listImageModels()); }));
app.get('/api/legal', (_req, res) => res.json({ versions: LEGAL_VERSIONS, urls: LEGAL_URLS, documents: currentLegal() }));
app.get('/api/styles', h(async (_req, res) => {
  res.json((await q.styles(true)).map(styleDto));
}));
app.get('/api/room-types', (_req, res) => res.json(ROOM_TYPE_NAMES));

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

app.get('/api/my/generations', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json((await q.userGenerations(req.user.id)).map(generationDto));
}));

app.get('/api/credits', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json({ balance: await q.creditBalance(req.user.id), history: await q.creditHistory(req.user.id) });
}));

// ---------- оплата ----------
app.get('/api/packs', h(async (_req, res) => {
  const packs = await q.creditPacks(true);
  res.json(packs.map(p => ({ id: p.id, credits: p.credits, price_kopecks: p.price_kopecks, title: p.title })));
}));

app.post('/api/payments/create', h(async (req, res) => {
  if (!PAYMENTS_ENABLED) return res.status(503).json({ error: 'Платежи временно отключены (бесплатный пилот)' });
  if (!requireAuth(req, res)) return;
  if (req.body?.accept_offer !== true) {
    return res.status(400).json({ error: 'Нужен отдельный акцепт оферты', legal_version: LEGAL_VERSIONS.offer });
  }
  const pack = await q.packById(String(req.body?.pack_id || ''));
  if (!pack || !pack.active) return res.status(400).json({ error: 'Неизвестный пакет' });
  const base = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  const returnPath = req.body?.return_path === '/cabinet' ? '/cabinet' : '/';
  const returnUrl = `${base}${returnPath}${returnPath.includes('?') ? '&' : '?'}paid=${pack.id}`;
  const payment = await createPayment({ userId: req.user.id, pack, returnUrl });
  await recordAcceptances({
    userId: req.user.id,
    context: 'payment',
    req,
    paymentId: payment.local_payment_id,
    documents: ['offer'],
  });
  res.json({ confirmation_url: payment.confirmation?.confirmation_url, payment_id: payment.id });
}));

// fallback на случай задержки/отсутствия webhook: сверяем последний pending-платёж пользователя
app.post('/api/payments/sync', h(async (req, res) => {
  if (!PAYMENTS_ENABLED) return res.status(503).json({ error: 'Платежи отключены' });
  if (!requireAuth(req, res)) return;
  const payment = await q.latestPendingPayment(req.user.id);
  if (!payment) return res.json({ ok: true, granted: false, status: 'no_pending' });
  const out = await syncPayment(payment.provider_payment_id);
  res.json({ ok: true, ...out });
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
    // transient-ошибка: отдаём 5xx, чтобы ЮKassa повторила уведомление
    log({ event: 'webhook_error', provider_payment_id: id, error: String(e.message || e).slice(0, 300) });
    return res.status(500).json({ ok: false });
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

// ---------- аккаунты: только админ ----------
app.get('/api/admin/users', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await q.adminUsers(String(req.query.q || '').slice(0, 100)));
}));

app.get('/api/admin/users/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const user = await q.adminUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Не найдено' });
  res.json({
    user,
    credits: await q.creditHistory(user.id),
    generations: (await q.userGenerations(user.id)).map(generationDto),
  });
}));

app.post('/api/admin/users/:id/credits', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const out = await adjustCredits(
    Number(req.params.id),
    Number(req.body?.delta),
    String(req.body?.reason || 'admin_adjust').slice(0, 120),
    req.body?.note ? String(req.body.note).slice(0, 300) : null,
  );
  res.json(out);
}));


// ---------- пакеты кредитов: только админ ----------
app.get('/api/admin/packs', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await q.creditPacks(false));
}));

app.post('/api/admin/packs', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.body?.id || '').trim().toLowerCase();
  const title = String(req.body?.title || '').trim();
  const credits = Number(req.body?.credits);
  const price = Number(req.body?.price_kopecks);
  if (!/^[a-z0-9_-]{2,40}$/.test(id) || !title || !Number.isInteger(credits) || credits < 1 || !Number.isInteger(price) || price < 100) {
    return res.status(400).json({ error: 'Нужны id (латиница), title, credits>0 и price_kopecks>=100' });
  }
  try {
    const row = await q.createPack({ id, title, credits, price_kopecks: price, active: req.body?.active !== false, sort: Number(req.body?.sort) || 0 });
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Пакет с таким id уже есть' });
    throw e;
  }
}));

app.put('/api/admin/packs/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const row = await q.updatePack(String(req.params.id), req.body || {});
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  res.json(row);
}));

app.delete('/api/admin/packs/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = await q.deletePack(String(req.params.id));
  res.status(ok ? 204 : 404).end();
}));

// ---------- стили: только админ ----------
function styleFields(req, { creating = false } = {}) {
  const f = {};
  if (creating || req.body.key !== undefined) f.key = String(req.body.key || '').trim().toLowerCase();
  if (creating || req.body.name !== undefined) f.name = String(req.body.name || '').trim();
  if (req.body.accent !== undefined) f.accent = String(req.body.accent || 'sand');
  if (req.body.prompt_description !== undefined) f.prompt_description = String(req.body.prompt_description || '');
  if (req.body.description !== undefined) f.description = String(req.body.description || '');
  if (req.body.active !== undefined) f.active = String(req.body.active) === 'true' || String(req.body.active) === '1';
  if (req.body.sort !== undefined) f.sort = Number(req.body.sort) || 0;
  if (req.file) f.preset_image_path = null; // заполним ниже после сохранения
  return f;
}

async function stylePresetFromRequest(req, f) {
  if (req.file) f.preset_image_path = await saveUpload(req.file, 'style-images');
  return f;
}

app.get('/api/admin/styles', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json((await q.adminStyles()).map(row => ({
    ...styleDto(row),
    references_count: row.references_count,
    products_count: row.products_count,
  })));
}));

app.get('/api/admin/styles/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const style = await q.styleById(id);
  if (!style) return res.status(404).json({ error: 'Не найдено' });
  res.json({
    style: styleDto(style),
    prompt_description: style.prompt_description,
    references: (await q.styleReferences(id)).map(styleReferenceDto),
    products: (await q.styleProducts(id)).map(styleProductDto),
  });
}));

app.post('/api/admin/styles', upload.single('image'), h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const f = await stylePresetFromRequest(req, styleFields(req, { creating: true }));
  if (!/^[a-z0-9_-]{2,40}$/.test(f.key || '') || !f.name) {
    return res.status(400).json({ error: 'Нужны key (латиница) и name' });
  }
  try {
    const row = await q.createStyle(f);
    log({ event: 'style_created', style_id: row.id, key: row.key, name: row.name });
    res.status(201).json(styleDto(row));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Стиль с таким key или name уже есть' });
    throw e;
  }
}));

app.put('/api/admin/styles/:id', upload.single('image'), h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const style = await q.styleById(id);
  if (!style) return res.status(404).json({ error: 'Не найдено' });
  const f = await stylePresetFromRequest(req, styleFields(req));
  if (f.key !== undefined && !/^[a-z0-9_-]{2,40}$/.test(f.key)) return res.status(400).json({ error: 'key: только латиница/цифры/-_' });
  if (f.name !== undefined && !f.name) return res.status(400).json({ error: 'name не может быть пустым' });
  try {
    const row = await q.updateStyle(id, f);
    res.json(styleDto(row));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Стиль с таким key или name уже есть' });
    throw e;
  }
}));

app.delete('/api/admin/styles/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = await q.deleteStyle(Number(req.params.id));
  res.status(ok ? 204 : 404).end();
}));

app.post('/api/admin/styles/:id/references', upload.array('images', 8), h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const styleId = Number(req.params.id);
  const style = await q.styleById(styleId);
  if (!style) return res.status(404).json({ error: 'Не найдено' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Нужно хотя бы одно изображение' });
  const out = [];
  for (const file of files) {
    const imagePath = await saveUpload(file, 'style-images');
    const ref = await q.addStyleReference(styleId, imagePath, String(req.body.title || file.originalname || '').slice(0, 200), Number(req.body.sort) || 0);
    out.push(styleReferenceDto(ref));
  }
  res.status(201).json(out);
}));

app.delete('/api/admin/styles/:id/references/:refId', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = await q.deleteStyleReference(Number(req.params.id), Number(req.params.refId));
  res.status(ok ? 204 : 404).end();
}));

app.post('/api/admin/styles/:id/products', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const styleId = Number(req.params.id);
  const productId = Number(req.body?.product_id);
  if (!styleId || !productId) return res.status(400).json({ error: 'Нужны style id и product_id' });
  const row = await q.addStyleProduct(styleId, productId, Number(req.body?.sort) || 0);
  res.status(201).json(row);
}));

app.delete('/api/admin/styles/:id/products/:productId', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = await q.deleteStyleProduct(Number(req.params.id), Number(req.params.productId));
  res.status(ok ? 204 : 404).end();
}));

// ---------- модели генерации: только админ ----------
app.get('/api/admin/settings/models', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = getModelConfig();
  const listed = await listImageModels();
  const imageModels = Array.isArray(listed) ? listed : (listed.models || []);
  res.json({ render_model: config.render, vision_model: config.vision, resolution: config.resolution, aspect_ratio: config.aspectRatio, image_models: imageModels });
}));

app.put('/api/admin/settings/models', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const renderModel = String(req.body?.render_model || '').trim();
  const visionModel = String(req.body?.vision_model || '').trim();
  const resolution = String(req.body?.resolution || '1K').trim();
  const aspectRatio = String(req.body?.aspect_ratio || 'auto').trim();
  if (!renderModel || !visionModel) return res.status(400).json({ error: 'Нужны render_model и vision_model' });
  if (!['1K', '2K'].includes(resolution)) return res.status(400).json({ error: 'resolution: 1K или 2K' });
  if (!['auto', '1:1', '1:2', '2:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '9:20', '20:9', '9:21', '21:9'].includes(aspectRatio)) {
    return res.status(400).json({ error: 'Некорректный aspect_ratio' });
  }
  const listed = await listImageModels();
  const imageModels = Array.isArray(listed) ? listed : (listed.models || []);
  const picked = imageModels.find(m => m.id === renderModel);
  if (!picked) return res.status(400).json({ error: 'Модель не найдена среди image-моделей OpenRouter' });
  const saved = await saveModelConfig({ render: renderModel, vision: visionModel, resolution, aspectRatio });
  let warning = '';
  try { await assertConfig(); }
  catch (e) { warning = String(e.message || e).slice(0, 300); log({ event: 'model_config_warning', error: warning }); }
  log({ event: 'model_config_saved', render_model: saved.render, vision_model: saved.vision, resolution: saved.resolution, aspect_ratio: saved.aspectRatio, input_refs: picked.input_refs });
  res.json({ ...saved, input_refs: Boolean(picked.input_refs), warning });
}));

// ---------- промты генераций: только админ ----------
app.get('/api/admin/renders', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = await q.adminRenders(Number(req.query.limit) || 100);
  res.json(rows.map(r => ({
    ...r,
    image_url: r.image_path ? `/renders/${path.basename(r.image_path)}` : null,
    photo_url: r.photo_path ? `/files/${path.basename(r.photo_path)}` : null,
  })));
}));

// ---------- админские изображения пользователей ----------
app.get('/api/admin/renders/:file', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await serveStored(req, res, 'renders', req.params.file);
}));
app.get('/api/admin/files/:name', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await serveStored(req, res, 'uploads', req.params.name);
}));

// ---------- возвраты: только админ ----------
app.get('/api/admin/payments', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const userId = Number(req.query.user_id);
  if (!userId) return res.status(400).json({ error: 'Нужен user_id' });
  res.json(await q.paymentsByUser(userId));
}));

app.get('/api/admin/refunds/quote', h(async (req, res) => {
  if (!REFUNDS_ENABLED) return res.status(503).json({ error: 'Возвраты отключены до полной state machine' });
  if (!requireAdmin(req, res)) return;
  const paymentId = Number(req.query.payment_id);
  if (!paymentId) return res.status(400).json({ error: 'Нужен payment_id' });
  res.json({ ...(await refundQuote(paymentId)), yukassa_configured: yukassaConfigured() });
}));

app.post('/api/admin/refunds', h(async (req, res) => {
  if (!REFUNDS_ENABLED) return res.status(503).json({ error: 'Возвраты отключены до полной state machine' });
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
app.post('/api/rooms', rateLimit, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'style_ref', maxCount: 1 },
]), h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const photo = req.files?.photo?.[0];
  const styleRef = req.files?.style_ref?.[0];
  if (!photo) return res.status(400).json({ error: 'Нет фото' });
  if (!MOCK_MODE) {
    const bal = await q.creditBalance(req.user.id);
    if (bal < 1) {
      return res.status(402).json({ error: 'Нужен кредит', buy_url: '/app?buy=1', balance: bal });
    }
  }
  const id = crypto.randomUUID();
  const allowedStyles = [
    'Современный', 'Светлый', 'Тёмный', 'Классика',
    'Скандинавский', 'Лофт', 'Джапанди', 'Неоклассика', 'Минимализм',
    'Тёмный модерн', 'Бохо', 'Ар-деко', 'Кантри', 'Референс пользователя',
  ];
  const requestedStyle = String(req.body?.style || '').trim();
  const requestedRoomType = String(req.body?.room_type || '').trim();
  const roomType = ROOM_TYPE_NAMES.includes(requestedRoomType) ? requestedRoomType : 'Другое';
  const dbStyle = requestedStyle ? await q.styleByName(requestedStyle) : null;
  const style = dbStyle && dbStyle.active ? dbStyle.name
    : (allowedStyles.includes(requestedStyle) ? requestedStyle : 'Современный');
  const allowedPalettes = new Set(['none', 'mono', 'analogous', 'complementary', 'split']);
  const allowedAccents = new Set(['none', 'forest', 'sand', 'terra', 'dust', 'graphite']);
  const palette = allowedPalettes.has(req.body.palette) ? req.body.palette : 'none';
  const accent = allowedAccents.has(req.body.accent) ? req.body.accent : 'none';
  const budget = Math.min(Math.max(Number(req.body.budget) || 150, 50), 1000);
  const photoKey = await saveUpload(photo, 'uploads');
  const styleRefKey = styleRef ? await saveUpload(styleRef, 'uploads') : null;
  await q.createRoom(id, style, budget, photoKey, req.user.id, roomType, palette, accent, styleRefKey);
  try {
    await enqueueRender({ roomId: id, chargedUserId: req.user.id, requestIp: clientIp(req) });
  } catch (e) {
    if (e.status === 402) {
      await q.deleteRoom(id);
      await remove(photoKey);
      if (styleRefKey) await remove(styleRefKey);
      return res.status(402).json({ error: 'Нужен кредит', buy_url: '/app?buy=1', balance: await q.creditBalance(req.user.id) });
    }
    throw e;
  }
  res.status(201).json({ id, status: 'queued' });
}));

app.get('/api/rooms/:id', h(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Войдите, чтобы продолжить' });
  const room = await q.getRoom(req.params.id);
  if (!room || Number(room.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  let render = null;
  if (req.query.render_id) {
    const picked = await q.getRender(String(req.query.render_id));
    if (picked && picked.room_id === room.id) render = picked;
  }
  if (!render) render = await q.latestRender(room.id);
  const items = render ? await q.itemsForRender(render.id) : [];
  const total = render ? await q.totalForRender(render.id) : 0;
  const pricesAsOf = render ? await q.pricesAsOfForRender(render.id) : null;
  res.json({
    id: room.id,
    style: room.style,
    room_type: room.room_type,
    budget: room.budget,
    status: room.status,
    error: room.error,
    photo_url: `/files/${path.basename(room.photo_path)}`,
    render: render ? {
      id: render.id,
      image: render.image_path ? `/renders/${path.basename(render.image_path)}` : null,
      status: render.status,
      created_at: render.created_at,
      request_text: render.request_text,
      cost_usd: render.cost_usd,
      model: render.model,
    } : null,
    items: items.map(p => ({
      name: p.name, brand: p.brand, attrs: p.attrs || {},
      price: p.price, unit: p.unit, qty: p.qty, source: p.source, match_score: p.match_score,
      price_date: p.price_date, price_updated_at: p.price_updated_at,
      url: productLink(p), link_label: p.url ? 'Открыть товар' : 'Найти похожие',
      image_search_url: `https://yandex.ru/images/search?text=${encodeURIComponent([p.name, p.brand, p.source].filter(Boolean).join(' '))}`,
      image_url: p.image_path ? `/products/${path.basename(p.image_path)}` : p.image_url,
    })),
    total,
    prices_as_of: pricesAsOf,
  });
}));

// отдача файлов: с S3 — 302 на presigned URL, иначе с диска.
// Фото комнат и рендеры доступны только владельцу комнаты; товары — публично.
async function serveStored(req, res, dir, name, ownerQuery = null) {
  const key = `${dir}/${path.basename(name)}`;
  if (ownerQuery) {
    if (!req.user) return res.status(401).end();
    const owner = await ownerQuery(key);
    if (!owner || Number(owner.user_id) !== Number(req.user.id)) return res.status(404).end();
  }
  try {
    const url = await redirectUrl(key);
    if (url) return res.redirect(url);
  } catch { /* fallthrough на диск */ }
  const f = resolveDisk(key);
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).end();
}
app.get('/files/:name', h(async (req, res) => serveStored(req, res, 'uploads', req.params.name, q.roomByPhotoKey)));
app.get('/renders/:file', h(async (req, res) => serveStored(req, res, 'renders', req.params.file, q.roomByRenderKey)));
app.get('/products/:file', h(async (req, res) => serveStored(req, res, 'products', req.params.file)));
app.get('/style-images/:file', h(async (req, res) => serveStored(req, res, 'style-images', req.params.file)));

// итерация: только для авторизованных, стоит 1 кредит
app.delete('/api/rooms/:id', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const room = await q.getRoom(req.params.id);
  if (!room || Number(room.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  const renderPaths = await q.renderPathsForRoom(room.id);
  await q.deleteRoom(room.id);
  for (const imagePath of renderPaths) {
    try { await remove(imagePath); } catch { /* файл мог быть уже удалён */ }
  }
  if (room.photo_path) { try { await remove(room.photo_path); } catch { /* ignore */ } }
  if (room.style_ref_path) { try { await remove(room.style_ref_path); } catch { /* ignore */ } }
  res.status(204).end();
}));

app.post('/api/rooms/:id/iterate', rateLimit, h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const room = await q.getRoom(req.params.id);
  if (!room || Number(room.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустой запрос' });
  if (text.length > 500) return res.status(400).json({ error: 'Слишком длинный запрос (макс. 500 символов)' });
  if (room.status !== 'done') return res.status(409).json({ error: 'Подождите завершения текущей задачи' });
  const parent = await q.latestRender(room.id);
  if (!parent) return res.status(409).json({ error: 'Нет рендера для правки' });
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

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 15 МБ' : err.message });
  }
  if (err?.message === 'Только JPG/PNG/WebP') return res.status(400).json({ error: err.message });
  next(err);
});

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
  await loadModelConfig();  // модели из app_settings / env
  if (MOCK_MODE && (process.env.NODE_ENV === 'production' || PAYMENTS_ENABLED)) {
    throw new Error('OPENROUTER_API_KEY обязателен в production/при включённой монетизации');
  }
  await assertConfig();     // проверка slug'ов моделей до приёма трафика
  if (!ADMIN_KEY) console.log('[warn] ADMIN_KEY не задан — админка каталога открыта не будет');
  app.listen(PORT, () => {
    log({ event: 'listen', port: PORT, mock: MOCK_MODE, payments_enabled: PAYMENTS_ENABLED });
    startWorker();
  });
}

main().catch(e => {
  console.error(`[remontvision] не запускаюсь: ${e.message}`);
  process.exit(1);
});

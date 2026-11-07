import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, migrate } from './db.js';
import { startWorker, enqueueRender } from './jobs.js';
import { listImageModels, MOCK_MODE, assertConfig, log, generateCleanupRender, snapAspect } from './openrouter.js';
import { analyzeRoomBrief } from './artdirector.js';
import { rateLimit } from './ratelimit.js';
import { requestCode, verifyCode, sessionUser, setSessionCookie, clearSessionCookie, logout } from './auth.js';
import { createPayment, syncPayment, createRefund, refundQuote, adjustCredits, yukassaConfigured, robokassaConfigured, paymentProvider } from './payments.js';
import { verifyResult as verifyRobokassaResult } from './robokassa.js';
import { putBuffer, getBuffer, remove, redirectUrl, resolveDisk } from './storage.js';
import { reviewDesign } from './architect.js';
import { getCatalogOffer } from './catalogclient.js';
import { runVisionAgent } from './visionagent.js';
import { sanitizeImage, fitAspect } from './media.js';
import { LEGAL_VERSIONS, LEGAL_URLS, currentLegal, clientIp, requireConsents, recordAcceptances } from './legal.js';
import { ROOM_TYPE_NAMES, activeRoomTypeNames, roomTypeByName, isRoomTypeActive, getRoomTypeConfig, getRoomTypeDefaults, saveRoomTypes, resetRoomTypes, loadRoomTypes } from './roomtypes.js';
import { SLOT_LABELS, SLOT_LABELS_RU, normalizeTier } from './pricing.js';
import { curateProducts } from './curate.js';
import { fetchRemoteImage, firstImageUrl } from './remoteimage.js';
import { seedStyleReferences } from './stylerefseed.js';
import { getModelConfig, loadModelConfig, saveModelConfig } from './modelconfig.js';
import { validateModelOptions, modelCaps } from './modelcaps.js';
import { applyProxy, testProxy, loadProxyConfig, getProxyState } from './proxy.js';
import { importProductFromUrl } from './productimport.js';
import { getPromptConfig, getPromptDefaults, savePromptConfig, resetPromptConfig, loadPromptConfig } from './promptconfig.js';
import { getCleanupConfig, getCleanupDefaults, saveCleanupConfig, resetCleanupConfig, loadCleanupConfig, buildCleanupPrompt } from './cleanupconfig.js';
import { getRenderConfig, getRenderDefaults, saveRenderConfig, resetRenderConfig, loadRenderConfig } from './renderconfig.js';
import { generateArticle, articlePage } from './articles.js';
import { canBindProduct, canReplaceWithProduct, productTarget } from './productpipeline.js';
import { logProcurementClick } from './procurement.js';
import { getProcurementConfig, getProcurementDefaults, saveProcurementConfig, resetProcurementConfig, loadProcurementConfig } from './procurementconfig.js';
import { createSearchJob, processVisionStep, processGridStep, processCropsStep, processObjectSearch, searchJobDto, searchResultsDto } from './searchservice.js';
import { startSearchWorker } from './searchjobs.js';
import { getSearchConfig, saveSearchConfig, resetSearchConfig, loadSearchConfig } from './searchconfig.js';
import { listSearchPrompts, createPromptVersion, activatePromptVersion, loadSearchPrompts, seedSearchPrompts, DEFAULT_SEARCH_PROMPTS, PROMPT_KINDS } from './searchprompts.js';
import { listArchitectPrompts, createArchitectPromptVersion, activateArchitectPromptVersion, loadArchitectPrompts, seedArchitectPrompts, DEFAULT_ARCHITECT_PROMPTS, ARCHITECT_PROMPT_KINDS, getArchitectPrompt } from './architectprompts.js';
import { getStyleConfig, getStyleDefaults, saveStyleConfig, resetStyleConfig, loadStyleConfig } from './styleconfig.js';
import { DESIGN_STYLES, DESIGN_CONCEPTS, pickRandomCompatiblePair, compatibilityOf } from './designdata.js';
import { imageSize, detectImageExt } from './imagesize.js';

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PAYMENTS_ENABLED = String(process.env.PAYMENTS_ENABLED || 'false') === 'true';
const APP_URL = (process.env.APP_URL || 'https://www.remontvision.ru').replace(/\/$/, '');
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
app.use('/images', express.static(path.join(WEB_DIST, 'images'), { maxAge: '7d' }));
app.use('/fonts', express.static(path.join(WEB_DIST, 'fonts'), { maxAge: '30d' }));
// Хешированные имена → можно кэшировать навсегда.
app.use('/web-assets', express.static(path.join(WEB_DIST, 'web-assets'), { maxAge: '1y', immutable: true }));
app.get(['/app', '/app/'], (_req, res) => res.sendFile(path.join(process.cwd(), 'public', 'app.html')));
const webIndexPath = path.join(WEB_DIST, 'index.html');
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html')));
app.all(['/cabinet', '/cabinet/', '/cabinet/paid', '/cabinet/paid/', '/cabinet/fail', '/cabinet/fail/'], (_req, res) => res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html')));
app.get('/s/:token', (_req, res) => res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html')));
app.get(['/room/:id', '/room/:id/'], (_req, res) => res.sendFile(fs.existsSync(webIndexPath) ? webIndexPath : path.join(process.cwd(), 'public', 'app.html')));
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

const visitorKey = req => crypto.createHash('sha256')
  .update(`${clientIp(req)}|${req.headers['user-agent'] || ''}`)
  .digest('hex').slice(0, 40);

// В каталоге может не быть прямой ссылки: не отдаём битый href, а ведём на поиск.
function productLink(p) {
  const raw = String(p.url || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(raw)) return `https://${raw}`;
  const query = [p.name, p.brand, p.source].filter(Boolean).join(' ');
  return `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
}

const STATIC_STYLE_KEYS = new Set(['modern', 'scandi', 'loft', 'japandi', 'neo', 'minimal', 'dark', 'boho', 'deco', 'country']);
// Новые стили 2026 показываем ближайшей существующей обложкой, пока нет своих ассетов.
const STYLE_IMAGE_ALIASES = {
  'wabi-sabi': 'japandi',
  'organic': 'minimal',
  'warm-minimal': 'scandi',
  'biophilic': 'country',
  'heritage': 'neo',
  'maximalism': 'deco',
  'mediterranean': 'deco',
};

function styleImageUrl(style) {
  if (style.preset_image_path) return `/style-images/${path.basename(style.preset_image_path)}`;
  if (STATIC_STYLE_KEYS.has(style.key)) return `/images/style-${style.key}.webp`;
  const alias = STYLE_IMAGE_ALIASES[style.key];
  return alias ? `/images/style-${alias}.webp` : '/images/style-modern.webp';
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
    room_type: ref.room_type || null,
    kind: ref.kind || 'upload',
    source: ref.source || null,
    approved: ref.approved !== false,
    score: ref.score || null,
    product_ids: ref.product_ids || null,
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
    price_tier: product.price_tier || 'comfort',
    room_types: product.room_types || null,
    surface: product.surface || null,
    active: product.active !== false,
    room_type: product.style_room_type || null,
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
    price_tier: g.price_tier || 'comfort',
    status: g.status,
    error: g.error,
    created_at: g.created_at,
    finished_at: g.finished_at,
    request_text: g.request_text,
    credits_spent: g.credits_spent,
    prompt: g.prompt || null,
    model: g.model || null,
    duration_ms: g.duration_ms ?? null,
    image_url: g.image_path ? `/renders/${path.basename(g.image_path)}` : null,
    photo_url: g.photo_path ? `/files/${path.basename(g.photo_path)}` : null,
  };
}

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  mock: MOCK_MODE,
  payments_enabled: PAYMENTS_ENABLED,
  payment_provider: paymentProvider(),
  robokassa_configured: robokassaConfigured(),
  procurement_enabled: getProcurementConfig().enabled,
  procurement_configured: getProcurementConfig().configured,
  refunds_enabled: REFUNDS_ENABLED,
}));
app.get('/api/models', h(async (_req, res) => { res.json(await listImageModels()); }));
app.get('/api/legal', (_req, res) => res.json({ versions: LEGAL_VERSIONS, urls: LEGAL_URLS, documents: currentLegal() }));
app.get('/api/styles', h(async (_req, res) => {
  res.json((await q.styles(true)).map(styleDto));
}));
app.get('/api/room-types', (_req, res) => res.json(activeRoomTypeNames()));

app.get('/api/design', (_req, res) => {
  res.json({
    styles: DESIGN_STYLES.map(({ id, name, palette, materials }) => ({ id, name, palette, materials })),
    concepts: DESIGN_CONCEPTS.map(({ id, name, main_move, quiet_areas, description }) => ({
      id, name, main_move, quiet_areas, description,
    })),
    compatibility: Object.fromEntries(DESIGN_CONCEPTS.map(concept => [
      concept.id,
      Object.fromEntries(DESIGN_STYLES.map(style => [style.id, compatibilityOf(style.id, concept.id)])),
    ])),
  });
});

// «На усмотрение ИИ»: случайная совместимая пара без повторов у пользователя.
app.post('/api/design/random', rateLimit, h(async (req, res) => {
  const rows = req.user ? await q.designRegistryForUser(req.user.id) : [];
  const usedPairs = rows.map(row => `${row.style_key}:${row.concept_key}`);
  res.json(pickRandomCompatiblePair({ usedPairs }));
}));

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
  if (!req.user) return res.json(null);
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
  const payment = await createPayment({ userId: req.user.id, pack, returnUrl, email: req.user.email });
  await recordAcceptances({
    userId: req.user.id,
    context: 'payment',
    req,
    paymentId: payment.local_payment_id,
    documents: ['offer'],
  });
  res.json({
    confirmation_url: payment.confirmation?.confirmation_url,
    payment_id: payment.id,
    provider: paymentProvider(),
  });
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

// ResultURL Robokassa: подпись Password#2, ответ строго OK{InvId}
app.all('/api/payments/robokassa/result', express.urlencoded({ extended: false }), h(async (req, res) => {
  const params = { ...req.query, ...req.body };
  const verified = verifyRobokassaResult(params);
  if (!verified.ok) {
    log({ event: 'robokassa_result_bad_signature', inv_id: verified.invId || null });
    return res.status(400).type('text/plain').send('bad signature');
  }
  const localId = Number(verified.invId);
  if (!Number.isSafeInteger(localId) || localId <= 0) return res.status(400).type('text/plain').send('bad inv id');
  const local = await q.paymentById(localId);
  if (!local || local.provider !== 'robokassa') {
    log({ event: 'robokassa_result_unknown_payment', inv_id: verified.invId });
    return res.status(404).type('text/plain').send('unknown payment');
  }
  const out = await syncPayment(verified.invId, { amountKopecks: verified.amountKopecks });
  if (out.granted || out.status === 'already') {
    return res.type('text/plain').send(`OK${verified.invId}`);
  }
  log({ event: 'robokassa_result_not_confirmed', inv_id: verified.invId, result: out });
  const status = out.status === 'amount_mismatch' ? 400 : 409;
  return res.status(status).type('text/plain').send('not confirmed');
}));

app.all(['/api/payments/robokassa', '/api/payments/robokassa/', '/api/payments/robokassa/success', '/api/payments/robokassa/success/'], (_req, res) => {
  res.redirect(302, `${APP_URL}/cabinet?paid=robokassa`);
});

app.all(['/api/payments/robokassa/fail', '/api/payments/robokassa/fail/'], (_req, res) => {
  res.redirect(302, `${APP_URL}/cabinet?payment=failed`);
});

// ---------- каталог: админ ----------
app.get('/api/admin/products', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await q.adminProducts());
}));

app.post('/api/admin/products/import', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Нужна http(s)-ссылка на товар' });
  try {
    const preview = await importProductFromUrl(url);
    res.json(preview);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
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
    references: (await q.adminStyleReferences(id)).map(styleReferenceDto),
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
    const roomType = ROOM_TYPE_NAMES.includes(String(req.body.room_type || '')) ? String(req.body.room_type) : null;
    const ref = await q.addStyleReference(styleId, imagePath, String(req.body.title || file.originalname || '').slice(0, 200), Number(req.body.sort) || 0, roomType, 'upload', 'upload', true);
    out.push(styleReferenceDto(ref));
  }
  res.status(201).json(out);
}));

app.patch('/api/admin/styles/:id/references/:refId', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const styleId = Number(req.params.id);
  const refId = Number(req.params.refId);
  const ref = await q.styleReferenceById(refId);
  if (!ref || Number(ref.style_id) !== styleId) return res.status(404).json({ error: 'Не найдено' });
  if (typeof req.body?.approved !== 'boolean') return res.status(400).json({ error: 'Нужен approved: true/false' });
  const row = await q.setStyleReferenceApproval(refId, req.body.approved);
  res.json(styleReferenceDto(row));
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
  const roomType = ROOM_TYPE_NAMES.includes(String(req.body?.room_type || '')) ? String(req.body.room_type) : null;
  const row = await q.addStyleProduct(styleId, productId, Number(req.body?.sort) || 0, roomType);
  res.status(201).json(row);
}));

app.post('/api/admin/styles/:id/products/bulk', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const styleId = Number(req.params.id);
  const roomType = ROOM_TYPE_NAMES.includes(String(req.body?.room_type || '')) ? String(req.body.room_type) : null;
  const ids = [...new Set((Array.isArray(req.body?.product_ids) ? req.body.product_ids : []).map(Number).filter(Boolean))];
  const existing = new Set((await q.styleProducts(styleId, roomType)).map(p => Number(p.id)));
  let added = 0;
  for (const id of ids) {
    if (existing.has(id)) continue;
    await q.addStyleProduct(styleId, id, added, roomType);
    added++;
  }
  res.json({ added });
}));

app.post('/api/admin/styles/:id/kit', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const style = await q.styleById(Number(req.params.id));
  if (!style) return res.status(404).json({ error: 'Стиль не найден' });
  const roomType = ROOM_TYPE_NAMES.includes(String(req.body?.room_type || '')) ? String(req.body.room_type) : 'Спальня';
  const priceTier = normalizeTier(String(req.body?.price_tier || ''), 'comfort');
  const room = roomTypeByName(roomType);
  if (!room) return res.status(400).json({ error: 'Неизвестная комната' });
  const pinned = await q.styleProducts(style.id, roomType);
  const curated = await curateProducts({
    style: style.name,
    priceTier,
    roomType,
    preferredIds: pinned.filter(p => p.active !== false).map(p => p.id),
    seed: `kit:${style.id}:${roomType}`,
    requireUrl: true,
  });
  const slots = room.slots.map(slot => {
    const p = curated.find(x => x.slot === slot.key);
    return {
      key: slot.key,
      label: SLOT_LABELS_RU[slot.key] || slot.key,
      product: p ? {
        id: p.id, name: p.name, price: p.price, unit: p.unit, price_tier: p.price_tier,
        url: p.url || null, image_url: p.image_path ? `/products/${path.basename(p.image_path)}` : p.image_url,
        dimensions: p.dimensions || null,
      } : null,
    };
  });
  res.json({
    style_id: style.id, style: style.name, room_type: roomType, price_tier: priceTier,
    slots, missing: slots.filter(s => !s.product).map(s => s.key),
    product_ids: slots.filter(s => s.product).map(s => s.product.id),
  });
}));

app.delete('/api/admin/styles/:id/products/:productId', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = await q.deleteStyleProduct(Number(req.params.id), Number(req.params.productId));
  res.status(ok ? 204 : 404).end();
}));

// ---------- типы комнат: справочник и настройки ----------
app.get('/api/admin/settings/room-types', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ config: getRoomTypeConfig(), defaults: getRoomTypeDefaults() });
}));

app.put('/api/admin/settings/room-types', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await saveRoomTypes(req.body?.config ?? req.body);
    log({ event: 'room_types_saved', count: config.length, active: config.filter(type => type.active !== false).length });
    res.json({ config, defaults: getRoomTypeDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/settings/room-types/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await resetRoomTypes();
    log({ event: 'room_types_reset' });
    res.json({ config, defaults: getRoomTypeDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

// ---------- модели генерации: только админ ----------
app.get('/api/admin/settings/models', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = getModelConfig();
  const listed = await listImageModels();
  const imageModels = Array.isArray(listed) ? listed : (listed.models || []);
  res.json({ render_model: config.render, edit_model: config.edit, vision_model: config.vision, resolution: config.resolution, aspect_ratio: config.aspectRatio, image_models: imageModels });
}));

app.get('/api/admin/settings/cleanup', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ config: getCleanupConfig(), defaults: getCleanupDefaults() });
}));

app.put('/api/admin/settings/cleanup', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cfg = req.body?.config || req.body || {};
  try {
    if (!cfg.model) return res.status(400).json({ error: 'Нужна модель очистки' });
    const optionsError = validateModelOptions(String(cfg.model), String(cfg.resolution || '1K'), String(cfg.aspect_ratio || 'auto'));
    if (optionsError) return res.status(400).json({ error: optionsError });
    const listed = await listImageModels();
    const imageModels = Array.isArray(listed) ? listed : (listed.models || []);
    if (!imageModels.find(m => m.id === String(cfg.model))) return res.status(400).json({ error: 'Модель очистки не найдена среди image-моделей' });
    const config = await saveCleanupConfig(cfg);
    log({ event: 'cleanup_config_saved', model: config.model, resolution: config.resolution, aspect_ratio: config.aspect_ratio, enabled: config.enabled });
    res.json({ config, defaults: getCleanupDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/settings/cleanup/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await resetCleanupConfig();
    log({ event: 'cleanup_config_reset' });
    res.json({ config, defaults: getCleanupDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.get('/api/admin/settings/render', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ config: getRenderConfig(), defaults: getRenderDefaults() });
}));

app.put('/api/admin/settings/render', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const cfg = req.body?.config || req.body || {};
    const config = await saveRenderConfig(cfg);
    log({ event: 'render_config_saved', product_refs_enabled: config.product_refs_enabled, product_matching_enabled: config.product_matching_enabled, max_products: config.max_products });
    res.json({ config, defaults: getRenderDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/settings/render/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await resetRenderConfig();
    log({ event: 'render_config_reset' });
    res.json({ config, defaults: getRenderDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

// ---------- lookbook-статьи (контент-движок) ----------
app.get('/api/admin/articles', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ articles: await q.listArticles() });
}));

app.post('/api/admin/articles/generate', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const article = await generateArticle({
      style: req.body?.style || 'Скандинавский',
      roomType: req.body?.room_type || 'Спальня',
      tier: req.body?.tier || 'comfort',
      title: req.body?.title || '',
    });
    log({ event: 'article_generated', id: article.id, slug: article.slug, style: article.style, room_type: article.room_type });
    res.json({ article });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/articles/:id/publish', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const article = await q.publishArticle(Number(req.params.id));
  if (!article) return res.status(404).json({ error: 'Статья не найдена' });
  log({ event: 'article_published', id: article.id, slug: article.slug });
  res.json({ article });
}));

app.delete('/api/admin/articles/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const removed = await q.deleteArticle(Number(req.params.id));
  if (!removed) return res.status(404).json({ error: 'Статья не найдена' });
  res.json({ ok: true });
}));

app.get('/api/admin/settings/prompt', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ config: getPromptConfig(), defaults: getPromptDefaults() });
}));

app.put('/api/admin/settings/prompt', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await savePromptConfig(req.body?.config || req.body || {});
    log({ event: 'prompt_config_saved' });
    res.json({ config, defaults: getPromptDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/settings/prompt/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await resetPromptConfig();
    log({ event: 'prompt_config_reset' });
    res.json({ config, defaults: getPromptDefaults() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.get('/api/admin/settings/style', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ config: getStyleConfig(), defaults: getStyleDefaults() });
}));

app.put('/api/admin/settings/style', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = await saveStyleConfig(req.body?.config || {});
  res.json({ ok: true, config });
}));

app.post('/api/admin/settings/style/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = await resetStyleConfig();
  res.json({ ok: true, config });
}));

app.get('/api/admin/settings/procurement', h(async (req, res) => {

  if (!requireAdmin(req, res)) return;
  res.json({ config: getProcurementConfig(), defaults: getProcurementDefaults() });
}));

app.put('/api/admin/settings/procurement', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = await saveProcurementConfig(req.body?.config || {});
  res.json({ ok: true, config });
}));

app.post('/api/admin/settings/procurement/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = await resetProcurementConfig();
  res.json({ ok: true, config });
}));

// ---------- поисковая лаборатория: только админ ----------
app.get('/api/admin/search/config', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(getSearchConfig());
}));

app.put('/api/admin/search/config', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = await saveSearchConfig(req.body?.config || req.body || {});
  res.json({ ok: true, config });
}));

app.post('/api/admin/search/config/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const config = await resetSearchConfig();
  res.json({ ok: true, config });
}));

app.get('/api/admin/search/prompts', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    vision: await listSearchPrompts('vision'),
    grid: await listSearchPrompts('grid'),
    cell: await listSearchPrompts('cell'),
  });
}));

app.post('/api/admin/search/prompts', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const kind = String(req.body?.kind || '');
  const prompt = String(req.body?.prompt || '');
  try {
    const created = await createPromptVersion(kind, prompt);
    return res.status(201).json(created);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/search/prompts/:id/activate', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const kind = String(req.body?.kind || '');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Некорректный id промта' });
  try {
    return res.json(await activatePromptVersion(kind, id));
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/search/prompts/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const prompts = {};
  for (const kind of PROMPT_KINDS) {
    const created = await createPromptVersion(kind, DEFAULT_SEARCH_PROMPTS[kind]);
    prompts[kind] = await activatePromptVersion(kind, created.id);
  }
  res.json(prompts);
}));

app.get('/api/admin/architect-prompts', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const data = {};
  for (const kind of ARCHITECT_PROMPT_KINDS) {
    data[kind] = {
      rows: await listArchitectPrompts(kind),
      active: getArchitectPrompt(kind),
    };
  }
  res.json(data);
}));

app.post('/api/admin/architect-prompts', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const kind = String(req.body?.kind || '');
  const system = String(req.body?.system || '');
  try {
    const created = await createArchitectPromptVersion(kind, system);
    return res.status(201).json(created);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/architect-prompts/:id/activate', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const kind = String(req.body?.kind || '');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Некорректный id промта' });
  try {
    return res.json(await activateArchitectPromptVersion(kind, id));
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/architect-prompts/reset', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const prompts = {};
  for (const kind of ARCHITECT_PROMPT_KINDS) {
    const created = await createArchitectPromptVersion(kind, DEFAULT_ARCHITECT_PROMPTS[kind]);
    prompts[kind] = await activateArchitectPromptVersion(kind, created.id);
  }
  res.json(prompts);
}));

async function runSearchStep(req, res, stage, processFn) {
  if (!requireAdmin(req, res)) return;
  const job = await q.getSearchJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Поиск не найден' });
  const id = req.params.id;
  await q.updateSearchJob(id, {
    status: 'processing',
    stage,
    error: null,
    started_at: new Date().toISOString(),
  });
  void processFn(id).catch(async (e) => {
    const error = String(e.message || e).slice(0, 300);
    await q.updateSearchJob(id, {
      status: 'failed',
      error,
      finished_at: new Date().toISOString(),
    }).catch(() => {});
    log({ event: 'search_step_error', step: stage, job_id: id, error });
  });
  return res.status(202).json(await searchJobDto(id));
}

app.post('/api/admin/search/jobs', (req, res, next) => {
  if (!requireAdmin(req, res)) return;
  next();
}, upload.single('photo'), h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  let id;
  if (req.file) {
    const photoPath = await saveUpload(req.file, 'search-lab');
    id = await createSearchJob({ source: 'photo', photoPath });
  } else if (req.body?.render_id) {
    const render = await q.getRender(String(req.body.render_id));
    if (!render) return res.status(404).json({ error: 'Рендер не найден' });
    id = await createSearchJob({ source: 'render', renderId: render.id });
  } else {
    return res.status(400).json({ error: 'Нужно фото или render_id' });
  }
  return res.status(201).json(await searchJobDto(id));
}));

app.get('/api/admin/search/jobs/:id', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const job = await searchJobDto(req.params.id);
  if (!job) return res.status(404).json({ error: 'Поиск не найден' });
  res.json(job);
}));

app.post('/api/admin/search/jobs/:id/vision', h(async (req, res) =>
  runSearchStep(req, res, 'vision', processVisionStep)));

app.post('/api/admin/search/jobs/:id/grid', h(async (req, res) =>
  runSearchStep(req, res, 'grid', processGridStep)));

app.post('/api/admin/search/jobs/:id/crops', h(async (req, res) =>
  runSearchStep(req, res, 'crops', processCropsStep)));

app.post('/api/admin/search/jobs/:id/objects/:objId/search', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const job = await q.getSearchJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Поиск не найден' });
  const objId = Number(req.params.objId);
  if (!Number.isSafeInteger(objId)) return res.status(400).json({ error: 'Некорректный объект' });
  const object = await q.getSearchObject(objId);
  if (!object || object.job_id !== job.id) return res.status(404).json({ error: 'Объект не найден' });
  const out = await processObjectSearch(req.params.id, objId, req.body || {});
  return res.json(out);
}));

app.get('/api/admin/search/jobs/:id/objects/:objId/search', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const job = await q.getSearchJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Поиск не найден' });
  const objId = Number(req.params.objId);
  if (!Number.isSafeInteger(objId)) return res.status(400).json({ error: 'Некорректный объект' });
  const object = await q.getSearchObject(objId);
  if (!object || object.job_id !== job.id) return res.status(404).json({ error: 'Объект не найден' });
  const out = await searchResultsDto(objId);
  return res.json({ object_id: objId, results: out });
}));

app.get('/api/admin/settings/proxy', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(getProxyState({ masked: true }));
}));

app.put('/api/admin/settings/proxy', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const raw = String(req.body?.url ?? '').trim();
  try {
    // Маскированное значение = «не менять»; пустая строка = отключить.
    if (!raw.includes('***')) {
      await applyProxy(raw);
      await q.setSetting('proxy.url', getProxyState().url);
    }
    res.json(getProxyState({ masked: true }));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.post('/api/admin/settings/proxy/test', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const raw = String(req.body?.url ?? '').trim();
  const target = raw && !raw.includes('***') ? raw : getProxyState().url;
  try {
    const result = await testProxy(target);
    res.json({ ...getProxyState({ masked: true }), status: result });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 300) });
  }
}));

app.put('/api/admin/settings/models', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const renderModel = String(req.body?.render_model || '').trim();
  const editModel = String(req.body?.edit_model || '').trim();
  const visionModel = String(req.body?.vision_model || '').trim();
  const resolution = String(req.body?.resolution || '1K').trim();
  const aspectRatio = String(req.body?.aspect_ratio || 'auto').trim();
  if (!renderModel || !visionModel) return res.status(400).json({ error: 'Нужны render_model и vision_model' });
  const optionsError = validateModelOptions(renderModel, resolution, aspectRatio);
  if (optionsError) return res.status(400).json({ error: optionsError });
  const listed = await listImageModels();
  const imageModels = Array.isArray(listed) ? listed : (listed.models || []);
  const picked = imageModels.find(m => m.id === renderModel);
  if (!picked) return res.status(400).json({ error: 'Модель не найдена среди image-моделей OpenRouter' });
  if (editModel && !imageModels.find(m => m.id === editModel)) {
    return res.status(400).json({ error: 'Модель редактирования не найдена среди image-моделей OpenRouter' });
  }
  const saved = await saveModelConfig({ render: renderModel, edit: editModel, vision: visionModel, resolution, aspectRatio });
  let warning = '';
  try { await assertConfig(); }
  catch (e) { warning = String(e.message || e).slice(0, 300); log({ event: 'model_config_warning', error: warning }); }
  log({ event: 'model_config_saved', render_model: saved.render, edit_model: saved.edit || null, vision_model: saved.vision, resolution: saved.resolution, aspect_ratio: saved.aspectRatio, input_refs: picked.input_refs });
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
    method: method || null,
    reason: reason || '',
  });
  res.status(201).json(out);
}));

// ---------- комнаты ----------
app.post('/api/cleanup', rateLimit, upload.single('photo'), h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const photo = req.file;
  if (!photo) return res.status(400).json({ error: 'Нет фото' });
  const roomType = ROOM_TYPE_NAMES.includes(String(req.body?.room_type || '')) ? String(req.body.room_type) : 'Другое';
  if (MOCK_MODE) {
    return res.json({ image: `data:${photo.mimetype};base64,${photo.buffer.toString('base64')}`, model: 'mock' });
  }
  const cleanupCfg = getCleanupConfig();
  const clean = await sanitizeImage(photo.buffer);
  const { width, height } = imageSize(clean);
  const cleanupAspect = cleanupCfg.aspect_ratio === 'auto'
    ? snapAspect(width, height, modelCaps(cleanupCfg.model).aspects)
    : cleanupCfg.aspect_ratio;
  const out = await generateCleanupRender({
    prompt: buildCleanupPrompt(roomType),
    sourceImageB64: `data:${photo.mimetype};base64,${clean.toString('base64')}`,
    aspectRatio: cleanupAspect,
    model: cleanupCfg.model,
    resolution: cleanupCfg.resolution,
    aspect: cleanupCfg.aspect_ratio,
  });
  let shell = Buffer.from(out.b64, 'base64');
  shell = await fitAspect(shell, width / height);
  const ext = detectImageExt(shell);
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  log({ event: 'cleanup_api_done', model: cleanupCfg.model, room_type: roomType, cost_usd: out.cost ?? null });
  res.json({ image: `data:${mime};base64,${shell.toString('base64')}`, model: out.model || cleanupCfg.model, cost_usd: out.cost ?? null });
}));

app.post('/api/estimate-room', rateLimit, upload.single('photo'), h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const photo = req.file;
  if (!photo) return res.status(400).json({ error: 'Нет фото' });
  const roomType = String(req.body?.room_type || '').trim().slice(0, 80);
  if (MOCK_MODE) {
    return res.json({
      width_m: 3, length_m: 4, height_m: 2.7, bed_present: /спальн|детск/i.test(roomType),
      confidence: 'low', room_type_guess: roomType || 'Гостиная (зал)', room_type_confidence: 'low',
      style_suggestions: [], architecture: {}, existing_furniture: [],
      reasoning: 'Mock-оценка для локальной разработки', assumptions: [], cost_usd: 0,
    });
  }
  const clean = await sanitizeImage(photo.buffer);
  const out = await analyzeRoomBrief({
    imageDataUrl: `data:${photo.mimetype};base64,${clean.toString('base64')}`,
    roomType,
  });
  log({ event: 'room_brief', room_type: roomType, guess: out?.room_type_guess, width_m: out?.width_m, length_m: out?.length_m, height_m: out?.height_m, confidence: out?.confidence, styles: out?.style_suggestions?.map(s => s.name).join('|') || '', cost_usd: out?.cost ?? null });
  res.json({ ...out, cost_usd: out?.cost ?? null });
}));

app.post('/api/rooms', rateLimit, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cleanup_photo', maxCount: 1 },
]), h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const photo = req.files?.photo?.[0];
  const cleanupPhoto = req.files?.cleanup_photo?.[0];
  if (!photo) return res.status(400).json({ error: 'Нет фото' });
  if (!MOCK_MODE) {
    const bal = await q.creditBalance(req.user.id);
    if (bal < 1) {
      return res.status(402).json({ error: 'Нужен кредит', buy_url: '/app?buy=1', balance: bal });
    }
  }
  const id = crypto.randomUUID();
  const canonicalStyleNames = new Set(DESIGN_STYLES.map(item => item.name));
  const requestedStyle = String(req.body?.style || '').trim();
  const requestedRoomType = String(req.body?.room_type || '').trim();
  if (!requestedStyle) {
    return res.status(400).json({ error: 'Выберите стиль' });
  }
  const roomType = ROOM_TYPE_NAMES.includes(requestedRoomType) && isRoomTypeActive(requestedRoomType) ? requestedRoomType : 'Другое';
  const dbStyle = requestedStyle ? await q.styleByName(requestedStyle) : null;
  const style = requestedStyle
    ? (dbStyle && dbStyle.active ? dbStyle.name : (canonicalStyleNames.has(requestedStyle) ? requestedStyle : 'Современный минимализм'))
    : 'Современный минимализм';
  const requestedConcept = String(req.body?.concept || '').trim();
  const conceptKey = DESIGN_CONCEPTS.some(item => item.id === requestedConcept) ? requestedConcept : null;
  const allowedPalettes = new Set(['none', 'mono', 'analogous', 'complementary', 'split']);
  const allowedAccents = new Set(['none', 'forest', 'sand', 'terra', 'dust', 'graphite']);
  const palette = allowedPalettes.has(req.body.palette) ? req.body.palette : 'none';
  const accent = allowedAccents.has(req.body.accent) ? req.body.accent : 'none';
  const budget = Math.min(Math.max(Number(req.body.budget) || 150, 50), 1000);
  const priceTier = normalizeTier(String(req.body.price_tier || req.body.tier || '').trim(), 'comfort');
  const bool = (value, fallback = true) => value === undefined || value === null || value === ''
    ? fallback
    : !(value === false || value === 0 || value === '0' || value === 'false' || value === 'off');
  const keepFurniture = bool(req.body.keep_furniture, true);
  const useCatalog = bool(req.body.use_catalog, true);
  const optionalMeasure = (value, min, max) => {
    const raw = String(value ?? '').replace(',', '.').trim();
    if (!raw) return null;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min || number > max) return undefined;
    return number;
  };
  const roomWidthM = optionalMeasure(req.body.room_width_m, 1, 30);
  const roomLengthM = optionalMeasure(req.body.room_length_m, 1, 30);
  const roomHeightM = optionalMeasure(req.body.room_height_m, 2, 10);
  const bedLengthM = optionalMeasure(req.body.bed_length_m, 1, 4);
  const isBedRoom = /спальн|детск/i.test(roomType);
  if ([roomWidthM, roomLengthM, roomHeightM].some(value => value === undefined) || (isBedRoom && bedLengthM === undefined)) {
    return res.status(400).json({ error: 'Размеры должны быть положительными числами в метрах: комната 1–30, высота 2–10, кровать 1–4' });
  }
  const hasRoomMeasure = [roomWidthM, roomLengthM, roomHeightM].some(value => value !== null);
  const hasAllRoomMeasures = [roomWidthM, roomLengthM, roomHeightM].every(value => value !== null);
  if (hasRoomMeasure && !hasAllRoomMeasures) {
    return res.status(400).json({ error: 'Заполните все три размера комнаты: ширину, длину и высоту' });
  }
  const effectiveBedLengthM = isBedRoom ? (bedLengthM ?? 2) : null;
  const dimensionOrientation = String(req.body.dimension_orientation || '').trim().slice(0, 200) || null;
  const photoKey = await saveUpload(photo, 'uploads');
  let cleanupKey = cleanupPhoto ? await saveUpload(cleanupPhoto, 'uploads') : null;
  await q.createRoom(id, style, budget, photoKey, req.user.id, roomType, palette, accent, null, priceTier, keepFurniture, useCatalog, cleanupKey, roomWidthM, roomLengthM, roomHeightM, effectiveBedLengthM, dimensionOrientation, conceptKey);
  try {
    await enqueueRender({ roomId: id, chargedUserId: req.user.id, requestIp: clientIp(req) });
  } catch (e) {
    if (e.status === 402) {
      await q.deleteRoom(id);
      await remove(photoKey);
      if (cleanupKey) await remove(cleanupKey);
      return res.status(402).json({ error: 'Нужен кредит', buy_url: '/app?buy=1', balance: await q.creditBalance(req.user.id) });
    }
    throw e;
  }
  res.status(201).json({ id, status: 'queued', concept_key: conceptKey });
}));

app.get('/api/rooms/:id', h(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Войдите, чтобы продолжить' });
  const room = await q.getRoom(req.params.id);
  if (!room || Number(room.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  let render = null;
  if (req.query.render_id) {
    const picked = await q.getRender(String(req.query.render_id));
    if (picked && picked.room_id === room.id && picked.status === 'done' && picked.image_path) render = picked;
  }
  if (!render) render = await q.latestRender(room.id);
  const items = render ? await q.itemsForRender(render.id) : [];
  const total = render ? await q.totalForRender(render.id) : 0;
  const pricesAsOf = render ? await q.pricesAsOfForRender(render.id) : null;
  res.json({
    id: room.id,
    style: room.style,
    room_type: room.room_type,
    room_width_m: room.room_width_m == null ? null : Number(room.room_width_m),
    room_length_m: room.room_length_m == null ? null : Number(room.room_length_m),
    room_height_m: room.room_height_m == null ? null : Number(room.room_height_m),
    bed_length_m: room.bed_length_m == null ? null : Number(room.bed_length_m),
    dimension_orientation: room.dimension_orientation || null,
    budget: room.budget,
    price_tier: room.price_tier || 'comfort',
    keep_furniture: room.keep_furniture !== false,
    use_catalog: room.use_catalog !== false,
    products_enabled: getRenderConfig().product_matching_enabled,
    concept_key: room.concept_key || null,
    design_direction: room.design_direction || null,
    status: room.status,
    error: room.error,
    notice: room.notice || null,
    photo_url: `/files/${path.basename(room.photo_path)}`,
    render: render ? {
      id: render.id,
      image: render.image_path ? `/renders/${path.basename(render.image_path)}` : null,
      status: render.status,
      created_at: render.created_at,
      request_text: render.request_text,
      model: render.model,
      edit_target: render.edit_target || null,
      analysis: render.analysis || null,
      art_direction: render.meta?.art_direction ? {
        palette: render.meta.art_direction.palette || [],
        focalPoint: render.meta.art_direction.focalPoint || '',
        featureWall: render.meta.art_direction.featureWall || '',
        lighting: render.meta.art_direction.lighting || '',
        mood: render.meta.art_direction.mood || '',
      } : null,
      product_qa: render.meta?.product_qa ? {
        status: render.meta.product_qa.status,
        accepted: render.meta.product_qa.accepted,
        issues: render.meta.product_qa.issues || [],
      } : null,
      dimensions_estimate: render.meta?.room_dimensions_estimate || null,
      lens: render.meta?.lens || null,
      repair_scope: render.meta?.repair_scope || null,
      design_direction: render.meta?.design_direction ? {
        styleId: render.meta.design_direction.styleId || null,
        conceptId: render.meta.design_direction.conceptId || null,
        concept: render.meta.design_direction.concept || '',
        mainMove: render.meta.design_direction.mainMove || null,
        supportingMoves: render.meta.design_direction.supportingMoves || [],
        focalPoint: render.meta.design_direction.focalPoint || '',
        focalZone: render.meta.design_direction.focalZone || null,
        quietAreas: render.meta.design_direction.quietAreas || [],
        materialsStory: render.meta.design_direction.materialsStory || [],
        materials: render.meta.design_direction.materials || '',
        palette: render.meta.design_direction.palette || [],
        compatibility: render.meta.design_direction.compatibility || 'ok',
        avoid: render.meta.design_direction.avoid || [],
      } : null,
      layout_plan: render.meta?.layout_plan ? {
        strategy: render.meta.layout_plan.strategy || '',
        zones: render.meta.layout_plan.zones || [],
        items: render.meta.layout_plan.items || [],
        circulation: render.meta.layout_plan.circulation || '',
        focalPoint: render.meta.layout_plan.focal_point || '',
        avoid: render.meta.layout_plan.avoid || [],
      } : null,
    } : null,
    items: items.map(p => ({
      id: p.id,
      name: p.name, brand: p.brand, attrs: p.attrs || {}, category: p.category,
      price: p.price, unit: p.unit, qty: p.qty, source: p.source, match_score: p.match_score,
      presentation_status: p.presentation_status || 'curated',
      target: productTarget(p),
      can_bind: p.presentation_status !== 'verified' && canBindProduct(p, room.keep_furniture !== false),
      price_tier: p.price_tier || 'comfort',
      price_date: p.price_date, price_updated_at: p.price_updated_at,
      url: `/go/${p.id}${render ? `?r=${encodeURIComponent(render.id)}` : ''}`,
      direct_url: Boolean(p.url),
      link_label: p.url ? 'Заказать' : 'Найти похожие',
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
app.get('/procurement/:file', h(async (req, res) => serveStored(req, res, 'procurement', req.params.file)));
app.get('/style-images/:file', h(async (req, res) => serveStored(req, res, 'style-images', req.params.file)));
app.get('/covers/:file', h(async (req, res) => serveStored(req, res, 'covers', req.params.file)));
function notFoundPage(title, text) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — ремонтвижн</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;background:#f5f2ec;color:#1e1c19;font-family:Georgia,'Times New Roman',serif;display:flex;min-height:100vh;align-items:center;justify-content:center}.box{max-width:520px;padding:40px 24px;text-align:center}.logo{font-family:system-ui,sans-serif;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px;color:#1e1c19;text-decoration:none}h1{font-size:clamp(32px,6vw,56px);line-height:1.05;margin:24px 0 12px}p{color:#6b645c;line-height:1.6}a.btn{display:inline-block;margin-top:24px;padding:14px 22px;background:#1e1c19;color:#f5f2ec;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px}</style></head><body><div class="box"><a class="logo" href="/">ремонтвижн</a><h1>${title}</h1><p>${text}</p><a class="btn" href="/">На главную</a></div></body></html>`;
}

app.get('/articles/:slug', h(async (req, res) => {
  const article = await q.articleBySlug(String(req.params.slug || ''));
  if (!article) return res.status(404).type('html').send(notFoundPage('Статья не найдена', 'Такой статьи нет или она снята с публикации.'));
  res.type('html').send(articlePage(article));
}));
app.get('/search-lab/:file', h(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await serveStored(req, res, 'search-lab', req.params.file);
}));

// Переход из сметы к товару: логируем клик и уводим на реальную страницу/поиск.
app.get('/go/:id', h(async (req, res) => {
  const product = await q.getProduct(Number(req.params.id));
  if (!product) return res.status(404).end();
  let renderId = String(req.query.r || '').trim() || null;
  if (renderId) {
    const r = await q.getRender(renderId);
    if (!r) renderId = null;
  }
  const ipHash = crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
  try {
    await q.logProductClick({ productId: product.id, userId: req.user?.id || null, renderId, ipHash });
  } catch (e) {
    log({ event: 'product_click_error', product_id: product.id, error: String(e.message || e).slice(0, 200) });
  }
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, productLink(product));
}));

// «Готово»: архитектор смотрит финальный рендер и собирает итог + реальные товары.
app.post('/api/renders/:id/final-review', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const render = await q.renderOwnedByUser(req.params.id, req.user.id);
  if (!render) return res.status(404).json({ error: 'Дизайн не найден' });
  if (render.status !== 'done' || !render.image_path) return res.status(409).json({ error: 'Дизайн ещё не готов' });
  if (render.analysis?.final) return res.json({ analysis: render.analysis, cost_usd: 0, cached: true });
  const room = await q.getRoom(render.room_id);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  const buffer = await getBuffer(render.image_path);
  const ext = path.extname(render.image_path).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  const imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  const review = await reviewDesign({
    imageDataUrl,
    roomType: room.room_type || 'Другое',
    style: room.style,
    priceTier: room.price_tier || 'comfort',
    mode: 'final',
  });
  if (!review) return res.status(502).json({ error: 'Не удалось собрать итог по дизайну' });
  const products = Array.isArray(render.analysis?.products) ? render.analysis.products : [];
  const analysis = {
    ...(render.analysis || {}),
    architect: { ...review.architect, status: 'ready', render_id: render.id },
    final: review.architect.summary || {
      concept: [room.style, room.room_type].filter(Boolean).join(' · '),
      palette: (review.architect.palette || []).map(color => `${color.name} ${color.hex}`).join(', '),
      materials: (review.architect.surfaces || []).map(surface => [surface.material, surface.color].filter(Boolean).join(' ')).filter(Boolean).join(', '),
      electrical: (review.architect.electrical || []).map(item => `${item.title}: ${item.text}`).join(' '),
      next_steps: (review.architect.hints || []).map(hint => hint.action),
    },
    products,
  };
  await q.setRenderAnalysis(render.id, analysis);
  const meta = {
    ...(render.meta || {}),
    final_review: { cost_usd: review.cost ?? null, at: new Date().toISOString() },
  };
  await q.setRenderMeta(render.id, meta);
  log({ event: 'final_review_done', render_id: render.id, user_id: req.user.id, items: review.architect.items.length, products: products.reduce((sum, match) => sum + match.offers.length, 0), cost_usd: review.cost ?? null });
  res.json({ analysis, cost_usd: review.cost ?? null });
}));

// Поиск товаров по кнопке: агент смотрит на рендер и вызывает MCP-инструменты каталога.
app.post('/api/renders/:id/product-search', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const render = await q.renderOwnedByUser(req.params.id, req.user.id);
  if (!render) return res.status(404).json({ error: 'Дизайн не найден' });
  if (render.status !== 'done' || !render.image_path) return res.status(409).json({ error: 'Дизайн ещё не готов' });
  if (!getRenderConfig().product_matching_enabled) return res.status(503).json({ error: 'Подбор товаров выключен в админке' });
  if (render.analysis?.mcp_products && !req.body?.refresh) {
    return res.json({ analysis: render.analysis, cached: true });
  }
  const room = await q.getRoom(render.room_id);
  const buffer = await getBuffer(render.image_path);
  const ext = path.extname(render.image_path).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  const started = Date.now();
  try {
    const agent = await runVisionAgent({
      image: buffer,
      mime,
      roomType: room?.room_type || 'Другое',
      style: room?.style || '',
      topK: 4,
      maxSteps: 10,
    });
    const ids = [...new Set((agent.items || []).flatMap(item => item.offer_ids || []).map(String))].slice(0, 40);
    const offers = new Map();
    const queue = [...ids];
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift();
        try {
          const offer = await getCatalogOffer(id);
          if (!offer) continue;
          offers.set(String(id), {
            id: String(offer.id),
            name: String(offer.name || ''),
            price: offer.price == null ? null : Number(offer.price),
            currency: offer.currency || 'RUB',
            merchant: offer.merchant || null,
            url: offer.affiliate_url || offer.canonical_url || null,
            image_url: offer.picture_url || null,
            erid: offer.erid || null,
            score: null,
          });
        } catch (e) {
          log({ event: 'product_search_offer_error', render_id: render.id, offer_id: id, error: String(e.message || e).slice(0, 200) });
        }
      }
    });
    await Promise.all(workers);
    const products = (agent.items || []).map(item => {
      const seen = new Set();
      const itemOffers = (item.offer_ids || [])
        .map(id => offers.get(String(id)))
        .filter(Boolean)
        .filter(offer => {
          const key = offer.url || offer.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 4);
      return {
        item: { key: item.category || item.label, label: item.label || item.category || 'Товар', category: item.category || '' },
        offers: itemOffers,
        ...(itemOffers.length ? {} : { note: 'В каталоге не нашлось подходящего товара' }),
      };
    });
    const analysis = {
      ...(render.analysis || {}),
      products,
      mcp_products: products,
      mcp_room: agent.room || null,
    };
    await q.setRenderAnalysis(render.id, analysis);
    log({ event: 'product_search_done', render_id: render.id, user_id: req.user.id, items: products.length, offers: [...offers.values()].length, ms: Date.now() - started });
    res.json({ analysis, cached: false });
  } catch (e) {
    log({ event: 'product_search_error', render_id: render.id, user_id: req.user.id, error: String(e.message || e).slice(0, 300), ms: Date.now() - started });
    res.status(502).json({ error: 'Не удалось подобрать товары. Попробуйте ещё раз.' });
  }
}));

app.get('/buy/:id', h(async (req, res) => {
  const candidateId = Number(req.params.id);
  if (!Number.isSafeInteger(candidateId) || candidateId <= 0) return res.status(404).end();
  const ipHash = crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
  const candidate = await logProcurementClick({ candidateId, userId: req.user?.id || null, ipHash });
  if (!candidate?.canonical_url) return res.status(404).end();
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, candidate.canonical_url);
}));

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

app.post('/api/renders/:id/share', h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const render = await q.getRender(req.params.id);
  if (!render || render.status !== 'done' || !render.image_path) return res.status(404).json({ error: 'Дизайн не найден' });
  const room = await q.getRoom(render.room_id);
  if (!room || Number(room.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Дизайн не найден' });
  const token = render.share_token || crypto.randomBytes(18).toString('base64url');
  if (!render.share_token) await q.setRenderShareToken(render.id, token);
  res.json({ token, url: `${APP_URL}/s/${token}` });
}));

app.get('/api/share/:token', h(async (req, res) => {
  const render = await q.renderByShareToken(req.params.token);
  if (!render) return res.status(404).json({ error: 'Ссылка не найдена' });
  const visitor = visitorKey(req);
  const [likes, comments, liked] = await Promise.all([
    q.countLikes(render.id),
    q.listComments(render.id),
    q.hasLike(render.id, visitor),
  ]);
  res.json({
    id: render.id,
    image: `/s/${req.params.token}/image`,
    style: render.style,
    room_type: render.room_type,
    created_at: render.created_at,
    likes,
    liked,
    comments: comments.map(c => ({ id: c.id, name: c.name, text: c.text, created_at: c.created_at })),
    design_direction: render.meta?.design_direction ? {
      concept: render.meta.design_direction.concept || '',
      mainMove: render.meta.design_direction.mainMove || null,
      focalPoint: render.meta.design_direction.focalPoint || '',
      quietAreas: render.meta.design_direction.quietAreas || [],
      materialsStory: render.meta.design_direction.materialsStory || [],
      palette: render.meta.design_direction.palette || [],
    } : null,
    surfaces: Array.isArray(render.analysis?.surfaces) ? render.analysis.surfaces : [],
  });
}));

app.post('/api/share/:token/like', rateLimit, h(async (req, res) => {
  const render = await q.renderByShareToken(req.params.token);
  if (!render) return res.status(404).json({ error: 'Ссылка не найдена' });
  const visitor = visitorKey(req);
  const liked = await q.hasLike(render.id, visitor);
  if (liked) await q.removeLike(render.id, visitor);
  else await q.addLike(render.id, visitor);
  res.json({ liked: !liked, likes: await q.countLikes(render.id) });
}));

app.post('/api/share/:token/comments', rateLimit, h(async (req, res) => {
  const render = await q.renderByShareToken(req.params.token);
  if (!render) return res.status(404).json({ error: 'Ссылка не найдена' });
  const text = String(req.body?.text || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (!text) return res.status(400).json({ error: 'Введите комментарий' });
  if (text.length > 500) return res.status(400).json({ error: 'Комментарий длиннее 500 символов' });
  const comment = await q.addComment(render.id, name, text, visitorKey(req));
  res.status(201).json({ id: comment.id, name: comment.name, text: comment.text, created_at: comment.created_at });
}));

app.get('/s/:token/image', h(async (req, res) => {
  const render = await q.renderByShareToken(req.params.token);
  if (!render || !render.image_path) return res.status(404).end();
  await serveStored(req, res, 'renders', path.basename(render.image_path));
}));

const MAX_EDIT_REFS = 4;
app.post('/api/rooms/:id/iterate', rateLimit, upload.fields([{ name: 'refs', maxCount: MAX_EDIT_REFS }, { name: 'ref', maxCount: 1 }]), h(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const room = await q.getRoom(req.params.id);
  if (!room || Number(room.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  const text = String(req.body?.text || '').trim();
  if (text.length > 500) return res.status(400).json({ error: 'Слишком длинный запрос (макс. 500 символов)' });
  const uploaded = [...(req.files?.refs || []), ...(req.files?.ref || [])];
  let refMeta = [];
  if (req.body?.ref_meta) {
    try {
      const parsed = JSON.parse(String(req.body.ref_meta));
      if (Array.isArray(parsed)) refMeta = parsed;
    } catch {
      return res.status(400).json({ error: 'Некорректные данные референсов' });
    }
  }
  if (refMeta.length > MAX_EDIT_REFS) return res.status(400).json({ error: `Максимум ${MAX_EDIT_REFS} референса за запрос` });
  const hasRefInput = uploaded.length > 0 || refMeta.some(r => r?.url) || Boolean(String(req.body?.ref_url || '').trim());
  if (!text && !hasRefInput) return res.status(400).json({ error: 'Пустой запрос' });
  if (room.status !== 'done') return res.status(409).json({ error: 'Подождите завершения текущей задачи' });
  const requestedParentId = String(req.body?.parent_id || '').trim();
  let parent;
  if (requestedParentId) {
    const picked = await q.getRender(requestedParentId);
    if (!picked || picked.room_id !== room.id || picked.status !== 'done' || !picked.image_path) {
      return res.status(400).json({ error: 'Версия для правки не найдена' });
    }
    parent = picked;
  } else {
    parent = await q.latestRender(room.id);
  }
  if (!parent) return res.status(409).json({ error: 'Нет рендера для правки' });

  let target = String(req.body?.target || '').trim();
  if (target && !SLOT_LABELS[target]) return res.status(400).json({ error: 'Неизвестный объект правки' });

  const refProductId = req.body?.product_id ? Number(req.body.product_id) : null;
  let refProduct = null;
  if (refProductId) {
    refProduct = await q.getProduct(refProductId);
    if (!refProduct || refProduct.active === false) return res.status(400).json({ error: 'Товар для референса не найден' });
    if (!refProduct.image_path && !refProduct.image_url) return res.status(400).json({ error: 'У товара нет изображения для привязки' });
    if (!canReplaceWithProduct(refProduct, room.keep_furniture !== false)) {
      return res.status(400).json({ error: 'В режиме «Оставить мебель» эту мебель нельзя заменить. Создайте свободный дизайн.' });
    }
    const expectedTarget = productTarget(refProduct);
    if (target && target !== expectedTarget && !(refProduct.category === 'tile' && target === 'backsplash')) {
      return res.status(400).json({ error: 'Товар не соответствует выбранному объекту правки' });
    }
    target = target || expectedTarget;
    if (!SLOT_LABELS[target]) target = null;
  }

  let instruction = text;
  const editRefs = [];
  const addUrlRef = async (url, description) => {
    const img = await fetchRemoteImage(url);
    const stored = await saveUpload({ buffer: img.buffer, mimetype: img.mime }, 'uploads');
    editRefs.push({ path: stored, instruction: description, label: 'URL' });
  };
  let fileIdx = 0;
  try {
    for (const meta of refMeta) {
      const description = String(meta?.description || '').trim().slice(0, 300);
      const url = String(meta?.url || '').trim();
      if (url) {
        await addUrlRef(url, description);
      } else if (fileIdx < uploaded.length) {
        const file = uploaded[fileIdx++];
        const stored = await saveUpload(file, 'uploads');
        editRefs.push({ path: stored, instruction: description, label: file.originalname || '' });
      }
    }
    while (fileIdx < uploaded.length && editRefs.length < MAX_EDIT_REFS) {
      const file = uploaded[fileIdx++];
      const stored = await saveUpload(file, 'uploads');
      editRefs.push({ path: stored, instruction: '', label: file.originalname || '' });
    }
    if (!editRefs.length) {
      const explicitUrl = String(req.body?.ref_url || '').trim();
      const url = explicitUrl || firstImageUrl(text);
      if (url) {
        await addUrlRef(url, '');
        // URL в тексте модели не нужен: картинка уже прикреплена.
        if (!explicitUrl) instruction = text.replace(url, '').replace(/\s+/g, ' ').trim();
      }
    }
  } catch (e) {
    log({ event: 'iterate_ref_url_error', error: String(e.message || e).slice(0, 200) });
    return res.status(400).json({ error: `Не удалось загрузить референс по ссылке: ${e.message}. Прикрепите файл.` });
  }
  if (!instruction) instruction = 'Применить правки по референсам';
  const refPath = editRefs[0]?.path || null;

  try {
    await enqueueRender({
      roomId: room.id,
      parentRenderId: parent.id,
      requestText: instruction,
      chargedUserId: req.user.id,
      requestIp: clientIp(req),
      editTarget: target || null,
      refPath,
      refProductId: refProduct ? refProduct.id : null,
      editRefs: (editRefs.length > 1 || editRefs.some(r => r.instruction)) ? editRefs : null,
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
  await seedStyleReferences(); // сгенерированные референсы стилей (style-refs/seed.json)
  await loadModelConfig();  // модели из app_settings / env
  await loadProxyConfig();  // прокси из app_settings / env
  await loadPromptConfig(); // редактируемые правила промта из app_settings
  await loadCleanupConfig(); // очистка комнаты: модель/промт из app_settings
  await loadRenderConfig();  // «товары в рендере»: референсы hero-товаров
  await loadProcurementConfig(); // подбор товаров: слои, лимиты, домены
  await loadSearchConfig();      // поиск: модели, домены, лимиты из app_settings
  await seedSearchPrompts();     // версии промтов vision/grid/cell
  await loadSearchPrompts();     // активные версии в память
  await seedArchitectPrompts();  // промты строителя/рецензента/критерия
  await loadArchitectPrompts();  // активные версии архитектора
  await loadStyleConfig(); // источник стиля: текст/свотчи
  await loadRoomTypes();   // типы комнат: справочник и промты из app_settings
  if (MOCK_MODE && (process.env.NODE_ENV === 'production' || PAYMENTS_ENABLED)) {
    throw new Error('OPENROUTER_API_KEY обязателен в production/при включённой монетизации');
  }
  // Проверка моделей не должна ронять сайт, если OpenRouter/прокси временно недоступны.
  try {
    await assertConfig();
  } catch (e) {
    log({ event: 'config_warning', error: String(e.message || e).slice(0, 300) });
  }
  if (!ADMIN_KEY) console.log('[warn] ADMIN_KEY не задан — админка каталога открыта не будет');
  // Единая брендированная 404 для неизвестных маршрутов (API — JSON).
  app.use((req, res) => {
    if (String(req.path || '').startsWith('/api/')) return res.status(404).json({ error: 'Не найдено' });
    res.status(404).type('html').send(notFoundPage('Страница не найдена', 'Такой страницы нет. Проверьте ссылку или вернитесь на главную.'));
  });
  app.listen(PORT, () => {
    log({ event: 'listen', port: PORT, mock: MOCK_MODE, payments_enabled: PAYMENTS_ENABLED });
    startWorker();
    startSearchWorker();
  });
}

main().catch(e => {
  console.error(`[remontvision] не запускаюсь: ${e.message}`);
  process.exit(1);
});

// Слой данных: Postgres (pg) + накатные миграции из migrations/*.sql.
// ВНИМАНИЕ: имя переменной своё (RV_DATABASE_URL), не стандартное DATABASE_URL —
// на машине разработчика DATABASE_URL экспортирован глобально в ~/.bashrc чужим проектом,
// и процессное окружение перебивает --env-file. Fallback на DATABASE_URL намеренно не делаем.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.RV_DATABASE_URL) {
  console.error('[db] не задан RV_DATABASE_URL (см. .env.example)');
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: process.env.RV_DATABASE_URL,
  max: 10,
});

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// накат миграций, которых ещё нет в _migrations
export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtext($1))', ['remontvision_migrations']);
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
      if (rows.length) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await withTransaction(async client => {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
      });
      console.log(`[db] миграция применена: ${f}`);
    }
  } finally {
    try { await lock.query('SELECT pg_advisory_unlock(hashtext($1))', ['remontvision_migrations']); } catch { /* ignore */ }
    lock.release();
  }
}

// ---------- запросы ----------
export const q = {
  // rooms
  createRoom: (id, style, budget, photoPath, userId, roomType = null, palette = null, accent = null, styleRefPath = null, priceTier = 'comfort', keepFurniture = true, useCatalog = true) =>
    pool.query(`INSERT INTO rooms (id, style, budget, photo_path, user_id, room_type, palette, accent, style_ref_path, price_tier, keep_furniture, use_catalog)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, style, budget, photoPath, userId, roomType, palette, accent, styleRefPath, priceTier, keepFurniture, useCatalog]),
  getRoom: id => pool.query(`SELECT * FROM rooms WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  roomByPhotoKey: key =>
    pool.query(`SELECT user_id FROM rooms WHERE photo_path = $1 OR photo_path LIKE '%/' || $1 LIMIT 1`, [key])
      .then(r => r.rows[0] || null),
  roomByRenderKey: key =>
    pool.query(`SELECT rm.user_id FROM renders r JOIN rooms rm ON rm.id = r.room_id
                WHERE r.image_path = $1 OR r.image_path LIKE '%/' || $1 LIMIT 1`, [key])
      .then(r => r.rows[0] || null),
  renderPathsForRoom: roomId =>
    pool.query(`SELECT image_path, shell_path FROM renders WHERE room_id = $1 AND (image_path IS NOT NULL OR shell_path IS NOT NULL)`, [roomId])
      .then(r => r.rows.flatMap(row => [row.image_path, row.shell_path]).filter(Boolean)),
  setRoomStatus: (status, id) =>
    pool.query(`UPDATE rooms SET status = $1, error = NULL, notice = NULL, updated_at = now() WHERE id = $2`, [status, id]),
  setRoomError: (error, id) =>
    pool.query(`UPDATE rooms SET status = 'error', error = $1, notice = NULL, updated_at = now() WHERE id = $2`, [error, id]),
  setRoomNotice: (notice, id) =>
    pool.query(`UPDATE rooms SET status = 'done', error = NULL, notice = $1, updated_at = now() WHERE id = $2`, [notice, id]),
  deleteRoom: id => withTransaction(async client => {
    await client.query(`DELETE FROM render_items WHERE render_id IN (SELECT id FROM renders WHERE room_id = $1)`, [id]);
    await client.query(`DELETE FROM renders WHERE room_id = $1`, [id]);
    await client.query(`DELETE FROM rooms WHERE id = $1`, [id]);
  }),

  // renders
  createRender: (id, roomId, parentRenderId, requestText, prompt) =>
    pool.query(`INSERT INTO renders (id, room_id, parent_render_id, request_text, prompt) VALUES ($1,$2,$3,$4,$5)`,
      [id, roomId, parentRenderId, requestText, prompt]),
  getRender: id => pool.query(`SELECT * FROM renders WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  setRenderShellPath: (id, shellPath) =>
    pool.query(`UPDATE renders SET shell_path = $2 WHERE id = $1`, [id, shellPath]),
  setRenderDone: (imagePath, costUsd, model, id) =>
    pool.query(`UPDATE renders SET status='done', image_path = $1, cost_usd = $2, model = $3,
                finished_at = now(),
                duration_ms = FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000)::int
                WHERE id = $4`, [imagePath, costUsd, model, id]),
  setRenderError: (error, id, stage = null, costUsd = null) =>
    pool.query(`UPDATE renders SET status='error', error = $1, error_stage = COALESCE($3, error_stage),
                cost_usd = COALESCE($4, cost_usd),
                finished_at = now(),
                duration_ms = FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000)::int
                WHERE id = $2`, [error, id, stage, costUsd]),
  setRenderRejected: (error, imagePath, costUsd, model, id) =>
    pool.query(`UPDATE renders SET status='rejected', error = $1, error_stage = 'product_qa', image_path = $2,
                cost_usd = $3, model = $4, finished_at = now(),
                duration_ms = FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000)::int
                WHERE id = $5`, [error, imagePath, costUsd, model, id]),
  failStaleRender: (id, error, stage = 'timeout') =>
    pool.query(`UPDATE renders SET status='error', error = $2, error_stage = $3,
                finished_at = now(),
                duration_ms = FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000)::int
                WHERE id = $1 AND status IN ('queued','processing')
                RETURNING id`, [id, error, stage]).then(r => r.rows[0] || null),
  staleRenders: minutes =>
    pool.query(`SELECT id, room_id FROM renders
                WHERE status IN ('queued','processing')
                  AND created_at < now() - ($1 || ' minutes')::interval`, [String(minutes)]).then(r => r.rows),
  setRenderPrompt: (id, prompt) =>
    pool.query(`UPDATE renders SET prompt = $2 WHERE id = $1`, [id, prompt]),
  setRenderRequestIp: (id, ip) =>
    pool.query(`UPDATE renders SET request_ip = $2 WHERE id = $1`, [id, ip || null]),
  setRenderMeta: (id, meta) =>
    pool.query(`UPDATE renders SET meta = $2 WHERE id = $1`, [id, JSON.stringify(meta || {})]),
  setRenderAnalysis: (id, analysis) =>
    pool.query(`UPDATE renders SET analysis = $2 WHERE id = $1`, [id, JSON.stringify(analysis || {})]),
  getProduct: id => pool.query(`SELECT * FROM products WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  logProductClick: ({ productId, userId = null, renderId = null, ipHash = null }) =>
    pool.query(`INSERT INTO product_clicks (product_id, user_id, render_id, ip_hash) VALUES ($1,$2,$3,$4)`,
      [productId, userId || null, renderId || null, ipHash || null]),
  copyItems: (fromRenderId, toRenderId) =>
    pool.query(`INSERT INTO render_items (render_id, product_id, match_score, presentation_status)
                SELECT $2, product_id, match_score, presentation_status FROM render_items WHERE render_id = $1`, [fromRenderId, toRenderId]),
  // заменяем позицию той же категории: vision уточнил материал, но остальные позиции сохраняем
  replaceItemByCategories: async (renderId, categories, productId, score, presentationStatus = 'matched') => {
    await pool.query(`DELETE FROM render_items WHERE render_id = $1
                      AND product_id IN (SELECT id FROM products WHERE category = ANY($2))`, [renderId, categories]);
    return pool.query(`INSERT INTO render_items (render_id, product_id, match_score, presentation_status) VALUES ($1,$2,$3,$4)`, [renderId, productId, score, presentationStatus]);
  },
  replaceItemByCategory: async (renderId, category, productId, score, presentationStatus = 'matched') => {
    await pool.query(`DELETE FROM render_items WHERE render_id = $1
                      AND product_id IN (SELECT id FROM products WHERE category = $2)`, [renderId, category]);
    return pool.query(`INSERT INTO render_items (render_id, product_id, match_score, presentation_status) VALUES ($1,$2,$3,$4)`, [renderId, productId, score, presentationStatus]);
  },
  setRenderShareToken: (id, token) =>
    pool.query(`UPDATE renders SET share_token = $2 WHERE id = $1 RETURNING share_token`, [id, token]).then(r => r.rows[0]?.share_token || null),
  renderByShareToken: token =>
    pool.query(`SELECT r.*, rm.style, rm.room_type, rm.user_id FROM renders r
                JOIN rooms rm ON rm.id = r.room_id WHERE r.share_token = $1 AND r.status = 'done'`, [token]).then(r => r.rows[0] || null),
  countLikes: renderId => pool.query(`SELECT COUNT(*)::int AS n FROM render_likes WHERE render_id = $1`, [renderId]).then(r => r.rows[0]?.n || 0),
  hasLike: (renderId, visitor) => pool.query(`SELECT 1 FROM render_likes WHERE render_id = $1 AND visitor = $2`, [renderId, visitor]).then(r => r.rowCount > 0),
  addLike: (renderId, visitor) => pool.query(`INSERT INTO render_likes (render_id, visitor) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [renderId, visitor]),
  removeLike: (renderId, visitor) => pool.query(`DELETE FROM render_likes WHERE render_id = $1 AND visitor = $2`, [renderId, visitor]),
  listComments: renderId => pool.query(`SELECT id, name, text, created_at FROM render_comments WHERE render_id = $1 ORDER BY created_at DESC LIMIT 100`, [renderId]).then(r => r.rows),
  addComment: (renderId, name, text, visitor) => pool.query(`INSERT INTO render_comments (render_id, name, text, visitor) VALUES ($1,$2,$3,$4) RETURNING id, name, text, created_at`, [renderId, name || null, text, visitor || null]).then(r => r.rows[0]),
  latestRender: roomId =>
    pool.query(`SELECT * FROM renders WHERE room_id = $1 AND status = 'done' ORDER BY created_at DESC LIMIT 1`, [roomId])
      .then(r => r.rows[0] || null),
  // атомарный claim следующей queued-задачи
  claimNextRender: () =>
    pool.query(`UPDATE renders SET status = 'processing', started_at = now()
                WHERE id = (SELECT id FROM renders WHERE status = 'queued' ORDER BY created_at LIMIT 1)
                RETURNING id`).then(r => r.rows[0] || null),
  requeueProcessing: () =>
    pool.query(`UPDATE renders SET status = 'queued' WHERE status = 'processing'`).then(r => r.rowCount),
  saveItem: (renderId, productId, score, presentationStatus = score == null ? 'curated' : 'matched') =>
    pool.query(`INSERT INTO render_items (render_id, product_id, match_score, presentation_status) VALUES ($1,$2,$3,$4)`, [renderId, productId, score, presentationStatus]),
  clearItems: renderId => pool.query(`DELETE FROM render_items WHERE render_id = $1`, [renderId]),
  itemsForRender: renderId =>
    pool.query(`SELECT p.*, ri.match_score, ri.presentation_status FROM render_items ri
                JOIN products p ON p.id = ri.product_id
                WHERE ri.render_id = $1 ORDER BY p.price * p.qty DESC`, [renderId]).then(r => r.rows),
  totalForRender: renderId =>
    pool.query(`SELECT COALESCE(SUM(p.price * p.qty), 0)::int AS total FROM render_items ri
                JOIN products p ON p.id = ri.product_id WHERE ri.render_id = $1`, [renderId])
      .then(r => r.rows[0].total),
  pricesAsOfForRender: renderId =>
    pool.query(`SELECT MAX(p.price_updated_at) AS as_of FROM render_items ri
                JOIN products p ON p.id = ri.product_id WHERE ri.render_id = $1`, [renderId])
      .then(r => r.rows[0]?.as_of || null),
  allProducts: () => pool.query(`SELECT * FROM products WHERE active IS NOT FALSE`).then(r => r.rows),
  adminProducts: () => pool.query(`SELECT p.*, (SELECT COUNT(*) FROM product_clicks pc WHERE pc.product_id = p.id)::int AS clicks FROM products p ORDER BY p.active DESC, p.id`).then(r => r.rows),

  // users / auth
  findUserByEmail: email =>
    pool.query(`SELECT * FROM users WHERE email = $1`, [email]).then(r => r.rows[0] || null),
  createUser: email => pool.query(`INSERT INTO users (email) VALUES ($1) RETURNING *`, [email]).then(r => r.rows[0]),
  addIdentity: (userId, provider, sub, email) =>
    pool.query(`INSERT INTO auth_identities (user_id, provider, provider_sub, email) VALUES ($1,$2,$3,$4)
                ON CONFLICT (provider, provider_sub) DO NOTHING`, [userId, provider, sub, email]),
  createOtp: (email, codeHash, ttlMin) =>
    pool.query(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' minutes')::interval)`,
      [email, codeHash, String(ttlMin)]),
  latestOtp: email =>
    pool.query(`SELECT * FROM otp_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1`, [email]).then(r => r.rows[0] || null),
  otpMarkAttempt: id => pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [id]),
  otpMarkUsed: id => pool.query(`UPDATE otp_codes SET used_at = now() WHERE id = $1`, [id]),
  consumeOtp: (email, codeHash) =>
    pool.query(`UPDATE otp_codes
                SET attempts = attempts + 1,
                    used_at = CASE
                      WHEN code_hash = $2 AND expires_at > now() AND used_at IS NULL AND attempts < 5
                      THEN now() ELSE used_at END
                WHERE id = (SELECT id FROM otp_codes WHERE email = $1 AND used_at IS NULL
                            ORDER BY created_at DESC LIMIT 1)
                RETURNING (code_hash = $2 AND expires_at > now() AND attempts <= 5 AND used_at IS NOT NULL) AS matched`,
      [email, codeHash]).then(r => r.rows[0]?.matched === true),
  otpCountRecent: (email, minutes) =>
    pool.query(`SELECT COUNT(*)::int AS n FROM otp_codes WHERE email = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
      [email, String(minutes)]).then(r => r.rows[0].n),
  createSession: (userId, tokenHash, days) =>
    pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
      [userId, tokenHash, String(days)]),
  findSession: tokenHash =>
    pool.query(`SELECT s.*, u.email FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = $1 AND s.expires_at > now()`, [tokenHash]).then(r => r.rows[0] || null),
  deleteSession: tokenHash => pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]),

  // кредиты
  creditBalance: userId =>
    pool.query(`SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_txn WHERE user_id = $1`, [userId])
      .then(r => r.rows[0].balance),
  addCreditTxn: (userId, delta, reason, paymentId = null, renderId = null, note = null) =>
    pool.query(`INSERT INTO credit_txn (user_id, delta, reason, payment_id, render_id, note)
                VALUES ($1,$2,$3,$4,$5,$6)`, [userId, delta, reason, paymentId, renderId, note]),
  creditHistory: userId =>
    pool.query(`SELECT ct.id, ct.delta, ct.reason, ct.payment_id, ct.render_id, ct.note, ct.created_at,
                       r.room_id
                FROM credit_txn ct LEFT JOIN renders r ON r.id = ct.render_id
                WHERE ct.user_id = $1 ORDER BY ct.created_at DESC, ct.id DESC LIMIT 100`, [userId])
      .then(r => r.rows),

  // комнаты юзера (история в UI)
  myRooms: userId =>
    pool.query(`SELECT id, style, budget, price_tier, status, created_at FROM rooms WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId])
      .then(r => r.rows),
  userGenerations: userId =>
    pool.query(`SELECT r.id, r.room_id, r.status, r.error, r.created_at, r.finished_at, r.request_text,
                       r.image_path, r.prompt, r.model, r.cost_usd, r.duration_ms,
                       rm.style, rm.budget, rm.price_tier, rm.photo_path, rm.room_type,
                       GREATEST(0,
                         COALESCE((SELECT SUM(-ct.delta) FROM credit_txn ct WHERE ct.render_id = r.id AND ct.delta < 0), 0)
                         - COALESCE((SELECT SUM(ct.delta) FROM credit_txn ct WHERE ct.render_id = r.id AND ct.reason = 'iterate_refund'), 0)
                       )::int AS credits_spent
                FROM renders r JOIN rooms rm ON rm.id = r.room_id
                WHERE rm.user_id = $1 AND r.status <> 'rejected' ORDER BY r.created_at DESC LIMIT 100`, [userId])
      .then(r => r.rows),

  // админка: аккаунты
  adminRenders: (limit = 100) =>
    pool.query(`SELECT r.id, r.room_id, r.status, r.error, r.created_at, r.finished_at,
                       r.request_text, r.prompt, r.model, r.cost_usd, r.duration_ms, r.image_path, r.analysis, r.meta,
                       rm.style, rm.room_type, rm.budget, rm.price_tier, rm.photo_path, u.email,
                       GREATEST(0,
                         COALESCE((SELECT SUM(-ct.delta) FROM credit_txn ct WHERE ct.render_id = r.id AND ct.delta < 0), 0)
                         - COALESCE((SELECT SUM(ct.delta) FROM credit_txn ct WHERE ct.render_id = r.id AND ct.reason = 'iterate_refund'), 0)
                       )::int AS credits_spent
                FROM renders r JOIN rooms rm ON rm.id = r.room_id JOIN users u ON u.id = rm.user_id
                ORDER BY r.created_at DESC LIMIT $1`, [Math.min(Math.max(Number(limit) || 100, 1), 500)])
      .then(r => r.rows),

  adminUsers: search =>
    pool.query(`SELECT u.id, u.email, u.created_at,
                       COALESCE((SELECT SUM(delta) FROM credit_txn WHERE user_id = u.id), 0)::int AS balance,
                       (SELECT COUNT(*) FROM rooms WHERE user_id = u.id)::int AS rooms_count,
                       (SELECT COUNT(*) FROM renders r JOIN rooms rm ON rm.id = r.room_id WHERE rm.user_id = u.id)::int AS renders_count,
                       (SELECT MAX(r.created_at) FROM renders r JOIN rooms rm ON rm.id = r.room_id WHERE rm.user_id = u.id) AS last_generation_at
                FROM users u
                WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%')
                ORDER BY u.created_at DESC LIMIT 100`, [search || ''])
      .then(r => r.rows),
  adminUserById: id =>
    pool.query(`SELECT u.id, u.email, u.created_at,
                       COALESCE((SELECT SUM(delta) FROM credit_txn WHERE user_id = u.id), 0)::int AS balance,
                       (SELECT COUNT(*) FROM rooms WHERE user_id = u.id)::int AS rooms_count,
                       (SELECT COUNT(*) FROM renders r JOIN rooms rm ON rm.id = r.room_id WHERE rm.user_id = u.id)::int AS renders_count,
                       (SELECT MAX(r.created_at) FROM renders r JOIN rooms rm ON rm.id = r.room_id WHERE rm.user_id = u.id) AS last_generation_at
                FROM users u WHERE u.id = $1`, [id])
      .then(r => r.rows[0] || null),

  // платежи
  createPaymentRow: (userId, provider, providerPaymentId, amountKopecks, payload) =>
    pool.query(`INSERT INTO payments (user_id, provider, provider_payment_id, amount_kopecks, payload) VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (provider_payment_id) DO NOTHING RETURNING *`,
      [userId, provider, providerPaymentId, amountKopecks, JSON.stringify(payload)])
      .then(r => r.rows[0] || null),
  paymentById: id => pool.query(`SELECT * FROM payments WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  paymentByProviderId: providerPaymentId =>
    pool.query(`SELECT * FROM payments WHERE provider_payment_id = $1`, [providerPaymentId]).then(r => r.rows[0] || null),
  latestPendingPayment: userId =>
    pool.query(`SELECT * FROM payments WHERE user_id = $1 AND status IN ('created','pending')
                ORDER BY created_at DESC LIMIT 1`, [userId]).then(r => r.rows[0] || null),
  paymentsByUser: userId =>
    pool.query(`SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId]).then(r => r.rows),

  // юридические документы и акцепты
  legalDocs: () => pool.query(`SELECT * FROM legal_docs ORDER BY published_at DESC`).then(r => r.rows),
  acceptLegal: (userId, document, version, context, ip, userAgent, paymentId = null) =>
    pool.query(`INSERT INTO legal_acceptances (user_id, document, version, context, ip, user_agent, payment_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, document, version, context, ip || null, userAgent || null, paymentId]),

  // возвраты
  refundsByPayment: paymentId =>
    pool.query(`SELECT * FROM refunds WHERE payment_id = $1 ORDER BY created_at DESC`, [paymentId]).then(r => r.rows),
  createRefundRow: (paymentId, providerRefundId, amountKopecks, credits, method, status, reason, payload) =>
    pool.query(`INSERT INTO refunds (payment_id, provider_refund_id, amount_kopecks, credits, method, status, reason, payload)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [paymentId, providerRefundId, amountKopecks, credits, method, status, reason, JSON.stringify(payload || {})])
      .then(r => r.rows[0]),
  markPaymentRefunded: (paymentId, amountKopecks) =>
    pool.query(`UPDATE payments SET refunded_kopecks = refunded_kopecks + $2 WHERE id = $1 RETURNING *`,
      [paymentId, amountKopecks]).then(r => r.rows[0]),

  // чеки
  createReceiptRow: (paymentId, provider, payload) =>
    pool.query(`INSERT INTO receipts (payment_id, provider, payload) VALUES ($1,$2,$3) RETURNING *`,
      [paymentId, provider, JSON.stringify(payload || {})]).then(r => r.rows[0]),
  markReceipt: (id, status, providerReceiptId = null, error = null) =>
    pool.query(`UPDATE receipts SET status=$2, provider_receipt_id=$3, error=$4,
                sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
                WHERE id=$1 RETURNING *`, [id, status, providerReceiptId, error]).then(r => r.rows[0]),

  // каталог (админ)
  insertProduct: f =>
    pool.query(`INSERT INTO products (category, name, brand, attrs, price, unit, qty, source, keywords, style_tags, url, image_url, image_path, price_date, price_tier, room_types, surface, active, dimensions)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14, CURRENT_DATE), $15,$16,$17,$18,$19) RETURNING *`,
      [f.category, f.name, f.brand || null, JSON.stringify(f.attrs || {}), f.price, f.unit || 'шт', f.qty || 1,
       f.source || null, f.keywords || null, f.style_tags || null, f.url || null, f.image_url || null, f.image_path || null, f.price_date || null,
       f.price_tier || 'comfort', f.room_types || null, f.surface || null, f.active !== false,
       JSON.stringify(f.dimensions || {})])
      .then(r => r.rows[0]),
  updateProduct: (id, fields) => {
    const keys = Object.keys(fields).filter(k => ['category','name','brand','attrs','price','unit','qty','source','keywords','style_tags','url','image_url','image_path','price_date','price_tier','room_types','surface','active','dimensions'].includes(k));
    if (!keys.length) return Promise.resolve(null);
    const set = keys.map((k, i) => `${k} = $${i + 2}`);
    if (keys.includes('price')) set.push('price_updated_at = now()');
    const vals = keys.map(k => k === 'attrs' ? JSON.stringify(fields[k]) : fields[k]);
    return pool.query(`UPDATE products SET ${set.join(', ')} WHERE id = $1 RETURNING *`, [id, ...vals]).then(r => r.rows[0] || null);
  },
  deleteProduct: id => pool.query(`DELETE FROM products WHERE id = $1`, [id]).then(r => r.rowCount > 0),
  upsertSeedProduct: f =>
    pool.query(`INSERT INTO products (seed_key, category, name, brand, attrs, price, unit, qty, source, keywords, style_tags, url, image_url, price_tier, room_types, surface, active, price_date, dimensions)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,CURRENT_DATE,$17)
                ON CONFLICT (seed_key) DO NOTHING RETURNING id`,
      [f.seed_key, f.category, f.name, f.brand || null, JSON.stringify(f.attrs || {}), f.price, f.unit || 'шт', f.qty || 1,
       'remontvision catalog', f.keywords || null, f.style_tags || null, f.url || null, f.image_url || null,
       f.price_tier || 'comfort', f.room_types || null, f.surface || null, JSON.stringify(f.dimensions || {})])
      .then(r => r.rows[0] || null),

  // настройки приложения
  settingsByKeys: keys =>
    pool.query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [keys]).then(r => r.rows),
  deleteSetting: key => pool.query(`DELETE FROM app_settings WHERE key = $1`, [key]),
  setSetting: (key, value) =>
    pool.query(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1,$2,now())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() RETURNING *`,
      [key, value]).then(r => r.rows[0]),

  // пакеты кредитов
  creditPacks: activeOnly =>
    pool.query(`SELECT * FROM credit_packs ${activeOnly ? 'WHERE active = true' : ''} ORDER BY sort, id`)
      .then(r => r.rows),
  packById: id =>
    pool.query(`SELECT * FROM credit_packs WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  createPack: f =>
    pool.query(`INSERT INTO credit_packs (id, title, credits, price_kopecks, active, sort)
                VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [f.id, f.title, f.credits, f.price_kopecks, f.active !== false, f.sort || 0])
      .then(r => r.rows[0]),
  updatePack: (id, fields) => {
    const keys = Object.keys(fields).filter(k => ['title','credits','price_kopecks','active','sort'].includes(k));
    if (!keys.length) return Promise.resolve(null);
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    return pool.query(`UPDATE credit_packs SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => fields[k])]).then(r => r.rows[0] || null);
  },
  deletePack: id => pool.query(`DELETE FROM credit_packs WHERE id = $1`, [id]).then(r => r.rowCount > 0),

  // подбор товаров по рендеру
  renderOwnedByUser: (renderId, userId) =>
    pool.query(`SELECT r.* FROM renders r JOIN rooms rm ON rm.id = r.room_id
                WHERE r.id = $1 AND rm.user_id = $2`, [renderId, userId]).then(r => r.rows[0] || null),
  activeProcurementRun: (renderId, configHash) =>
    pool.query(`SELECT * FROM procurement_runs
                WHERE render_id = $1 AND config_hash = $2 AND status IN ('queued','processing','done')
                ORDER BY created_at DESC LIMIT 1`, [renderId, configHash]).then(r => r.rows[0] || null),
  latestDoneRender: () =>
    pool.query(`SELECT * FROM renders WHERE status = 'done' AND image_path IS NOT NULL ORDER BY created_at DESC LIMIT 1`).then(r => r.rows[0] || null),
  procurementRunById: id =>
    pool.query(`SELECT * FROM procurement_runs WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  procurementRunForUser: (id, userId) =>
    pool.query(`SELECT * FROM procurement_runs WHERE id = $1 AND user_id = $2`, [id, userId]).then(r => r.rows[0] || null),
  createProcurementRun: f =>
    pool.query(`INSERT INTO procurement_runs (id, render_id, user_id, room_type, mode, region, config, config_hash, status, credit_charged)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [f.id, f.render_id, f.user_id, f.room_type || null, f.mode || 'list', f.region || null,
       JSON.stringify(f.config || {}), f.config_hash, f.status || 'queued', Boolean(f.credit_charged)])
      .then(r => r.rows[0]),
  setProcurementStage: (id, stage) =>
    pool.query(`UPDATE procurement_runs SET stage = $2 WHERE id = $1`, [id, stage]),
  setProcurementAnalysis: (id, analysis) =>
    pool.query(`UPDATE procurement_runs SET analysis = $2 WHERE id = $1`, [id, JSON.stringify(analysis || {})]),
  startProcurementRun: id =>
    pool.query(`UPDATE procurement_runs SET status = 'processing', stage = 'vision', started_at = now()
                WHERE id = $1 AND status = 'queued' RETURNING *`, [id]).then(r => r.rows[0] || null),
  finishProcurementRun: (id, { costUsd = 0 } = {}) =>
    pool.query(`UPDATE procurement_runs SET status = 'done', stage = 'done', cost_usd = $2, finished_at = now()
                WHERE id = $1 RETURNING *`, [id, costUsd]).then(r => r.rows[0] || null),
  failProcurementRun: (id, error, { costUsd = 0 } = {}) =>
    pool.query(`UPDATE procurement_runs SET status = 'error', stage = 'error', error = $2, cost_usd = $3, finished_at = now()
                WHERE id = $1 RETURNING *`, [id, String(error).slice(0, 1000), costUsd]).then(r => r.rows[0] || null),
  claimNextProcurement: () =>
    withTransaction(async client => {
      const { rows } = await client.query(
        `SELECT id FROM procurement_runs WHERE status = 'queued'
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const row = rows[0];
      if (!row) return null;
      const updated = await client.query(
        `UPDATE procurement_runs SET status = 'processing', stage = 'vision', started_at = now()
         WHERE id = $1 RETURNING *`, [row.id]);
      return updated.rows[0] || null;
    }),
  requeueProcessingProcurements: () =>
    pool.query(`UPDATE procurement_runs SET status = 'queued', stage = 'requeued', started_at = NULL
                WHERE status = 'processing' RETURNING id`).then(r => r.rowCount),
  staleProcurements: minutes =>
    pool.query(`SELECT * FROM procurement_runs WHERE status IN ('queued','processing')
                AND created_at < now() - ($1 || ' minutes')::interval`, [String(minutes)]).then(r => r.rows),
  createProcurementItem: f =>
    pool.query(`INSERT INTO procurement_items (run_id, layer, category, label, query, search_mode, status, sort, attributes, bbox, crop_path, visibility, confidence, quantity, unit, measurement_status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [f.run_id, f.layer, f.category, f.label, f.query || null, f.search_mode || 'text',
       f.status || 'pending', f.sort || 0, JSON.stringify(f.attributes || {}),
       f.bbox ? JSON.stringify(f.bbox) : null, f.crop_path || null, f.visibility || null,
       f.confidence ?? null, f.quantity ?? null, f.unit || null, f.measurement_status || null])
      .then(r => r.rows[0]),
  deleteProcurementItemsForRun: runId =>
    pool.query(`DELETE FROM procurement_items WHERE run_id = $1`, [runId]),
  procurementItemsForRun: runId =>
    pool.query(`SELECT * FROM procurement_items WHERE run_id = $1 ORDER BY sort, id`, [runId]).then(r => r.rows),
  setProcurementItemStatus: (id, status, { error = null, candidateCount = null } = {}) =>
    pool.query(`UPDATE procurement_items SET status = $2, error = $3,
                candidate_count = COALESCE($4, candidate_count) WHERE id = $1`, [id, status, error, candidateCount]),
  setProcurementItemCrop: (id, cropPath) =>
    pool.query(`UPDATE procurement_items SET crop_path = $2 WHERE id = $1`, [id, cropPath]),
  createProcurementRound: f =>
    pool.query(`INSERT INTO procurement_search_rounds (item_id, round_no, kind, provider, query, results_count, latency_ms, cost_usd)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [f.item_id, f.round_no || 1, f.kind || 'text', f.provider || 'yandex', f.query,
       f.results_count || 0, f.latency_ms ?? null, f.cost_usd ?? null]).then(r => r.rows[0]),
  finishProcurementRound: (id, f) =>
    pool.query(`UPDATE procurement_search_rounds SET rejection_reasons = $2, results_count = $3,
                best_score = $4, decision = $5, cost_usd = $6, latency_ms = $7 WHERE id = $1`,
      [id, JSON.stringify(f.rejection_reasons || []), f.results_count || 0,
       f.best_score ?? null, f.decision || null, f.cost_usd ?? null, f.latency_ms ?? null]),
  upsertProcurementCandidate: f =>
    pool.query(`INSERT INTO procurement_candidates (item_id, round_id, store, canonical_url, title, image_url, image_path, price, currency, availability, sku, dimensions, checked_at, match_score, score_breakdown, match_reasons, raw)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                ON CONFLICT (item_id, canonical_url) DO UPDATE SET
                  title = EXCLUDED.title, image_url = EXCLUDED.image_url, image_path = EXCLUDED.image_path,
                  price = EXCLUDED.price, currency = EXCLUDED.currency, availability = EXCLUDED.availability,
                  sku = EXCLUDED.sku, dimensions = EXCLUDED.dimensions, checked_at = EXCLUDED.checked_at,
                  match_score = EXCLUDED.match_score, score_breakdown = EXCLUDED.score_breakdown,
                  match_reasons = EXCLUDED.match_reasons, raw = EXCLUDED.raw
                RETURNING *`,
      [f.item_id, f.round_id || null, f.store || null, f.canonical_url, f.title || '',
       f.image_url || null, f.image_path || null, f.price ?? null, f.currency || 'RUB',
       f.availability || null, f.sku || null, JSON.stringify(f.dimensions || {}),
       f.checked_at || new Date(), f.match_score ?? null, JSON.stringify(f.score_breakdown || {}),
       JSON.stringify(f.match_reasons || []), JSON.stringify(f.raw || {})]).then(r => r.rows[0]),
  procurementCandidatesForItem: itemId =>
    pool.query(`SELECT * FROM procurement_candidates WHERE item_id = $1 ORDER BY match_score DESC NULLS LAST, id`, [itemId]).then(r => r.rows),
  procurementCandidatesForRun: runId =>
    pool.query(`SELECT c.* FROM procurement_candidates c JOIN procurement_items i ON i.id = c.item_id
                WHERE i.run_id = $1 ORDER BY i.sort, c.match_score DESC NULLS LAST, c.id`, [runId]).then(r => r.rows),
  procurementCandidateById: id =>
    pool.query(`SELECT * FROM procurement_candidates WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  procurementCandidateWithRun: id =>
    pool.query(`SELECT c.*, i.run_id FROM procurement_candidates c
                JOIN procurement_items i ON i.id = c.item_id WHERE c.id = $1`, [id]).then(r => r.rows[0] || null),
  logProcurementClick: ({ runId, itemId = null, candidateId = null, userId = null, ipHash = null }) =>
    pool.query(`INSERT INTO procurement_clicks (run_id, item_id, candidate_id, user_id, ip_hash)
                VALUES ($1,$2,$3,$4,$5)`, [runId, itemId, candidateId, userId, ipHash]),

  // стили и их референсы/товары
  styles: activeOnly =>
    pool.query(`SELECT * FROM styles ${activeOnly ? 'WHERE active = true' : ''} ORDER BY sort, id`)
      .then(r => r.rows),
  adminStyles: () =>
    pool.query(`SELECT s.*,
                       (SELECT COUNT(*) FROM style_references r WHERE r.style_id = s.id)::int AS references_count,
                       (SELECT COUNT(*) FROM style_products sp WHERE sp.style_id = s.id)::int AS products_count
                FROM styles s ORDER BY s.sort, s.id`).then(r => r.rows),
  styleById: id =>
    pool.query(`SELECT * FROM styles WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  styleByName: name =>
    pool.query(`SELECT * FROM styles WHERE name = $1`, [name]).then(r => r.rows[0] || null),
  createStyle: f =>
    pool.query(`INSERT INTO styles (key, name, accent, prompt_description, description, preset_image_path, active, sort)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [f.key, f.name, f.accent || 'sand', f.prompt_description || '', f.description || '',
       f.preset_image_path || null, f.active !== false, f.sort || 0])
      .then(r => r.rows[0]),
  updateStyle: (id, fields) => {
    const keys = Object.keys(fields).filter(k => ['key','name','accent','prompt_description','description','preset_image_path','active','sort'].includes(k));
    if (!keys.length) return Promise.resolve(null);
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    return pool.query(`UPDATE styles SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => fields[k])]).then(r => r.rows[0] || null);
  },
  deleteStyle: id => pool.query(`DELETE FROM styles WHERE id = $1`, [id]).then(r => r.rowCount > 0),
  styleReferences: (styleId, roomType = null) =>
    pool.query(`SELECT * FROM style_references WHERE style_id = $1 AND approved IS NOT FALSE
                ${roomType ? 'AND (room_type IS NULL OR room_type = $2)' : ''}
                ORDER BY ${roomType ? 'CASE WHEN room_type = $2 THEN 0 ELSE 1 END,' : ''} sort, id`,
      roomType ? [styleId, roomType] : [styleId]).then(r => r.rows),
  adminStyleReferences: (styleId, roomType = null) =>
    pool.query(`SELECT * FROM style_references WHERE style_id = $1
                ${roomType ? 'AND (room_type IS NULL OR room_type = $2)' : ''}
                ORDER BY ${roomType ? 'CASE WHEN room_type = $2 THEN 0 ELSE 1 END,' : ''} sort, id`,
      roomType ? [styleId, roomType] : [styleId]).then(r => r.rows),
  styleReferenceById: id => pool.query(`SELECT * FROM style_references WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  styleReferenceBySeedKey: key => pool.query(`SELECT id FROM style_references WHERE seed_key = $1`, [key]).then(r => r.rows[0] || null),
  setStyleReferenceApproval: (id, approved) =>
    pool.query(`UPDATE style_references SET approved = $2 WHERE id = $1 RETURNING *`, [id, Boolean(approved)]).then(r => r.rows[0] || null),
  upsertSeedStyleReference: (f) =>
    pool.query(`INSERT INTO style_references (seed_key, style_id, image_path, title, sort, room_type, kind, source, approved, score, product_ids, meta)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (seed_key) DO NOTHING RETURNING *`,
      [f.seed_key, f.style_id, f.image_path, f.title || '', f.sort || 0, f.room_type || null,
       f.kind || 'hero', f.source || 'ai', f.approved !== false,
       f.score ? JSON.stringify(f.score) : null, f.product_ids || null, JSON.stringify(f.meta || {})])
      .then(r => r.rows[0] || null),
  addStyleReference: (styleId, imagePath, title = '', sort = 0, roomType = null, kind = 'upload', source = 'upload', approved = true) =>
    pool.query(`INSERT INTO style_references (style_id, image_path, title, sort, room_type, kind, source, approved) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [styleId, imagePath, title, sort, roomType, kind, source, approved]).then(r => r.rows[0]),
  deleteStyleReference: (styleId, refId) =>
    pool.query(`DELETE FROM style_references WHERE id = $1 AND style_id = $2`, [refId, styleId]).then(r => r.rowCount > 0),
  styleProducts: (styleId, roomType = null) =>
    pool.query(`SELECT p.*, sp.sort AS style_sort, sp.room_type AS style_room_type FROM style_products sp
                JOIN products p ON p.id = sp.product_id WHERE sp.style_id = $1
                ${roomType ? 'AND (sp.room_type IS NULL OR sp.room_type = $2)' : ''}
                ORDER BY ${roomType ? 'CASE WHEN sp.room_type = $2 THEN 0 ELSE 1 END,' : ''} sp.sort, p.id`,
      roomType ? [styleId, roomType] : [styleId]).then(r => r.rows),
  addStyleProduct: (styleId, productId, sort = 0, roomType = null) =>
    pool.query(`INSERT INTO style_products (style_id, product_id, sort, room_type) VALUES ($1,$2,$3,$4)
                ON CONFLICT (style_id, product_id) DO UPDATE SET sort = EXCLUDED.sort, room_type = EXCLUDED.room_type RETURNING *`,
      [styleId, productId, sort, roomType]).then(r => r.rows[0]),
  deleteStyleProduct: (styleId, productId) =>
    pool.query(`DELETE FROM style_products WHERE style_id = $1 AND product_id = $2`, [styleId, productId]).then(r => r.rowCount > 0),
};

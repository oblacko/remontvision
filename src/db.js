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
}

// ---------- запросы ----------
export const q = {
  // rooms
  createRoom: (id, style, budget, photoPath, userId) =>
    pool.query(`INSERT INTO rooms (id, style, budget, photo_path, user_id) VALUES ($1,$2,$3,$4,$5)`, [id, style, budget, photoPath, userId]),
  getRoom: id => pool.query(`SELECT * FROM rooms WHERE id = $1`, [id]).then(r => r.rows[0] || null),
  setRoomStatus: (status, id) =>
    pool.query(`UPDATE rooms SET status = $1, error = NULL, updated_at = now() WHERE id = $2`, [status, id]),
  setRoomError: (error, id) =>
    pool.query(`UPDATE rooms SET status = 'error', error = $1, updated_at = now() WHERE id = $2`, [error, id]),
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
  setRenderDone: (imagePath, costUsd, model, id) =>
    pool.query(`UPDATE renders SET status='done', image_path = $1, cost_usd = $2, model = $3,
                finished_at = now(),
                duration_ms = FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000)::int
                WHERE id = $4`, [imagePath, costUsd, model, id]),
  setRenderError: (error, id, stage = null) =>
    pool.query(`UPDATE renders SET status='error', error = $1, error_stage = COALESCE($3, error_stage),
                finished_at = now(),
                duration_ms = FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000)::int
                WHERE id = $2`, [error, id, stage]),
  staleRenders: minutes =>
    pool.query(`SELECT id, room_id FROM renders
                WHERE status IN ('queued','processing')
                  AND created_at < now() - ($1 || ' minutes')::interval`, [String(minutes)]).then(r => r.rows),
  setRenderPrompt: (id, prompt) =>
    pool.query(`UPDATE renders SET prompt = $2 WHERE id = $1`, [id, prompt]),
  setRenderRequestIp: (id, ip) =>
    pool.query(`UPDATE renders SET request_ip = $2 WHERE id = $1`, [id, ip || null]),
  copyItems: (fromRenderId, toRenderId) =>
    pool.query(`INSERT INTO render_items (render_id, product_id, match_score)
                SELECT $2, product_id, match_score FROM render_items WHERE render_id = $1`, [fromRenderId, toRenderId]),
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
  saveItem: (renderId, productId, score) =>
    pool.query(`INSERT INTO render_items (render_id, product_id, match_score) VALUES ($1,$2,$3)`, [renderId, productId, score]),
  clearItems: renderId => pool.query(`DELETE FROM render_items WHERE render_id = $1`, [renderId]),
  itemsForRender: renderId =>
    pool.query(`SELECT p.*, ri.match_score FROM render_items ri
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
  allProducts: () => pool.query(`SELECT * FROM products`).then(r => r.rows),

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
    pool.query(`SELECT id, style, budget, status, created_at FROM rooms WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId])
      .then(r => r.rows),

  // платежи
  createPaymentRow: (userId, provider, providerPaymentId, amountKopecks, payload) =>
    pool.query(`INSERT INTO payments (user_id, provider, provider_payment_id, amount_kopecks, payload) VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (provider_payment_id) DO NOTHING RETURNING *`,
      [userId, provider, providerPaymentId, amountKopecks, JSON.stringify(payload)])
      .then(r => r.rows[0] || null),
  paymentById: id => pool.query(`SELECT * FROM payments WHERE id = $1`, [id]).then(r => r.rows[0] || null),
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
    pool.query(`INSERT INTO products (category, name, brand, attrs, price, unit, qty, source, keywords, style_tags, url, image_url, image_path, price_date)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14, CURRENT_DATE)) RETURNING *`,
      [f.category, f.name, f.brand || null, JSON.stringify(f.attrs || {}), f.price, f.unit || 'шт', f.qty || 1,
       f.source || null, f.keywords || null, f.style_tags || null, f.url || null, f.image_url || null, f.image_path || null, f.price_date || null])
      .then(r => r.rows[0]),
  updateProduct: (id, fields) => {
    const keys = Object.keys(fields).filter(k => ['category','name','brand','attrs','price','unit','qty','source','keywords','style_tags','url','image_url','image_path','price_date'].includes(k));
    if (!keys.length) return Promise.resolve(null);
    const set = keys.map((k, i) => `${k} = $${i + 2}`);
    if (keys.includes('price')) set.push('price_updated_at = now()');
    const vals = keys.map(k => k === 'attrs' ? JSON.stringify(fields[k]) : fields[k]);
    return pool.query(`UPDATE products SET ${set.join(', ')} WHERE id = $1 RETURNING *`, [id, ...vals]).then(r => r.rows[0] || null);
  },
  deleteProduct: id => pool.query(`DELETE FROM products WHERE id = $1`, [id]).then(r => r.rowCount > 0),
};

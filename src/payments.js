// Оплата через ЮKassa/Robokassa + кредиты.
// Кредиты — ledger (credit_txn): баланс = SUM(delta), списание атомарно (FOR UPDATE).
// Начисление за оплату идемпотентно: у payments UNIQUE(provider_payment_id),
// выдача кредитов только при переходе в succeeded.
import crypto from 'node:crypto';
import { Agent } from 'undici';
import { q, withTransaction } from './db.js';
import { log } from './openrouter.js';
import { issueReceipt } from './receipts.js';
import {
  isConfigured as robokassaIsConfigured,
  buildPaymentUrl,
  fetchOpState,
  amountToKopecks,
  createRefundRequest,
} from './robokassa.js';

const SHOP_ID = process.env.YUKASSA_SHOP_ID || '';
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY || '';
const API = 'https://api.yookassa.ru/v3';
// ЮKassa — российский сервис, ходим напрямую, не через прокси OpenRouter.
const DIRECT = new Agent({ connect: { timeout: 15_000 } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// пакеты кредитов (от 99 ₽)
export const PACKS = [
  { id: 'pack2',  credits: 2,  price_kopecks: 9900,  title: '2 кредита — попробовать' },
  { id: 'pack5',  credits: 5,  price_kopecks: 22900, title: '5 кредитов' },
  { id: 'pack15', credits: 15, price_kopecks: 59900, title: '15 кредитов — выгодно' },
];
export const packById = id => PACKS.find(p => p.id === id);

export const yukassaConfigured = () => Boolean(SHOP_ID && SECRET_KEY);
export const robokassaConfigured = () => robokassaIsConfigured();

export function paymentProvider() {
  const forced = String(process.env.PAYMENT_PROVIDER || '').toLowerCase();
  if (forced === 'robokassa' || forced === 'yukassa') return forced;
  if (robokassaConfigured()) return 'robokassa';
  return 'yukassa';
}

export function paymentConfigured(provider = paymentProvider()) {
  return provider === 'robokassa' ? robokassaConfigured() : yukassaConfigured();
}

async function yukassa(pathname, method, body) {
  const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
  const idempotenceKey = crypto.randomUUID();
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${API}${pathname}`, {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotenceKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        dispatcher: DIRECT,
        signal: AbortSignal.timeout(20_000),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return data;
      const msg = `yukassa ${r.status}: ${JSON.stringify(data).slice(0, 300)}`;
      if (r.status !== 429 && r.status < 500) throw new Error(msg);
      lastErr = new Error(msg);
    } catch (e) {
      lastErr = e;
      if (!/fetch failed|timeout|ECONN|ENOTFOUND|ETIMEDOUT|socket|network/i.test(String(e.message || ''))) throw e;
    }
    if (attempt < 2) {
      log({ event: 'yukassa_retry', pathname, attempt: attempt + 1, error: String(lastErr?.message || lastErr).slice(0, 200) });
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

async function createYukassaPayment({ userId, pack, returnUrl }) {
  if (!yukassaConfigured()) {
    const e = new Error('ЮKassa не настроена (YUKASSA_SHOP_ID/YUKASSA_SECRET_KEY)');
    e.status = 503;
    throw e;
  }
  const payment = await yukassa('/payments', 'POST', {
    amount: { value: (pack.price_kopecks / 100).toFixed(2), currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: `ремонтвижн: ${pack.title}`,
    metadata: { user_id: String(userId), pack_id: pack.id, credits: String(pack.credits) },
  });
  const local = await q.createPaymentRow(userId, 'yukassa', payment.id, pack.price_kopecks,
    { pack_id: pack.id, credits: pack.credits });
  log({ event: 'payment_created', user_id: userId, pack: pack.id, provider: 'yukassa', provider_payment_id: payment.id });
  return { ...payment, local_payment_id: local?.id || null };
}

function generationWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'генерация';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'генерации';
  return 'генераций';
}

function robokassaReceipt(pack) {
  return {
    items: [{
      name: `Доступ к онлайн-сервису генерации дизайна интерьера — пакет на ${pack.credits} ${generationWord(pack.credits)}`,
      quantity: 1,
      sum: Number((pack.price_kopecks / 100).toFixed(2)),
      payment_method: 'full_payment',
      payment_object: 'service',
      tax: 'none',
    }],
  };
}

async function createRobokassaPayment({ userId, pack, email }) {
  if (!robokassaConfigured()) {
    const e = new Error('Robokassa не настроена (ROBOKASSA_LOGIN/ROBOKASSA_PASSWORD_1/ROBOKASSA_PASSWORD_2)');
    e.status = 503;
    throw e;
  }
  const local = await withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO payments (user_id, provider, provider_payment_id, amount_kopecks, payload)
       VALUES ($1, 'robokassa', NULL, $2, $3) RETURNING *`,
      [userId, pack.price_kopecks, JSON.stringify({ pack_id: pack.id, credits: pack.credits })]);
    const row = inserted.rows[0];
    const invId = String(row.id);
    await client.query(`UPDATE payments SET provider_payment_id = $2 WHERE id = $1`, [row.id, invId]);
    return { ...row, provider_payment_id: invId };
  });
  const confirmationUrl = buildPaymentUrl({
    invId: local.id,
    amountKopecks: pack.price_kopecks,
    description: `ремонтвижн: ${pack.title}`,
    email,
    receipt: robokassaReceipt(pack),
  });
  log({ event: 'payment_created', user_id: userId, pack: pack.id, provider: 'robokassa', provider_payment_id: local.provider_payment_id });
  return {
    id: local.provider_payment_id,
    local_payment_id: local.id,
    status: 'pending',
    confirmation: { confirmation_url: confirmationUrl },
  };
}

export async function createPayment({ userId, pack, returnUrl, email = null }) {
  return paymentProvider() === 'robokassa'
    ? createRobokassaPayment({ userId, pack, email })
    : createYukassaPayment({ userId, pack, returnUrl });
}

async function syncYukassaPayment(providerPaymentId) {
  const remote = await yukassa(`/payments/${encodeURIComponent(providerPaymentId)}`, 'GET');
  if (remote.status !== 'succeeded') return { granted: false, status: remote.status };

  const out = await withTransaction(async client => {
    const { rows } = await client.query(`SELECT * FROM payments WHERE provider_payment_id = $1 FOR UPDATE`, [providerPaymentId]);
    const local = rows[0];
    if (!local) return { granted: false, status: 'unknown_local' };
    if (local.status === 'succeeded') return { granted: false, status: 'already', local_payment_id: local.id }; // идемпотентность

    const credits = Number(local.payload?.credits || 0);
    const userId = local.user_id;
    const remoteKopecks = Math.round(Number(remote.amount?.value || 0) * 100);
    if (remote.amount?.currency !== 'RUB' || remoteKopecks !== local.amount_kopecks) {
      log({ event: 'payment_amount_mismatch', payment_id: local.id, local_kopecks: local.amount_kopecks, remote: remote.amount });
      return { granted: false, status: 'amount_mismatch', local_payment_id: local.id };
    }
    // сохраняем локальные pack_id/credits, добавляя remote-детали; refundQuote читает payload.credits
    await client.query(`UPDATE payments SET status='succeeded', paid_at = now(),
                        payload = $2::jsonb || payload WHERE id = $1`,
      [local.id, JSON.stringify({ amount: remote.amount, metadata: remote.metadata })]);
    if (credits > 0) {
      await client.query(`INSERT INTO credit_txn (user_id, delta, reason, payment_id) VALUES ($1,$2,'purchase',$3)`,
        [userId, credits, local.id]);
    }
    log({ event: 'payment_succeeded', user_id: userId, credits, provider: 'yukassa', provider_payment_id: providerPaymentId });
    return { granted: true, credits, user_id: userId, local_payment_id: local.id };
  });

  if (out.granted) {
    try { await issueReceipt(out.local_payment_id); }
    catch (e) { log({ event: 'receipt_hook_error', payment_id: out.local_payment_id, error: String(e.message || e).slice(0, 300) }); }
  }
  return out;
}

async function syncRobokassaPayment(local, { amountKopecks = null } = {}) {
  let remoteKopecks = amountKopecks;
  let opKey = local.payload?.robokassa_op_key || null;
  let stateCode = null;

  try {
    const state = await fetchOpState(local.provider_payment_id, { dispatcher: DIRECT });
    if (state) {
      stateCode = state.stateCode;
      opKey = opKey || state.opKey;
      if (remoteKopecks === null) remoteKopecks = amountToKopecks(state.outSum);
      if (state.stateCode === 10 || state.stateCode === 60) {
        await withTransaction(async client => {
          const { rows } = await client.query(`SELECT status FROM payments WHERE id = $1 FOR UPDATE`, [local.id]);
          if (rows[0]?.status === 'succeeded') return;
          await client.query(
            `UPDATE payments SET status = 'canceled', payload = payload || $2::jsonb WHERE id = $1`,
            [local.id, JSON.stringify({ robokassa_state: state.stateCode })]);
        });
        log({ event: 'payment_canceled', provider: 'robokassa', payment_id: local.id, state: state.stateCode });
        return { granted: false, status: 'canceled', local_payment_id: local.id };
      }
    }
  } catch (e) {
    log({ event: 'robokassa_state_error', payment_id: local.id, error: String(e.message || e).slice(0, 300) });
  }

  if (remoteKopecks === null) return { granted: false, status: 'pending', local_payment_id: local.id };
  if (remoteKopecks !== local.amount_kopecks) {
    log({ event: 'payment_amount_mismatch', provider: 'robokassa', payment_id: local.id, local_kopecks: local.amount_kopecks, remote_kopecks: remoteKopecks });
    return { granted: false, status: 'amount_mismatch', local_payment_id: local.id };
  }

  const out = await withTransaction(async client => {
    const { rows } = await client.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [local.id]);
    const payment = rows[0];
    if (!payment) return { granted: false, status: 'unknown_local' };
    if (payment.status === 'succeeded') return { granted: false, status: 'already', local_payment_id: payment.id };

    const credits = Number(payment.payload?.credits || 0);
    await client.query(`UPDATE payments SET status = 'succeeded', paid_at = now(),
                        payload = payload || $2::jsonb WHERE id = $1`,
      [payment.id, JSON.stringify({
        amount: { value: (remoteKopecks / 100).toFixed(2), currency: 'RUB' },
        robokassa_op_key: opKey,
        robokassa_state: stateCode,
      })]);
    if (credits > 0) {
      await client.query(`INSERT INTO credit_txn (user_id, delta, reason, payment_id) VALUES ($1,$2,'purchase',$3)`,
        [payment.user_id, credits, payment.id]);
    }
    log({ event: 'payment_succeeded', user_id: payment.user_id, credits, provider: 'robokassa', provider_payment_id: payment.provider_payment_id });
    return { granted: true, credits, user_id: payment.user_id, local_payment_id: payment.id };
  });

  if (out.granted) {
    try { await issueReceipt(out.local_payment_id); }
    catch (e) { log({ event: 'receipt_hook_error', payment_id: out.local_payment_id, error: String(e.message || e).slice(0, 300) }); }
  }
  return out;
}

export async function syncPayment(providerPaymentId, options = {}) {
  const local = await q.paymentByProviderId(String(providerPaymentId));
  if (!local) return { granted: false, status: 'unknown_local' };
  return local.provider === 'robokassa'
    ? syncRobokassaPayment(local, options)
    : syncYukassaPayment(providerPaymentId);
}

// ---------- кредиты ----------
export async function grantCredits(userId, delta, reason, paymentId = null) {
  await q.addCreditTxn(userId, delta, reason, paymentId);
}

// ручная корректировка кредитов из админки
export async function adjustCredits(userId, delta, reason = 'admin_adjust', note = null) {
  if (!Number.isInteger(delta) || delta === 0) {
    const e = new Error('Количество кредитов должно быть целым числом, не равным 0');
    e.status = 400;
    throw e;
  }
  return withTransaction(async client => {
    const lock = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!lock.rows[0]) {
      const e = new Error('Пользователь не найден');
      e.status = 404;
      throw e;
    }
    const bal = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int AS balance FROM credit_txn WHERE user_id = $1`, [userId]);
    const next = bal.rows[0].balance + delta;
    if (next < 0) {
      const e = new Error(`Недостаточно кредитов: баланс ${bal.rows[0].balance}`);
      e.status = 400;
      throw e;
    }
    await client.query(
      `INSERT INTO credit_txn (user_id, delta, reason, note) VALUES ($1, $2, $3, $4)`,
      [userId, delta, reason || 'admin_adjust', note || null]);
    log({ event: 'admin_credit_adjust', user_id: userId, delta, balance: next, reason, note });
    return { user_id: userId, delta, balance: next };
  });
}

// атомарное списание: блокируем строку юзера — списания сериализуются, гонки исключены
export async function spendCredit(userId, reason) {
  return withTransaction(async client => {
    const lock = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!lock.rows[0]) return false;
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_txn WHERE user_id = $1`, [userId]);
    if (rows[0].balance < 1) return false;
    await client.query(`INSERT INTO credit_txn (user_id, delta, reason) VALUES ($1,-1,$2)`, [userId, reason]);
    return true;
  });
}

// списание с привязкой к рендеру: именно этот списанный кредит вернём при сбое
export async function spendCreditForRender(userId, renderId, reason = 'iterate') {
  return withTransaction(async client => {
    const lock = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!lock.rows[0]) return false;
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_txn WHERE user_id = $1`, [userId]);
    if (rows[0].balance < 1) return false;
    await client.query(
      `INSERT INTO credit_txn (user_id, delta, reason, render_id) VALUES ($1,-1,$2,$3)`,
      [userId, reason, renderId]);
    return true;
  });
}

// восстановление кредита за конкретный рендер (ровно один раз)
export async function restoreCreditForRender(renderId, note = null) {
  return withTransaction(async client => {
    const spend = await client.query(
      `SELECT * FROM credit_txn WHERE render_id = $1 AND delta < 0 AND reason IN ('iterate','render')
       ORDER BY id ASC LIMIT 1 FOR UPDATE`, [renderId]);
    if (!spend.rows[0]) return false;
    const userId = spend.rows[0].user_id;
    const ins = await client.query(
      `INSERT INTO credit_txn (user_id, delta, reason, render_id, note)
       VALUES ($1, 1, 'iterate_refund', $2, $3)
       ON CONFLICT DO NOTHING RETURNING id`, [userId, renderId, note]);
    if (!ins.rows[0]) return false;
    log({ event: 'credit_restored', user_id: userId, render_id: renderId, note });
    return true;
  });
}

// Атомарно: проверить владельца/статус комнаты, списать кредит, создать queued-рендер.
// Worker не увидит задачу, пока транзакция не закоммичена; вторая параллельная
// итерация получает 409, потому что ждёт lock на строке комнаты.
export async function enqueueRenderWithCredit({
  id,
  roomId,
  parentRenderId = null,
  requestText = null,
  chargedUserId = null,
  requestIp = null,
  editTarget = null,
  refPath = null,
  refProductId = null,
}) {
  const iteration = Boolean(parentRenderId);
  const out = await withTransaction(async client => {
    const room = await client.query(`SELECT id, user_id, status FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
    if (!room.rows[0]) {
      const e = new Error('Комната не найдена'); e.status = 404; throw e;
    }
    if (chargedUserId && room.rows[0].user_id !== chargedUserId) {
      const e = new Error('Комната не найдена'); e.status = 404; throw e;
    }
    if (iteration && room.rows[0].status !== 'done') {
      const e = new Error('Комната уже обрабатывается'); e.status = 409; throw e;
    }

    if (chargedUserId) {
      const lock = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [chargedUserId]);
      if (!lock.rows[0]) {
        const e = new Error('Пользователь не найден'); e.status = 404; throw e;
      }
      const bal = await client.query(
        `SELECT COALESCE(SUM(delta), 0)::int AS balance FROM credit_txn WHERE user_id = $1`, [chargedUserId]);
      if (bal.rows[0].balance < 1) {
        const e = new Error('Нужен кредит'); e.status = 402; throw e;
      }
    }

    await client.query(
      `INSERT INTO renders (id, room_id, parent_render_id, request_text, request_ip, edit_target, ref_path, ref_product_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')`,
      [id, roomId, parentRenderId, requestText, requestIp, editTarget, refPath, refProductId]);

    if (chargedUserId) {
      await client.query(
        `INSERT INTO credit_txn (user_id, delta, reason, render_id)
         VALUES ($1, -1, $2, $3)`,
        [chargedUserId, iteration ? 'iterate' : 'render', id]);
    }

    await client.query(
      `UPDATE rooms SET status = 'queued', error = NULL, updated_at = now() WHERE id = $1`, [roomId]);

    return { id, charged: Boolean(chargedUserId), iteration };
  });

  log({ event: 'enqueue', room_id: roomId, render_id: id, parent_render_id: parentRenderId, charged_user_id: chargedUserId || null, iteration });
  return out;
}

export async function balance(userId) {
  return q.creditBalance(userId);
}

// ---------- возвраты ----------
export async function refundQuote(paymentId) {
  const payment = await q.paymentById(paymentId);
  if (!payment) {
    const e = new Error('Платёж не найден'); e.status = 404; throw e;
  }
  if (payment.status !== 'succeeded') {
    const e = new Error('Платёж ещё не подтверждён'); e.status = 409; throw e;
  }
  const credits = Number(payment.payload?.credits || 0);
  const balance = await q.creditBalance(payment.user_id);
  const remaining = credits > 0 ? Math.max(0, Math.min(credits, balance)) : 0;
  const pricePer = credits > 0 ? payment.amount_kopecks / credits : 0;
  const gross = Math.floor(remaining * pricePer);
  const already = Number(payment.refunded_kopecks || 0);
  const refundable = Math.max(0, gross - already);
  return {
    payment_id: payment.id,
    user_id: payment.user_id,
    provider: payment.provider,
    provider_payment_id: payment.provider_payment_id,
    amount_kopecks: payment.amount_kopecks,
    credits,
    balance,
    remaining_credits: remaining,
    price_per_credit_kopecks: Math.round(pricePer),
    gross_refund_kopecks: gross,
    already_refunded_kopecks: already,
    refundable_kopecks: refundable,
    yukassa_configured: yukassaConfigured(),
    robokassa_configured: robokassaConfigured(),
  };
}

export async function createRefund({ paymentId, amountKopecks, method = null, reason = '' }) {
  const payment = await q.paymentById(paymentId);
  if (!payment) { const e = new Error('Платёж не найден'); e.status = 404; throw e; }
  if (payment.status !== 'succeeded') { const e = new Error('Платёж ещё не подтверждён'); e.status = 409; throw e; }
  const quote = await refundQuote(paymentId);
  const amount = Number(amountKopecks);
  if (!Number.isInteger(amount) || amount <= 0) { const e = new Error('Некорректная сумма возврата'); e.status = 400; throw e; }
  if (amount > quote.refundable_kopecks) {
    const e = new Error(`Сумма возврата больше доступной: ${quote.refundable_kopecks} коп.`); e.status = 400; throw e;
  }
  method = method || (payment.provider === 'robokassa' ? 'robokassa' : 'yukassa');
  if (!['yukassa', 'robokassa', 'manual'].includes(method)) { const e = new Error('Неизвестный способ возврата'); e.status = 400; throw e; }
  if (method !== 'manual' && method !== payment.provider) {
    const e = new Error('Способ возврата не совпадает с провайдером платежа'); e.status = 400; throw e;
  }

  let providerRefundId = null;
  let status = 'manual';
  let payload = {};
  if (method === 'yukassa') {
    if (!yukassaConfigured()) { const e = new Error('ЮKassa не настроена'); e.status = 503; throw e; }
    const remote = await yukassa('/refunds', 'POST', {
      payment_id: payment.provider_payment_id,
      amount: { value: (amount / 100).toFixed(2), currency: 'RUB' },
      description: (reason || 'Возврат по заявлению').slice(0, 128),
    });
    providerRefundId = remote.id || null;
    status = remote.status === 'succeeded' ? 'succeeded' : 'pending';
    payload = remote;
  } else if (method === 'robokassa') {
    if (!robokassaConfigured()) { const e = new Error('Robokassa не настроена'); e.status = 503; throw e; }
    try {
      const remote = await createRefundRequest({ payment, amountKopecks: amount, dispatcher: DIRECT });
      providerRefundId = remote.id;
      status = remote.status;
      payload = remote.payload;
    } catch (e) {
      const err = new Error(e.message || 'Robokassa: не удалось создать возврат');
      err.status = 502;
      throw err;
    }
  }

  const creditsToRemove = quote.price_per_credit_kopecks
    ? Math.round(amount / quote.price_per_credit_kopecks)
    : 0;

  const out = await withTransaction(async client => {
    const lock = await client.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
    const p = lock.rows[0];
    if (!p) { const e = new Error('Платёж не найден'); e.status = 404; throw e; }
    if (Number(p.refunded_kopecks || 0) + amount > p.amount_kopecks) {
      const e = new Error('Сумма возврата превышает платёж'); e.status = 400; throw e;
    }
    const bal = await client.query(
      `SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_txn WHERE user_id = $1`, [p.user_id]);
    const credits = Math.max(0, Math.min(creditsToRemove, bal.rows[0].balance));
    await client.query(`UPDATE payments SET refunded_kopecks = refunded_kopecks + $2 WHERE id = $1`, [paymentId, amount]);
    if (credits > 0) {
      await client.query(`INSERT INTO credit_txn (user_id, delta, reason, payment_id, note)
                          VALUES ($1,$2,'refund',$3,$4)`, [p.user_id, -credits, paymentId, reason || null]);
    }
    const refund = await client.query(
      `INSERT INTO refunds (payment_id, provider_refund_id, amount_kopecks, credits, method, status, reason, payload, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6 = 'succeeded' THEN now() ELSE NULL END)
       RETURNING *`,
      [paymentId, providerRefundId, amount, credits, method, status, reason || null, JSON.stringify(payload)]);
    return { refund: refund.rows[0], credits_removed: credits, payment: p };
  });

  try { await issueReceipt(paymentId, { refund: true, refundId: out.refund.id }); }
  catch (e) { log({ event: 'refund_receipt_error', payment_id: paymentId, error: String(e.message || e).slice(0, 300) }); }

  log({ event: 'refund_created', payment_id: paymentId, amount_kopecks: amount, method, status, credits_removed: out.credits_removed });
  return out;
}

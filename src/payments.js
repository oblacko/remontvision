// Оплата через ЮKassa + кредиты.
// Кредиты — ledger (credit_txn): баланс = SUM(delta), списание атомарно (FOR UPDATE).
// Начисление за оплату идемпотентно: у payments UNIQUE(provider_payment_id),
// выдача кредитов только при переходе в succeeded.
import crypto from 'node:crypto';
import { q, withTransaction } from './db.js';
import { log } from './openrouter.js';
import { issueReceipt } from './receipts.js';

const SHOP_ID = process.env.YUKASSA_SHOP_ID || '';
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY || '';
const API = 'https://api.yookassa.ru/v3';

// пакеты кредитов (от 99 ₽)
export const PACKS = [
  { id: 'pack2',  credits: 2,  price_kopecks: 9900,  title: '2 кредита — попробовать' },
  { id: 'pack5',  credits: 5,  price_kopecks: 22900, title: '5 кредитов' },
  { id: 'pack15', credits: 15, price_kopecks: 59900, title: '15 кредитов — выгодно' },
];
export const packById = id => PACKS.find(p => p.id === id);

export const yukassaConfigured = () => Boolean(SHOP_ID && SECRET_KEY);

async function yukassa(pathname, method, body) {
  const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
  const r = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`yukassa ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// создание платежа: юзер уходит на confirmation_url, потом webhook донесёт результат
export async function createPayment({ userId, pack, returnUrl }) {
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
  log({ event: 'payment_created', user_id: userId, pack: pack.id, provider_payment_id: payment.id });
  return { ...payment, local_payment_id: local?.id || null };
}

// подтверждение по webhook: не доверяем телу, спрашиваем у ЮKassa; начисление идемпотентно
export async function syncPayment(providerPaymentId) {
  const remote = await yukassa(`/payments/${encodeURIComponent(providerPaymentId)}`, 'GET');
  if (remote.status !== 'succeeded') return { granted: false, status: remote.status };

  const out = await withTransaction(async client => {
    const { rows } = await client.query(`SELECT * FROM payments WHERE provider_payment_id = $1 FOR UPDATE`, [providerPaymentId]);
    const local = rows[0];
    if (!local) return { granted: false, status: 'unknown_local' };
    if (local.status === 'succeeded') return { granted: false, status: 'already', local_payment_id: local.id }; // идемпотентность

    const credits = Number(remote.metadata?.credits || 0);
    const userId = Number(remote.metadata?.user_id || local.user_id);
    await client.query(`UPDATE payments SET status='succeeded', paid_at = now(), payload = $2 WHERE id = $1`,
      [local.id, JSON.stringify({ amount: remote.amount, metadata: remote.metadata })]);
    if (credits > 0) {
      await client.query(`INSERT INTO credit_txn (user_id, delta, reason, payment_id) VALUES ($1,$2,'purchase',$3)`,
        [userId, credits, local.id]);
    }
    log({ event: 'payment_succeeded', user_id: userId, credits, provider_payment_id: providerPaymentId });
    return { granted: true, credits, user_id: userId, local_payment_id: local.id };
  });

  if (out.granted) {
    try { await issueReceipt(out.local_payment_id); }
    catch (e) { log({ event: 'receipt_hook_error', payment_id: out.local_payment_id, error: String(e.message || e).slice(0, 300) }); }
  }
  return out;
}

// ---------- кредиты ----------
export async function grantCredits(userId, delta, reason, paymentId = null) {
  await q.addCreditTxn(userId, delta, reason, paymentId);
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
    provider_payment_id: payment.provider_payment_id,
    amount_kopecks: payment.amount_kopecks,
    credits,
    balance,
    remaining_credits: remaining,
    price_per_credit_kopecks: Math.round(pricePer),
    gross_refund_kopecks: gross,
    already_refunded_kopecks: already,
    refundable_kopecks: refundable,
  };
}

export async function createRefund({ paymentId, amountKopecks, method = 'yukassa', reason = '' }) {
  const payment = await q.paymentById(paymentId);
  if (!payment) { const e = new Error('Платёж не найден'); e.status = 404; throw e; }
  if (payment.status !== 'succeeded') { const e = new Error('Платёж ещё не подтверждён'); e.status = 409; throw e; }
  const quote = await refundQuote(paymentId);
  const amount = Number(amountKopecks);
  if (!Number.isInteger(amount) || amount <= 0) { const e = new Error('Некорректная сумма возврата'); e.status = 400; throw e; }
  if (amount > quote.refundable_kopecks) {
    const e = new Error(`Сумма возврата больше доступной: ${quote.refundable_kopecks} коп.`); e.status = 400; throw e;
  }
  if (!['yukassa', 'manual'].includes(method)) { const e = new Error('Неизвестный способ возврата'); e.status = 400; throw e; }

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

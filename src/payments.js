// Оплата через ЮKassa + кредиты.
// Кредиты — ledger (credit_txn): баланс = SUM(delta), списание атомарно (FOR UPDATE).
// Начисление за оплату идемпотентно: у payments UNIQUE(provider_payment_id),
// выдача кредитов только при переходе в succeeded.
import crypto from 'node:crypto';
import { pool, q, withTransaction } from './db.js';
import { log } from './openrouter.js';

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

const yukassaConfigured = () => Boolean(SHOP_ID && SECRET_KEY);

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
  await q.createPaymentRow(userId, 'yukassa', payment.id, pack.price_kopecks, { pack_id: pack.id, credits: pack.credits });
  log({ event: 'payment_created', user_id: userId, pack: pack.id, provider_payment_id: payment.id });
  return payment;
}

// подтверждение по webhook: не доверяем телу, спрашиваем у ЮKassa; начисление идемпотентно
export async function syncPayment(providerPaymentId) {
  const remote = await yukassa(`/payments/${encodeURIComponent(providerPaymentId)}`, 'GET');
  if (remote.status !== 'succeeded') return { granted: false, status: remote.status };

  return withTransaction(async client => {
    const { rows } = await client.query(`SELECT * FROM payments WHERE provider_payment_id = $1 FOR UPDATE`, [providerPaymentId]);
    const local = rows[0];
    if (!local) return { granted: false, status: 'unknown_local' };
    if (local.status === 'succeeded') return { granted: false, status: 'already' }; // идемпотентность

    const credits = Number(remote.metadata?.credits || 0);
    const userId = Number(remote.metadata?.user_id || local.user_id);
    await client.query(`UPDATE payments SET status='succeeded', paid_at = now(), payload = $2 WHERE id = $1`,
      [local.id, JSON.stringify({ amount: remote.amount, metadata: remote.metadata })]);
    if (credits > 0) {
      await client.query(`INSERT INTO credit_txn (user_id, delta, reason, payment_id) VALUES ($1,$2,'purchase',$3)`,
        [userId, credits, local.id]);
    }
    log({ event: 'payment_succeeded', user_id: userId, credits, provider_payment_id: providerPaymentId });
    return { granted: true, credits, user_id: userId };
  });
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

export async function balance(userId) {
  return q.creditBalance(userId);
}

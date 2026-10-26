// Чеки самозанятого: отправляем событие во внешний вебхук, если он настроен.
// Провайдер чека (интеграция с «Мой налог» / ЮKassa) задаётся через RECEIPTS_WEBHOOK_URL.
// Без вебхука чек сохраняется как pending — это видно в таблице receipts и в логах.
import { q } from './db.js';
import { log } from './openrouter.js';

const WEBHOOK_URL = process.env.RECEIPTS_WEBHOOK_URL || '';
const WEBHOOK_KEY = process.env.RECEIPTS_API_KEY || '';

export async function issueReceipt(paymentId, { refund = false, refundId = null } = {}) {
  const payment = await q.paymentById(paymentId);
  if (!payment) return null;

  const payload = {
    event: refund ? 'refund.receipt' : 'payment.receipt',
    payment_id: payment.id,
    provider_payment_id: payment.provider_payment_id,
    user_id: payment.user_id,
    amount_kopecks: payment.amount_kopecks,
    refund_id: refundId,
    created_at: payment.created_at,
  };

  if (!WEBHOOK_URL) {
    const row = await q.createReceiptRow(payment.id, 'pending', payload);
    log({ event: 'receipt_pending', payment_id: payment.id, receipt_id: row.id, reason: 'RECEIPTS_WEBHOOK_URL не задан' });
    return row;
  }

  const row = await q.createReceiptRow(payment.id, 'webhook', payload);
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_KEY ? { 'X-Api-Key': WEBHOOK_KEY } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`receipt webhook ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
    await q.markReceipt(row.id, 'sent', data.receipt_id || data.id || null);
    log({ event: 'receipt_sent', payment_id: payment.id, receipt_id: row.id, provider_receipt_id: data.receipt_id || data.id || null });
    return row;
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    await q.markReceipt(row.id, 'error', null, msg);
    log({ event: 'receipt_error', payment_id: payment.id, receipt_id: row.id, error: msg });
    return row;
  }
}

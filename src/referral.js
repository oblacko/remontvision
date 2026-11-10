// Реферальная программа: +2 кредита пригласившему после первой успешной оплаты
// приглашённого. При регистрации только запоминаем пару (referral_rewards),
// начисление — в момент оплаты, однократно на приглашённого (флаг rewarded).
import crypto from 'node:crypto';
import { q, withTransaction } from './db.js';
import { log } from './openrouter.js';
import { grantCredits } from './payments.js';

// Алфавит без похожих символов (нет 0/O/1/I). Длина 32 → randomBytes % 32 без смещения.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const REFERRAL_REWARD = 2;
export const REFERRAL_COOKIE = 'rv_ref';
const COOKIE_MAX_AGE = 30 * 86400; // 30 дней

export function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function normalizeCode(codeRaw) {
  return String(codeRaw || '').trim().toUpperCase();
}

// Чистое решение о начислении: без self-referral и однократно на приглашённого.
export function rewardDecision({ ownerId, inviteeId, alreadyRewarded }) {
  if (ownerId === inviteeId) return { reward: false, reason: 'self' };
  if (alreadyRewarded) return { reward: false, reason: 'already' };
  return { reward: true, reason: 'ok' };
}

// Чистое решение о награде за покупку: нужна запись пары, не self и не rewarded.
export function purchaseRewardDecision({ ownerId, inviteeId, rewarded }) {
  if (!ownerId || !inviteeId) return { reward: false, reason: 'missing' };
  if (String(ownerId) === String(inviteeId)) return { reward: false, reason: 'self' };
  if (rewarded) return { reward: false, reason: 'already' };
  return { reward: true, reason: 'ok' };
}

// Существующий код пользователя или новый (с повтором при коллизии кода).
export async function getOrCreateCode(userId) {
  const existing = await q.referralCodeByUser(userId);
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const row = await q.insertReferralCode(userId, code);
    if (row) return row.code;
    // Конфликт: либо user_id (параллельно создали), либо code (коллизия) — перечитываем.
    const again = await q.referralCodeByUser(userId);
    if (again) return again.code;
  }
  const e = new Error('Не удалось сгенерировать реферальный код');
  e.status = 503;
  throw e;
}

// Код → owner user_id (или null). Регистронезависимо, с обрезкой пробелов.
export async function resolveCode(codeRaw) {
  const code = normalizeCode(codeRaw);
  if (!code) return null;
  const row = await q.referralCodeByCode(code);
  return row?.user_id || null;
}

// Запоминаем пару «пригласивший — приглашённый» при регистрации, без начислений.
// Уникальность по invitee_id: повторная регистрация/вход ничего не дублирует.
export async function recordReferral(ownerId, inviteeId) {
  if (String(ownerId) === String(inviteeId)) return { recorded: false, reason: 'self' };
  return withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO referral_rewards (invitee_id, owner_id) VALUES ($1, $2)
       ON CONFLICT (invitee_id) DO NOTHING RETURNING invitee_id`,
      [inviteeId, ownerId]);
    return { recorded: Boolean(inserted.rows[0]) };
  });
}

// Награда пригласившему при первой успешной оплате приглашённого.
// Идемпотентно: флаг rewarded переставляется в той же транзакции, что и начисление.
// client — транзакция платёжного webhook, чтобы начисление коммитилось вместе с оплатой.
export async function rewardReferrerForPurchase(inviteeId, client = null) {
  const run = async dbClient => {
    const { rows } = await dbClient.query(
      `UPDATE referral_rewards SET rewarded = true
       WHERE invitee_id = $1 AND rewarded = false RETURNING owner_id`,
      [inviteeId]);
    const row = rows[0];
    if (!row) return { rewarded: false, reason: 'missing' };
    const decision = purchaseRewardDecision({ ownerId: row.owner_id, inviteeId, rewarded: false });
    if (!decision.reward) return { rewarded: false, reason: decision.reason };
    // grantCredits с клиентом транзакции: начисление коммитится вместе с флагом rewarded.
    await grantCredits(row.owner_id, REFERRAL_REWARD, 'referral', null, dbClient);
    log({ event: 'referral_rewarded_on_purchase', owner_id: row.owner_id, invitee_id: inviteeId });
    return { rewarded: true };
  };
  return client ? run(client) : withTransaction(run);
}

// Куки rv_ref: ставится на /r/:code, читается при регистрации, стирается после начисления.
export function referralCookieValue(req) {
  const raw = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(REFERRAL_COOKIE + '='));
  return raw ? decodeURIComponent(raw.slice(REFERRAL_COOKIE.length + 1)) : null;
}

export function setReferralCookie(res, code) {
  const secure = (process.env.APP_URL || '').startsWith('https') ? '; Secure' : '';
  res.set('Set-Cookie', `${REFERRAL_COOKIE}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`);
}

export function clearReferralCookie(res) {
  // append, а не set: после setSessionCookie сохраняем обе куки.
  res.append('Set-Cookie', `${REFERRAL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

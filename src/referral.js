// Реферальная программа: «+2 кредита обоим».
// Пользователь получает уникальный код; при регистрации нового пользователя по ссылке
// оба получают по 2 кредита (однократно на приглашённого).
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

// Однократное начисление +2 обоим. Атомарно: referral_rewards уникален по invitee_id,
// поэтому повторная попытка (второй вход того же приглашённого) ничего не начисляет.
export async function rewardPair(ownerId, inviteeId) {
  if (ownerId === inviteeId) return { rewarded: false };
  return withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO referral_rewards (invitee_id, owner_id) VALUES ($1, $2)
       ON CONFLICT (invitee_id) DO NOTHING RETURNING invitee_id`,
      [inviteeId, ownerId]);
    if (!inserted.rows[0]) return { rewarded: false };
    // grantCredits с клиентом транзакции: начисления коммитятся вместе с reward-строкой.
    await grantCredits(ownerId, REFERRAL_REWARD, 'referral', null, client);
    await grantCredits(inviteeId, REFERRAL_REWARD, 'referral', null, client);
    log({ event: 'referral_rewarded', owner_id: ownerId, invitee_id: inviteeId });
    return { rewarded: true };
  });
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

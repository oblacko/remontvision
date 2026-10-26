// E-mail авторизация по одноразовому коду (passwordless).
// Архитектура с заделкой под OAuth: юзер в users, входы — строки в auth_identities
// (provider: email|yandex|vk|mailru), склейка аккаунтов по email.
// Без SMTP_URL код пишется в json-лог (dev-режим) — удобно для локальной разработки.
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { q } from './db.js';
import { log } from './openrouter.js';
import { grantCredits } from './payments.js';

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const RESEND_SECONDS = Number(process.env.OTP_RESEND_SECONDS || 60);
const DAILY_LIMIT = Number(process.env.OTP_DAILY_LIMIT || 10);
const COOKIE = 'rv_sid';

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

let mailer = null;
if (process.env.SMTP_URL) {
  mailer = nodemailer.createTransport(process.env.SMTP_URL);
  log({ event: 'mail_transport', mode: 'smtp' });
} else {
  log({ event: 'mail_transport', mode: 'dev_log', msg: 'SMTP_URL не задан — коды авторизации пишутся в лог' });
}

async function sendCodeEmail(email, code) {
  if (!mailer) {
    log({ event: 'otp_dev_code', email, code, ttl_min: OTP_TTL_MIN });
    return;
  }
  await mailer.sendMail({
    from: process.env.MAIL_FROM || 'remontvision <no-reply@localhost>',
    to: email,
    subject: 'Код входа — ремонтвижн',
    text: `Ваш код входа: ${code}\nДействует ${OTP_TTL_MIN} минут. Если вы не запрашивали код — просто игнорируйте письмо.`,
  });
}

export async function requestCode(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    const e = new Error('Некорректный e-mail');
    e.status = 400;
    throw e;
  }
  const recent = await q.otpCountRecent(email, 24 * 60);
  if (recent >= DAILY_LIMIT) {
    const e = new Error('Слишком много запросов кода, попробуйте завтра');
    e.status = 429;
    throw e;
  }
  const last = await q.latestOtp(email);
  if (last && (Date.now() - new Date(last.created_at).getTime()) < RESEND_SECONDS * 1000) {
    const e = new Error(`Код уже отправлен, повторите через ${RESEND_SECONDS} с`);
    e.status = 429;
    throw e;
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await q.createOtp(email, sha256(code), OTP_TTL_MIN);
  try {
    await sendCodeEmail(email, code);
  } catch (e) {
    log({ event: 'mail_error', email, error: String(e.message || e).slice(0, 300) });
    const err = new Error('Не удалось отправить письмо, попробуйте позже');
    err.status = 502;
    throw err;
  }
  log({ event: 'otp_sent', email });
}

export async function verifyCode(emailRaw, codeRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  const code = String(codeRaw || '').trim();
  const fail = () => {
    const e = new Error('Неверный или просроченный код');
    e.status = 400;
    throw e;
  };
  if (!/^\d{6}$/.test(code)) fail();
  const row = await q.latestOtp(email);
  if (!row || row.used_at || new Date(row.expires_at) < new Date() || row.attempts >= 5) fail();
  if (row.code_hash !== sha256(code)) {
    await q.otpMarkAttempt(row.id);
    fail();
  }
  await q.otpMarkUsed(row.id);

  let user = await q.findUserByEmail(email);
  let isNew = false;
  if (!user) {
    user = await q.createUser(email);
    isNew = true;
    log({ event: 'user_created', user_id: user.id, email });
    await grantCredits(user.id, 1, 'signup_bonus'); // 1 бесплатный рендер-итерация за регистрацию
  }
  await q.addIdentity(user.id, 'email', null, email);

  const token = crypto.randomBytes(32).toString('base64url');
  await q.createSession(user.id, sha256(token), SESSION_DAYS);
  log({ event: 'login', user_id: user.id, email, is_new: isNew });
  return { token, user, isNew };
}

// middleware: цепляет req.user, если валидная сессия
export async function sessionUser(req, _res, next) {
  try {
    const raw = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
    if (raw) {
      const token = decodeURIComponent(raw.slice(COOKIE.length + 1));
      const sess = await q.findSession(sha256(token));
      if (sess) req.user = { id: sess.user_id, email: sess.email };
    }
  } catch { /* сессия не обязана быть */ }
  next();
}

export function setSessionCookie(res, token, req) {
  const secure = (process.env.APP_URL || '').startsWith('https') || req?.secure ? '; Secure' : '';
  res.set('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

export function clearSessionCookie(res) {
  res.set('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function logout(token) {
  if (token) await q.deleteSession(sha256(token));
}

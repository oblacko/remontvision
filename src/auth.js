// E-mail авторизация по одноразовому коду (passwordless).
// Архитектура с заделкой под OAuth: юзер в users, входы — строки в auth_identities
// (provider: email|yandex|vk|mailru), склейка аккаунтов по email.
// Отправка: Resend API (RESEND_API_KEY) → SMTP (SMTP_URL) → dev-лог.
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

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_TEMPLATE_ID = process.env.RESEND_TEMPLATE_ID || '';
const MAIL_FROM = process.env.MAIL_FROM || 'ремонтвижн <noreply@remontvision.ru>';
const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || 'support@remontvision.ru';

let mailer = null;
if (!RESEND_API_KEY && process.env.SMTP_URL) {
  mailer = nodemailer.createTransport(process.env.SMTP_URL);
  log({ event: 'mail_transport', mode: 'smtp' });
} else if (RESEND_API_KEY) {
  log({ event: 'mail_transport', mode: 'resend', from: MAIL_FROM, reply_to: MAIL_REPLY_TO });
} else {
  log({ event: 'mail_transport', mode: 'dev_log', msg: 'RESEND_API_KEY/SMTP_URL не заданы — коды авторизации пишутся в лог' });
}

async function sendCodeEmail(email, code) {
  const text = `Ваш код входа: ${code}\nДействует ${OTP_TTL_MIN} минут. Если вы не запрашивали код — просто игнорируйте письмо.`;
  if (RESEND_API_KEY) {
    const payload = RESEND_TEMPLATE_ID
      ? {
          from: MAIL_FROM,
          to: [email],
          reply_to: [MAIL_REPLY_TO],
          subject: 'Код входа — ремонтвижн',
          template: {
            id: RESEND_TEMPLATE_ID,
            variables: {
              code,
              CODE: code,
              otp: code,
              OTP: code,
              code_otp: code,
              CODE_OTP: code,
              ttl: String(OTP_TTL_MIN),
              TTL: String(OTP_TTL_MIN),
              ttl_min: String(OTP_TTL_MIN),
              TTL_MIN: String(OTP_TTL_MIN),
              minutes: String(OTP_TTL_MIN),
              email,
            },
          },
        }
      : {
          from: MAIL_FROM,
          to: [email],
          reply_to: [MAIL_REPLY_TO],
          subject: 'Код входа — ремонтвижн',
          text,
          html: `<p>Ваш код входа: <b style="font-size:22px;letter-spacing:2px">${code}</b></p>
                 <p>Действует ${OTP_TTL_MIN} минут. Если вы не запрашивали код — просто игнорируйте письмо.</p>`,
        };
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (!mailer) {
    log({ event: 'otp_dev_code', email, code, ttl_min: OTP_TTL_MIN });
    return;
  }
  await mailer.sendMail({
    from: MAIL_FROM,
    to: email,
    replyTo: MAIL_REPLY_TO,
    subject: 'Код входа — ремонтвижн',
    text,
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
    await grantCredits(user.id, 2, 'signup_bonus'); // 2 бесплатные генерации за регистрацию
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

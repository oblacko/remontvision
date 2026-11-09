// Транспорт писем: Resend API (RESEND_API_KEY) → SMTP (SMTP_URL) → dev-лог.
// Общий для OTP-кодов (auth.js) и уведомлений (notify.js), чтобы не дублировать выбор транспорта.
// Модуль не зависит от БД, чтобы его можно было импортировать в DB-free тестах.
import nodemailer from 'nodemailer';
import { log } from './openrouter.js';
import { directFetch } from './proxy.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'ремонтвижн <noreply@remontvision.ru>';
const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || 'support@remontvision.ru';

let mailer = null;
if (!RESEND_API_KEY && process.env.SMTP_URL) {
  mailer = nodemailer.createTransport(process.env.SMTP_URL);
  log({ event: 'mail_transport', mode: 'smtp' });
} else if (RESEND_API_KEY) {
  log({ event: 'mail_transport', mode: 'resend', from: MAIL_FROM, reply_to: MAIL_REPLY_TO });
} else {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('В production нужен RESEND_API_KEY или SMTP_URL: dev-лог с OTP запрещён');
  }
  log({ event: 'mail_transport', mode: 'dev_log', msg: 'RESEND_API_KEY/SMTP_URL не заданы — коды авторизации пишутся в лог' });
}

// Отправка письма через выбранный транспорт. Возвращает true, если письмо реально
// отправлено (Resend/SMTP), и false, если транспорта нет (dev-лог). Бросает Error на
// ошибку Resend/SMTP. `template` (Resend) имеет приоритет над text/html.
export async function sendEmail({ to, subject, text, html = null, template = null }) {
  if (RESEND_API_KEY) {
    const payload = {
      from: MAIL_FROM,
      to: [to],
      reply_to: [MAIL_REPLY_TO],
      subject,
      ...(template ? { template } : { text, ...(html ? { html } : {}) }),
    };
    const r = await directFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      // Дренируем тело ответа (освобождаем соединение), но не логируем его —
      // в нём может быть адрес получателя или другая чувствительная информация.
      await r.text().catch(() => {});
      throw new Error(`resend ${r.status}`);
    }
    return true;
  }
  if (!mailer) return false;
  await mailer.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject,
    text,
    ...(html ? { html } : {}),
  });
  return true;
}

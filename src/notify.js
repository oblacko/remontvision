// Уведомления по e-mail. Письмо «дизайн готов» отправляется после успешного рендера,
// чтобы пользователь мог закрыть вкладку и вернуться к результату по ссылке из письма.
// Отправка переиспользует транспорт из src/mailer.js (Resend → SMTP → dev-лог);
// модуль не зависит от БД и не логирует e-mail (в логах — только user_id/room_id).
import { log } from './openrouter.js';
import { sendEmail } from './mailer.js';

const APP_URL = (process.env.APP_URL || 'https://www.remontvision.ru').replace(/\/$/, '');

// Публичная ссылка на результат по share-токену (см. POST /api/renders/:id/share).
export function renderShareUrl(token) {
  return `${APP_URL}/s/${token}`;
}

// Чистый шаблон письма «дизайн готов». Не содержит секретов; пропущенные поля опускаются.
export function renderDoneEmail({ roomType, style, shareUrl }) {
  const subject = 'Ваш дизайн готов — ремонтвижн';
  const lines = ['Ваш дизайн интерьера готов!'];
  if (roomType) lines.push(`Комната: ${roomType}`);
  if (style) lines.push(`Стиль: ${style}`);
  lines.push('');
  if (shareUrl) {
    lines.push(`Откройте результат по ссылке: ${shareUrl}`);
    lines.push('Ссылка открывает готовую визуализацию.');
  } else {
    lines.push('Откройте результат в личном кабинете.');
  }
  return { subject, text: lines.join('\n') };
}

// Отправка письма «дизайн готов». Никогда не бросает исключение:
// без транспорта пишет email_skipped и возвращает false, при ошибке отправки — email_error и false.
export async function sendRenderDoneEmail(toEmail, data) {
  try {
    const { subject, text } = renderDoneEmail(data || {});
    const sent = await sendEmail({ to: toEmail, subject, text });
    if (!sent) {
      log({ event: 'email_skipped', reason: 'no_transport' });
      return false;
    }
    return true;
  } catch (e) {
    log({ event: 'email_error', error: String(e.message || e).slice(0, 300) });
    return false;
  }
}

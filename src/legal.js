// Версии юридических документов и журнал акцептов.
// Версия должна совпадать с редакцией на страницах /offer и /privacy.
import net from 'node:net';
import { q } from './db.js';

export const LEGAL_VERSIONS = {
  offer: '2026-10-26.5',
  privacy: '2026-10-26.5',
  cross_border: '2026-10-26.5',
};

export const LEGAL_URLS = {
  offer: '/offer',
  privacy: '/privacy',
  cross_border: '/privacy#cross-border',
};

export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = xff || req.socket?.remoteAddress || null;
  return ip && net.isIP(ip) ? ip : null;
}

export function requireConsents(consents) {
  const ok = consents && consents.offer === true && consents.privacy === true && consents.cross_border === true;
  if (!ok) {
    const e = new Error('Нужны отдельные согласия: акцепт оферты, обработка ПДн и трансграничная передача');
    e.status = 400;
    throw e;
  }
}

export async function recordAcceptances({ userId, context, req, paymentId = null, documents = ['offer', 'privacy', 'cross_border'] }) {
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 500) || null;
  for (const document of documents) {
    const version = LEGAL_VERSIONS[document];
    if (!version) continue;
    await q.acceptLegal(userId, document, version, context, ip, ua, paymentId);
  }
}

export function currentLegal() {
  return Object.fromEntries(Object.entries(LEGAL_VERSIONS).map(([document, version]) => [
    document,
    { version, url: LEGAL_URLS[document] },
  ]));
}

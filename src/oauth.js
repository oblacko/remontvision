// Вход через соцсети (OAuth). Сейчас — Яндекс ID, дальше VK/Telegram по той же схеме.
// Ключи: YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET.
// Redirect URI: ${APP_URL}/api/auth/yandex/callback — должен совпадать с настройкой приложения.
//
// Поток: /api/auth/yandex/start (state + cookie) → oauth.yandex.ru → /callback
//        → обмен code на access_token → профиль (заголовок OAuth!) → наша сессия.
import crypto from 'node:crypto';
import { q } from './db.js';
import { log } from './openrouter.js';
import { grantCredits } from './payments.js';
import { directFetch } from './proxy.js';
import { startSession } from './auth.js';

const STATE_COOKIE = 'rv_oauth_state';
const STATE_TTL_MIN = 10;
const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID || '';
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET || '';

export function yandexConfigured() {
  return Boolean(YANDEX_CLIENT_ID && YANDEX_CLIENT_SECRET);
}

function oauthError(message, status = 400, redirectTo) {
  const e = new Error(message);
  e.status = status;
  if (redirectTo) e.redirectTo = redirectTo;
  return e;
}

// Базовый URL сайта: APP_URL в проде; локальный host — при разработке без APP_URL.
export function appBaseUrl(req) {
  const configured = (process.env.APP_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  const host = String(req.get('host') || '');
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return `${req.protocol}://${host}`;
  return 'https://www.remontvision.ru';
}

function yandexRedirectUri(req) {
  return `${appBaseUrl(req)}/api/auth/yandex/callback`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : null;
}

// Только внутренний путь: нельзя увести редирект на чужой домен.
function safeRedirectPath(value) {
  const route = String(value || '').trim();
  if (!route.startsWith('/') || route.startsWith('//') || route.startsWith('/\\')) return '/';
  return route;
}

// POST /api/auth/yandex/start: создаёт state, ставит cookie, возвращает URL авторизации.
export async function startYandex({ consents, redirectTo, req, res }) {
  if (!yandexConfigured()) throw oauthError('Вход через Яндекс не настроен', 503);
  const state = crypto.randomBytes(24).toString('base64url');
  await q.createOauthState(state, 'yandex', consents || {}, safeRedirectPath(redirectTo), STATE_TTL_MIN);
  const secure = appBaseUrl(req).startsWith('https') ? '; Secure' : '';
  res.append('Set-Cookie', `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_MIN * 60}${secure}`);
  const url = new URL('https://oauth.yandex.ru/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', YANDEX_CLIENT_ID);
  url.searchParams.set('redirect_uri', yandexRedirectUri(req));
  url.searchParams.set('state', state);
  return url.toString();
}

// GET /api/auth/yandex/callback: обмен кода, вход/регистрация, сессия.
// Возвращает данные для записи согласий и редиректа — куку ставит startSession.
export async function completeYandexLogin({ code, state, req, res }) {
  const cookieState = readCookie(req, STATE_COOKIE);
  const st = state ? await q.consumeOauthState(String(state), 'yandex') : null;
  const redirectTo = safeRedirectPath(st?.redirect_to || '/');
  // state одноразовый и привязан к cookie — защита от login CSRF.
  if (!st) throw oauthError('Ссылка входа устарела, попробуйте ещё раз', 400, redirectTo);
  if (!cookieState || cookieState !== String(state)) throw oauthError('Проверка state не пройдена', 400, redirectTo);
  if (!code) throw oauthError('Яндекс не вернул код авторизации', 400, redirectTo);

  const tokenRes = await directFetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      client_id: YANDEX_CLIENT_ID,
      client_secret: YANDEX_CLIENT_SECRET,
      redirect_uri: yandexRedirectUri(req),
    }).toString(),
  });
  if (!tokenRes.ok) {
    throw oauthError(`Яндекс не выдал токен (${tokenRes.status})`, 502, redirectTo);
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) throw oauthError('Яндекс не выдал access_token', 502, redirectTo);

  // Яндекс требует заголовок OAuth, а не Bearer.
  const infoRes = await directFetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!infoRes.ok) throw oauthError(`Не удалось получить профиль Яндекса (${infoRes.status})`, 502, redirectTo);
  const info = await infoRes.json();
  const sub = String(info.id || '').trim();
  if (!sub) throw oauthError('Яндекс не вернул идентификатор пользователя', 502, redirectTo);
  const emails = Array.isArray(info.emails) ? info.emails : [];
  const email = String(info.default_email || emails.find(Boolean) || '').trim().toLowerCase() || null;

  // 1) уже привязанный аккаунт → 2) склейка по e-mail → 3) новый пользователь.
  let user = null;
  const identity = await q.findIdentity('yandex', sub);
  if (identity) {
    user = { id: identity.user_id, email: identity.user_email };
  } else if (email) {
    user = await q.findUserByEmail(email);
  }
  let isNew = false;
  if (!user) {
    user = await q.createUser(email);
    isNew = true;
    log({ event: 'user_created', provider: 'yandex', user_id: user.id, email });
    await grantCredits(user.id, 2, 'signup_bonus'); // как при e-mail-регистрации
  }
  await q.addIdentity(user.id, 'yandex', sub, email);
  await startSession(user, req, res);
  log({ event: 'login', provider: 'yandex', user_id: user.id, email, is_new: isNew });
  return { user, isNew, consents: st.consents || {}, redirectTo };
}

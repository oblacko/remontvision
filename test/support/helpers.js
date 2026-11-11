// Хелперы для интеграционных тестов: пользователь, сессия, HTTP-вызовы.
import './db.js';
import crypto from 'node:crypto';
import { q } from '../../src/db.js';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

export async function createUser(email = `u-${crypto.randomUUID()}@test.local`) {
  return q.createUser(email);
}

// Создаёт валидную сессию и возвращает cookie для запросов.
export async function loginAs(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q.createSession(user.id, sha256(token), 30);
  return `rv_sid=${token}`;
}

export async function api(url, path, { method = 'GET', cookie, body, headers } = {}) {
  const res = await fetch(url + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

export function sha256Hex(value) {
  return sha256(value);
}

// Хелперы для интеграционных тестов: пользователь, сессия, комнаты, рендеры, HTTP.
import './db.js';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { q, pool } from '../../src/db.js';

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

export async function seedRoom({ userId, photoPath = 'uploads/room.png', style = 'Современный минимализм', status = 'queued', keepFurniture = true, conceptKey = null } = {}) {
  const id = crypto.randomUUID();
  await q.createRoom(id, style, 150, photoPath, userId, 'Гостиная', 'none', 'none', null, 'comfort', keepFurniture, false, null, null, null, null, null, null, conceptKey);
  await q.setRoomStatus(status, id);
  return q.getRoom(id);
}

// Прямая вставка рендера для фикстур (статус/картинка/токен задаются явно).
export async function insertRender({
  roomId,
  id = crypto.randomUUID(),
  status = 'queued',
  parentId = null,
  imagePath = null,
  shareToken = null,
  modelKey = null,
  modelCredits = 1,
  isPrivate = false,
} = {}) {
  await pool.query(
    `INSERT INTO renders (id, room_id, parent_render_id, root_render_id, status, image_path, share_token, model_key, model_credits, is_private)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, roomId, parentId, parentId || id, status, imagePath, shareToken, modelKey, modelCredits, isPrivate],
  );
  return id;
}

export async function tinyPng() {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
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

export async function uploadRoom(url, { cookie, style = 'Современный минимализм', fields = {} } = {}) {
  const png = await tinyPng();
  const form = new FormData();
  form.append('photo', new Blob([png], { type: 'image/png' }), 'room.png');
  if (style !== null) form.append('style', style);
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  const res = await fetch(`${url}/api/rooms`, { method: 'POST', headers: cookie ? { cookie } : {}, body: form });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

export function sha256Hex(value) {
  return sha256(value);
}

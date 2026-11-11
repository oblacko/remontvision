import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser, loginAs } from '../support/helpers.js';
import { grantCredits } from '../../src/payments.js';
import { q, pool } from '../../src/db.js';

after(closeTestApp);

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadWith(url, cookie, { styles, idempotencyKey } = {}) {
  const form = new FormData();
  form.append('photo', new Blob([tinyPng], { type: 'image/png' }), 'room.png');
  form.append('room_type', 'Гостиная');
  form.append('items', JSON.stringify(styles.map(style => ({ style, concept: null }))));
  const headers = { cookie };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(`${url}/api/rooms`, { method: 'POST', headers, body: form });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { status: res.status, json };
}

test('запуск нескольких стилей создаёт пакет с отдельными вариантами', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);

  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский', 'Джапанди', 'Лофт'] });
  assert.equal(created.status, 201);
  assert.ok(created.json.batch_id, 'ответ должен содержать batch_id');

  const batch = await api(app.url, `/api/batches/${created.json.batch_id}`, { cookie });
  assert.equal(batch.status, 200);
  assert.equal(batch.json.total, 3);
  assert.equal(batch.json.done, 0);
  assert.equal(batch.json.room_id, created.json.id);
  assert.equal(batch.json.renders.length, 3);
  assert.ok(batch.json.renders.every(r => r.is_edit === false), 'варианты пакета не должны быть правками');

  const renders = await q.batchRenders(created.json.batch_id);
  assert.equal(renders.length, 3);
});

test('повторный запуск с тем же Idempotency-Key не создаёт новую комнату', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);

  const key = 'idem-test-1';
  const first = await uploadWith(app.url, cookie, { styles: ['Скандинавский'], idempotencyKey: key });
  assert.equal(first.status, 201);
  const balanceAfterFirst = await q.creditBalance(user.id);

  const second = await uploadWith(app.url, cookie, { styles: ['Скандинавский'], idempotencyKey: key });
  assert.equal(second.status, 202);
  assert.equal(second.json.idempotent, true);
  assert.equal(second.json.id, first.json.id);
  assert.equal(second.json.batch_id, first.json.batch_id);

  assert.equal(await q.creditBalance(user.id), balanceAfterFirst, 'повтор не должен списывать кредиты');
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM generation_batches WHERE user_id = $1', [user.id]);
  assert.equal(rows[0].n, 1);
});

test('чужой пакет недоступен', async () => {
  const app = await createTestApp();
  const owner = await createUser();
  await grantCredits(owner.id, 5, 'test_grant');
  const cookie = await loginAs(owner);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });

  const stranger = await createUser();
  const strangerCookie = await loginAs(stranger);
  const res = await api(app.url, `/api/batches/${created.json.batch_id}`, { cookie: strangerCookie });
  assert.equal(res.status, 404);
});

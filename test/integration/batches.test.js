import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser, loginAs } from '../support/helpers.js';
import { grantCredits, enqueueRenderWithCredit } from '../../src/payments.js';
import crypto from 'node:crypto';
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

test('повтор неудачного варианта создаёт новый рендер в том же пакете', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);
  await pool.query(`UPDATE renders SET status = 'error', error = 'provider failed' WHERE id = $1`, [render.id]);
  const balanceBefore = await q.creditBalance(user.id);

  const res = await api(app.url, `/api/renders/${render.id}/retry`, { method: 'POST', cookie });
  assert.equal(res.status, 202);
  assert.equal(res.json.batch_id, created.json.batch_id);

  const renders = await q.batchRenders(created.json.batch_id);
  assert.equal(renders.length, 2);
  assert.equal(renders.filter(item => item.status === 'queued').length, 1);
  assert.equal(await q.creditBalance(user.id), balanceBefore - 1);
});

test('повтор доступен только для неудачного базового дизайна', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);

  const ok = await api(app.url, `/api/renders/${render.id}/retry`, { method: 'POST', cookie });
  assert.equal(ok.status, 409);

  await pool.query(`UPDATE renders SET status = 'error' WHERE id = $1`, [render.id]);
  const edit = await pool.query(
    `INSERT INTO renders (id, room_id, parent_render_id, root_render_id, status, batch_id)
     VALUES ('edit-retry-test', $1, $2, $2, 'error', $3) RETURNING id`,
    [render.room_id, render.id, created.json.batch_id],
  );
  const res = await api(app.url, `/api/renders/${edit.rows[0].id}/retry`, { method: 'POST', cookie });
  assert.equal(res.status, 400);
});

test('другой стиль создаёт отдельный пакет и списывает кредит', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);
  await q.setRoomStatus('done', created.json.id);
  const balanceBefore = await q.creditBalance(user.id);

  const res = await api(app.url, `/api/renders/${render.id}/variant`, { method: 'POST', cookie, body: { style: 'Джапанди' } });
  assert.equal(res.status, 202);
  assert.notEqual(res.json.batch_id, created.json.batch_id);
  assert.equal(res.json.style, 'Джапанди');

  const renders = await q.batchRenders(res.json.batch_id);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].style, 'Джапанди');
  assert.equal(await q.creditBalance(user.id), balanceBefore - 1);
});

test('другой стиль отвергает неизвестный стиль', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);
  await q.setRoomStatus('done', created.json.id);
  const res = await api(app.url, `/api/renders/${render.id}/variant`, { method: 'POST', cookie, body: { style: 'Несуществующий стиль' } });
  assert.equal(res.status, 400);
});

test('избранное переключается и сохраняется', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);

  const on = await api(app.url, `/api/renders/${render.id}/favorite`, { method: 'POST', cookie, body: { value: true } });
  assert.equal(on.status, 200);
  assert.equal(on.json.is_favorite, true);
  const stored = await q.getRender(render.id);
  assert.equal(stored.is_favorite, true);

  const off = await api(app.url, `/api/renders/${render.id}/favorite`, { method: 'POST', cookie, body: { value: false } });
  assert.equal(off.json.is_favorite, false);
});

test('публичный промпт не содержит внутренних инструкций и сохраняется', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);

  const res = await api(app.url, `/api/renders/${render.id}/public-prompt`, { method: 'POST', cookie });
  assert.equal(res.status, 200);
  assert.ok(res.json.public_prompt.length > 20);
  assert.doesNotMatch(res.json.public_prompt, /system|instruction|assistant|model/i);
  const stored = await q.getRender(render.id);
  assert.equal(stored.public_prompt, res.json.public_prompt);
});

test('приватный дизайн нельзя опубликовать, обычный можно', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);

  const on = await api(app.url, `/api/renders/${render.id}/publish`, { method: 'POST', cookie, body: { value: true } });
  assert.equal(on.status, 200);
  assert.equal(on.json.publish_consent, true);

  await pool.query(`UPDATE renders SET is_private = true WHERE id = $1`, [render.id]);
  const denied = await api(app.url, `/api/renders/${render.id}/publish`, { method: 'POST', cookie, body: { value: true } });
  assert.equal(denied.status, 403);
});

test('отмена задачи в очереди возвращает кредит', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  // В mock-режиме загрузка не списывает кредиты, поэтому создаём оплаченный рендер явно.
  const paidId = crypto.randomUUID();
  await enqueueRenderWithCredit({
    id: paidId, roomId: created.json.id, chargedUserId: user.id, modelCredits: 1, batchId: created.json.batch_id,
  });
  const balanceBefore = await q.creditBalance(user.id);

  const res = await api(app.url, `/api/renders/${paidId}/cancel`, { method: 'POST', cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'cancelled');
  assert.equal(await q.creditBalance(user.id), balanceBefore + 1);
  const stored = await q.getRender(paidId);
  assert.equal(stored.status, 'cancelled');
});

test('нельзя отменить задачу, которая уже в работе', async () => {
  const app = await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const cookie = await loginAs(user);
  const created = await uploadWith(app.url, cookie, { styles: ['Скандинавский'] });
  const [render] = await q.batchRenders(created.json.batch_id);
  await pool.query(`UPDATE renders SET status = 'processing' WHERE id = $1`, [render.id]);
  const res = await api(app.url, `/api/renders/${render.id}/cancel`, { method: 'POST', cookie });
  assert.equal(res.status, 409);
});

test('события воронки пишутся и видны в админ-метриках', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const res = await fetch(`${app.url}/api/events`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'upload_ok', props: { room_type: 'Кухня' } }),
  });
  assert.equal(res.status, 204);

  const metrics = await fetch(`${app.url}/api/admin/metrics`, { headers: { 'x-admin-key': process.env.ADMIN_KEY || 'test-admin-key' } });
  assert.equal(metrics.status, 200);
  const data = await metrics.json();
  assert.ok(Array.isArray(data.events));
  assert.ok(data.events.some(item => item.name === 'upload_ok'));
});

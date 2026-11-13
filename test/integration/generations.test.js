import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom, api, loginAs } from '../support/helpers.js';
import { q, pool } from '../../src/db.js';
import { enqueueRenderWithCredit, restoreCreditForRender, grantCredits } from '../../src/payments.js';

after(closeTestApp);

const id = () => crypto.randomUUID();

test('userGenerations computes credits_spent in one aggregate query (no N+1)', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 20, 'test_grant');
  const room = await seedRoom({ userId: user.id });

  // Три рендера с разной стоимостью; у одного — возврат кредита.
  const r1 = id();
  const r2 = id();
  const r3 = id();
  await enqueueRenderWithCredit({ id: r1, roomId: room.id, chargedUserId: user.id, modelCredits: 2 });
  await enqueueRenderWithCredit({ id: r2, roomId: room.id, chargedUserId: user.id, modelCredits: 3 });
  await enqueueRenderWithCredit({ id: r3, roomId: room.id, chargedUserId: user.id, modelCredits: 1 });
  await restoreCreditForRender(r2, 'test');
  await q.setRoomStatus('done', room.id);

  // Считаем запросы: ровно два (список рендеров + агрегат кредитов), независимо от числа рендеров.
  const original = pool.query.bind(pool);
  let count = 0;
  pool.query = (...args) => { count += 1; return original(...args); };
  let rows;
  try {
    rows = await q.userGenerations(user.id);
  } finally {
    pool.query = original;
  }
  assert.equal(count, 2);

  const byId = new Map(rows.map(row => [row.id, row]));
  assert.equal(rows.length, 3);
  assert.equal(byId.get(r1).credits_spent, 2);
  assert.equal(byId.get(r2).credits_spent, 0); // 3 списано - 3 возврата
  assert.equal(byId.get(r3).credits_spent, 1);
  // room_status идёт из комнаты и не зависит от рендера.
  for (const row of rows) assert.equal(row.room_status, 'done');
});

test('GET /api/my/generations keeps response shape and exposes room_status', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  await grantCredits(user.id, 5, 'test_grant');
  const room = await seedRoom({ userId: user.id });
  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 2 });
  await q.setRoomStatus('done', room.id);

  const res = await api(app.url, '/api/my/generations', { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.length, 1);
  const g = res.json[0];
  assert.equal(g.id, renderId);
  assert.equal(g.kind, 'render');
  assert.equal(g.room_id, room.id);
  assert.equal(g.room_status, 'done');
  assert.equal(g.credits_spent, 2);
  assert.equal(g.status, 'queued');
  // Поля, которые читает фронт, на месте.
  assert.ok('style' in g);
  assert.ok('image_url' in g);
  assert.ok('photo_url' in g);

  const anon = await api(app.url, '/api/my/generations');
  assert.equal(anon.status, 401);
});

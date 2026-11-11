import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom, insertRender, api, loginAs } from '../support/helpers.js';
import { q, pool } from '../../src/db.js';
import { enqueueRenderWithCredit, restoreCreditForRender, grantCredits } from '../../src/payments.js';

after(closeTestApp);

const id = () => crypto.randomUUID();
const balance = userId => q.creditBalance(userId);

async function countRenders(roomId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM renders WHERE room_id = $1', [roomId]);
  return rows[0].n;
}

test('root render charges modelCredits', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const room = await seedRoom({ userId: user.id });

  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 2 });

  assert.equal(await balance(user.id), 3);
  const render = await q.getRender(renderId);
  assert.equal(render.status, 'queued');
  assert.equal(render.model_credits, 2);
  const { rows } = await pool.query(`SELECT delta, reason FROM credit_txn WHERE user_id = $1 ORDER BY id`, [user.id]);
  assert.deepEqual(rows.map(r => [r.reason, r.delta]).at(-1), ['render', -2]);
});

test('root render without enough credits is rejected and inserts nothing', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 1, 'test_grant');
  const room = await seedRoom({ userId: user.id });

  await assert.rejects(
    enqueueRenderWithCredit({ id: id(), roomId: room.id, chargedUserId: user.id, modelCredits: 2 }),
    e => e.status === 402,
  );

  assert.equal(await balance(user.id), 1);
  assert.equal(await countRenders(room.id), 0);
});

test('first three edits are free, the fourth is charged', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const parentId = await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/parent.png' });

  for (let i = 0; i < 3; i += 1) {
    await enqueueRenderWithCredit({ id: id(), roomId: room.id, parentRenderId: parentId, chargedUserId: user.id });
    await q.setRoomStatus('done', room.id);
  }
  assert.equal(await balance(user.id), 5);

  const fourth = await enqueueRenderWithCredit({ id: id(), roomId: room.id, parentRenderId: parentId, chargedUserId: user.id });
  assert.equal(fourth.charged, true);
  assert.equal(await balance(user.id), 4);
});

test('iteration inherits privacy from the parent render', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const parentId = await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/parent.png', isPrivate: true });

  const childId = id();
  await enqueueRenderWithCredit({ id: childId, roomId: room.id, parentRenderId: parentId, chargedUserId: user.id });
  assert.equal((await q.getRender(childId)).is_private, true);
});

test('restoreCreditForRender refunds exactly once', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 3, 'test_grant');
  const room = await seedRoom({ userId: user.id });
  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 1 });
  assert.equal(await balance(user.id), 2);

  assert.equal(await restoreCreditForRender(renderId, 'test'), true);
  assert.equal(await balance(user.id), 3);
  assert.equal(await restoreCreditForRender(renderId, 'test'), false);
  assert.equal(await balance(user.id), 3);
});

test('refund feed exposes fresh credit returns to the user', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  await grantCredits(user.id, 3, 'test_grant');
  const room = await seedRoom({ userId: user.id });
  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 1 });
  assert.equal(await restoreCreditForRender(renderId, 'render_cancelled'), true);

  const first = await api(app.url, '/api/credits/refunds?after=0', { cookie });
  assert.equal(first.status, 200);
  assert.equal(first.json.length, 1);
  assert.equal(first.json[0].reason, 'iterate_refund');
  assert.equal(first.json[0].note, 'render_cancelled');
  assert.equal(first.json[0].render_id, renderId);
  assert.equal(first.json[0].delta, 1);

  const again = await api(app.url, `/api/credits/refunds?after=${first.json[0].id}`, { cookie });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json, []);

  const anon = await api(app.url, '/api/credits/refunds');
  assert.equal(anon.status, 401);
});

test('two concurrent root enqueues never go below zero balance', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 1, 'test_grant');
  const room = await seedRoom({ userId: user.id });
  const results = await Promise.allSettled([
    enqueueRenderWithCredit({ id: id(), roomId: room.id, chargedUserId: user.id, modelCredits: 1 }),
    enqueueRenderWithCredit({ id: id(), roomId: room.id, chargedUserId: user.id, modelCredits: 1 }),
  ]);

  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(await balance(user.id), 0);
});

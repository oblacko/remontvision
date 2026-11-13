import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom, insertRender } from '../support/helpers.js';
import { q, pool } from '../../src/db.js';
import { enqueueRenderWithCredit, grantCredits, restoreCreditForRender } from '../../src/payments.js';
import { processRender } from '../../src/jobs.js';

after(closeTestApp);

const id = () => crypto.randomUUID();

async function seedQueuedRender({ userId, credits = 3, modelCredits = 1 } = {}) {
  const user = await createUser();
  await grantCredits(user.id, credits, 'test_grant');
  const room = await seedRoom({ userId: user.id });
  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits });
  return { user, room, renderId };
}

test('claimed render is processed to done in mock mode', async () => {
  await createTestApp();
  const { user, room, renderId } = await seedQueuedRender({ credits: 3 });

  const claimed = await q.claimNextRender();
  assert.equal(claimed.id, renderId);
  await processRender(renderId);

  const render = await q.getRender(renderId);
  assert.equal(render.status, 'done');
  assert.match(String(render.image_path), /^renders\//);
  assert.equal((await q.getRoom(room.id)).status, 'done');
  assert.equal(await q.creditBalance(user.id), 2);
});

test('failed render is marked error and the credit is restored once', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const parentId = await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/parent.png' });
  for (let i = 0; i < 3; i += 1) {
    await insertRender({ roomId: room.id, status: 'done', parentId });
  }
  await q.setRoomStatus('done', room.id);

  const renderId = id();
  await enqueueRenderWithCredit({
    id: renderId,
    roomId: room.id,
    parentRenderId: parentId,
    chargedUserId: user.id,
    refProductId: 999999,
  });
  assert.equal(await q.creditBalance(user.id), 4);

  await q.claimNextRender();
  await processRender(renderId);

  assert.equal((await q.getRender(renderId)).status, 'error');
  assert.equal(await q.creditBalance(user.id), 5);
});

test('two concurrent claims return two different renders', async () => {
  await createTestApp();
  const first = await seedQueuedRender();
  const second = await seedQueuedRender();

  const [a, b] = await Promise.all([q.claimNextRender(), q.claimNextRender()]);

  assert.ok(a, 'first claim returned null');
  assert.ok(b, 'second claim returned null');
  assert.notEqual(a.id, b.id);
  assert.deepEqual(new Set([a.id, b.id]), new Set([first.renderId, second.renderId]));
});

test('requeueProcessing requeues only expired leases', async () => {
  await createTestApp();
  const { renderId } = await seedQueuedRender();

  await q.claimNextRender();
  const claimedRender = await q.getRender(renderId);
  assert.ok(claimedRender.lease_expires_at, 'claim must set a lease');

  // Живой lease не трогаем: вторая реплика не крадёт in-flight задачу.
  assert.equal(await q.requeueProcessing(), 0);
  assert.equal((await q.getRender(renderId)).status, 'processing');

  await pool.query(`UPDATE renders SET lease_expires_at = now() - interval '1 minute' WHERE id = $1`, [renderId]);
  assert.equal(await q.requeueProcessing(), 1);
  assert.equal((await q.getRender(renderId)).status, 'queued');
});

test('heartbeat extends the lease of a processing render', async () => {
  await createTestApp();
  const { renderId } = await seedQueuedRender();
  await q.claimNextRender();
  const before = new Date((await q.getRender(renderId)).lease_expires_at).getTime();

  await new Promise(r => setTimeout(r, 20));
  await q.heartbeatRender(renderId);
  const after = new Date((await q.getRender(renderId)).lease_expires_at).getTime();

  assert.ok(after > before, `lease not extended: ${before} -> ${after}`);
});

test('reaper does not fail a processing render with a live lease', async () => {
  await createTestApp();
  const { renderId } = await seedQueuedRender();
  await q.claimNextRender();
  // Рендер старый по created_at, но его lease жив: это долгий бэклог, а не зависание.
  await pool.query(`UPDATE renders SET created_at = now() - interval '2 hours' WHERE id = $1`, [renderId]);

  const stale = await q.staleRenders(60);
  assert.deepEqual(stale, []);
});

test('a stuck processing render is failed and refunded once', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 3, 'test_grant');
  const room = await seedRoom({ userId: user.id });
  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 1 });
  await q.claimNextRender();
  // Один attempt висит дольше 60 минут — heartbeat не спасает от вечного рендера.
  await pool.query(`UPDATE renders SET started_at = now() - interval '2 hours' WHERE id = $1`, [renderId]);

  const stale = await q.staleRenders(60);
  assert.deepEqual(stale.map(row => row.id), [renderId]);

  const failed = await q.failStaleRender(renderId, 'Генерация не завершилась', 'timeout');
  assert.ok(failed);
  assert.equal(await restoreCreditForRender(renderId, 'timeout'), true);
  assert.equal(await q.creditBalance(user.id), 3);
  assert.equal(await restoreCreditForRender(renderId, 'timeout'), false);
  assert.equal(await q.creditBalance(user.id), 3);
});

test('edit queue is claimed before base queue and completes first', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 20, 'test_grant');

  // Долгий базовый рендер уже обрабатывается (processing).
  const roomLong = await seedRoom({ userId: user.id });
  const baseLongId = id();
  await enqueueRenderWithCredit({ id: baseLongId, roomId: roomLong.id, chargedUserId: user.id });
  assert.equal((await q.getRender(baseLongId)).queue, 'base');
  await q.claimNextRender();
  assert.equal((await q.getRender(baseLongId)).status, 'processing');

  // Ещё один базовый рендер в очереди — старее правки.
  const roomBase = await seedRoom({ userId: user.id });
  const baseQueuedId = id();
  await enqueueRenderWithCredit({ id: baseQueuedId, roomId: roomBase.id, chargedUserId: user.id });
  assert.equal((await q.getRender(baseQueuedId)).queue, 'base');
  assert.equal((await q.getRender(baseQueuedId)).status, 'queued');

  // Правка в очереди — создана позже базы, но должна выйти первой.
  const roomEdit = await seedRoom({ userId: user.id, status: 'done' });
  const parentId = await insertRender({ roomId: roomEdit.id, status: 'done', imagePath: 'renders/parent.png' });
  const editId = id();
  await enqueueRenderWithCredit({ id: editId, roomId: roomEdit.id, parentRenderId: parentId, chargedUserId: user.id });
  assert.equal((await q.getRender(editId)).queue, 'edit');
  assert.equal((await q.getRender(editId)).status, 'queued');

  // Claim обязан взять правку, а не более раннюю базу.
  const claimed = await q.claimNextRender();
  assert.equal(claimed.id, editId);

  await processRender(editId);
  assert.equal((await q.getRender(editId)).status, 'done');
  // База всё ещё в очереди — правка завершена первой.
  assert.equal((await q.getRender(baseQueuedId)).status, 'queued');
});

test('a worker that lost its lease cannot complete the render', async () => {
  await createTestApp();
  const { renderId } = await seedQueuedRender();

  const first = await q.claimNextRender();
  assert.equal(first.id, renderId);
  const staleToken = first.claimed_by;
  assert.ok(staleToken);

  await pool.query(`UPDATE renders SET lease_expires_at = now() - interval '1 minute' WHERE id = $1`, [renderId]);
  assert.equal(await q.requeueProcessing(), 1);
  const second = await q.claimNextRender();
  assert.equal(second.id, renderId);
  assert.notEqual(second.claimed_by, staleToken);

  // Старый воркер не должен перезаписать результат нового.
  assert.equal(await q.setRenderDone('renders/stale.png', 0, 'm', renderId, staleToken), 0);
  assert.equal((await q.getRender(renderId)).status, 'processing');
  assert.equal(await q.setRenderDone('renders/new.png', 0, 'm', renderId, second.claimed_by), 1);
  assert.equal((await q.getRender(renderId)).status, 'done');
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom, insertRender } from '../support/helpers.js';
import { q } from '../../src/db.js';
import { enqueueRenderWithCredit, grantCredits } from '../../src/payments.js';
import { processRender } from '../../src/jobs.js';

after(closeTestApp);

const id = () => crypto.randomUUID();

test('claimed render is processed to done in mock mode', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 3, 'test_grant');
  const room = await seedRoom({ userId: user.id });

  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 1 });

  const claimed = await q.claimNextRender();
  assert.equal(claimed.id, renderId);
  await processRender(renderId);

  const render = await q.getRender(renderId);
  assert.equal(render.status, 'done');
  assert.match(String(render.image_path), /^renders\//);
  assert.equal((await q.getRoom(room.id)).status, 'done');
  // Воркер не списывает повторно: остаётся только первоначальное списание.
  assert.equal(await q.creditBalance(user.id), 2);
});

test('failed render is marked error and the credit is restored once', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 5, 'test_grant');
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const parentId = await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/parent.png' });
  // Три прошлые правки делают четвёртую платной.
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
    refProductId: 999999, // товара нет — processRender обязан упасть
  });
  assert.equal(await q.creditBalance(user.id), 4);

  await q.claimNextRender();
  await processRender(renderId);

  const render = await q.getRender(renderId);
  assert.equal(render.status, 'error');
  assert.equal(await q.creditBalance(user.id), 5);
});

test('current requeueProcessing moves all processing renders back to queued', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 3, 'test_grant');
  const room = await seedRoom({ userId: user.id });

  const renderId = id();
  await enqueueRenderWithCredit({ id: renderId, roomId: room.id, chargedUserId: user.id, modelCredits: 1 });
  await q.claimNextRender();
  assert.equal((await q.getRender(renderId)).status, 'processing');

  // Текущее поведение (дефект при >1 реплике): blanket-requeue без lease. TODO(slice 7).
  const requeued = await q.requeueProcessing();
  assert.equal(requeued >= 1, true);
  assert.equal((await q.getRender(renderId)).status, 'queued');
});

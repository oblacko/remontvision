import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom, insertRender } from '../support/helpers.js';
import { q, pool } from '../../src/db.js';

after(closeTestApp);

test('room cleanup is claimed once and stores the shell on the room', async () => {
  await createTestApp();
  const user = await createUser();
  const room = await seedRoom({ userId: user.id, keepFurniture: false });

  const first = await q.claimRoomCleanup(room.id);
  assert.equal(first.id, room.id);
  const second = await q.claimRoomCleanup(room.id);
  assert.equal(second, null, 'second enqueue/call must not start a parallel cleanup');

  await q.finishRoomCleanup(room.id, 'shells/room.png', 0.012);
  const state = await q.roomCleanupState(room.id);
  assert.equal(state.cleanup_status, 'done');
  assert.equal(state.precleaned_shell_path, 'shells/room.png');
  assert.equal(Number(state.cleanup_cost_usd), 0.012);

  const afterDone = await q.claimRoomCleanup(room.id);
  assert.equal(afterDone, null, 'a finished cleanup is never repeated');
});

test('cleanup is never started when the owner keeps furniture', async () => {
  await createTestApp();
  const user = await createUser();
  const room = await seedRoom({ userId: user.id, keepFurniture: true });
  assert.equal(await q.claimRoomCleanup(room.id), null);
});

test('waiting_shell heartbeat extends started_at so the 60-minute sweeper does not kill the job', async () => {
  await createTestApp();
  const user = await createUser();
  const room = await seedRoom({ userId: user.id });
  const renderId = await insertRender({ roomId: room.id, status: 'processing', imagePath: 'renders/pending.png' });
  await pool.query(`UPDATE renders SET started_at = now() - interval '50 minutes' WHERE id = $1`, [renderId]);

  const before = await q.getRender(renderId);
  await q.heartbeatRender(renderId, null, 300, true);
  const after = await q.getRender(renderId);
  assert.ok(new Date(after.started_at) > new Date(before.started_at), 'started_at must move forward while waiting for the shell');
});

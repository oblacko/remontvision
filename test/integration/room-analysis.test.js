import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom } from '../support/helpers.js';
import { q } from '../../src/db.js';

after(closeTestApp);

test('room analysis cache stores one snapshot per room and replaces it on a new key', async () => {
  await createTestApp();
  const user = await createUser();
  const room = await seedRoom({ userId: user.id });

  assert.equal(await q.roomAnalysis(room.id), null);

  await q.upsertRoomAnalysis(room.id, 'key-1', { dimensions: { width: 3 }, art_direction: 'first' });
  const first = await q.roomAnalysis(room.id);
  assert.equal(first.cache_key, 'key-1');
  assert.equal(first.data.art_direction, 'first');

  await q.upsertRoomAnalysis(room.id, 'key-2', { dimensions: { width: 4 }, art_direction: 'second' });
  const second = await q.roomAnalysis(room.id);
  assert.equal(second.cache_key, 'key-2');
  assert.equal(second.data.art_direction, 'second');
  assert.equal(second.data.dimensions.width, 4);
});

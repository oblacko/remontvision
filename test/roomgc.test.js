import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGcDays, shouldGcRoom } from '../src/roomgc.js';
import { remove } from '../src/storage.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 13);

test('roomGcDays defaults to 7 and clamps non-positive values', () => {
  assert.equal(roomGcDays(undefined), 7);
  assert.equal(roomGcDays(''), 7);
  assert.equal(roomGcDays('30'), 30);
  assert.equal(roomGcDays('0'), 7);
  assert.equal(roomGcDays('-5'), 7);
  assert.equal(roomGcDays('abc'), 7);
  assert.equal(roomGcDays('3.9'), 3);
});

test('shouldGcRoom rejects rooms in cleanup queue/processing', () => {
  const old = new Date(now - 30 * DAY).toISOString();
  assert.equal(shouldGcRoom({ cleanup_status: 'queued', created_at: old }, { days: 7, now }), false);
  assert.equal(shouldGcRoom({ cleanup_status: 'processing', created_at: old }, { days: 7, now }), false);
  assert.equal(shouldGcRoom({ cleanup_status: null, created_at: old }, { days: 7, now }), true);
  assert.equal(shouldGcRoom({ cleanup_status: 'done', created_at: old }, { days: 7, now }), true);
});

test('shouldGcRoom requires a room older than N days', () => {
  assert.equal(shouldGcRoom({ cleanup_status: null, created_at: new Date(now - 6 * DAY).toISOString() }, { days: 7, now }), false);
  assert.equal(shouldGcRoom({ cleanup_status: null, created_at: new Date(now - 8 * DAY).toISOString() }, { days: 7, now }), true);
});

test('shouldGcRoom ignores missing or invalid rows', () => {
  assert.equal(shouldGcRoom(null, { days: 7, now }), false);
  assert.equal(shouldGcRoom(undefined, { days: 7, now }), false);
  assert.equal(shouldGcRoom({ cleanup_status: null, created_at: 'не дата' }, { days: 7, now }), false);
});

test('storage.remove does not throw when the file is missing', async () => {
  await assert.doesNotReject(() => remove('gc-test/missing-file.png'));
});

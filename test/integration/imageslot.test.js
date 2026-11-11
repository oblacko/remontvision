import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { withGlobalImageSlot } from '../../src/imageslot.js';
import { withImageSlot } from '../../src/openrouter.js';
import { IMAGE_SLOT_KEY } from '../../src/imageslot.js';

after(closeTestApp);

test('global image slot serializes concurrent callers', async () => {
  await createTestApp();
  let active = 0;
  let maxActive = 0;

  const run = () => withGlobalImageSlot(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 100));
    active -= 1;
  });

  await Promise.all([run(), run(), run()]);

  assert.equal(maxActive, 1);
});

test('a throwing image call is not retried outside the slot', async () => {
  await createTestApp();
  let calls = 0;
  await assert.rejects(
    withImageSlot(async () => { calls += 1; throw new Error('provider failed'); }),
    /provider failed/,
  );
  assert.equal(calls, 1);
});

test('slot acquisition has a bounded wait', async () => {
  await createTestApp();
  const { pool } = await import('../../src/db.js');
  const holder = await pool.connect();
  await holder.query('SELECT pg_advisory_lock($1)', [IMAGE_SLOT_KEY]);
  let called = 0;
  try {
    await assert.rejects(
      withGlobalImageSlot(async () => { called += 1; }, { timeoutMs: 200 }),
      error => error.code === 'SLOT_UNAVAILABLE',
    );
    assert.equal(called, 0);
  } finally {
    await holder.query('SELECT pg_advisory_unlock($1)', [IMAGE_SLOT_KEY]);
    holder.release();
  }
});

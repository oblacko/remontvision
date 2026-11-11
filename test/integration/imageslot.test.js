import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { withGlobalImageSlot } from '../../src/imageslot.js';

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

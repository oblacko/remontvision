import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../support/app.js';
import { api } from '../support/helpers.js';

test('test app boots and serves health', async t => {
  const app = await createTestApp();
  t.after(() => app.close());

  const res = await api(app.url, '/api/health');

  assert.equal(res.status, 200);
  assert.equal(res.json?.ok, true);
});

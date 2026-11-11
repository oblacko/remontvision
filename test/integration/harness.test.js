import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api } from '../support/helpers.js';

after(closeTestApp);

test('test app boots and serves health', async () => {
  const app = await createTestApp();

  const res = await api(app.url, '/api/health');

  assert.equal(res.status, 200);
  assert.equal(res.json?.ok, true);
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api } from '../support/helpers.js';

after(closeTestApp);

const ADMIN = { 'x-admin-key': 'test-admin-key' };

test('admin settings require the admin key', async () => {
  const app = await createTestApp();
  for (const path of ['/api/admin/settings/render', '/api/admin/settings/cleanup', '/api/admin/settings/prompt', '/api/admin/settings/room-types']) {
    assert.equal((await api(app.url, path)).status, 403, path);
  }
  assert.equal((await api(app.url, '/api/admin/settings/render', { headers: ADMIN })).status, 200);
});

test('render settings save and reset', async () => {
  const app = await createTestApp();
  const initial = await api(app.url, '/api/admin/settings/render', { headers: ADMIN });
  assert.equal(initial.status, 200);
  assert.equal(initial.json.config.image_min_gap_ms, 0);

  try {
    const saved = await api(app.url, '/api/admin/settings/render', {
      method: 'PUT',
      headers: ADMIN,
      body: { config: { image_min_gap_ms: 5000 } },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.config.image_min_gap_ms, 5000);
    assert.equal((await api(app.url, '/api/admin/settings/render', { headers: ADMIN })).json.config.image_min_gap_ms, 5000);
  } finally {
    const reset = await api(app.url, '/api/admin/settings/render/reset', { method: 'POST', headers: ADMIN });
    assert.equal(reset.status, 200);
    assert.equal(reset.json.config.image_min_gap_ms, 0);
  }
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser, seedRoom } from '../support/helpers.js';
import { pool } from '../../src/db.js';

after(closeTestApp);

const ADMIN = { 'x-admin-key': 'test-admin-key' };

test('admin metrics expose per-model p50/p95 duration', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const room = await seedRoom({ userId: user.id, status: 'done' });

  // 5 завершённых рендеров одной модели с известной длительностью [100..500].
  for (const ms of [100, 200, 300, 400, 500]) {
    await pool.query(
      `INSERT INTO renders (id, room_id, status, model, duration_ms, created_at, finished_at)
       VALUES ($1, $2, 'done', 'm-a', $3, now(), now())`,
      [crypto.randomUUID(), room.id, ms],
    );
  }

  const res = await api(app.url, '/api/admin/metrics?days=30', { headers: ADMIN });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.model_latency), 'model_latency — массив');
  const m = res.json.model_latency.find(row => row.model === 'm-a');
  assert.ok(m, 'модель m-a есть в model_latency');
  assert.equal(m.p50, 300);
  assert.equal(m.p95, 480);
});

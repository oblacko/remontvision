import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api } from '../support/helpers.js';

after(closeTestApp);

// Эндпоинт курируемой галереи для блока лендинга (REM-56). Читающий, без приватных полей.
test('gallery/featured returns items and 6 room links with server-computed slugs', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/api/gallery/featured');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.items), 'items — массив');
  // Список курируемых id пуст до подтверждения G3 — items должен быть пуст.
  assert.deepEqual(res.json.items, []);
  assert.deepEqual(res.json.rooms, [
    { name: 'Спальня', slug: 'spalnya' },
    { name: 'Гостиная', slug: 'gostinaya-zal' },
    { name: 'Кухня', slug: 'kuhnya' },
    { name: 'Кабинет', slug: 'kabinet' },
    { name: 'Санузел', slug: 'sanuzel' },
    { name: 'Детская', slug: 'detskaya' },
  ]);
});

test('gallery/featured does not leak private fields', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/api/gallery/featured');
  assert.equal(res.status, 200);
  const raw = JSON.stringify(res.json);
  assert.ok(!raw.includes('photo_path'));
  assert.ok(!raw.includes('user_id'));
  assert.ok(!raw.includes('prompt'));
});

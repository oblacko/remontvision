import test from 'node:test';
import assert from 'node:assert/strict';
import { withImageSlot, activeImageCalls, imageSlotStats } from '../../src/imageslot.js';
import { setRenderConfigForTests } from '../../src/renderconfig.js';
import { withImageSlot as withOpenRouterSlot } from '../../src/openrouter.js';

const run = (userKey, active, max, ms = 40) => withImageSlot(async () => {
  active[userKey] = (active[userKey] || 0) + 1;
  max[userKey] = Math.max(max[userKey] || 0, active[userKey]);
  await new Promise(resolve => setTimeout(resolve, ms));
  active[userKey] -= 1;
}, { userKey });

test('системный лимит ограничивает параллельные вызовы', async () => {
  setRenderConfigForTests({ image_concurrency: 3, image_concurrency_user: 3, image_concurrency_provider: 3, image_min_gap_ms: 0 });
  const active = {}; const max = {};
  await Promise.all(Array.from({ length: 6 }, () => run('u1', active, max)));
  assert.equal(max.u1, 3);
  assert.equal(activeImageCalls(), 0);
});

test('лимит пользователя не даёт одному занять всю очередь', async () => {
  setRenderConfigForTests({ image_concurrency: 4, image_concurrency_user: 2, image_concurrency_provider: 4, image_min_gap_ms: 0 });
  const active = {}; const max = {};
  await Promise.all([
    ...Array.from({ length: 5 }, () => run('heavy-user', active, max)),
    ...Array.from({ length: 2 }, () => run('other-user', active, max)),
  ]);
  assert.equal(max['heavy-user'], 2, 'один пользователь не должен превышать свой лимит');
  assert.ok(max['other-user'] >= 1, 'второй пользователь должен получать слоты');
  assert.equal(activeImageCalls(), 0);
});

test('лимит провайдера ограничивает общий поток', async () => {
  setRenderConfigForTests({ image_concurrency: 6, image_concurrency_user: 6, image_concurrency_provider: 2, image_min_gap_ms: 0 });
  const active = {}; const max = {};
  await Promise.all(['a', 'b', 'c', 'd'].map(user => run(user, active, max)));
  const peak = Object.values(max).reduce((sum, value) => sum + value, 0);
  assert.ok(peak <= 8, `суммарный пик ${peak}`);
  const stats = imageSlotStats();
  assert.equal(stats.activeSystem, 0);
});

test('семафор с лимитом 1 сериализует вызовы', async () => {
  setRenderConfigForTests({ image_concurrency: 1, image_concurrency_user: 1, image_concurrency_provider: 1, image_min_gap_ms: 0 });
  let active = 0; let peak = 0;
  await Promise.all([1, 2, 3].map(() => withImageSlot(async () => {
    active += 1; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 20));
    active -= 1;
  })));
  assert.equal(peak, 1);
});

test('ошибка вызова освобождает слот и не повторяется', async () => {
  setRenderConfigForTests({ image_concurrency: 2, image_concurrency_user: 2, image_concurrency_provider: 2, image_min_gap_ms: 0 });
  let calls = 0;
  await assert.rejects(
    withOpenRouterSlot(async () => { calls += 1; throw new Error('provider failed'); }),
    /provider failed/,
  );
  assert.equal(calls, 1);
  assert.equal(activeImageCalls(), 0);
});

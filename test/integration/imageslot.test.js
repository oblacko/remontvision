import test from 'node:test';
import assert from 'node:assert/strict';
import { withImageSlot, activeImageCalls } from '../../src/imageslot.js';
import { setRenderConfigForTests } from '../../src/renderconfig.js';
import { withImageSlot as withOpenRouterSlot } from '../../src/openrouter.js';

// Раньше здесь проверялась глобальная сериализация через advisory-lock.
// Теперь семафор ограничивает число одновременных вызовов: варианты одного
// пакета должны стартовать параллельно, пока не достигнут лимита.
test('image slot runs up to the configured concurrency in parallel', async () => {
  setRenderConfigForTests({ image_concurrency: 3, image_min_gap_ms: 0 });
  let active = 0;
  let maxActive = 0;
  const run = () => withImageSlot(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 80));
    active -= 1;
  });

  await Promise.all([run(), run(), run(), run(), run(), run()]);

  assert.equal(maxActive, 3, `ожидали 3 одновременных вызова, было ${maxActive}`);
  assert.equal(activeImageCalls(), 0);
});

test('image slot with concurrency 1 serializes callers', async () => {
  setRenderConfigForTests({ image_concurrency: 1, image_min_gap_ms: 0 });
  let active = 0;
  let maxActive = 0;
  const run = () => withImageSlot(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 30));
    active -= 1;
  });

  await Promise.all([run(), run(), run()]);

  assert.equal(maxActive, 1);
});

test('a throwing image call is released and not retried by the slot', async () => {
  setRenderConfigForTests({ image_concurrency: 2, image_min_gap_ms: 0 });
  let calls = 0;
  await assert.rejects(
    withOpenRouterSlot(async () => { calls += 1; throw new Error('provider failed'); }),
    /provider failed/,
  );
  assert.equal(calls, 1);
  assert.equal(activeImageCalls(), 0);
});

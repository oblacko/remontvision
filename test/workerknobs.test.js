import test from 'node:test';
import assert from 'node:assert/strict';
import { workerConcurrency } from '../src/workerknobs.js';

test('worker concurrency defaults to 100 (процесс держит ~100 одновременных рендеров)', () => {
  assert.equal(workerConcurrency(undefined), 100);
  assert.equal(workerConcurrency(''), 100);
});

test('worker concurrency clamps between 1 and 500', () => {
  assert.equal(workerConcurrency('0'), 1);
  assert.equal(workerConcurrency('1'), 1);
  assert.equal(workerConcurrency('4'), 4);
  assert.equal(workerConcurrency('99'), 99);
  assert.equal(workerConcurrency('999'), 500);
  assert.equal(workerConcurrency('abc'), 100);
  assert.equal(workerConcurrency('2.7'), 2);
});

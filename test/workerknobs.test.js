import test from 'node:test';
import assert from 'node:assert/strict';
import { workerConcurrency } from '../src/workerknobs.js';

test('worker concurrency defaults to 6 (пакет из 5 не ждёт)', () => {
  assert.equal(workerConcurrency(undefined), 6);
  assert.equal(workerConcurrency(''), 6);
});

test('worker concurrency clamps between 1 and 8', () => {
  assert.equal(workerConcurrency('0'), 1);
  assert.equal(workerConcurrency('1'), 1);
  assert.equal(workerConcurrency('4'), 4);
  assert.equal(workerConcurrency('99'), 8);
  assert.equal(workerConcurrency('abc'), 6);
  assert.equal(workerConcurrency('2.7'), 2);
});

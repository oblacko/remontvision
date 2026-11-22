import test from 'node:test';
import assert from 'node:assert/strict';
import { workerConcurrency, workerTickMs, shellWaitTimeoutMs } from '../src/workerknobs.js';

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

test('worker tick defaults to 500 ms (быстрее холодного старта задачи, чуть больше опросов Postgres)', () => {
  assert.equal(workerTickMs(undefined), 500);
  assert.equal(workerTickMs(''), 500);
  assert.equal(workerTickMs('abc'), 500);
});

test('worker tick clamps between 100 and 5000', () => {
  assert.equal(workerTickMs('50'), 100);
  assert.equal(workerTickMs('100'), 100);
  assert.equal(workerTickMs('750'), 750);
  assert.equal(workerTickMs('5000'), 5000);
  assert.equal(workerTickMs('7000'), 5000);
  assert.equal(workerTickMs('1.9'), 100);
});

test('shell wait defaults to 30 s (раньше холостые 3 минуты поллинга)', () => {
  assert.equal(shellWaitTimeoutMs(undefined), 30_000);
  assert.equal(shellWaitTimeoutMs(''), 30_000);
  assert.equal(shellWaitTimeoutMs('abc'), 30_000);
});

test('shell wait clamps between 0 and 300 s', () => {
  assert.equal(shellWaitTimeoutMs('-1'), 0);
  assert.equal(shellWaitTimeoutMs('0'), 0);
  assert.equal(shellWaitTimeoutMs('45000'), 45_000);
  assert.equal(shellWaitTimeoutMs('300000'), 300_000);
  assert.equal(shellWaitTimeoutMs('600000'), 300_000);
  assert.equal(shellWaitTimeoutMs('1.9'), 1);
});

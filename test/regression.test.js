import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// CI-гейт: промт-регрессия должна совпадать с baseline (без платных вызовов).
test('20 prompt configurations match the committed baseline', () => {
  const out = execFileSync(process.execPath, ['scripts/regression-prompts.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.match(out, /OK: 20\/20 промтов совпали с baseline/);
});

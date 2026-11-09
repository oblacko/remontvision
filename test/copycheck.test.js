import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCopyViolations } from '../scripts/check-copy.mjs';

test('detects forbidden «генераци» in a string', () => {
  const v = findCopyViolations([{ path: 'web/src/pages/Home.tsx', content: "const t = 'одна генерация за 399 ₽'" }]);
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'web/src/pages/Home.tsx');
  assert.equal(v[0].word, 'генерация');
});

test('detects forbidden «реальные товары»', () => {
  const v = findCopyViolations([{ path: 'web/index.html', content: '<meta content="реальные товары и смета" />' }]);
  assert.ok(v.some((x) => x.word.includes('реальные товары')));
});

test('bans «смета» in user text', () => {
  const v = findCopyViolations([{ path: 'web/src/pages/Home.tsx', content: 'Получите смету, RAL и электрику' }]);
  assert.equal(v.length, 1);
});

test('allows «смета» negation in offer.html', () => {
  const v = findCopyViolations([{ path: 'public/offer.html', content: 'Сервис не составляет смету; стоимость — ориентир' }]);
  assert.equal(v.length, 0);
});

test('allows «смета» with a demo label', () => {
  const v = findCopyViolations([{ path: 'web/src/pages/Home.tsx', content: 'Демонстрационный пример: смета 98 900 ₽' }]);
  assert.equal(v.length, 0);
});

test('ignores // and /* */ comments in ts/tsx', () => {
  const v = findCopyViolations([
    { path: 'web/src/x.ts', content: '// генерация — внутреннее\nconst ok = 1' },
    { path: 'web/src/y.tsx', content: '/* генерация и смета */\nexport const y = 1' },
  ]);
  assert.equal(v.length, 0);
});

test('does not hide strings behind a URL containing //', () => {
  const v = findCopyViolations([
    { path: 'web/src/z.tsx', content: "const url = 'https://example.com'; const t = 'генерация'" },
  ]);
  assert.equal(v.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';

const { parseSizeCm, fitLayoutPlan } = await import('../src/layoutfit.js');
const { layoutPlanToText } = await import('../src/layoutagent.js');

const plan = () => ({
  strategy: 'диван вдоль стены',
  items: [
    { type: 'sofa', label: 'Диван 200', size_cm: '200x90' },
    { type: 'storage', label: 'Тумба 120', size_cm: '120x40' },
    { type: 'coffee_table', label: 'Журнальный стол', size_cm: '60x60' },
    { type: 'rug', label: 'Ковёр', size_cm: '200x140' },
  ],
  circulation: 'между журнальным столиком и тумбой 70 см',
  zones: [{ name: 'Зона отдыха', purpose: 'отдых у журнального столика', position: 'у дивана' }],
  avoid: [],
});

test('parseSizeCm reads size strings', () => {
  assert.deepEqual(parseSizeCm('200x90'), { width: 200, depth: 90, raw: [200, 90] });
  assert.deepEqual(parseSizeCm('60 × 40'), { width: 60, depth: 40, raw: [60, 40] });
  assert.equal(parseSizeCm('нет данных'), null);
});

test('narrow living room drops the central coffee table before the prompt', () => {
  const result = fitLayoutPlan({ plan: plan(), dimensions: { width: 2.9, length: 3.9 }, roomType: 'Гостиная (зал)' });

  assert.equal(result.fit.accepted, true);
  assert.ok(!result.plan.items.some(item => item.type === 'coffee_table'));
  assert.match(result.plan.constraints.join(' '), /compact side table/i);
  const text = layoutPlanToText(result.plan);
  assert.doesNotMatch(text, /Журнальный стол/);
  assert.doesNotMatch(text, /журнальн[а-яё]*\s+столик/i);
  assert.match(text, /Hard furniture limits/);
});

test('wide living room keeps a coffee table that fits', () => {
  const result = fitLayoutPlan({ plan: plan(), dimensions: { width: 4.2, length: 5 }, roomType: 'Гостиная (зал)' });

  assert.equal(result.fit.accepted, true);
  assert.ok(result.plan.items.some(item => item.type === 'coffee_table'));
  assert.equal(result.dropped.length, 0);
});

test('too narrow room drops central and storage, then reports whether it fits', () => {
  const result = fitLayoutPlan({ plan: plan(), dimensions: { width: 1.8, length: 3 }, roomType: 'Гостиная (зал)' });

  assert.ok(!result.plan.items.some(item => item.type === 'coffee_table'));
  assert.ok(!result.plan.items.some(item => item.type === 'storage'));
  assert.equal(result.fit.neededCm, 150);
  assert.equal(result.fit.accepted, true);
});

test('no dimensions leaves the plan untouched', () => {
  const source = plan();
  const result = fitLayoutPlan({ plan: source, dimensions: null, roomType: 'Гостиная (зал)' });
  assert.equal(result.fit, null);
  assert.equal(result.plan.items.length, source.items.length);
});

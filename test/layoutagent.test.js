import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeLayoutPlan } = await import('../src/agentcontracts.js');
const { composeLayoutPrompt, layoutPlanToText } = await import('../src/layoutagent.js');

test('layout plan keeps items, zones and circulation', () => {
  const plan = normalizeLayoutPlan({
    strategy: 'Рабочая зона у окна + lounge у стеллажа',
    zones: [{ name: 'Работа', purpose: 'стол у окна', position: 'у окна' }],
    items: [
      { type: 'desk', label: 'Стол 140 см', position: 'перпендикулярно окну', size_cm: '140x70' },
      { type: 'armchair', label: 'Кресло для чтения', position: 'у стеллажа' },
    ],
    circulation: 'проход 90 см от двери',
    focal_point: 'стеллаж-перегородка',
    avoid: ['стол в центре комнаты'],
  });
  assert.equal(plan.strategy, 'Рабочая зона у окна + lounge у стеллажа');
  assert.equal(plan.zones.length, 1);
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].type, 'desk');
  assert.equal(plan.circulation, 'проход 90 см от двери');
  assert.deepEqual(plan.avoid, ['стол в центре комнаты']);
});

test('layout plan rejects empty or non-object input', () => {
  assert.equal(normalizeLayoutPlan(null), null);
  assert.equal(normalizeLayoutPlan({}), null);
  assert.equal(normalizeLayoutPlan({ items: [] }), null);
  assert.equal(normalizeLayoutPlan({ items: [{ label: 'без типа' }] }), null);
});

test('layout prompt asks for a non-template layout for the room', () => {
  const out = composeLayoutPrompt({
    roomType: 'Кабинет',
    dimensions: { width: 3, length: 4, height: 2.7 },
    style: 'Неоклассика',
    concept: 'accent_block',
  });
  assert.match(out.system, /планиров/i);
  assert.match(out.user, /Кабинет/);
  assert.match(out.user, /Неоклассика/);
  assert.match(out.user, /3 × 4 × 2.7/);
  assert.match(out.user, /не шаблон|минимум/i);
});

test('layout text renders zones, items and circulation', () => {
  const text = layoutPlanToText({
    strategy: 'Рабочая зона у окна',
    zones: [{ name: 'Работа', purpose: 'стол', position: 'у окна' }],
    items: [{ type: 'desk', label: 'Стол 140 см', position: 'у окна', size_cm: '140x70' }],
    circulation: '90 см',
    focal_point: 'стеллаж',
    avoid: ['стол в центре'],
  });
  assert.match(text, /Рабочая зона у окна/);
  assert.match(text, /Стол 140 см/);
  assert.match(text, /у окна/);
  assert.match(text, /90 см/);
  assert.match(text, /стеллаж/);
  assert.match(text, /Стол 140 см/);
});

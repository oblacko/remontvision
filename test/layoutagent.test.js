import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeLayoutPlan } = await import('../src/agentcontracts.js');
const { composeLayoutPrompt, layoutPlanToText, normalizeLayoutPlanV2 } = await import('../src/layoutagent.js');

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
  assert.match(out.user, /ширина 300 см/);
  assert.match(out.user, /длина 400 см/);
  assert.match(out.user, /высота 270 см/);
  assert.match(out.system, /минимум|один основной вариант/i);
});

test('layout prompt does not ask for centimetre coordinates', () => {
  const out = composeLayoutPrompt({ roomType: 'Кабинет', dimensions: { width: 3, length: 4, height: 2.7 } });
  assert.doesNotMatch(out.system, /x_cm|y_cm/);
  assert.match(out.system, /position.*текст/i);
});

test('layout text contains no x/y coordinates', () => {
  const text = layoutPlanToText({
    items: [{ type: 'sofa', label: 'Диван', position: 'у стены', x_cm: 40, y_cm: 50, rotation_deg: 90 }],
  });
  assert.match(text, /Диван/);
  assert.doesNotMatch(text, /@ \(/);
});

test('previous layout strategies are capped at five', () => {
  const out = composeLayoutPrompt({
    roomType: 'Гостиная (зал)',
    usedStrategies: Array.from({ length: 9 }, (_, i) => `strategy-${i}`),
  });
  assert.doesNotMatch(out.user, /strategy-0/);
  assert.match(out.user, /strategy-8/);
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


test('v2 planner result is converted to the legacy layout shape', () => {
  const plan = normalizeLayoutPlanV2({
    status: 'proposed',
    strategy: 'Диван вдоль левой стены, ТВ-тумба напротив',
    plan: { width_cm: 290, depth_cm: 390 },
    zones: [{ id: 'zone_1', name: 'Отдых', purpose: 'ТВ', position: 'левая стена' }],
    items: [
      { id: 'item_1', type: 'sofa', label: 'Диван 200', position: 'у левой стены', x_cm: 0, y_cm: 140, width_cm: 200, depth_cm: 85, rotation_deg: 90, priority: 1 },
      { id: 'item_2', type: 'sideboard', label: 'Тумба 150', position: 'у правой стены', x_cm: 250, y_cm: 170, width_cm: 150, depth_cm: 35, rotation_deg: 90, priority: 1 },
    ],
    circulation: { description: 'проход 90 см', routes: [], temporary_conflicts: [], compromises: [] },
    validation: { result: 'passed', checks: [], conflicts: [], unverified: ['положение розеток'] },
  });

  assert.equal(plan.status, 'proposed');
  assert.equal(plan.zones.length, 1);
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].size_cm, '200x85');
  assert.equal(plan.items[0].rotation_deg, 90);
  assert.equal(plan.circulation, 'проход 90 см');
  assert.deepEqual(plan.constraints, ['положение розеток']);
});

test('v2 planner needs_input keeps questions and does not invent items', () => {
  const plan = normalizeLayoutPlanV2({
    status: 'needs_input',
    strategy: 'Не хватает плана',
    missing_inputs: ['положение двери'],
    questions: ['Где дверь?'],
    validation: { result: 'not_checked', checks: [] },
  });

  assert.equal(plan.status, 'needs_input');
  assert.equal(plan.items.length, 0);
  assert.deepEqual(plan.questions, ['Где дверь?']);
});

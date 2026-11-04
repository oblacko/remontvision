import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeArchitect, reviewDesign, ARCHITECT_CATEGORIES } = await import('../src/architect.js');

test('normalizeArchitect keeps valid items and drops unknown categories', () => {
  const out = normalizeArchitect({
    items: [
      { label: 'Диван', category: 'sofa', bbox: [0.1, 0.2, 0.3, 0.4], confidence: 0.9 },
      { label: 'Летающая тарелка', category: 'ufo' },
      { label: 'Ковёр', category: 'rug', bbox: [2, -1, 0, 5] },
    ],
  });
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].category, 'sofa');
  assert.deepEqual(out.items[0].bbox, [0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual(out.items[1].bbox, [1, 0, 0.01, 1]);
  assert.equal(out.items[0].visibility, 'seen');
  assert.ok(ARCHITECT_CATEGORIES.includes('sofa'));
});

test('normalizeArchitect validates palette, hints and limits their count', () => {
  const out = normalizeArchitect({
    palette: [
      { name: 'Тёплый белый', hex: '#f5f2ec', where: 'стены' },
      { name: 'Плохой', hex: 'not-a-color' },
    ],
    hints: Array.from({ length: 9 }, (_, i) => ({ target: 'walls', action: `действие ${i}`, priority: 'high' })),
  });
  assert.deepEqual(out.palette, [{ name: 'Тёплый белый', hex: '#F5F2EC', where: 'стены' }]);
  assert.equal(out.hints.length, 6);
  assert.equal(out.hints[0].priority, 'high');
});

test('normalizeArchitect sorts editable layers by impact and keeps only valid keys', () => {
  const out = normalizeArchitect({
    layers: [
      { key: 'textile', label: 'Текстиль', impact: 0.3, actions: [{ action: 'Заменить шторы' }] },
      { key: 'walls', label: 'Стены', impact: 0.9, actions: [{ target: 'walls', action: 'Покрасить в тёплый белый', why: 'Больше света' }] },
      { key: 'ufo', label: 'НЛО', impact: 1 },
    ],
  });
  assert.equal(out.layers.length, 2);
  assert.equal(out.layers[0].key, 'walls');
  assert.equal(out.layers[0].impact, 0.9);
  assert.equal(out.layers[0].actions[0].action, 'Покрасить в тёплый белый');
  assert.equal(out.layers[1].key, 'textile');
});

test('reviewDesign returns parsed-compatible data sorted by visible area', async () => {
  const vision = async () => ({
    parsed: {
      items: [
        { label: 'Люстра', category: 'light', bbox: [0.4, 0, 0.1, 0.1] },
        { label: 'Диван', category: 'sofa', bbox: [0.1, 0.4, 0.7, 0.4] },
      ],
      surfaces: [{ surface: 'walls', hex: '#ffffff', description: 'Белые стены' }],
      hints: [{ target: 'light', action: 'Заменить люстру на подвес' }],
    },
    cost: 0.001,
  });
  const out = await reviewDesign({ imageDataUrl: 'data:image/jpeg;base64,X', vision });
  assert.ok(out);
  assert.equal(out.architect.items.length, 2);
  assert.equal(out.parsed.visible[0].label, 'Диван');
  assert.equal(out.parsed.visible[1].label, 'Люстра');
  assert.equal(out.cost, 0.001);
});

test('reviewDesign falls back to the vision model when the first answer is empty', async () => {
  const calls = [];
  const vision = async ({ model }) => {
    calls.push(model);
    if (calls.length === 1) return { parsed: {}, cost: 0.001 };
    return { parsed: { items: [{ label: 'Кресло', category: 'armchair' }] }, cost: 0.002 };
  };
  const out = await reviewDesign({ imageDataUrl: 'data:image/jpeg;base64,X', vision });
  assert.equal(calls.length, 2);
  assert.equal(calls[1], null);
  assert.equal(out.architect.items.length, 1);
  assert.equal(out.cost, 0.003);
});

test('reviewDesign returns null for a completely empty review', async () => {
  const out = await reviewDesign({
    imageDataUrl: 'data:image/jpeg;base64,X',
    vision: async () => ({ parsed: {}, cost: null }),
  });
  assert.equal(out, null);
});

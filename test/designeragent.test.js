import test from 'node:test';
import assert from 'node:assert/strict';

const { composeDirectionPrompt, normalizeDirectionResult } = await import('../src/designeragent.js');

test('direction prompt carries style, concept, compatibility and anti-repeat history', () => {
  const out = composeDirectionPrompt({
    styleId: 'neoclassic',
    conceptId: 'accent_block',
    roomType: 'Кухня',
    dimensions: { width: 3, length: 4, height: 2.7 },
    usedDirections: [{ main_move: 'тёмный блок на стене', focal_zone: 'wall' }],
  });
  assert.equal(out.compatibility, 'ok');
  assert.match(out.system, /DesignDirection/);
  assert.match(out.user, /Неоклассика/);
  assert.match(out.user, /Акцентный блок/);
  assert.match(out.user, /Кухня/);
  assert.match(out.user, /3 × 4 × 2.7/);
  assert.match(out.user, /тёмный блок на стене/);
});

test('direction prompt marks a weakened pair', () => {
  const out = composeDirectionPrompt({ styleId: 'dark_contemporary', conceptId: 'accent_block', roomType: 'Спальня' });
  assert.equal(out.compatibility, 'weaken');
  assert.match(out.user, /ослабленн/i);
});

test('direction result maps to art-direction fields', () => {
  const out = normalizeDirectionResult({
    style_id: 'neoclassic',
    concept_id: 'accent_block',
    compatibility: 'ok',
    concept: 'Светлая кухня с тёмно-синим блоком',
    main_move: { target: 'нижние фасады', action: 'глубокий синий', effect: 'основная масса' },
    palette_hex: { base: '#F2EDE4', support: '#D6CCBA', dark: '#9A8F7D', accent: '#1F3A5F' },
    focal_point: 'кухонный остров',
    focal_zone: 'center',
    quiet_areas: ['верх стен', 'потолок'],
    materials_story: ['паркет ёлочкой', 'латунь'],
    prompt_en: 'modern classic kitchen with navy lower cabinets',
    avoid: ['второй насыщенный цвет'],
  }, { styleId: 'neoclassic', conceptId: 'accent_block', compatibility: 'ok', cost: 0.001 });
  assert.equal(out.text, 'modern classic kitchen with navy lower cabinets');
  assert.equal(out.focalPoint, 'кухонный остров');
  assert.equal(out.materials, 'паркет ёлочкой, латунь');
  assert.equal(out.palette.length, 4);
  assert.equal(out.palette[0].hex, '#F2EDE4');
  assert.equal(out.conceptId, 'accent_block');
  assert.equal(out.focalZone, 'center');
  assert.deepEqual(out.quietAreas, ['верх стен', 'потолок']);
  assert.equal(out.cost, 0.001);
});

test('direction result without prompt falls back to empty text', () => {
  const out = normalizeDirectionResult({ main_move: { action: 'x' } }, { styleId: 'loft', conceptId: 'heavy_light' });
  assert.equal(out.text, '');
  assert.equal(out.compatibility, 'ok');
});

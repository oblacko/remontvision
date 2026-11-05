import test from 'node:test';
import assert from 'node:assert/strict';

const { validateRepairScope, validateChanges, validateSearchResult, validateDesignDirection } = await import('../src/agentcontracts.js');

test('repair scope rejects a door without clear visibility', () => {
  const scope = validateRepairScope({
    floor: { action: 'replace', why: 'старый пол' },
    doors: { action: 'replace', visible: false, why: 'дверь видна частично' },
    windows: { action: 'paint', visible: true, why: 'деревянные рамы и подоконник' },
    storage: ['шкаф'],
    style_dir: 'скандинавский',
  });
  assert.equal(scope.doors, null);
  assert.equal(scope.windows.action, 'paint');
  assert.equal(scope.storage[0], 'шкаф');
});

test('repair scope drops unknown actions and bad impact in changes', () => {
  assert.equal(validateRepairScope({ floor: { action: 'teleport', why: 'x' } }).floor, null);
  assert.deepEqual(validateChanges({ changes: [{
    layer: 'walls', label: 'Стены', current: 'обои', change: 'покрасить', impact: 2, effort: 'low', target: 'walls',
  }] }), []);
});

test('design direction normalizes valid fields', () => {
  const out = validateDesignDirection({
    style_id: 'neoclassic',
    concept_id: 'accent_block',
    compatibility: 'weaken',
    main_move: { target: 'нижние фасады', action: 'глубокий синий #1F3A5F', effect: 'основная цветовая масса' },
    palette_hex: { base: '#F2EDE4', support: 'red', dark: '#9A8F7D', accent: '#1F3A5F' },
    focal_point: 'кухонный остров',
    focal_zone: 'center',
    quiet_areas: ['верх стен', 'потолок'],
    materials_story: ['паркет ёлочкой', 'латунь'],
    prompt_en: 'modern classic kitchen, deep navy lower cabinets',
    novelty_class: 'balance',
    avoid: ['второй насыщенный цвет'],
  });
  assert.equal(out.style_id, 'neoclassic');
  assert.equal(out.compatibility, 'weaken');
  assert.equal(out.main_move.action, 'глубокий синий #1F3A5F');
  assert.equal(out.palette_hex.base, '#F2EDE4');
  assert.equal(out.palette_hex.support, undefined);
  assert.equal(out.palette_hex.accent, '#1F3A5F');
  assert.equal(out.focal_zone, 'center');
  assert.deepEqual(out.quiet_areas, ['верх стен', 'потолок']);
  assert.match(out.prompt_en, /navy/);
});

test('design direction repairs invalid enums and rejects non-objects', () => {
  const out = validateDesignDirection({ compatibility: 'conflict', focal_zone: 'mars', novelty_class: 'weird' });
  assert.equal(out.compatibility, 'ok');
  assert.equal(out.focal_zone, 'center');
  assert.equal(out.novelty_class, 'balance');
  assert.equal(validateDesignDirection(null), null);
});

test('search result keeps valid items and caps length', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ label: `Товар ${i}`, category: 'decor', offer_ids: ['1'] }));
  const out = validateSearchResult({ room: { type: 'Спальня' }, items });
  assert.equal(out.items.length, 20);
  assert.equal(out.room.type, 'Спальня');
});

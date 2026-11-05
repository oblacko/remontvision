import test from 'node:test';
import assert from 'node:assert/strict';

const { validateRepairScope, validateChanges, validateSearchResult } = await import('../src/agentcontracts.js');

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

test('search result keeps valid items and caps length', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ label: `Товар ${i}`, category: 'decor', offer_ids: ['1'] }));
  const out = validateSearchResult({ room: { type: 'Спальня' }, items });
  assert.equal(out.items.length, 20);
  assert.equal(out.room.type, 'Спальня');
});

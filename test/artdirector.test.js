import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeRoomDimensions, normalizeLens, normalizeRepairScope } = await import('../src/artdirector.js');

test('normalizeRoomDimensions validates and rounds architect estimates', () => {
  assert.deepEqual(normalizeRoomDimensions({ width_m: 2.84, length_m: 4.16, height_m: 2.61, confidence: 'high' }), {
    width: 2.8,
    length: 4.2,
    height: 2.6,
    confidence: 'high',
  });
  assert.equal(normalizeRoomDimensions({ width_m: 0, length_m: 4, height_m: 2.6 }), null);
  assert.equal(normalizeRoomDimensions({ width_m: 3, length_m: 4, height_m: 12 }), null);
  assert.equal(normalizeRoomDimensions(null), null);
});

test('normalizeLens keeps focal length, type, distortion and correction', () => {
  assert.deepEqual(normalizeLens({
    focal_length_mm: 18.4,
    type: 'wide',
    distortion: 'strong',
    correction: 'Ближний план растянут, длина скорректирована на 0.4 м',
    confidence: 'medium',
  }), {
    focal_length_mm: 18,
    type: 'wide',
    distortion: 'strong',
    correction: 'Ближний план растянут, длина скорректирована на 0.4 м',
    confidence: 'medium',
  });
  assert.equal(normalizeLens({ type: 'fisheye', distortion: 'huge' }).type, null);
  assert.equal(normalizeLens(null), null);
});

test('normalizeRepairScope keeps null, keep and valid actions, drops unknown', () => {
  const out = normalizeRepairScope({
    floor: { action: 'replace', material: 'светлый дуб', why: 'старый ламинат' },
    ceiling: { action: 'keep', why: 'ровный' },
    walls: { action: 'tile', why: 'недопустимо' },
    doors: null,
    windows: { action: 'fill', why: 'откосы' },
    storage: ['шкаф в нише', 42, ''],
    style_dir: 'тёплый минимализм',
  });
  assert.equal(out.floor.action, 'replace');
  assert.equal(out.ceiling.action, 'keep');
  assert.equal(out.walls, null);
  assert.equal(out.doors, null);
  assert.equal(out.windows.action, 'fill');
  assert.deepEqual(out.storage, ['шкаф в нише', '42']);
  assert.equal(out.style_dir, 'тёплый минимализм');
});

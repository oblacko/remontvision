import test from 'node:test';
import assert from 'node:assert/strict';
import { roomAnalysisKey } from '../src/roomanalysis.js';

const base = {
  photoPath: 'uploads/room.jpg',
  shellPath: '',
  style: 'Скандинавский',
  conceptId: 'accent_block',
  keepFurniture: true,
  dimensions: { width: 3.2, length: 4.4, height: 2.7, bedLength: 2, orientation: 'окно слева' },
};

test('same inputs produce the same room analysis key', () => {
  assert.equal(roomAnalysisKey(base), roomAnalysisKey({ ...base }));
});

test('photo, style, concept, keepFurniture and dimensions invalidate the key', () => {
  const key = roomAnalysisKey(base);
  for (const patch of [
    { photoPath: 'uploads/other.jpg' },
    { shellPath: 'uploads/shell.jpg' },
    { style: 'Лофт' },
    { conceptId: 'warm_minimal' },
    { keepFurniture: false },
    { dimensions: { ...base.dimensions, width: 3.3 } },
    { dimensions: { ...base.dimensions, orientation: 'окно справа' } },
  ]) {
    assert.notEqual(roomAnalysisKey({ ...base, ...patch }), key, JSON.stringify(patch));
  }
});

test('dimension rounding and orientation case do not bust the key', () => {
  assert.equal(
    roomAnalysisKey(base),
    roomAnalysisKey({ ...base, dimensions: { ...base.dimensions, width: 3.24, orientation: ' ОКНО СЛЕВА ' } }),
  );
});

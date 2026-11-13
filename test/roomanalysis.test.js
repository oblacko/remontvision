import test from 'node:test';
import assert from 'node:assert/strict';
import { briefHash, factsKey, layoutKey, artDirectionKey, shouldCacheRoomAnalysis } from '../src/roomanalysis.js';

const base = {
  photoPath: 'uploads/room.jpg',
  shellPath: '',
  style: 'Скандинавский',
  conceptId: 'accent_block',
  keepFurniture: true,
  dimensions: { width: 3.2, length: 4.4, height: 2.7, bedLength: 2, orientation: 'окно слева' },
};
const brief = briefHash('2 пользователя; отдых и просмотр ТВ; обязательны диван, ТВ/медиа и хранение.');

test('facts/repair key depends only on photo and shell', () => {
  const key = factsKey({ photoPath: base.photoPath, shellPath: base.shellPath });
  assert.equal(key, factsKey({ photoPath: base.photoPath, shellPath: base.shellPath }));
  assert.notEqual(key, factsKey({ photoPath: 'uploads/other.jpg', shellPath: '' }));
  assert.notEqual(key, factsKey({ photoPath: base.photoPath, shellPath: 'uploads/shell.jpg' }));
});

test('layout key depends on room, dimensions, keepFurniture and brief, not on style', () => {
  const key = layoutKey({ roomId: 'r1', dimensions: base.dimensions, keepFurniture: false, briefHash: brief });
  assert.equal(key, layoutKey({ roomId: 'r1', dimensions: base.dimensions, keepFurniture: false, briefHash: brief }));
  for (const patch of [
    { roomId: 'r2' },
    { dimensions: { ...base.dimensions, width: 3.3 } },
    { keepFurniture: true },
    { briefHash: briefHash('другой бриф') },
  ]) {
    assert.notEqual(key, layoutKey({ roomId: 'r1', dimensions: base.dimensions, keepFurniture: false, briefHash: brief, ...patch }), JSON.stringify(patch));
  }
});

test('changing style hits repair/layout but misses art direction', () => {
  const factsA = factsKey({ photoPath: base.photoPath, shellPath: base.shellPath });
  const layoutA = layoutKey({ roomId: 'r1', dimensions: base.dimensions, keepFurniture: false, briefHash: brief });
  const artA = artDirectionKey({ ...base, briefHash: brief });

  // Смена стиля/концепта: repair и layout — те же ключи (хит), art — другой (промах).
  const factsB = factsKey({ photoPath: base.photoPath, shellPath: base.shellPath });
  const layoutB = layoutKey({ roomId: 'r1', dimensions: base.dimensions, keepFurniture: false, briefHash: brief });
  const artB = artDirectionKey({ ...base, style: 'Лофт', conceptId: 'warm_minimal', briefHash: brief });

  assert.equal(factsB, factsA);
  assert.equal(layoutB, layoutA);
  assert.notEqual(artB, artA);
});

test('art direction key invalidates on style, concept, photo, shell, keepFurniture and dimensions', () => {
  const key = artDirectionKey({ ...base, briefHash: brief });
  for (const patch of [
    { photoPath: 'uploads/other.jpg' },
    { shellPath: 'uploads/shell.jpg' },
    { style: 'Лофт' },
    { conceptId: 'warm_minimal' },
    { keepFurniture: false },
    { dimensions: { ...base.dimensions, width: 3.3 } },
  ]) {
    assert.notEqual(key, artDirectionKey({ ...base, briefHash: brief, ...patch }), JSON.stringify(patch));
  }
});

test('dimension rounding and orientation case do not bust the keys', () => {
  const dims = { ...base.dimensions, width: 3.24, orientation: ' ОКНО СЛЕВА ' };
  assert.equal(
    layoutKey({ roomId: 'r1', dimensions: base.dimensions, keepFurniture: false, briefHash: brief }),
    layoutKey({ roomId: 'r1', dimensions: dims, keepFurniture: false, briefHash: brief }),
  );
  assert.equal(
    artDirectionKey({ ...base, briefHash: brief }),
    artDirectionKey({ ...base, dimensions: dims, briefHash: brief }),
  );
});

test('briefHash is stable and empty brief maps to none', () => {
  assert.equal(briefHash('  Две   зоны, хранение  '), briefHash('Две зоны, хранение'));
  assert.equal(briefHash(''), 'none');
  assert.equal(briefHash(null), 'none');
  assert.notEqual(briefHash('диван и хранение'), briefHash('только хранение'));
});

test('only a complete, non-cached analysis is written to the cache', () => {
  assert.equal(shouldCacheRoomAnalysis({ cached: false, failed: false }), true);
  assert.equal(shouldCacheRoomAnalysis({ cached: true, failed: false }), false);
  assert.equal(shouldCacheRoomAnalysis({ cached: false, failed: true }), false);
});

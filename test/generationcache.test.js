import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionsKey, pickVariant, pickVariantByNovelty, directionCacheKey } from '../src/generationcache.js';

test('dimensionsKey matches the prompt rounding', () => {
  assert.equal(dimensionsKey(null), 'none');
  assert.equal(dimensionsKey({ width: 3.24, length: 4.26, height: 2.71 }), '3.2x4.3x2.7');
  assert.equal(dimensionsKey({ width: 3, length: null, height: 2.7 }), 'none');
});

test('pickVariant is stable for the same seed', () => {
  const variants = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickVariant(variants, 'render:42'), pickVariant(variants, 'render:42'));
  assert.ok(variants.includes(pickVariant(variants, 'render:42')));
  assert.equal(pickVariant([], 'x'), null);
});

test('pickVariantByNovelty avoids recent focal zones and moves', () => {
  const variants = [
    { id: 'a', focalZone: 'window', mainMove: { action: 'поставить диван у окна' } },
    { id: 'b', focalZone: 'wall', mainMove: { action: 'акцентная стена' } },
    { id: 'c', focalZone: 'center', mainMove: { action: 'круглый стол в центре' } },
  ];
  const used = [
    { focal_zone: 'window', main_move: 'поставить диван у окна' },
    { focal_zone: 'wall', main_move: 'акцентная стена' },
  ];
  assert.equal(pickVariantByNovelty(variants, 'render:42', used).id, 'c');
  assert.equal(pickVariantByNovelty(variants, 'render:42', []).id, pickVariant(variants, 'render:42').id);
});

test('directionCacheKey includes style, concept, room, exact dims and revision', () => {
  const key = directionCacheKey({
    styleId: 'scandinavian',
    conceptId: 'warm',
    roomType: 'Гостиная',
    dimensions: { width: 3.2, length: 4.1, height: 2.7 },
    promptVersion: '1.4',
  });
  assert.equal(key, 'scandinavian|warm|Гостиная|3.2x4.1x2.7|v1.4');
});

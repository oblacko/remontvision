import test from 'node:test';
import assert from 'node:assert/strict';
import { dimsBucket, pickVariant, directionCacheKey } from '../src/generationcache.js';

test('dimsBucket rounds to stable buckets', () => {
  assert.equal(dimsBucket(null), 'none');
  assert.equal(dimsBucket({ width: 3.24, length: 4.26, height: 2.71 }), '3.0x4.5x2.7');
  assert.equal(dimsBucket({ width: 3.3, length: 4.2, height: 2.7 }), '3.5x4.0x2.7');
  assert.equal(dimsBucket({ width: 3, length: null, height: 2.7 }), 'none');
});

test('pickVariant is stable for the same seed', () => {
  const variants = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickVariant(variants, 'render:42'), pickVariant(variants, 'render:42'));
  assert.ok(variants.includes(pickVariant(variants, 'render:42')));
  assert.equal(pickVariant([], 'x'), null);
});

test('directionCacheKey includes style, concept, room and bucket', () => {
  const key = directionCacheKey({
    styleId: 'scandinavian',
    conceptId: 'warm',
    roomType: 'Гостиная',
    dimensions: { width: 3.2, length: 4.1, height: 2.7 },
    promptVersion: 4,
  });
  assert.match(key, /^scandinavian\|warm\|Гостиная\|3\.0x4\.0x2\.7\|v4$/);
});

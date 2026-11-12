import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionsKey } from '../src/generationcache.js';

test('dimensionsKey matches the prompt rounding', () => {
  assert.equal(dimensionsKey(null), 'none');
  assert.equal(dimensionsKey({ width: 3.24, length: 4.26, height: 2.71 }), '3.2x4.3x2.7');
  assert.equal(dimensionsKey({ width: 3, length: null, height: 2.7 }), 'none');
});

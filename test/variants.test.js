import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVariantsCount, shouldMarkRoomError, pluralVariants, retryAllowed } from '../src/variants.js';

test('parseVariantsCount clamps 1..8', () => {
  assert.equal(parseVariantsCount(undefined), 1);
  assert.equal(parseVariantsCount('3'), 3);
  assert.equal(parseVariantsCount('20'), 8);
  assert.equal(parseVariantsCount('0'), 1);
  assert.equal(parseVariantsCount('abc'), 1);
});

test('shouldMarkRoomError keeps done room with failing sibling', () => {
  assert.equal(shouldMarkRoomError('done', true), false);
  assert.equal(shouldMarkRoomError('error', false), true);
  assert.equal(shouldMarkRoomError('queued', true), false);
  assert.equal(shouldMarkRoomError('queued', false), true);
});

test('pluralVariants picks Russian form', () => {
  assert.equal(pluralVariants(1), 'вариант');
  assert.equal(pluralVariants(3), 'варианта');
  assert.equal(pluralVariants(5), 'вариантов');
  assert.equal(pluralVariants(11), 'вариантов');
});

test('retryAllowed only for failed rooms', () => {
  assert.equal(retryAllowed('error'), true);
  assert.equal(retryAllowed('queued'), false);
  assert.equal(retryAllowed('done'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVariantsCount, shouldMarkRoomError, roomStatusAfterFailure, pluralVariants, retryAllowed, parseVariantItems, isIterationRender, resolveRenderStyleConcept } from '../src/variants.js';

test('parseVariantsCount clamps 1..10', () => {
  assert.equal(parseVariantsCount(undefined), 1);
  assert.equal(parseVariantsCount('3'), 3);
  assert.equal(parseVariantsCount('10'), 10);
  assert.equal(parseVariantsCount('20'), 10);
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

test('retryAllowed blocks while sibling variants are processing', () => {
  assert.equal(retryAllowed('error', true), false);
  assert.equal(retryAllowed('error', false), true);
});

test('parseVariantItems parses pairs and drops unknown concepts', () => {
  const { items, error } = parseVariantItems(JSON.stringify([
    { style: 'Скандинавский', concept: 'light' },
    { style: 'Джапанди' },
    { style: 'Скандинавский', concept: 'unknown' },
  ]), { allowedConcepts: new Set(['light']) });
  assert.equal(error, null);
  assert.deepEqual(items, [
    { style: 'Скандинавский', concept: 'light' },
    { style: 'Джапанди', concept: null },
    { style: 'Скандинавский', concept: null },
  ]);
});

test('parseVariantItems accepts 10 items but rejects more', () => {
  const ten = parseVariantItems(JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ style: `s${i}` }))), {});
  assert.equal(ten.error, null);
  assert.equal(ten.items.length, 10);
  const eleven = parseVariantItems(JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ style: `s${i}` }))), {});
  assert.equal(eleven.error, 'Некорректный список дизайнов');
});

test('parseVariantItems rejects empty array and broken json', () => {
  assert.equal(parseVariantItems('[]', {}).error, 'Некорректный список дизайнов');
  assert.equal(parseVariantItems('{oops', {}).error, 'Некорректный список дизайнов');
});

test('parseVariantItems legacy fallback replicates style N times', () => {
  const { items } = parseVariantItems(undefined, { legacyStyle: 'Лофт', legacyConcept: 'x', legacyVariants: 3, allowedConcepts: new Set(['x']) });
  assert.equal(items.length, 3);
  assert.ok(items.every(i => i.style === 'Лофт' && i.concept === 'x'));
});

test('isIterationRender treats base render with request_text as base', () => {
  assert.equal(isIterationRender({ request_text: 'Стиль: X', parent_render_id: null }), false);
  assert.equal(isIterationRender({ request_text: 'edit', parent_render_id: 'p1' }), true);
});

test('resolveRenderStyleConcept: new render with null concept does not inherit room concept', () => {
  assert.deepEqual(
    resolveRenderStyleConcept({ style: 'Лофт', concept: null }, { style: 'Скандинавский', concept_key: 'light' }),
    { style: 'Лофт', concept: null },
  );
});

test('resolveRenderStyleConcept: legacy render falls back to room', () => {
  assert.deepEqual(
    resolveRenderStyleConcept({ style: null, concept: null }, { style: 'Скандинавский', concept_key: 'light' }),
    { style: 'Скандинавский', concept: 'light' },
  );
});

test('resolveRenderStyleConcept: per-render concept wins', () => {
  assert.deepEqual(
    resolveRenderStyleConcept({ style: 'Лофт', concept: 'craft' }, { style: 'X', concept_key: 'light' }),
    { style: 'Лофт', concept: 'craft' },
  );
});


test('roomStatusAfterFailure restores done after a failed edit', () => {
  assert.equal(roomStatusAfterFailure({ roomStatus: 'rendering', hasDoneSibling: true, iteration: true }), 'done');
});

test('roomStatusAfterFailure marks error when nothing is done', () => {
  assert.equal(roomStatusAfterFailure({ roomStatus: 'rendering', hasDoneSibling: false, iteration: false }), 'error');
});

test('roomStatusAfterFailure keeps done for a failed root with done sibling', () => {
  assert.equal(roomStatusAfterFailure({ roomStatus: 'rendering', hasDoneSibling: true, iteration: false }), null);
});

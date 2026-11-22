import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeOpenings } = await import('../src/openings.js');

test('normalizeOpenings clamps and filters small bboxes', () => {
  const parsed = {
    windows: [{ id: 'window_1', bbox: [100, 200, 400, 800], kind: 'window' }],
    doors: [{ id: 'door_1', bbox: [500, 900, 600, 1000], kind: 'interior' }],
    builtins: [{ id: 'builtin_1', bbox: [10, 10, 15, 15], label: 'shelf' }],
    confidence: 'medium',
  };
  const result = normalizeOpenings(parsed);
  assert.equal(result.windows.length, 1);
  assert.deepEqual(result.windows[0].bbox, [100, 200, 400, 800]);
  assert.equal(result.doors.length, 1);
  assert.equal(result.builtins.length, 0);
  assert.equal(result.confidence, 'medium');
});

test('normalizeOpenings ignores invalid coordinates', () => {
  const result = normalizeOpenings({
    windows: [{ bbox: ['a', 'b', null, 1000] }],
    confidence: 'low',
  });
  assert.equal(result.windows.length, 0);
  assert.equal(result.confidence, 'low');
});

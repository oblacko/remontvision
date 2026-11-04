import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysis } from '../src/analysis.js';

test('visible objects are sorted from largest to smallest by bbox area', () => {
  const analysis = buildAnalysis({
    roomType: 'Спальня',
    parsed: {
      visible: [
        { label: 'light', bbox: [0.1, 0.1, 0.1, 0.1] },
        { label: 'bed', bbox: [0.1, 0.2, 0.6, 0.5] },
        { label: 'rug', bbox: [0.1, 0.6, 0.4, 0.3] },
      ],
      surfaces: [],
      electrical: [],
    },
  });
  assert.deepEqual(analysis.visible.map(v => v.label), ['bed', 'rug', 'light']);
});

test('legacy string visible entries are preserved', () => {
  const analysis = buildAnalysis({ roomType: 'Спальня', parsed: { visible: ['bed', 'desk'] } });
  assert.deepEqual(analysis.visible.map(v => v.label), ['bed', 'desk']);
  assert.equal(analysis.visible[0].area, 0);
});

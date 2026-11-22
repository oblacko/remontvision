import test from 'node:test';
import assert from 'node:assert/strict';

const { buildBboxJson, bboxMentions, normalizedToFluxBox } = await import('../src/bboxprompt.js');

test('normalizedToFluxBox converts [x,y,w,h] to [top,left,bottom,right]', () => {
  assert.deepEqual(normalizedToFluxBox([0.1, 0.2, 0.3, 0.4]), [200, 100, 600, 400]);
});

test('normalizedToFluxBox drops too-small boxes', () => {
  assert.equal(normalizedToFluxBox([0, 0, 0.01, 0.01]), null);
});

test('buildBboxJson emits Keep rows for openings', () => {
  const json = buildBboxJson({
    openings: {
      windows: [{ id: 'window_1', bbox: [100, 200, 400, 800], kind: 'window' }],
      doors: [{ id: 'door_1', bbox: [500, 900, 600, 1000], kind: 'interior' }],
    },
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'window_1');
  assert.equal(parsed[0].from, 'ref_image_0');
  assert.deepEqual(parsed[0].src_bbox, parsed[0].tgt_bbox);
  assert.equal(parsed[1].id, 'door_1');
});

test('buildBboxJson describes balcony door separately from window', () => {
  const json = buildBboxJson({
    openings: {
      windows: [
        { id: 'window_1', bbox: [120, 540, 580, 920], kind: 'balcony_door' },
        { id: 'window_2', bbox: [120, 120, 580, 500], kind: 'window' },
      ],
      doors: [],
    },
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 2);
  assert.match(parsed[0].desc, /balcony door/i);
  assert.doesNotMatch(parsed[1].desc, /balcony/i);
});

test('bboxMentions returns ids', () => {
  const ids = bboxMentions({ windows: [{ id: 'w1' }], doors: [{ id: 'd1' }] });
  assert.deepEqual(ids, ['w1', 'd1']);
});

test('buildBboxJson returns empty string without rows', () => {
  assert.equal(buildBboxJson({ openings: { windows: [], doors: [] } }), '');
});

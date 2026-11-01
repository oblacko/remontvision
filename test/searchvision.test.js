import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeSearchVision } = await import('../src/searchvision.js');

test('returns defaults for non-object input', () => {
  assert.deepEqual(normalizeSearchVision(null), {
    photo_quality: { score: null, recommend_mode: 'A' },
    objects: [],
  });
});

test('normalizes photo quality', () => {
  const out = normalizeSearchVision({
    photo_quality: { score: 1.4, recommend_mode: 'b' },
    objects: [],
  });
  assert.deepEqual(out.photo_quality, { score: 1, recommend_mode: 'B' });

  const bad = normalizeSearchVision({ photo_quality: { score: 'x', recommend_mode: 'x' } });
  assert.deepEqual(bad.photo_quality, { score: null, recommend_mode: 'A' });
});

test('clamps bbox into 0..1', () => {
  const out = normalizeSearchVision({
    objects: [{ label: 'Диван', search_query: 'диван', bbox: [1.2, -0.1, 0.5, 2] }],
  });
  assert.deepEqual(out.objects[0].bbox, [1, 0, 0.5, 1]);
});

test('drops objects missing label or search_query', () => {
  const out = normalizeSearchVision({
    objects: [
      { label: '  ', search_query: 'стул' },
      { label: 'Стул', search_query: '   ' },
      { label: 'Стол', search_query: 'стол обеденный' },
    ],
  });
  assert.equal(out.objects.length, 1);
  assert.equal(out.objects[0].label, 'Стол');
  assert.equal(out.objects[0].index, 0);
});

test('caps at maxObjects', () => {
  const objects = Array.from({ length: 15 }, (_, i) => ({
    label: `Товар ${i}`,
    search_query: `запрос ${i}`,
  }));
  const out = normalizeSearchVision({ objects }, { maxObjects: 10 });
  assert.equal(out.objects.length, 10);
  assert.equal(out.objects[9].index, 9);
  assert.equal(out.objects[9].label, 'Товар 9');
});

test('keeps size attribute', () => {
  const out = normalizeSearchVision({
    objects: [{ label: 'Кровать', search_query: 'кровать 160', size: ' 160×200 ' }],
  });
  assert.equal(out.objects[0].size, '160×200');
});

test('coerces hex to #RRGGBB or null', () => {
  const ok = normalizeSearchVision({
    objects: [{ label: 'Стена', search_query: 'краска', hex: '#ABCDEF' }],
  });
  assert.equal(ok.objects[0].hex, '#ABCDEF');

  const bad = normalizeSearchVision({
    objects: [{ label: 'Стена', search_query: 'краска', hex: 'red' }],
  });
  assert.equal(bad.objects[0].hex, null);
});

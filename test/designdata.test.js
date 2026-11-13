import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DESIGN_STYLES,
  DESIGN_CONCEPTS,
  compatibilityOf,
  pickRandomCompatiblePair,
  styleById,
  conceptById,
} = await import('../src/designdata.js');

test('design catalog has ten unique styles and ten unique concepts', () => {
  assert.equal(DESIGN_STYLES.length, 10);
  assert.equal(DESIGN_CONCEPTS.length, 10);
  assert.equal(new Set(DESIGN_STYLES.map(item => item.id)).size, 10);
  assert.equal(new Set(DESIGN_CONCEPTS.map(item => item.id)).size, 10);
  for (const style of DESIGN_STYLES) {
    assert.match(style.palette.base, /^#[0-9a-f]{6}$/i);
    assert.ok(style.prompt_en.length > 20);
  }
});

test('every style exposes 3–5 style axes with 2–3 values each', () => {
  for (const style of DESIGN_STYLES) {
    assert.ok(Array.isArray(style.axes), `${style.id} has axes`);
    assert.ok(style.axes.length >= 3 && style.axes.length <= 5, `${style.id} has 3–5 axes`);
    for (const axis of style.axes) {
      assert.ok(typeof axis.key === 'string' && axis.key.length, `${style.id} axis has a key`);
      assert.ok(Array.isArray(axis.values) && axis.values.length >= 2 && axis.values.length <= 3, `${style.id}/${axis.key} has 2–3 values`);
      for (const value of axis.values) {
        assert.ok(typeof value === 'string' && value.length, `${style.id}/${axis.key} value is non-empty`);
        assert.doesNotMatch(value, /^#/, `${style.id}/${axis.key} value must not be a colour`);
      }
    }
  }
});

test('compatibility follows the matrix', () => {
  assert.equal(compatibilityOf('scandinavian', 'accent_block'), 'ok');
  assert.equal(compatibilityOf('dark_contemporary', 'accent_block'), 'weaken');
  assert.equal(compatibilityOf('memphis_accent', 'monochrome_depth'), 'conflict');
  assert.equal(compatibilityOf('japandi', 'horizontal_division'), 'conflict');
  assert.equal(compatibilityOf('unknown', 'accent_block'), 'conflict');
});

test('styleById and conceptById find cards', () => {
  assert.equal(styleById('japandi').name, 'Джапанди');
  assert.equal(conceptById('accent_block').name, 'Акцентный блок');
  assert.equal(styleById('nope'), null);
});

test('random pair is compatible and avoids used pairs', () => {
  const used = [];
  for (const style of DESIGN_STYLES) {
    for (const concept of DESIGN_CONCEPTS) {
      if (compatibilityOf(style.id, concept.id) === 'ok') used.push(`${style.id}:${concept.id}`);
    }
  }
  // Exclude every ok pair except one, so the picker must choose it.
  const last = used.pop();
  const pair = pickRandomCompatiblePair({ usedPairs: used });
  assert.equal(`${pair.style_id}:${pair.concept_id}`, last);
  assert.equal(compatibilityOf(pair.style_id, pair.concept_id), 'ok');
});

test('random pair falls back to a compatible pair when all ok pairs are used', () => {
  const used = [];
  for (const style of DESIGN_STYLES) {
    for (const concept of DESIGN_CONCEPTS) {
      used.push(`${style.id}:${concept.id}`);
    }
  }
  const pair = pickRandomCompatiblePair({ usedPairs: used });
  assert.notEqual(compatibilityOf(pair.style_id, pair.concept_id), 'conflict');
});

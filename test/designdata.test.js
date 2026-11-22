import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DESIGN_STYLES,
  DESIGN_STYLE_ORDER,
  DESIGN_CONCEPTS,
  WEAKEN_PARAMS,
  compatibilityOf,
  compatibilityNote,
  pickRandomCompatiblePair,
  styleById,
  conceptById,
} = await import('../src/designdata.js');

const CONCEPT_IDS = DESIGN_CONCEPTS.map(item => item.id);

test('design catalog has 32 unique styles and ten unique concepts', () => {
  assert.equal(DESIGN_STYLES.length, 32);
  assert.equal(DESIGN_STYLE_ORDER.length, 32);
  assert.equal(DESIGN_CONCEPTS.length, 10);
  assert.equal(new Set(DESIGN_STYLES.map(item => item.id)).size, 32);
  assert.equal(new Set(DESIGN_STYLES.map(item => item.name)).size, 32);
  assert.equal(new Set(DESIGN_STYLES.map(item => item.display_name)).size, 32);
  assert.equal(new Set(DESIGN_CONCEPTS.map(item => item.id)).size, 10);
  for (const style of DESIGN_STYLES) {
    assert.match(style.palette.base, /^#[0-9a-f]{6}$/i);
    assert.ok(style.prompt_en.length > 20, `${style.id} prompt_en is too short`);
    assert.ok(style.description.length > 20, `${style.id} description is too short`);
    assert.ok(style.family.length > 0, `${style.id} family is empty`);
    assert.ok(DESIGN_STYLE_ORDER.includes(style.id), `${style.id} missing in DESIGN_STYLE_ORDER`);
  }
});

test('exactly ten styles are featured for the main flow', () => {
  const featured = DESIGN_STYLES.filter(style => style.is_featured);
  assert.equal(featured.length, 10);
  assert.deepEqual(
    featured.map(style => style.id),
    ['modern', 'loft', 'scandinavian', 'provence', 'minimalism', 'neoclassic', 'boho', 'baroque', 'japandi', 'classic'],
  );
});

test('every style exposes 3–6 style axes with 2–3 values each', () => {
  for (const style of DESIGN_STYLES) {
    assert.ok(Array.isArray(style.axes), `${style.id} has axes`);
    assert.ok(style.axes.length >= 3 && style.axes.length <= 6, `${style.id} has 3–6 axes`);
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

test('prompt_en follows the FLUX 3 positive prose rules', () => {
  for (const style of DESIGN_STYLES) {
    assert.doesNotMatch(style.prompt_en, /\bno\b|\bwithout\b|\bavoid\b|\bdo not\b|\bdon't\b/i, `${style.id} has a negative phrase`);
    assert.match(style.prompt_en, /#(?:[0-9a-f]{6})/i, `${style.id} should anchor a hex colour`);
    assert.ok(style.prompt_en.split(/\s+/).length >= 30, `${style.id} prompt_en is too short for a scene caption`);
  }
});

test('compatibility matrix has 32 cells per concept and valid values', () => {
  let ok = 0, weaken = 0, conflict = 0;
  for (const concept of CONCEPT_IDS) {
    let rowOk = 0, rowWeaken = 0, rowConflict = 0;
    for (const style of DESIGN_STYLES) {
      const value = compatibilityOf(style.id, concept);
      assert.ok(['ok', 'weaken', 'conflict'].includes(value), `${style.id}/${concept} has invalid value ${value}`);
      if (value === 'ok') { ok++; rowOk++; }
      if (value === 'weaken') { weaken++; rowWeaken++; }
      if (value === 'conflict') { conflict++; rowConflict++; }
    }
    assert.equal(rowOk + rowWeaken + rowConflict, 32, `${concept} has wrong row length`);
  }
  assert.equal(ok + weaken + conflict, 320);
  assert.equal(ok, 257);
  assert.equal(weaken, 50);
  assert.equal(conflict, 13);
});

test('every style has at least five ok pairs', () => {
  for (const style of DESIGN_STYLES) {
    const okCount = CONCEPT_IDS.filter(concept => compatibilityOf(style.id, concept) === 'ok').length;
    assert.ok(okCount >= 5, `${style.id} has only ${okCount} ok pairs`);
  }
});

test('compatibility follows the matrix', () => {
  assert.equal(compatibilityOf('scandinavian', 'accent_block'), 'ok');
  assert.equal(compatibilityOf('dark_contemporary', 'accent_block'), 'ok');
  assert.equal(compatibilityOf('memphis_accent', 'monochrome_depth'), 'conflict');
  assert.equal(compatibilityOf('japandi', 'horizontal_division'), 'conflict');
  assert.equal(compatibilityOf('unknown', 'accent_block'), 'conflict');
});

test('every weaken pair has an explanatory note', () => {
  for (const style of DESIGN_STYLES) {
    for (const concept of CONCEPT_IDS) {
      if (compatibilityOf(style.id, concept) === 'weaken') {
        assert.ok(compatibilityNote(style.id, concept), `${concept}:${style.id} weaken note is empty`);
      }
    }
  }
  assert.equal(Object.keys(WEAKEN_PARAMS).length, 50);
});

test('styleById and conceptById find cards', () => {
  assert.equal(styleById('japandi').name, 'Джапанди');
  assert.equal(styleById('japandi').display_name, 'Киотская тишина');
  assert.equal(styleById('mid_century').name, 'Мид-сенчури');
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

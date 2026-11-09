import test from 'node:test';
import assert from 'node:assert/strict';

const { getRenderConfig, getRenderDefaults, getImageMinGapMs, setRenderConfigForTests } = await import('../src/renderconfig.js');

test('product matching is controlled separately from product refs', () => {
  const defaults = getRenderDefaults();
  assert.equal(defaults.product_refs_enabled, false);
  assert.equal(defaults.product_matching_enabled, true);
  setRenderConfigForTests({ product_matching_enabled: false, max_products: 9 });
  const config = getRenderConfig();
  assert.equal(config.product_matching_enabled, false);
  assert.equal(config.max_products, 4);
  setRenderConfigForTests({ product_matching_enabled: true });
});

test('image min gap defaults to 10 seconds', () => {
  assert.equal(getRenderDefaults().image_min_gap_ms, 10_000);
  setRenderConfigForTests({});
  assert.equal(getImageMinGapMs(), 10_000);
});

test('image min gap clamps negative and out-of-range values', () => {
  setRenderConfigForTests({ image_min_gap_ms: -5 });
  assert.equal(getImageMinGapMs(), 0);
  setRenderConfigForTests({ image_min_gap_ms: 999_999 });
  assert.equal(getImageMinGapMs(), 120_000);
});

test('image min gap accepts valid integers and rounds floats', () => {
  setRenderConfigForTests({ image_min_gap_ms: 2500 });
  assert.equal(getImageMinGapMs(), 2500);
  setRenderConfigForTests({ image_min_gap_ms: 333.6 });
  assert.equal(getImageMinGapMs(), 334);
});

test('image min gap rejects non-numeric input by falling back to default', () => {
  setRenderConfigForTests({ image_min_gap_ms: 'не число' });
  assert.equal(getImageMinGapMs(), 10_000);
});

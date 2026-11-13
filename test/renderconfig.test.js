import test from 'node:test';
import assert from 'node:assert/strict';

const { getRenderConfig, getRenderDefaults, getImageMinGapMs, getImageConcurrency, getImageConcurrencyUser, getImageConcurrencyProvider, setRenderConfigForTests, parseAutoEnabled } = await import('../src/renderconfig.js');

test('PARSE_AUTO is off by default and only truthy values enable it', () => {
  delete process.env.PARSE_AUTO;
  assert.equal(parseAutoEnabled(), false);
  for (const value of ['1', 'true', 'yes', 'on', 'TRUE']) {
    process.env.PARSE_AUTO = value;
    assert.equal(parseAutoEnabled(), true, value);
  }
  for (const value of ['0', 'false', 'no', 'off', '']) {
    process.env.PARSE_AUTO = value;
    assert.equal(parseAutoEnabled(), false, value);
  }
  delete process.env.PARSE_AUTO;
});

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

test('image min gap defaults to zero: варианты идут параллельно', () => {
  assert.equal(getRenderDefaults().image_min_gap_ms, 0);
  setRenderConfigForTests({});
  assert.equal(getImageMinGapMs(), 0);
});

test('image concurrency defaults: system 100, user 12, provider 100', () => {
  assert.equal(getRenderDefaults().image_concurrency, 100);
  assert.equal(getRenderDefaults().image_concurrency_user, 12);
  assert.equal(getRenderDefaults().image_concurrency_provider, 100);
  setRenderConfigForTests({ image_concurrency_user: 0 });
  assert.equal(getImageConcurrencyUser(), 1);
  setRenderConfigForTests({ image_concurrency_user: 99 });
  assert.equal(getImageConcurrencyUser(), 12);
  setRenderConfigForTests({ image_concurrency_provider: 2 });
  assert.equal(getImageConcurrencyProvider(), 2);
});

test('image concurrency clamps 1..200', () => {
  assert.equal(getImageConcurrency(), 100);
  setRenderConfigForTests({ image_concurrency: 0 });
  assert.equal(getImageConcurrency(), 1);
  setRenderConfigForTests({ image_concurrency: 999 });
  assert.equal(getImageConcurrency(), 200);
  setRenderConfigForTests({ image_concurrency: 5 });
  assert.equal(getImageConcurrency(), 5);
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
  assert.equal(getImageMinGapMs(), 0);
});

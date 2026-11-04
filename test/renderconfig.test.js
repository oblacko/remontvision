import test from 'node:test';
import assert from 'node:assert/strict';

const { getRenderConfig, getRenderDefaults, setRenderConfigForTests } = await import('../src/renderconfig.js');

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

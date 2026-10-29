import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getProcurementTemplate,
  templateCategoryKeys,
  categoryMeta,
  categoryQuery,
} = await import('../src/procurementtemplates.js');
const { getProcurementConfig, procurementConfigHash } = await import('../src/procurementconfig.js');

test('bedroom template covers furniture, finishes and completeness', () => {
  const template = getProcurementTemplate('Спальня');
  const keys = templateCategoryKeys(template).map(row => row.key);
  for (const key of ['bed', 'wardrobe', 'light', 'floor', 'walls', 'skirting', 'curtains', 'mattress', 'underlay']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  assert.equal(categoryMeta('mattress').layer, 'completeness');
  assert.equal(categoryMeta('bed').mode, 'visual');
});

test('kitchen template includes plumbing and built-in appliance layer', () => {
  const template = getProcurementTemplate('Кухня');
  const keys = templateCategoryKeys(template).map(row => row.key);
  for (const key of ['countertop', 'sink', 'faucet', 'appliance', 'tile', 'cabinet']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  assert.equal(categoryMeta('appliance').mode, 'text');
});

test('category query includes attributes without inventing brands', () => {
  assert.equal(categoryQuery('bed', { color: 'серый', material: 'рогожка' }), 'Кровать серый рогожка купить');
  assert.equal(categoryQuery('floor', { color: 'светлый', material: 'дуб' }), 'Напольное покрытие светлый дуб купить');
});

test('default search layers exclude finishes and completeness', () => {
  const config = getProcurementConfig();
  assert.deepEqual(config.enabled_layers, ['hero', 'textile']);
});

test('procurement config hash is stable and region-sensitive', () => {
  const config = getProcurementConfig();
  const base = procurementConfigHash(config);
  assert.equal(base, procurementConfigHash({ ...config }));
  assert.notEqual(base, procurementConfigHash({ ...config, region: '2' }));
  assert.equal(config.credit_cost, 1);
});

test('style source defaults to text and supports three modes', async () => {
  const { getStyleConfig, STYLE_MODES } = await import('../src/styleconfig.js');
  assert.deepEqual(STYLE_MODES, ['text', 'reference', 'swatches']);
  assert.equal(getStyleConfig().mode, 'text');
});

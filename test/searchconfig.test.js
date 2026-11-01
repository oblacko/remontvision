import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SEARCH_CONFIG,
  SEARCH_SETTINGS_KEY,
  getSearchConfig,
  getSearchDefaults,
  searchConfigHash,
  setSearchConfigForTests,
  validateSearchConfig,
} from '../src/searchconfig.js';

test('default grid aspect is 21:9', () => {
  assert.equal(DEFAULT_SEARCH_CONFIG.grid_aspect, '21:9');
});

test('hash changes when domains change', () => {
  const before = searchConfigHash({ ...DEFAULT_SEARCH_CONFIG });
  const after = searchConfigHash({ ...DEFAULT_SEARCH_CONFIG, domains: ['example.com'] });
  assert.notEqual(before, after);
});

test('saveConfig rejects unsupported grid aspect', () => {
  assert.throws(() => validateSearchConfig({ grid_aspect: '5:2' }));
});

test('validates aspect against provided grid model', () => {
  assert.throws(() => validateSearchConfig({
    grid_model: 'openai/gpt-image-1',
    grid_aspect: '7:5',
  }));
});

test('validates grid resolution against provided grid model', () => {
  assert.throws(() => validateSearchConfig({
    grid_model: 'google/gemini-3.1-flash-image-preview',
    grid_resolution: '2K',
  }));
});

test('clears resolution for models without resolution support', () => {
  const patch = validateSearchConfig({
    grid_model: 'black-forest-labs/flux.2-pro',
    grid_resolution: '4K',
  });
  assert.equal(patch.grid_resolution, '');
});

test('rejects resolution not supported by grid model', () => {
  assert.throws(() => validateSearchConfig({
    grid_model: 'black-forest-labs/flux-3-image-klein',
    grid_resolution: '8K',
  }));
});

test('settings key is search.v1', () => {
  assert.equal(SEARCH_SETTINGS_KEY, 'search.v1');
});

test('validate normalizes domains and clamps limits', () => {
  const patch = validateSearchConfig({
    domains: [' WWW.Example.com ', 'example.com', '', 'Shop.RU'],
    search_limit: 999,
    max_objects: 0,
    max_run_cost_usd: 100,
    cache_ttl_hours: 0,
    enabled: 'yes',
    visual_enabled: 'off',
  });
  assert.deepEqual(patch.domains, ['example.com', 'shop.ru']);
  assert.equal(patch.search_limit, 100);
  assert.equal(patch.max_objects, 1);
  assert.equal(patch.max_run_cost_usd, 10);
  assert.equal(patch.cache_ttl_hours, 1);
  assert.equal(patch.enabled, true);
  assert.equal(patch.visual_enabled, false);
});

test('test helper updates config without touching db', () => {
  setSearchConfigForTests({ region: '2', domains: ['www.shop.ru'] });
  const config = getSearchConfig();
  assert.equal(config.region, '2');
  assert.deepEqual(config.domains, ['shop.ru']);
  assert.deepEqual(getSearchDefaults().domains, DEFAULT_SEARCH_CONFIG.domains);
});

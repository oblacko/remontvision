import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDimensions, fitsDimensions, pickHoffProducts } from '../src/productpicker.js';

test('parseDimensions reads width/length/height from params', () => {
  const dims = parseDimensions({ 'Ширина, см': '160', 'Глубина, см': '200', 'Высота, см': '90' });
  assert.equal(dims.width, 160);
  assert.equal(dims.length, 200);
  assert.equal(dims.height, 90);
});

test('parseDimensions converts millimetres to centimetres', () => {
  const dims = parseDimensions({ 'Ширина, мм': '1600', 'Высота, мм': '900' });
  assert.equal(dims.width, 160);
  assert.equal(dims.height, 90);
});

test('fitsDimensions rejects oversized products', () => {
  assert.equal(fitsDimensions({ width: 200, length: 220 }, { max_w_cm: 180, max_l_cm: 220 }), false);
  assert.equal(fitsDimensions({ width: 160, length: 200 }, { max_w_cm: 180, max_l_cm: 220 }), true);
  assert.equal(fitsDimensions({ width: null, length: null }, { max_w_cm: 180 }), true);
});

test('pickHoffProducts filters by size and keeps the LLM choice', async () => {
  const plan = [{ slot: 'bed', category: 'bed', query: 'кровать', max_w_cm: 170, max_l_cm: 220 }];
  const searchCatalogText = async () => ({
    results: [
      { offer_id: 'big', name: 'Big bed', category: 'bed', price: 100, picture_url: 'x', params: { 'Ширина, см': '200' } },
      { offer_id: 'ok1', name: 'Bed A', category: 'bed', price: 200, picture_url: 'x', params: { 'Ширина, см': '160' } },
      { offer_id: 'ok2', name: 'Bed B', category: 'bed', price: 150, picture_url: 'x', params: { 'Ширина, см': '165' } },
    ],
  });
  const visionJson = async () => ({ parsed: { picks: [{ slot: 'bed', offer_id: 'ok2', why: 'лучше по стилю' }] }, cost: null });

  const picked = await pickHoffProducts({
    plan, roomType: 'Спальня', style: 'Джапанди', maxProducts: 3,
    deps: { searchCatalogText, visionJson, log: () => {} },
  });

  assert.equal(picked.length, 1);
  assert.equal(picked[0].offer_id, 'ok2');
  assert.equal(picked[0].picked_by, 'llm');
  assert.equal(picked[0].why, 'лучше по стилю');
});

test('pickHoffProducts falls back to top candidate when the LLM fails', async () => {
  const plan = [{ slot: 'light', category: 'light', query: 'светильник' }];
  const searchCatalogText = async () => ({
    results: [{ offer_id: 'l1', name: 'Lamp', category: 'light', price: 50, picture_url: 'x', params: {} }],
  });
  const visionJson = async () => { throw new Error('llm down'); };

  const picked = await pickHoffProducts({
    plan, roomType: 'Спальня', style: 'Джапанди',
    deps: { searchCatalogText, visionJson, log: () => {} },
  });

  assert.equal(picked.length, 1);
  assert.equal(picked[0].offer_id, 'l1');
  assert.equal(picked[0].picked_by, 'score');
});

test('pickHoffProducts returns nothing when catalog is empty', async () => {
  const searchCatalogText = async () => ({ results: [] });
  const visionJson = async () => ({ parsed: { picks: [] }, cost: null });
  const picked = await pickHoffProducts({
    plan: [{ slot: 'sofa', category: 'sofa', query: 'диван' }],
    deps: { searchCatalogText, visionJson, log: () => {} },
  });
  assert.deepEqual(picked, []);
});

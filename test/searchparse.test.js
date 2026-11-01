import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichSearchResults, normalizeAvailability, withBuyKeyword } from '../src/searchparse.js';

test('normalizeAvailability maps schema.org values', () => {
  assert.equal(normalizeAvailability('https://schema.org/InStock').status, 'in_stock');
  assert.equal(normalizeAvailability('https://schema.org/OutOfStock').status, 'out_of_stock');
  assert.equal(normalizeAvailability('https://schema.org/PreOrder').status, 'preorder');
  assert.equal(normalizeAvailability('').status, 'unknown');
});

test('normalizeAvailability maps russian labels', () => {
  assert.equal(normalizeAvailability('В наличии').status, 'in_stock');
  assert.equal(normalizeAvailability('Нет в наличии').status, 'out_of_stock');
  assert.equal(normalizeAvailability('Под заказ').status, 'preorder');
  assert.equal(normalizeAvailability('Ограниченное наличие').status, 'in_stock');
});

test('withBuyKeyword appends keyword once', () => {
  assert.equal(withBuyKeyword('диван бежевый'), 'диван бежевый купить');
  assert.equal(withBuyKeyword('диван купить'), 'диван купить');
  assert.equal(withBuyKeyword('Диван КУПИТЬ'), 'Диван КУПИТЬ');
  assert.equal(withBuyKeyword('диван', ''), 'диван');
  assert.equal(withBuyKeyword('', 'купить'), '');
});

test('enrichSearchResults leaves non-product urls untouched', async () => {
  const rows = [{ url: 'https://example.ru/catalog/divany', title: 'Каталог', price: null }];
  const out = await enrichSearchResults(rows, { limit: 6, concurrency: 2 });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Каталог');
  assert.equal(out[0].url, rows[0].url);
});

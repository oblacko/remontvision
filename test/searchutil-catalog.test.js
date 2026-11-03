import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeResults } from '../src/searchutil.js';

test('mergeResults puts catalog first and preserves affiliate fields', () => {
  const textResults = [{ url: 'https://other.test/p/9', title: 'Yandex', price: 120 }];
  const catalogResults = [{
    url: 'https://shop.test/p/1',
    canonical_url: 'https://shop.test/p/1',
    title: 'Offer',
    price: 100,
    affiliate_url: 'https://trk.ppdu.ru/click/x?erid=E',
    erid: 'E',
    availability: 'in_stock',
    store: 'shop.test',
    match_score: 0.92,
  }];
  const rows = mergeResults(textResults, [], { limit: 30, catalogResults });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, 'catalog');
  assert.equal(rows[0].provider, 'feed');
  assert.equal(rows[0].affiliate_url, 'https://trk.ppdu.ru/click/x?erid=E');
  assert.equal(rows[0].erid, 'E');
  assert.equal(rows[0].match_score, 0.92);
  assert.equal(rows[0].store, 'shop.test');
  assert.equal(rows[0].price, 100);
});

test('mergeResults dedupes catalog against text, catalog wins', () => {
  const textResults = [{ url: 'https://shop.test/p/1', title: 'Yandex' }];
  const catalogResults = [{
    url: 'https://shop.test/p/1', title: 'Catalog', affiliate_url: 'https://trk/x', erid: 'E',
  }];
  const rows = mergeResults(textResults, [], { limit: 30, catalogResults });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'catalog');
  assert.equal(rows[0].title, 'Catalog');
});

test('mergeResults catalog respects limit', () => {
  const catalogResults = [
    { url: 'https://a.test/1' },
    { url: 'https://a.test/2' },
  ];
  const rows = mergeResults([], [], { limit: 1, catalogResults });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://a.test/1');
});

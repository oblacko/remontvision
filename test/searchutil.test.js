import test from 'node:test';
import assert from 'node:assert/strict';

const { canonicalUrl, filtersHash, mergeResults } = await import('../src/searchutil.js');

test('canonicalUrl strips fragment and tracking', () => {
  assert.equal(
    canonicalUrl('https://www.Divan.ru/sofa/?utm_source=x#top'),
    'https://divan.ru/sofa/'
  );
});

test('canonicalUrl upgrades http and drops tracking params', () => {
  assert.equal(
    canonicalUrl('http://www.divan.ru/sofa/?gclid=1&from=ya&color=gray'),
    'https://divan.ru/sofa/?color=gray'
  );
});

test('canonicalUrl keeps trimmed raw on invalid input', () => {
  assert.equal(canonicalUrl('  not a url  '), 'not a url');
  assert.equal(canonicalUrl('mailto:a@b.ru'), 'mailto:a@b.ru');
  assert.equal(canonicalUrl(''), '');
});

test('filtersHash ignores domain order', () => {
  assert.equal(
    filtersHash({ domains: ['a.ru', 'b.ru'] }),
    filtersHash({ domains: ['b.ru', 'a.ru'] })
  );
});

test('filtersHash is stable and treats missing values as null', () => {
  assert.equal(filtersHash({}), filtersHash({}));
  assert.equal(filtersHash().length, 32);
  assert.notEqual(filtersHash({ query: 'sofa' }), filtersHash({ query: 'chair' }));
});

test('mergeResults dedups by canonicalUrl and caps limit', () => {
  const textResults = [
    { url: 'https://www.divan.ru/sofa/?utm_source=x', title: 'Text sofa', snippet: 'text' },
    { url: 'https://divan.ru/chair/', page_title: 'Text chair' },
  ];
  const visualResults = [
    { canonical_url: 'https://divan.ru/sofa/', title: 'Visual sofa', passage: 'visual' },
  ];

  const merged = mergeResults(textResults, visualResults, { limit: 10 });
  assert.equal(merged.length, 2);
  assert.equal(merged[0].url, 'https://divan.ru/sofa/');
  assert.equal(merged[0].source, 'visual');
  assert.equal(merged[0].title, 'Visual sofa');
  assert.equal(merged[1].url, 'https://divan.ru/chair/');
  assert.equal(merged[1].source, 'text');

  const capped = mergeResults(textResults, visualResults, { limit: 1 });
  assert.equal(capped.length, 1);
  assert.equal(capped[0].source, 'visual');
});

test('mergeResults skips rows without url and uses defaults', () => {
  const merged = mergeResults([{ title: 'no url' }], [], {});
  assert.deepEqual(merged, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  normalizeImageSearchResults,
  normalizeImageSearchXml,
  buildSearchByImageBody,
  buildSearchWebBody,
} = await import('../src/yandexsearch.js');

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/search_by_image.json', import.meta.url), 'utf8'),
);

test('normalizeImageSearchResults maps image fields', () => {
  const rows = normalizeImageSearchResults(fixture);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    url: 'https://example.ru/img/sofa-1.jpg',
    format: 'IMAGE_FORMAT_JPEG',
    width: 1000,
    height: 1000,
    host: 'example.ru',
    pageUrl: 'https://example.ru/product/1',
    pageTitle: 'Диван прямой трёхместный — Example',
    passage: 'Диван прямой трёхместный, серый велюр, на деревянных ножках.',
  });

  const camel = normalizeImageSearchResults({
    images: [{
      url: 'https://example.ru/img/sofa-2.jpg',
      pageUrl: 'https://example.ru/product/2',
      pageTitle: 'Диван два',
    }],
  });
  assert.equal(camel[0].pageUrl, 'https://example.ru/product/2');
  assert.equal(camel[0].pageTitle, 'Диван два');
});

const IMAGE_XML = `<?xml version="1.0" encoding="utf-8"?>
<yandexsearch>
  <response>
    <images>
      <image>
        <url>https://cdn.example.ru/img/one.jpg</url>
        <pageUrl>https://example.ru/product/one</pageUrl>
        <pageTitle>Первый товар</pageTitle>
        <host>example.ru</host>
        <passage>Первый товар с диваном.</passage>
        <width>640</width>
        <height>480</height>
      </image>
      <image>
        <url>https://cdn.example.ru/img/two.jpg</url>
        <page_url>https://example.ru/product/two</page_url>
        <page_title>Второй товар</page_title>
        <host>example.ru</host>
        <width>800</width>
        <height>600</height>
      </image>
    </images>
  </response>
</yandexsearch>`;

test('normalizeImageSearchXml maps image nodes and falls back for rawData', () => {
  const rows = normalizeImageSearchXml(IMAGE_XML);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].url, 'https://cdn.example.ru/img/one.jpg');
  assert.equal(rows[0].pageUrl, 'https://example.ru/product/one');
  assert.equal(rows[0].pageTitle, 'Первый товар');
  assert.equal(rows[1].pageUrl, 'https://example.ru/product/two');
  assert.equal(rows[1].pageTitle, 'Второй товар');
  assert.equal(rows[1].width, 800);
  assert.equal(rows[1].height, 600);

  const decoded = normalizeImageSearchXml(Buffer.from(IMAGE_XML, 'utf8').toString('base64'));
  assert.equal(decoded.length, 2);
});

test('buildSearchByImageBody sets data and page', () => {
  const body = buildSearchByImageBody({ imageB64: 'AAA', folderId: 'f', page: '2' });
  assert.equal(body.data, 'AAA');
  assert.equal(body.page, '2');
  assert.equal(body.folder_id, 'f');
  assert.equal('url' in body, false);
});

test('buildSearchWebBody includes period and maxPassages', () => {
  const body = buildSearchWebBody({
    query: '  диван  ',
    limit: 5,
    folderId: 'f',
    maxPassages: 3,
    groupsOnPage: 500,
  });
  assert.equal(body.period, 'PERIOD_ALL_TIME');
  assert.equal(body.maxPassages, '3');
  assert.equal(body.query.queryText, 'диван');
  assert.equal(body.groupSpec.groupsOnPage, '100');

  const clampedLow = buildSearchWebBody({ query: 'x', groupsOnPage: 0, folderId: 'f' });
  assert.equal(clampedLow.groupSpec.groupsOnPage, '1');
});

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeSearchResults,
  filterProductResults,
  isAllowedDomain,
  isLikelyProductUrl,
} = await import('../src/yandexsearch.js');

const XML = `<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0">
  <response>
    <results>
      <grouping>
        <group>
          <doc>
            <url>https://market.yandex.ru/search?text=divan</url>
            <title>Диваны — Маркет</title>
          </doc>
        </group>
        <group>
          <doc>
            <url>https://www.divan.ru/product/divan-pryamoj-fils-rogojka-seryj</url>
            <title>Диван <hlword>прямой</hlword> Филс</title>
            <passages><passage>Рогожка, серый, 216 см.</passage></passages>
            <properties><lang>ru</lang></properties>
          </doc>
        </group>
        <group>
          <doc>
            <url>https://stoolgroup.ru/divan-krovat-fraydey-rogozhka-seryy/</url>
            <title>Диван-кровать Фрайдей</title>
          </doc>
        </group>
      </grouping>
    </results>
  </response>
</yandexsearch>`;

test('Yandex XML is normalized into ranked documents', () => {
  const rows = normalizeSearchResults(XML);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].url, 'https://market.yandex.ru/search?text=divan');
  assert.equal(rows[1].url, 'https://www.divan.ru/product/divan-pryamoj-fils-rogojka-seryj');
  assert.equal(rows[1].title, 'Диван прямой Филс');
  assert.equal(rows[1].snippet, 'Рогожка, серый, 216 см.');
  assert.equal(rows[1].lang, 'ru');
});

test('product filtering drops search/category pages and non-allowlisted domains', () => {
  const domains = ['divan.ru', 'stoolgroup.ru'];
  const rows = normalizeSearchResults(XML);
  assert.equal(isAllowedDomain('https://www.divan.ru/product/x', domains), true);
  assert.equal(isAllowedDomain('https://market.yandex.ru/search?text=x', domains), false);
  assert.equal(isLikelyProductUrl('https://market.yandex.ru/search?text=x'), false);
  assert.equal(isLikelyProductUrl('https://www.divan.ru/category/divany'), false);
  assert.equal(isLikelyProductUrl('https://www.divan.ru/product/divan-x'), true);
  const filtered = filterProductResults(rows, { domains });
  assert.deepEqual(filtered.map(r => r.url), [
    'https://www.divan.ru/product/divan-pryamoj-fils-rogojka-seryj',
    'https://stoolgroup.ru/divan-krovat-fraydey-rogozhka-seryy/',
  ]);
});

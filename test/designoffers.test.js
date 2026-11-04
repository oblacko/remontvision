import test from 'node:test';
import assert from 'node:assert/strict';

const { matchDesignOffers } = await import('../src/designoffers.js');

const item = { key: 'sofa', label: 'Диван', category: 'sofa', color: 'бежевый', material: 'рогожка', bbox: [0.1, 0.2, 0.5, 0.4] };

test('matches an item to normalized catalog offers', async () => {
  const search = async (input) => {
    assert.equal(input.filters.categories[0], 'sofa');
    assert.equal(input.topK, 3);
    return {
      results: [{
        offer_id: '42',
        name: 'Диван Осло',
        price: 79990,
        currency: 'RUB',
        merchant: 'divan.ru',
        canonical_url: 'https://divan.ru/p/42',
        picture_url: 'https://cdn.example/42.jpg',
        erid: 'abc',
        score: 0.91,
        params: { Цвет: 'Бежевый' },
      }],
    };
  };
  const out = await matchDesignOffers({ items: [item], search });
  assert.equal(out.length, 1);
  assert.equal(out[0].offers[0].id, '42');
  assert.equal(out[0].offers[0].url, 'https://divan.ru/p/42');
  assert.equal(out[0].offers[0].price, 79990);
  assert.equal(out[0].note, undefined);
});

test('keeps an empty result honest when the category is missing in the catalog', async () => {
  const out = await matchDesignOffers({
    items: [{ key: 'tile', label: 'Плитка', category: 'tile' }],
    search: async () => ({ results: [] }),
  });
  assert.equal(out[0].offers.length, 0);
  assert.match(out[0].note, /нет товаров категории/i);
});

test('one failing item does not break the others', async () => {
  const search = async ({ filters }) => {
    if (filters.categories[0] === 'rug') throw new Error('timeout');
    return { results: [{ offer_id: '1', name: 'Кресло', price: 1000, canonical_url: 'https://shop/1' }] };
  };
  const out = await matchDesignOffers({
    items: [
      { label: 'Кресло', category: 'armchair' },
      { label: 'Ковёр', category: 'rug' },
    ],
    search,
  });
  assert.equal(out[0].offers.length, 1);
  assert.equal(out[1].offers.length, 0);
  assert.match(out[1].note, /недоступен/i);
});

test('skips items without a category and caps the item count', async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ label: `Предмет ${i}`, category: 'decor' }));
  items.push({ label: 'Без категории' });
  let calls = 0;
  const out = await matchDesignOffers({
    items,
    search: async () => { calls++; return { results: [] }; },
    limit: 5,
  });
  assert.equal(out.length, 5);
  assert.equal(calls, 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.RENDER_MODEL = 'test/model';

const { parseProductHtml, inferCategory, inferTier } = await import('../src/productimport.js');

const HTML = `<!doctype html><html><head>
<title>Диван Osло — купить в интернет-магазине</title>
<meta property="og:title" content="Диван Osло, букле" />
<meta property="og:description" content="Трёхместный диван из букле для гостиной" />
<meta property="og:image" content="https://cdn.example.com/sofa.jpg" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Диван Osло, букле","brand":{"name":"Osло"},"image":["https://cdn.example.com/sofa.jpg"],"description":"Трёхместный диван из букле для гостиной","sku":"OS-123","offers":{"@type":"Offer","price":"129990","priceCurrency":"RUB","availability":"https://schema.org/InStock"},"aggregateRating":{"ratingValue":"4.8","reviewCount":"42"}}
</script></head><body></body></html>`;

test('parses JSON-LD product fields', () => {
  const p = parseProductHtml(HTML, 'https://shop.example.com/sofa');
  assert.equal(p.name, 'Диван Osло, букле');
  assert.equal(p.brand, 'Osло');
  assert.equal(p.price, 129990);
  assert.equal(p.currency, 'RUB');
  assert.equal(p.image_url, 'https://cdn.example.com/sofa.jpg');
  assert.equal(p.rating, 4.8);
  assert.equal(p.reviews, 42);
  assert.equal(p.sku, 'OS-123');
});

test('falls back to OpenGraph and title', () => {
  const p = parseProductHtml('<html><head><meta property="og:title" content="Кресло Букле"><meta property="og:image" content="https://x.test/a.jpg"><meta property="product:price:amount" content="42 990"></head></html>', 'https://x.test/p');
  assert.equal(p.name, 'Кресло Букле');
  assert.equal(p.price, 42990);
  assert.equal(p.image_url, 'https://x.test/a.jpg');
});

test('infers category and price tier', () => {
  assert.equal(inferCategory('Диван трёхместный из букле для гостиной'), 'sofa');
  assert.equal(inferCategory('Инженерная доска дуб 220 мм'), 'floor');
  assert.equal(inferCategory('Смеситель для кухни'), 'faucet');
  assert.equal(inferTier('sofa', 45000), 'start');
  assert.equal(inferTier('sofa', 90000), 'comfort');
  assert.equal(inferTier('sofa', 180000), 'premium');
  assert.equal(inferTier('sofa', 300000), 'atelier');
});

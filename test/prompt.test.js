import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.RENDER_MODEL = 'test/model';

const { buildPrompt, buildEditPrompt } = await import('../src/openrouter.js');
const { nearestRal } = await import('../src/analysis.js');
const { designProducts, canBindProduct, canReplaceWithProduct } = await import('../src/productpipeline.js');

const PRODUCT = {
  id: 1,
  slot: 'floor',
  category: 'floor',
  name: 'Инженерная доска «Светлый дуб»',
  brand: null,
  attrs: { цвет: 'светлый дуб', материал: 'инженерная доска' },
  dimensions: { text: '220×2200×14 мм' },
  has_ref: true,
};

test('base prompt is a deep redesign with explicit keep/change and material class', () => {
  const prompt = buildPrompt({
    style: 'Джапанди',
    priceTier: 'comfort',
    products: [PRODUCT],
    roomType: 'Спальня',
    imageMap: [
      { role: 'source room', label: 'preserve architecture' },
      { role: 'style reference', label: 'mood and materials' },
      { role: 'product reference', label: 'floor' },
    ],
  });
  assert.match(prompt, /KEEP EXACTLY/);
  assert.match(prompt, /CHANGE \/ DEEP TRANSFORMATION/);
  assert.match(prompt, /MATERIAL CLASS/);
  assert.match(prompt, /floor finish/);
  assert.match(prompt, /dimensions: 220×2200×14 мм/);
  assert.match(prompt, /Comfort/);
  assert.match(prompt, /preserve the existing floor/i);
  assert.doesNotMatch(prompt, /Use EXACTLY these specific products/);
  assert.match(prompt, /Image 1|1\. source room/);
});

test('prompt modes can drop furniture and catalog', () => {
  const prompt = buildPrompt({
    style: 'Джапанди',
    priceTier: 'comfort',
    products: [PRODUCT],
    roomType: 'Спальня',
    keepFurniture: false,
    useCatalog: false,
    imageMap: [{ role: 'style reference' }],
  });
  assert.match(prompt, /FURNITURE MODE/);
  assert.match(prompt, /Replace and restyle existing loose furniture/);
  assert.match(prompt, /CATALOG DISABLED/);
  assert.doesNotMatch(prompt, /Инженерная доска/);
});

test('edit prompt is short, target-specific and reference-aware', () => {
  const prompt = buildEditPrompt({
    roomType: 'Спальня',
    target: 'light',
    instruction: 'Заменить на латунный подвес',
    hasRef: true,
    refLabel: 'Подвес «Латунь»',
    refDimensions: '⌀45×30 см',
  });
  assert.match(prompt, /Change only the ceiling light/);
  assert.match(prompt, /Image 2/);
  assert.match(prompt, /dimensions ⌀45×30 см/);
  assert.match(prompt, /Keep everything else exactly as in Image 1/);
  assert.doesNotMatch(prompt, /MATERIAL PALETTE/);
  assert.doesNotMatch(prompt, /KEEP EXACTLY/);
});

test('design pass excludes hero products and keeps preserved furniture out of replacements', () => {
  const sofa = { ...PRODUCT, id: 2, category: 'sofa', name: 'Диван «Тест»', image_url: '/catalog/sofa.webp' };
  const light = { ...PRODUCT, id: 3, category: 'light', name: 'Свет «Тест»', image_url: '/catalog/light.webp' };
  const materials = designProducts([sofa, PRODUCT, light]);
  assert.deepEqual(materials.map(product => product.id), [PRODUCT.id]);

  const prompt = buildPrompt({
    style: 'Джапанди',
    products: materials,
    roomType: 'Спальня',
    keepFurniture: true,
    hasStyleRef: true,
  });
  assert.match(prompt, /NO PRODUCT IMAGES/);
  assert.match(prompt, /Do not copy its furniture/);
  assert.doesNotMatch(prompt, /Диван «Тест»|Свет «Тест»/);
  assert.doesNotMatch(prompt, /replace or restyle the bed/i);
  assert.equal(canBindProduct(sofa, true), false);
  assert.equal(canBindProduct(light, true), true);
  assert.equal(canReplaceWithProduct(sofa, false), true);
});

test('nearest RAL maps pure white to RAL 9010', () => {
  const ral = nearestRal('#F1EDE1');
  assert.equal(ral?.code, 'RAL 9010');
});

test('catalog seed has unique keys and generated images', () => {
  const seedPath = path.join(process.cwd(), 'catalog', 'seed.json');
  const items = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  assert.ok(items.length >= 40);
  const keys = new Set();
  for (const item of items) {
    assert.ok(item.seed_key && item.image && item.image_prompt);
    assert.ok(!keys.has(item.seed_key), `duplicate seed_key ${item.seed_key}`);
    keys.add(item.seed_key);
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public', 'catalog', item.image)), `missing ${item.image}`);
  }
});

test('base prompt locks architecture and avoids structural additions', () => {
  const prompt = buildPrompt({
    style: 'Скандинавский',
    roomType: 'Спальня',
    keepFurniture: false,
    useCatalog: false,
    hasStyleRef: true,
    imageMap: [{ role: 'source room' }, { role: 'art reference' }],
  });
  assert.match(prompt, /ARCHITECTURE LOCK/);
  assert.match(prompt, /LOCKED INVARIANTS/);
  assert.match(prompt, /Built-ins are architecture, not furniture/);
  assert.match(prompt, /Do not add a second window/);
  assert.match(prompt, /Ignore all architecture in the reference/);
  assert.match(prompt, /cosmetic renovation/);
  assert.doesNotMatch(prompt, /deep renovation/);
  assert.doesNotMatch(prompt, /warm cove or wall wash|headboard ledge|hide the cornice/);
});

test('edit prompt preserves built-ins and room geometry', () => {
  const prompt = buildEditPrompt({ roomType: 'Спальня', target: 'light', instruction: 'replace pendant', hasRef: true });
  assert.match(prompt, /LOCKED INVARIANTS/);
  assert.match(prompt, /Built-in shelving/);
  assert.match(prompt, /Do not move objects/);
});

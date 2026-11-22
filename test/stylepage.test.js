import test from 'node:test';
import assert from 'node:assert/strict';

import { STYLE_SEO } from '../src/styleseo.js';
import {
  buildStyleCard, styleCoverUrl, stylesHubPage, stylePage, relatedStyleCards, confusionStyleCards,
} from '../src/stylepage.js';

// Строка БД в виде, который отдаёт q.styles(true).
const row = (key, extra = {}) => ({ key, name: STYLE_SEO.find(s => s.key === key)?.name || key, ...extra });

test('stylepage: buildStyleCard merges STYLE_SEO meta and designdata materials', () => {
  const card = buildStyleCard(row('scandinavian', {
    name: 'Скандинавский',
    description: 'Светлый дуб, лён, шерсть и много естественного света',
    swatches: [{ hex: '#FAF8F4', name: 'основной' }],
  }));
  assert.equal(card.key, 'scandinavian');
  assert.equal(card.h1, 'Скандинавский стиль в интерьере');
  assert.equal(card.title, 'Скандинавский стиль в интерьере: фото, свет и материалы');
  assert.equal(card.family, 'Современные');
  assert.equal(card.tier, 1);
  assert.equal(card.lead, 'Светлый дуб, лён, шерсть и много естественного света');
  assert.equal(card.materials, 'светлый дуб, белёный текстиль, шерсть, керамика');
  assert.deepEqual(card.palette, [{ hex: '#FAF8F4', name: 'основной' }]);
});

test('stylepage: buildStyleCard falls back to designdata palette without swatches', () => {
  const card = buildStyleCard(row('scandinavian', { description: 'лид' }));
  assert.ok(card.palette.length >= 4);
  assert.ok(card.palette.every(c => /^#[0-9A-Fa-f]{6}$/.test(c.hex)));
});

test('stylepage: cover URL resolves canonical key to a webp asset', () => {
  assert.equal(styleCoverUrl(row('scandinavian')), '/images/style-scandi.webp');
  assert.equal(styleCoverUrl(row('minimalism')), '/images/style-minimal.webp');
  assert.equal(styleCoverUrl(row('unknown-key')), '/images/style-modern.webp');
});

test('stylepage: hub lists all styles grouped by family with ItemList', () => {
  const cards = STYLE_SEO.map(s => buildStyleCard(row(s.key, { description: 'лид' })));
  const html = stylesHubPage(cards);
  assert.match(html, /<title>Стили интерьера: все направления с палитрами — ремонтвижн<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/styles">/);
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /"numberOfItems":32/);
  // 32 карточки-ссылки на /styles/{key}
  assert.equal((html.match(/href="\/styles\//g) || []).length, 32);
  // группировка по семействам
  assert.match(html, /<h2>Современные<\/h2>/);
  assert.match(html, /<h2>Классика<\/h2>/);
  assert.match(html, /<h2>Тёплые \/ природные<\/h2>/);
  assert.match(html, /<h2>Акцентные<\/h2>/);
});

test('stylepage: detail page has self-canonical, unique meta, no canonical to home', () => {
  const cards = STYLE_SEO.map(s => buildStyleCard(row(s.key, { description: 'лид' })));
  const card = cards.find(c => c.key === 'scandinavian');
  const html = stylePage(card, { allCards: cards });
  assert.match(html, /<title>Скандинавский стиль в интерьере: фото, свет и материалы<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/styles\/scandinavian">/);
  assert.ok(!html.includes('<link rel="canonical" href="https://www.remontvision.ru/">'));
  assert.match(html, /<h1>Скандинавский стиль в интерьере<\/h1>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.remontvision\.ru\/images\/style-scandi\.webp">/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  // палитра и материалы
  assert.match(html, /светлый дуб, белёный текстиль, шерсть, керамика/);
  assert.match(html, /class="swatch"/);
  // CTA с событием
  assert.match(html, /style_generate_click/);
  assert.match(html, /style_view/);
});

test('stylepage: related and confusion links come from family and CONFUSIONS', () => {
  const cards = STYLE_SEO.map(s => buildStyleCard(row(s.key, { description: 'лид' })));
  const card = cards.find(c => c.key === 'scandinavian');
  const related = relatedStyleCards(cards, card);
  assert.ok(related.length >= 4);
  assert.ok(related.every(c => c.family === 'Современные'));
  assert.ok(!related.some(c => c.key === 'scandinavian'));

  const confusions = confusionStyleCards(cards, card);
  assert.ok(confusions.length >= 2);
  assert.ok(confusions.some(c => c.key === 'minimalism') && confusions.some(c => c.key === 'japandi'));

  const html = stylePage(card, { allCards: cards });
  assert.match(html, /Похожие стили/);
  assert.match(html, /Не путать с/);
});

test('stylepage: hub loads only the first 6 cards eagerly, the rest lazy', () => {
  const cards = STYLE_SEO.map(s => buildStyleCard(row(s.key, { description: 'лид' })));
  const html = stylesHubPage(cards);
  const eager = (html.match(/loading="eager"/g) || []).length;
  const lazy = (html.match(/loading="lazy"/g) || []).length;
  assert.equal(eager, 6);
  assert.equal(lazy, 26); // 32 карточки минус 6 eager
});

test('stylepage: hub and detail footers link /styles /articles /gallery', () => {
  const cards = STYLE_SEO.map(s => buildStyleCard(row(s.key, { description: 'лид' })));
  const hub = stylesHubPage(cards);
  assert.match(hub, /href="\/styles"/);
  assert.match(hub, /href="\/articles"/);
  assert.match(hub, /href="\/gallery"/);
  const card = cards.find(c => c.key === 'loft');
  const detail = stylePage(card, { allCards: cards });
  assert.match(detail, /href="\/styles"/);
  assert.match(detail, /href="\/articles"/);
  assert.match(detail, /href="\/gallery"/);
});

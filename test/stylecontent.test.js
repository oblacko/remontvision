import test from 'node:test';
import assert from 'node:assert/strict';

import { STYLE_SEO, STYLE_FAMILY_ORDER, CONFUSIONS } from '../src/styleseo.js';
import { STYLE_CONTENT, STYLE_CTA, styleContentByKey } from '../src/stylecontent.js';
import { buildStyleCard, stylePage } from '../src/stylepage.js';

const words = value => String(value || '').trim().split(/\s+/).filter(Boolean).length;
const allText = c => [
  c.intro, ...c.quick, c.paletteText, c.light, c.rooms, c.pairs,
  ...c.faq.flatMap(f => [f.q, f.a]),
].join(' ');

const tierByKey = new Map(STYLE_SEO.map(s => [s.key, s.tier]));
const row = key => ({ key, name: STYLE_SEO.find(s => s.key === key)?.name || key, description: 'лид' });
const allCards = () => STYLE_SEO.map(s => buildStyleCard(row(s.key)));

test('stylecontent: 32 entries match STYLE_SEO keys exactly', () => {
  const keys = Object.keys(STYLE_CONTENT).sort();
  const expected = STYLE_SEO.map(s => s.key).sort();
  assert.deepEqual(keys, expected);
  assert.equal(keys.length, 32);
});

test('stylecontent: every entry has all required blocks and 4 HEX', () => {
  for (const [key, c] of Object.entries(STYLE_CONTENT)) {
    assert.ok(c.intro && c.paletteText && c.light && c.rooms && c.pairs, `${key}: пустой блок`);
    assert.ok(Array.isArray(c.quick) && c.quick.length >= 3 && c.quick.length <= 5, `${key}: quick`);
    assert.ok(Array.isArray(c.faq) && c.faq.length >= 2, `${key}: faq`);
    assert.ok(Array.isArray(c.links) && c.links.length >= 4 && c.links.length <= 6, `${key}: links`);
    assert.equal(c.palette.length, 4, `${key}: палитра`);
    for (const swatch of c.palette) assert.match(swatch.hex, /^#[0-9A-Fa-f]{6}$/);
    for (const swatch of c.palette) {
      assert.ok(c.paletteText.includes(swatch.hex), `${key}: HEX ${swatch.hex} не описан в тексте`);
    }
    assert.match(c.imageAlt, / (в|на) .+: /, `${key}: alt по шаблону «{Название} в {комнате}: {деталь}»`);
    assert.ok(c.materials && c.materials.length > 3, `${key}: материалы`);
    assert.ok(STYLE_FAMILY_ORDER.includes(STYLE_SEO.find(s => s.key === key).family), `${key}: семейство`);
  }
});

test('stylecontent: FAQ count matches tier', () => {
  for (const [key, c] of Object.entries(STYLE_CONTENT)) {
    const tier = tierByKey.get(key);
    if (tier === 1) assert.ok(c.faq.length >= 3 && c.faq.length <= 5, `${key}: T1 FAQ`);
    else assert.ok(c.faq.length >= 2 && c.faq.length <= 3, `${key}: T2/T3 FAQ`);
  }
});

test('stylecontent: volume stays within wave bounds', () => {
  const bounds = { 1: [450, 600], 2: [300, 400], 3: [200, 300] };
  for (const [key, c] of Object.entries(STYLE_CONTENT)) {
    const [min, max] = bounds[tierByKey.get(key)];
    const total = words(allText(c));
    assert.ok(total >= min && total <= max, `${key}: ${total} слов, ожидалось ${min}–${max}`);
  }
});

test('stylecontent: no sentence longer than 20 words repeats across pages', () => {
  const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  for (const [key, c] of Object.entries(STYLE_CONTENT)) {
    const sentences = allText(c).split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (words(sentence) <= 20) continue;
      const normalized = normalize(sentence);
      assert.ok(!seen.has(normalized), `${key}: повторяет абзац со страницы ${seen.get(normalized)}`);
      seen.set(normalized, key);
    }
  }
});

test('stylecontent: links point to real styles and not to itself', () => {
  const keys = new Set(STYLE_SEO.map(s => s.key));
  for (const [key, c] of Object.entries(STYLE_CONTENT)) {
    assert.equal(new Set(c.links).size, c.links.length, `${key}: дубли ссылок`);
    for (const link of c.links) {
      assert.ok(keys.has(link), `${key}: неизвестная ссылка ${link}`);
      assert.notEqual(link, key, `${key}: ссылка на себя`);
    }
  }
});

test('stylecontent: no promises of real products, estimates or budget', () => {
  for (const [key, c] of Object.entries(STYLE_CONTENT)) {
    assert.doesNotMatch(allText(c), /реальн(ые|ых|ым) товар|смет[аыу]|бюджет/i, `${key}: обещание функции`);
  }
});

test('stylecontent: CTA is shared by all pages and does not promise checkout', () => {
  assert.ok(words(STYLE_CTA) <= 20);
  assert.doesNotMatch(STYLE_CTA, /товар|смет|бюджет/i);
  assert.equal(styleContentByKey('scandinavian').links.length, 5);
  assert.equal(styleContentByKey('unknown'), null);
});

test('stylepage: detail page renders every content block, FAQ JSON-LD and two CTAs', () => {
  const cards = allCards();
  const card = cards.find(c => c.key === 'scandinavian');
  const html = stylePage(card, { allCards: cards, rooms: [{ name: 'Гостиная', slug: 'living-room' }, { name: 'Спальня', slug: 'bedroom' }, { name: 'Кухня', slug: 'kitchen' }] });
  const content = STYLE_CONTENT.scandinavian;

  assert.match(html, /Узнать за 10 секунд/);
  assert.match(html, /Палитра и материалы/);
  assert.match(html, /Свет и архитектура/);
  assert.match(html, /Где работает/);
  assert.match(html, /С чем сочетается и с чем путают/);
  assert.match(html, /Вопросы и ответы/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, new RegExp(content.intro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(content.imageAlt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /AI-визуализация стиля/);
  // Свотчи на странице совпадают с HEX в тексте палитры (единый источник контента).
  for (const swatch of content.palette) assert.ok(html.includes(`background:${swatch.hex}`), `свотч ${swatch.hex}`);
  assert.equal((html.match(/style_generate_click/g) || []).length, 2);
  // 4–6 ссылок на стили + «не путать» + комнаты, но не больше двух комнат.
  assert.equal((html.match(/href="\/styles\//g) || []).length, content.links.length + CONFUSIONS.scandinavian.length);
  assert.equal((html.match(/href="\/gallery\//g) || []).length, 2);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test('stylepage: content-less style is noindex and falls back to DB lead', () => {
  const card = buildStyleCard(row('scandinavian'));
  const custom = { ...card, key: 'no-content', name: 'Без текста', h1: 'Без текста', lead: 'Короткий лид.' };
  const html = stylePage(custom, { allCards: [] });
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /Короткий лид\./);
  assert.ok(!html.includes('Узнать за 10 секунд'));
});

test('stylepage: buildStyleCard uses content palette and materials for styles outside designdata', () => {
  const card = buildStyleCard(row('high_tech'));
  assert.equal(card.palette.length, 4);
  assert.match(card.materials, /хром/i);
  assert.equal(card.palette[0].hex, '#F0F2F4');
});

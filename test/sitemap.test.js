import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemapXml, escapeXml, STATIC_ENTRIES } from '../src/sitemap.js';

test('sitemap: valid XML declaration and urlset namespace', () => {
  const xml = buildSitemapXml({ staticEntries: [], articles: [] });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
});

test('sitemap: includes published article URL with lastmod from created_at', () => {
  const xml = buildSitemapXml({
    staticEntries: [],
    articles: [{ slug: 'scandi-spalnya', status: 'published', created_at: '2026-11-09T10:00:00Z' }],
    baseUrl: 'https://www.remontvision.ru',
  });
  assert.match(xml, /<loc>https:\/\/www\.remontvision\.ru\/articles\/scandi-spalnya<\/loc>/);
  assert.match(xml, /<lastmod>2026-11-09<\/lastmod>/);
});

test('sitemap: excludes non-published articles', () => {
  const xml = buildSitemapXml({
    staticEntries: [],
    articles: [
      { slug: 'draft-slug', status: 'draft' },
      { slug: 'published-slug', status: 'published', created_at: '2026-11-09T00:00:00Z' },
    ],
  });
  assert.ok(!xml.includes('articles/draft-slug'));
  assert.ok(xml.includes('articles/published-slug'));
});

test('sitemap: includes static /offer entry', () => {
  const xml = buildSitemapXml({ staticEntries: STATIC_ENTRIES, articles: [] });
  assert.match(xml, /<loc>https:\/\/www\.remontvision\.ru\/offer<\/loc>/);
});

test('sitemap: lastmod falls back to today when date is missing', () => {
  const xml = buildSitemapXml({
    staticEntries: [],
    articles: [{ slug: 'no-date', status: 'published' }],
  });
  const today = new Date().toISOString().slice(0, 10);
  assert.match(xml, new RegExp(`<lastmod>${today}</lastmod>`));
});

test('sitemap: escapes & < > " \' in XML text', () => {
  assert.equal(escapeXml('a&b<c>d"e\'f'), 'a&amp;b&lt;c&gt;d&quot;e&#39;f');
});

test('sitemap: article slug is URL-encoded and never leaks raw XML chars', () => {
  const xml = buildSitemapXml({
    staticEntries: [],
    articles: [{ slug: 'a&b<c>d', status: 'published', created_at: '2026-11-09T00:00:00Z' }],
  });
  assert.ok(xml.includes('articles/a%26b%3Cc%3Ed'));
  assert.ok(!/<loc>[^<]*[<>&][^<]*<\/loc>/.test(xml));
});

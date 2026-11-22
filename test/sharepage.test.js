import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePageHtml, noindexHtml } from '../src/sharepage.js';

test('sharePageHtml injects escaped og tags', () => {
  const html = sharePageHtml({
    indexHtml: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>',
    title: 'Дизайн "Скандинавский" — RemontVision',
    description: 'Гостиная · нейросеть',
    imageUrl: 'https://www.remontvision.ru/s/tok/image',
    canonicalUrl: 'https://www.remontvision.ru/s/tok',
  });
  assert.ok(html.includes('<meta property="og:image" content="https://www.remontvision.ru/s/tok/image">'));
  assert.ok(html.includes('og:title'));
  assert.ok(html.includes('&quot;Скандинавский&quot;'));
  assert.ok(html.includes('noindex'));
  assert.ok(html.includes('twitter:card'));
});

test('sharePageHtml returns null for empty index', () => {
  assert.equal(sharePageHtml({ indexHtml: '', title: '', description: '', imageUrl: '', canonicalUrl: '' }), null);
});

test('sharePageHtml strips conflicting robots/canonical/og:url from the SPA shell', () => {
  const html = sharePageHtml({
    indexHtml: '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="https://www.remontvision.ru/"><meta property="og:url" content="https://www.remontvision.ru/"><title>Лендинг</title></head><body></body></html>',
    title: 'Дизайн',
    description: 'Описание',
    imageUrl: 'https://www.remontvision.ru/s/tok/image',
    canonicalUrl: 'https://www.remontvision.ru/s/tok',
  });
  assert.ok(!html.includes('content="index'), 'остался index,follow из оболочки');
  // Один canonical — на /s/tok, не на «/».
  const canonicals = html.match(/rel="canonical"/g) || [];
  assert.equal(canonicals.length, 1);
  assert.ok(html.includes('rel="canonical" href="https://www.remontvision.ru/s/tok"'));
  assert.ok(!html.includes('rel="canonical" href="https://www.remontvision.ru/"'));
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
});

test('noindexHtml strips indexing meta and injects noindex, follow', () => {
  const html = noindexHtml('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="index, follow"><link rel="canonical" href="https://www.remontvision.ru/"><title>Кабинет</title></head><body></body></html>');
  assert.ok(!html.includes('content="index'), 'остался index,follow из оболочки');
  assert.ok(!html.includes('rel="canonical"'));
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.ok(html.includes('<title>Кабинет</title>'), 'title оболочки сохраняется');
});

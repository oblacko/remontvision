import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePageHtml } from '../src/sharepage.js';

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

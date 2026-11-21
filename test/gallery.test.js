import test from 'node:test';
import assert from 'node:assert/strict';

import { galleryPage, GALLERY_PAGE_SIZE } from '../src/gallery.js';

const ROOMS = [{ name: 'Кухня', slug: 'kuhnya', count: 78 }, { name: 'Спальня', slug: 'spalnya', count: 5 }];
const ITEMS = [{ id: 'r1', style: 'Скандинавский', roomType: 'Кухня', shareToken: 'tok1' }];

test('gallery: first page is index with room filters and share links', () => {
  const html = galleryPage(ITEMS, { page: 1, total: 80, rooms: ROOMS });
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/gallery">/);
  assert.match(html, /<title>Галерея дизайнов интерьера по фото — ремонтвижн<\/title>/);
  assert.match(html, /href="\/gallery\/kuhnya"/);
  assert.match(html, /Кухня <b>78<\/b>/);
  assert.match(html, /href="\/s\/tok1"/);
  assert.match(html, /utm_campaign=all/);
});

test('gallery: deep pages are noindex and canonicalize to base', () => {
  const html = galleryPage(ITEMS, { page: 2, total: 80, rooms: ROOMS });
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/gallery">/);
  assert.match(html, /Галерея дизайнов интерьера — страница 2/);
  assert.match(html, /href="\/gallery\?page=3"/);
});

test('gallery: room filter gets unique title and count', () => {
  const html = galleryPage(ITEMS, { room: 'Кухня', roomSlug: 'kuhnya', page: 1, total: 78, rooms: ROOMS });
  assert.match(html, /<title>Кухня: 78 дизайнов интерьера по фото — ремонтвижн<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/gallery\/kuhnya">/);
  assert.match(html, /utm_campaign=kuhnya/);
});

test('gallery: empty state renders', () => {
  const html = galleryPage([], { page: 1, total: 0, rooms: [] });
  assert.match(html, /Публичных дизайнов пока нет/);
  assert.ok(!html.includes('class="rooms"'));
});

test('gallery: page size is stable for pagination math', () => {
  assert.equal(GALLERY_PAGE_SIZE, 24);
});

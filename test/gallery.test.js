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

test('gallery: room title uses plural form, genitive description, renames «Гостиная (зал)»', () => {
  const g22 = galleryPage([], { room: 'Гостиная (зал)', roomSlug: 'gostinaya-zal', page: 1, total: 22, rooms: [] });
  assert.match(g22, /<title>Гостиная: 22 дизайна интерьера по фото — ремонтвижн<\/title>/);
  assert.match(g22, /Готовые AI-дизайны гостиной в разных стилях/);
  assert.ok(!g22.includes('Гостиная (зал):'));
  const s95 = galleryPage([], { room: 'Спальня', roomSlug: 'spalnya', page: 1, total: 95, rooms: [] });
  assert.match(s95, /<title>Спальня: 95 дизайнов интерьера по фото — ремонтвижн<\/title>/);
  assert.match(s95, /Готовые AI-дизайны спальни в разных стилях/);
});

test('gallery: «Другое» and «Кладовка» are noindex and excluded from room nav', () => {
  const rooms = [
    { name: 'Кухня', slug: 'kuhnya', count: 12 },
    { name: 'Другое', slug: 'drugoe', count: 14 },
    { name: 'Кладовка', slug: 'kladovka', count: 4 },
  ];
  const drugoe = galleryPage([], { room: 'Другое', roomSlug: 'drugoe', page: 1, total: 14, rooms });
  assert.match(drugoe, /<meta name="robots" content="noindex, follow">/);
  const all = galleryPage([], { page: 1, total: 12, rooms });
  assert.match(all, /href="\/gallery\/kuhnya"/);
  assert.ok(!all.includes('href="/gallery/drugoe"'));
  assert.ok(!all.includes('href="/gallery/kladovka"'));
});

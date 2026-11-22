import test from 'node:test';
import assert from 'node:assert/strict';

import { FEATURED_RENDERS, GALLERY_ROOMS, buildFeaturedItems } from '../src/galleryfeatured.js';

const pair = (entry, render) => ({ entry, render });

test('galleryfeatured: список курируемых рендеров — массив (пуст до подтверждения G3)', () => {
  assert.ok(Array.isArray(FEATURED_RENDERS));
});

test('galleryfeatured: 6 канонических комнат для ряда ссылок /gallery/{slug}', () => {
  assert.deepEqual(GALLERY_ROOMS, ['Спальня', 'Гостиная (зал)', 'Кухня', 'Кабинет', 'Санузел', 'Детская']);
});

test('galleryfeatured: отдаёт только done + картинка + не приватные', () => {
  const ok = { id: 'r1', status: 'done', image_path: 'renders/a.webp', is_private: false, style: 'Скандинавский', share_token: 'tok1' };
  const items = buildFeaturedItems([
    pair({ id: 'r1', roomType: 'Спальня', style: '' }, ok),
    pair({ id: 'r2', roomType: 'Кухня', style: '' }, { ...ok, id: 'r2', is_private: true }),
    pair({ id: 'r3', roomType: 'Кухня', style: '' }, { ...ok, id: 'r3', status: 'queued' }),
    pair({ id: 'r4', roomType: 'Кухня', style: '' }, { ...ok, id: 'r4', image_path: null }),
    pair({ id: 'r5', roomType: 'Кухня', style: '' }, null),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'r1');
  assert.equal(items[0].roomType, 'Спальня');
  assert.equal(items[0].style, 'Скандинавский');
  assert.equal(items[0].imageUrl, '/gallery/img/r1');
  assert.equal(items[0].shareToken, 'tok1');
});

test('galleryfeatured: style берётся из БД, при пустом — из записи списка', () => {
  const row = { id: 'r1', status: 'done', image_path: 'renders/a.webp', is_private: false, style: '', share_token: null };
  const items = buildFeaturedItems([pair({ id: 'r1', roomType: 'Гостиная', style: 'Лофт' }, row)]);
  assert.equal(items[0].style, 'Лофт');
});

test('galleryfeatured: shareToken — null при отсутствии токена', () => {
  const row = { id: 'r1', status: 'done', image_path: 'renders/a.webp', is_private: false, style: 'Лофт', share_token: null };
  const items = buildFeaturedItems([pair({ id: 'r1', roomType: 'Гостиная', style: '' }, row)]);
  assert.equal(items[0].shareToken, null);
});

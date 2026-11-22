import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STYLE_SEO, STYLE_FAMILY_ORDER, styleSeoByKey, styleKeyByName, CONFUSIONS,
} from '../src/styleseo.js';

test('styleseo: 32 unique keys', () => {
  assert.equal(STYLE_SEO.length, 32);
  const keys = STYLE_SEO.map(s => s.key);
  assert.equal(new Set(keys).size, 32);
});

test('styleseo: every record has non-empty h1/title/description/target_query', () => {
  for (const s of STYLE_SEO) {
    assert.ok(String(s.h1 || '').trim().length > 0, `${s.key}: h1 пуст`);
    assert.ok(String(s.title || '').trim().length > 0, `${s.key}: title пуст`);
    assert.ok(String(s.description || '').trim().length > 0, `${s.key}: description пуст`);
    assert.ok(String(s.target_query || '').trim().length > 0, `${s.key}: target_query пуст`);
  }
});

test('styleseo: title ≤65 symbols', () => {
  for (const s of STYLE_SEO) {
    assert.ok(s.title.length <= 65, `${s.key}: title ${s.title.length} симв.`);
  }
});

// Копирайт SEO-лида финализирован: длина description 130–165 симв. (три записи — 132).
test('styleseo: description within 130–165 symbols', () => {
  for (const s of STYLE_SEO) {
    assert.ok(s.description.length >= 130 && s.description.length <= 165,
      `${s.key}: description ${s.description.length} симв.`);
  }
});

test('styleseo: family and tier are valid', () => {
  for (const s of STYLE_SEO) {
    assert.ok(STYLE_FAMILY_ORDER.includes(s.family), `${s.key}: family ${s.family}`);
    assert.ok([1, 2, 3].includes(s.tier), `${s.key}: tier ${s.tier}`);
  }
});

test('styleseo: every style belongs to one of four families', () => {
  const grouped = new Map();
  for (const s of STYLE_SEO) {
    if (!grouped.has(s.family)) grouped.set(s.family, []);
    grouped.get(s.family).push(s.key);
  }
  assert.deepEqual([...grouped.keys()].sort(), [...STYLE_FAMILY_ORDER].sort());
  const total = [...grouped.values()].reduce((n, arr) => n + arr.length, 0);
  assert.equal(total, 32);
});

test('styleseo: styleSeoByKey resolves keys and rejects unknown', () => {
  assert.equal(styleSeoByKey('scandinavian').key, 'scandinavian');
  assert.equal(styleSeoByKey('scandinavian').h1, 'Скандинавский стиль в интерьере');
  assert.equal(styleSeoByKey('no-such-style'), null);
});

test('styleseo: styleKeyByName maps display names of active styles to keys', () => {
  const active = {
    'Современный минимализм': 'minimalism',
    'Скандинавский': 'scandinavian',
    'Джапанди': 'japandi',
    'Лофт': 'loft',
    'Неоклассика': 'neoclassic',
    'Эко / органический модерн': 'eco',
    'Тёмный контемпорари': 'dark_contemporary',
    'Ар-деко': 'art_deco',
    'Средиземноморский': 'mediterranean',
    'Мемфис-акцент': 'memphis_accent',
  };
  for (const [name, key] of Object.entries(active)) {
    assert.equal(styleKeyByName(name), key, `имя ${name}`);
  }
  assert.equal(styleKeyByName('Нет такого стиля'), null);
});

test('styleseo: CONFUSIONS only reference known keys and are symmetric', () => {
  const keys = new Set(STYLE_SEO.map(s => s.key));
  for (const [from, toList] of Object.entries(CONFUSIONS)) {
    assert.ok(keys.has(from), `CONFUSIONS: ${from} нет в STYLE_SEO`);
    for (const to of toList) {
      assert.ok(keys.has(to), `CONFUSIONS: ${to} нет в STYLE_SEO`);
      assert.ok(CONFUSIONS[to].includes(from), `CONFUSIONS: ${from}↔${to} не симметрична`);
    }
  }
});

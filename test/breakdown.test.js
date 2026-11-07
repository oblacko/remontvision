import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeBreakdown,
  buildBreakdownSystem,
  buildBreakdownUser,
  SECTION_TITLES,
  BREAKDOWN_ICON_KEYS,
} = await import('../src/breakdowndata.js');

test('normalizeBreakdown keeps up to 3 top cards and validates icons', () => {
  const result = normalizeBreakdown({
    title: '  Как воплотить этот дизайн  ',
    lead: 'Что повторить и что купить.',
    top_cards: [
      { icon: 'sofa', title: 'Что создаёт образ', preview: 'Светлые фасады и дерево.' },
      { icon: 'unknown-icon', title: 'До заказа кухни', preview: 'Проверьте открывание.' },
      { icon: 'ruler', title: 'Что измерить' },
      { icon: 'tag', title: 'Лишняя карточка' },
    ],
  });

  assert.equal(result.version, 2);
  assert.equal(result.title, 'Как воплотить этот дизайн');
  assert.equal(result.top_cards.length, 3);
  assert.equal(result.top_cards[0].icon, 'sofa');
  assert.equal(result.top_cards[1].icon, 'sparkles');
  assert.equal(result.top_cards[2].preview, '');
});

test('normalizeBreakdown keeps only known non-empty sections with limits', () => {
  const result = normalizeBreakdown({
    sections: [
      { key: 'buy', cards: Array.from({ length: 7 }, (_, i) => ({ name: `Позиция ${i}` })) },
      { key: 'calc', cards: Array.from({ length: 5 }, (_, i) => ({ element: `Связка ${i}` })) },
      { key: 'check', cards: Array.from({ length: 4 }, (_, i) => ({ what: `Проверка ${i}` })) },
      { key: 'start', cards: [{ action: 'Снять размеры' }, { action: 'Вторая' }] },
      { key: 'unknown', cards: [{ name: 'Мусор' }] },
      { key: 'buy', cards: [{ name: 'Дубль' }] },
      { key: 'save', cards: [] },
    ],
  });

  assert.deepEqual(result.sections.map(section => section.key), ['buy', 'calc', 'check', 'start']);
  assert.equal(result.sections[0].cards.length, 5);
  assert.equal(result.sections[1].cards.length, 3);
  assert.equal(result.sections[2].cards.length, 3);
  assert.equal(result.sections[3].cards.length, 1);
  assert.equal(result.sections[3].title, SECTION_TITLES.start);
  assert.equal(result.sections[3].icon, 'rocket');
});

test('normalizeBreakdown maps card fields and falls back to section icons', () => {
  const result = normalizeBreakdown({
    sections: [
      { key: 'buy', cards: [{ name: 'Стол', traits: 'дуб', clarify: 'длина', icon: 'table' }] },
      { key: 'calc', cards: [{ element: 'Окно', note: 'комплект и монтаж' }] },
      { key: 'check', cards: [{ what: 'Габариты', when: 'до заказа', why: 'совместимость' }] },
      { key: 'start', cards: [{ action: 'Измерить проход', why: 'проверить эргономику' }] },
    ],
  });

  assert.deepEqual(result.sections[0].cards[0], { icon: 'table', name: 'Стол', traits: 'дуб', clarify: 'длина' });
  assert.equal(result.sections[1].cards[0].icon, 'calculator');
  assert.equal(result.sections[2].cards[0].icon, 'check');
  assert.equal(result.sections[2].cards[0].when, 'до заказа');
  assert.equal(result.sections[3].cards[0].icon, 'rocket');
  assert.equal(result.sections[3].cards[0].why, 'проверить эргономику');
});

test('normalizeBreakdown accepts sections as an object and returns null when empty', () => {
  const result = normalizeBreakdown({
    sections: {
      buy: { cards: [{ name: 'Стул' }] },
      start: { cards: [{ action: 'Позвать замерщика' }] },
    },
  });

  assert.equal(result.sections.length, 2);
  assert.equal(normalizeBreakdown({ top_cards: [], sections: [] }), null);
});

test('buildBreakdownSystem merges the consultant prompt with icons and JSON contract', () => {
  const system = buildBreakdownSystem();
  assert.match(system, /Как воплотить этот дизайн/);
  assert.match(system, /практический гайд/i);
  assert.match(system, /ВЫБОР ИКОНКИ/);
  assert.match(system, /top_cards/);
  assert.match(system, /до 350 слов/i);
  for (const key of BREAKDOWN_ICON_KEYS) assert.ok(system.includes(key), `icon ${key} missing`);
});

test('buildBreakdownUser passes known inputs and omits unknown ones', () => {
  const user = buildBreakdownUser({
    roomType: 'Кухня',
    style: 'Современный минимализм',
    priceTier: 'comfort',
    budget: 150,
    dimensions: { width: 3, length: 4, height: 2.7 },
  });

  assert.match(user, /Тип изображения: сгенерированный дизайн/);
  assert.match(user, /Тип комнаты: Кухня/);
  assert.match(user, /Стиль: Современный минимализм/);
  assert.match(user, /Бюджет: 150 тыс. ₽/);
  assert.match(user, /3 × 4 × 2,7 м/);
  assert.doesNotMatch(user, /Город:/);
});

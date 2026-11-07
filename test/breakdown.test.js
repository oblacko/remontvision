import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeBreakdown,
  buildBreakdownSystem,
  buildBreakdownUser,
  SECTION_TITLES,
} = await import('../src/breakdowndata.js');

test('normalizeBreakdown keeps at most 3 top cards and clamps copy', () => {
  const result = normalizeBreakdown({
    title: '  Ваш интерьер — в деталях  ',
    lead: 'Что сохранить, проверить и подобрать.',
    top_cards: [
      { title: 'Что создаёт образ', preview: 'Светлые фасады и дерево.', action: 'Что сохранить', body: 'Объяснение', details: ['Шаг 1', '', 'Шаг 2'] },
      { title: 'До заказа кухни', preview: 'Проверьте открывание.', action: 'Что измерить', body: 'Объяснение' },
      { title: 'С чего начать', preview: 'Сравните образцы.', action: 'Какие образцы' },
      { title: 'Лишняя карточка', preview: 'Не должна попасть.' },
    ],
    sections: [],
  });

  assert.equal(result.title, 'Ваш интерьер — в деталях');
  assert.equal(result.top_cards.length, 3);
  assert.deepEqual(result.top_cards[0].details, ['Шаг 1', 'Шаг 2']);
  assert.equal(result.top_cards[2].action, 'Какие образцы');
});

test('normalizeBreakdown drops empty and unknown sections', () => {
  const result = normalizeBreakdown({
    top_cards: [],
    sections: [
      { key: 'repeat', preview: 'Повтор', cards: [{ title: 'Сохранить свет', body: 'Текст' }] },
      { key: 'unknown', cards: [{ title: 'Мусор' }] },
      { key: 'check', preview: 'Пусто', cards: [] },
      { key: 'buy', cards: [{ name: 'Стол', traits: 'Дуб', clarify: '180 см', custom: 'нет' }] },
    ],
  });

  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].key, 'repeat');
  assert.equal(result.sections[0].title, SECTION_TITLES.repeat);
  assert.equal(result.sections[1].key, 'buy');
  assert.equal(result.sections[1].cards[0].name, 'Стол');
});

test('normalizeBreakdown keeps edit instructions for change cards', () => {
  const result = normalizeBreakdown({
    sections: [{
      key: 'change',
      cards: [{ title: 'Заменить шторы', body: 'На лён.', effort: 'подбор предмета', edit_instruction: 'Заменить шторы на льняные светлые.' }],
    }],
  });

  const card = result.sections[0].cards[0];
  assert.equal(card.edit_instruction, 'Заменить шторы на льняные светлые.');
  assert.equal(card.effort, 'подбор предмета');
});

test('normalizeBreakdown validates next action and limits questions', () => {
  const result = normalizeBreakdown({
    sections: [{ key: 'repeat', cards: [{ title: 'Свет' }] }],
    next_action: { label: 'Добавить размеры', kind: 'sizes' },
    questions: ['Первый?', 'Второй?', 'Третий?', 'Четвёртый?'],
  });

  assert.deepEqual(result.next_action, { label: 'Добавить размеры', kind: 'sizes' });
  assert.equal(result.questions.length, 3);
});

test('normalizeBreakdown returns null when there is nothing useful', () => {
  assert.equal(normalizeBreakdown({ top_cards: [], sections: [] }), null);
});

test('buildBreakdownSystem merges consultant rules with progressive disclosure', () => {
  const system = buildBreakdownSystem();
  assert.match(system, /практичный консультант по реализации интерьера/i);
  assert.match(system, /постепенн/i);
  assert.match(system, /top_cards/);
  assert.match(system, /edit_instruction/);
  assert.match(system, /Только JSON/i);
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

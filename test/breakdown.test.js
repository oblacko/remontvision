import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeBreakdown,
  buildBreakdownSystem,
  buildBreakdownUser,
  BREAKDOWN_ICON_KEYS,
} = await import('../src/breakdowndata.js');

test('normalizeBreakdown keeps up to 5 cards with why and color', () => {
  const result = normalizeBreakdown({
    title: '  Что подобрать  ',
    lead: 'Сохраните светлые фасады.',
    cards: [
      { icon: 'table', name: 'Стол', traits: 'светлое дерево', clarify: 'длину', why: 'тёплый акцент', hex: 'a6784f' },
      { icon: 'unknown', name: 'Стул', traits: '', clarify: '', why: '', hex: 'not-a-color' },
      ...Array.from({ length: 5 }, (_, i) => ({ name: `Позиция ${i}` })),
    ],
  });

  assert.equal(result.version, 4);
  assert.equal(result.title, 'Что подобрать');
  assert.equal(result.cards.length, 5);
  assert.equal(result.cards[0].hex, '#A6784F');
  assert.equal(result.cards[1].icon, 'sparkles');
  assert.equal(result.cards[1].hex, null);
  assert.equal(result.cards[0].why, 'тёплый акцент');
});

test('normalizeBreakdown keeps lighting plan, temperature and why', () => {
  const result = normalizeBreakdown({
    cards: [{ name: 'Стол' }],
    lighting: { plan: 'лента на фартук и точечные по потолку', temperature: '2700–3000K', why: 'нижний свет делает фартук светящейся полосой' },
  });

  assert.deepEqual(result.lighting, {
    plan: 'лента на фартук и точечные по потолку',
    temperature: '2700–3000K',
    why: 'нижний свет делает фартук светящейся полосой',
  });
  assert.equal(normalizeBreakdown({ cards: [{ name: 'Стол' }], lighting: {} }).lighting, null);
});

test('normalizeBreakdown drops empty cards and returns null when nothing useful', () => {
  const result = normalizeBreakdown({ cards: [{ name: 'Стол' }, { name: '' }, { title: 'Свет' }] });
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[1].name, 'Свет');
  assert.equal(normalizeBreakdown({ cards: [] }), null);
  assert.equal(normalizeBreakdown(null), null);
});

test('buildBreakdownSystem merges the selection prompt with the JSON contract', () => {
  const system = buildBreakdownSystem();
  assert.match(system, /консультант по подбору материалов/i);
  assert.match(system, /Что подобрать/);
  assert.match(system, /why/);
  assert.match(system, /lighting/);
  assert.match(system, /hex/);
  assert.match(system, /СВЕТ/);
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

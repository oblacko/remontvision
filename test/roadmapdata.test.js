import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeRoadmap,
  buildRoadmapSystem,
  buildRoadmapUser,
  ROADMAP_VERSION,
  PHASE_TITLES,
} = await import('../src/roadmapdata.js');

test('normalizeRoadmap keeps phase order and caps sections and cards', () => {
  const result = normalizeRoadmap({
    title: '  Роадмап ремонта  ',
    sections: [
      { key: 'demolition', title: 'Демонтаж', icon: 'hammer', cards: ['Снять обои', { text: 'Вынести мебель' }, '', 'Защитить пол'] },
      { key: 'electrics', icon: 'zap', cards: Array.from({ length: 12 }, (_, i) => `Работа ${i}`) },
      ...Array.from({ length: 10 }, (_, i) => ({ key: `extra-${i}`, cards: [`Пункт ${i}`] })),
    ],
  });

  assert.equal(result.version, ROADMAP_VERSION);
  assert.equal(result.title, 'Роадмап ремонта');
  assert.equal(result.sections[0].cards.length, 3);
  assert.equal(result.sections[1].cards.length, 8);
  assert.equal(result.sections.length, 10);
});

test('normalizeRoadmap dedupes keys, drops empty sections and falls back to phase titles', () => {
  const result = normalizeRoadmap({
    sections: [
      { key: 'floor', cards: ['Купить покрытие'] },
      { key: 'floor', cards: ['Дубль'] },
      { key: 'empty', cards: [] },
      { key: 'custom', cards: ['Своя работа'] },
    ],
  });

  assert.deepEqual(result.sections.map(section => section.key), ['floor', 'custom']);
  assert.equal(result.sections[0].title, PHASE_TITLES.floor);
  assert.equal(result.sections[0].icon, 'hammer');
  assert.equal(result.sections[1].title, 'Этап 2');
});

test('normalizeRoadmap accepts sections as an object and returns null when empty', () => {
  const result = normalizeRoadmap({
    sections: {
      electrics: { icon: 'zap', cards: ['Вывести розетки'] },
    },
  });

  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].icon, 'zap');
  assert.equal(normalizeRoadmap({ sections: [] }), null);
});

test('buildRoadmapSystem includes prompt, phase order and JSON contract', () => {
  const system = buildRoadmapSystem();
  assert.match(system, /роадмап ремонта/i);
  assert.match(system, /Демонтаж и подготовка/);
  assert.match(system, /cards/);
  assert.match(system, /icon/);
});

test('buildRoadmapUser includes known inputs and repair scope', () => {
  const user = buildRoadmapUser({
    roomType: 'Кухня',
    style: 'Современный минимализм',
    priceTier: 'comfort',
    repairScope: {
      floor: { action: 'replace', material: 'кварцвинил', why: 'износ' },
      walls: { action: 'paint', material: 'матовая краска' },
    },
  });

  assert.match(user, /Тип комнаты: Кухня/);
  assert.match(user, /Стиль: Современный минимализм/);
  assert.match(user, /Пол: replace · кварцвинил · износ/);
  assert.match(user, /Стены: paint · матовая краска/);
  assert.doesNotMatch(user, /Двери:/);
});

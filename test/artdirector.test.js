import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeRoomDimensions, normalizeLens, normalizeRepairScope, composeArtDirectionPrompt, normalizeDirection } = await import('../src/artdirector.js');

test('normalizeRoomDimensions validates and rounds architect estimates', () => {
  assert.deepEqual(normalizeRoomDimensions({ width_m: 2.84, length_m: 4.16, height_m: 2.61, confidence: 'high' }), {
    width: 2.8,
    length: 4.2,
    height: 2.6,
    confidence: 'high',
  });
  assert.equal(normalizeRoomDimensions({ width_m: 0, length_m: 4, height_m: 2.6 }), null);
  assert.equal(normalizeRoomDimensions({ width_m: 3, length_m: 4, height_m: 12 }), null);
  assert.equal(normalizeRoomDimensions(null), null);
});

test('normalizeLens keeps focal length, type, distortion and correction', () => {
  assert.deepEqual(normalizeLens({
    focal_length_mm: 18.4,
    type: 'wide',
    distortion: 'strong',
    correction: 'Ближний план растянут, длина скорректирована на 0.4 м',
    confidence: 'medium',
  }), {
    focal_length_mm: 18,
    type: 'wide',
    distortion: 'strong',
    correction: 'Ближний план растянут, длина скорректирована на 0.4 м',
    confidence: 'medium',
  });
  assert.equal(normalizeLens({ type: 'fisheye', distortion: 'huge' }).type, null);
  assert.equal(normalizeLens(null), null);
});

test('normalizeRepairScope rejects a door inferred from a wall fragment', () => {
  const out = normalizeRepairScope({
    doors: { action: 'replace', why: 'В кадре виден только фрагмент старого полотна, окрашенного в зелёный, у левой стены' },
    windows: { action: 'paint', why: 'Деревянные рамы с двумя створками и подоконники выглядят целыми' },
  });
  assert.equal(out.doors, null);
  assert.equal(out.windows.action, 'paint');
});

test('normalizeRepairScope keeps null, keep and valid actions, drops unknown', () => {
  const out = normalizeRepairScope({
    floor: { action: 'replace', material: 'светлый дуб', why: 'старый ламинат' },
    ceiling: { action: 'keep', why: 'ровный' },
    walls: { action: 'tile', why: 'недопустимо' },
    doors: null,
    windows: { action: 'fill', why: 'откосы' },
    storage: ['шкаф в нише', 42, ''],
    style_dir: 'тёплый минимализм',
  });
  assert.equal(out.floor.action, 'replace');
  assert.equal(out.ceiling.action, 'keep');
  assert.equal(out.walls, null);
  assert.equal(out.doors, null);
  assert.equal(out.windows.action, 'fill');
  assert.deepEqual(out.storage, ['шкаф в нише', '42']);
  assert.equal(out.style_dir, 'тёплый минимализм');
});

test('art direction without a concept is facts-only: no direction schema or concept card', () => {
  const out = composeArtDirectionPrompt({ roomType: 'Гостиная', style: 'Скандинавский' });
  assert.equal(out.factsOnly, true);
  assert.equal(out.compatibility, null);
  assert.doesNotMatch(out.system, /полем "direction"/);
  assert.doesNotMatch(out.user, /Карточка концепции/);
});

test('concept adds style/concept cards and anti-repeat history to one call', () => {
  const out = composeArtDirectionPrompt({
    roomType: 'Спальня',
    styleId: 'scandinavian',
    style: 'Скандинавский',
    conceptId: 'accent_block',
    usedDirections: [{ main_move: 'тёмный блок на стене', focal_zone: 'wall' }],
  });
  assert.equal(out.factsOnly, false);
  assert.equal(out.compatibility, 'ok');
  assert.match(out.system, /полем "direction"/);
  assert.match(out.system, /DesignDirection/);
  assert.match(out.user, /Карточка стиля/);
  assert.match(out.user, /Скандинавский/);
  assert.match(out.user, /Карточка концепции/);
  assert.match(out.user, /Акцентный блок/);
  assert.match(out.user, /тёмный блок на стене/);
});

test('conflict pair stays facts-only and never asks for a direction', () => {
  const out = composeArtDirectionPrompt({ styleId: 'memphis_accent', conceptId: 'monochrome_depth' });
  assert.equal(out.compatibility, 'conflict');
  assert.equal(out.factsOnly, true);
  assert.doesNotMatch(out.system, /полем "direction"/);
});

test('normalizeDirection maps the combined contract to art-direction fields', () => {
  const out = normalizeDirection({
    style_id: 'scandinavian',
    concept_id: 'accent_block',
    compatibility: 'ok',
    concept: 'Светлая комната с терракотовым акцентом',
    main_move: { target: 'стена', action: 'терракотовый блок', effect: 'фокус' },
    supporting_moves: [],
    palette_hex: { base: '#FAF8F4', support: '#D8CFC2', dark: '#8A9A8B', accent: '#C26D5A' },
    focal_point: 'стена за диваном',
    focal_zone: 'wall',
    quiet_areas: ['потолок'],
    materials_story: ['дуб', 'лён'],
    prompt_en: 'scandinavian room with a terracotta accent wall',
    novelty_class: 'balance',
    avoid: ['второй акцент'],
  }, { styleId: 'scandinavian', conceptId: 'accent_block', compatibility: 'ok' });
  assert.equal(out.text, 'scandinavian room with a terracotta accent wall');
  assert.equal(out.focalZone, 'wall');
  assert.equal(out.materials, 'дуб, лён');
  assert.equal(out.palette.length, 4);
  assert.equal(out.conceptId, 'accent_block');
});

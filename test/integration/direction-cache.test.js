import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { buildDesignDirection, setDirectionAgentForTests } from '../../src/designeragent.js';
import { pickRandomCompatiblePair } from '../../src/designdata.js';

after(closeTestApp);

function direction(styleId, conceptId, n) {
  return {
    style_id: styleId,
    concept_id: conceptId,
    compatibility: 'ok',
    concept: `концепция ${n}`,
    main_move: { target: 'диван', action: 'поставить у окна', effect: 'свет' },
    supporting_moves: [],
    palette_hex: { base: '#eeeeee', support: '#cccccc', dark: '#333333', accent: '#aa8866' },
    focal_point: 'окно',
    focal_zone: 'window',
    quiet_areas: [],
    materials_story: ['дуб'],
    prompt_en: `variant ${n}`,
    novelty_class: 'balance',
    avoid: [],
  };
}

test('direction is generated once per pair and then served from cache', async () => {
  await createTestApp();
  process.env.DIRECTION_CACHE_VARIANTS = '3';
  const { style_id: styleId, concept_id: conceptId } = pickRandomCompatiblePair();
  let calls = 0;
  setDirectionAgentForTests(async () => {
    calls += 1;
    return { parsed: direction(styleId, conceptId, calls), text: '{}', usage: null, cost: 0.001 };
  });
  try {
    const first = await buildDesignDirection({ styleId, conceptId, roomType: 'Гостиная', sessionId: 'render:one' });
    assert.equal(calls, 3, 'first miss generates the configured number of variants');
    assert.equal(first.cached, false);
    assert.match(first.text, /^variant /);

    const second = await buildDesignDirection({ styleId, conceptId, roomType: 'Гостиная', sessionId: 'render:one' });
    assert.equal(calls, 3, 'cache hit must not call the model');
    assert.equal(second.cached, true);
    assert.equal(second.text, first.text, 'same seed picks the same variant');
  } finally {
    setDirectionAgentForTests(null);
    delete process.env.DIRECTION_CACHE_VARIANTS;
  }
});

test('cache key separates different room types', async () => {
  await createTestApp();
  process.env.DIRECTION_CACHE_VARIANTS = '1';
  const { style_id: styleId, concept_id: conceptId } = pickRandomCompatiblePair();
  let calls = 0;
  setDirectionAgentForTests(async () => {
    calls += 1;
    return { parsed: direction(styleId, conceptId, calls), text: '{}', usage: null, cost: 0.001 };
  });
  try {
    await buildDesignDirection({ styleId, conceptId, roomType: 'Гостиная', sessionId: 'render:one' });
    await buildDesignDirection({ styleId, conceptId, roomType: 'Спальня', sessionId: 'render:one' });
    assert.equal(calls, 2, 'a different room type is a different cache entry');
  } finally {
    setDirectionAgentForTests(null);
    delete process.env.DIRECTION_CACHE_VARIANTS;
  }
});

test('valid but empty prompt_en is cached as a negative marker', async () => {
  await createTestApp();
  process.env.DIRECTION_CACHE_VARIANTS = '1';
  const { style_id: styleId, concept_id: conceptId } = pickRandomCompatiblePair();
  let calls = 0;
  setDirectionAgentForTests(async () => {
    calls += 1;
    const value = direction(styleId, conceptId, calls);
    value.prompt_en = '';
    return { parsed: value, text: '{}', usage: null, cost: 0.001 };
  });
  try {
    const first = await buildDesignDirection({ styleId, conceptId, roomType: 'Кухня', sessionId: 'render:empty' });
    assert.equal(first.text, '');
    assert.equal(calls, 1);

    const second = await buildDesignDirection({ styleId, conceptId, roomType: 'Кухня', sessionId: 'render:empty' });
    assert.equal(second, null, 'negative marker must not call the model again');
    assert.equal(calls, 1);
  } finally {
    setDirectionAgentForTests(null);
    delete process.env.DIRECTION_CACHE_VARIANTS;
  }
});

test('cache hit picks a variant that avoids recent user directions', async () => {
  await createTestApp();
  process.env.DIRECTION_CACHE_VARIANTS = '3';
  const { style_id: styleId, concept_id: conceptId } = pickRandomCompatiblePair();
  const zones = ['window', 'wall', 'center'];
  let calls = 0;
  setDirectionAgentForTests(async () => {
    const index = calls;
    calls += 1;
    const value = direction(styleId, conceptId, calls);
    value.focal_zone = zones[index % zones.length];
    value.main_move = { target: 'объект', action: `ход-${index}`, effect: 'эффект' };
    return { parsed: value, text: '{}', usage: null, cost: 0.001 };
  });
  try {
    await buildDesignDirection({ styleId, conceptId, roomType: 'Спальня', sessionId: 'render:novelty' });
    assert.equal(calls, 3);

    const picked = await buildDesignDirection({
      styleId,
      conceptId,
      roomType: 'Спальня',
      sessionId: 'render:novelty-2',
      usedDirections: [
        { focal_zone: 'window', main_move: 'ход-0' },
        { focal_zone: 'wall', main_move: 'ход-1' },
      ],
    });
    assert.equal(picked.focalZone, 'center');
    assert.equal(calls, 3, 'cache hit must not call the model');
  } finally {
    setDirectionAgentForTests(null);
    delete process.env.DIRECTION_CACHE_VARIANTS;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDesignDirection, setDirectionAgentForTests } from '../src/designeragent.js';
import { pickRandomCompatiblePair } from '../src/designdata.js';

// Unit-тесты direction не касаются БД: кэш выключен, агент инъектируется.
process.env.DIRECTION_CACHE_ENABLED = '0';

const validDirection = (styleId, conceptId, promptEn) => ({
  style_id: styleId,
  concept_id: conceptId,
  compatibility: 'ok',
  concept: 'тёплый минимализм',
  main_move: { target: 'диван', action: 'поставить у окна', effect: 'свет и вид' },
  supporting_moves: [],
  palette_hex: { base: '#eeeeee', support: '#cccccc', dark: '#333333', accent: '#aa8866' },
  focal_point: 'окно',
  focal_zone: 'window',
  quiet_areas: ['угол у шкафа'],
  materials_story: ['дуб', 'лён'],
  prompt_en: promptEn || '',
  novelty_class: 'balance',
  avoid: [],
});

test('does not retry when the contract is valid but prompt_en is empty', async () => {
  const { style_id: styleId, concept_id: conceptId } = pickRandomCompatiblePair();
  let calls = 0;
  setDirectionAgentForTests(async args => {
    calls += 1;
    assert.equal(args.maxSteps, 1, 'direction must use a single agent step');
    return { parsed: validDirection(styleId, conceptId, ''), text: '{}', usage: null, cost: 0.001 };
  });
  try {
    const result = await buildDesignDirection({ styleId: styleId, conceptId: conceptId, roomType: 'Гостиная' });
    assert.equal(calls, 1);
    assert.equal(result.retried, false);
    assert.equal(result.text, '');
    assert.equal(result.cost, 0.001);
    assert.ok(result.ms >= 0);
  } finally {
    setDirectionAgentForTests(null);
  }
});

test('retries once when the model returns no valid contract', async () => {
  const { style_id: styleId, concept_id: conceptId } = pickRandomCompatiblePair();
  let calls = 0;
  setDirectionAgentForTests(async args => {
    calls += 1;
    assert.equal(args.maxSteps, 1);
    if (calls === 1) return { parsed: null, text: 'not json', usage: null, cost: 0.001 };
    return { parsed: validDirection(styleId, conceptId, 'warm minimal interior'), text: '{}', usage: null, cost: 0.002 };
  });
  try {
    const result = await buildDesignDirection({ styleId: styleId, conceptId: conceptId, roomType: 'Гостиная' });
    assert.equal(calls, 2);
    assert.equal(result.retried, true);
    assert.equal(result.text, 'warm minimal interior');
    assert.equal(result.cost, 0.003);
  } finally {
    setDirectionAgentForTests(null);
  }
});

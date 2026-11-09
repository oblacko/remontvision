import test from 'node:test';
import assert from 'node:assert/strict';

const { FREE_EDITS, editChargeDecision, modelCreditsFor, modelForEdit, chargeForEnqueue, rootEditCountSql } = await import('../src/billing.js');

const models = [
  { id: 'seedream', label: 'Стандарт', model_id: 'bytedance/seedream', credits: 1, active: true, sort: 1 },
  { id: 'flux-3-image', label: 'Премиум', model_id: 'black-forest-labs/flux-3-image', credits: 2, active: true, sort: 2 },
  { id: 'legacy', label: 'Старая', model_id: 'legacy/model', credits: 5, active: false, sort: 3 },
];

test('free edits limit is three', () => {
  assert.equal(FREE_EDITS, 3);
});

test('first three iterations are free', () => {
  for (const editCount of [0, 1, 2]) {
    assert.deepEqual(editChargeDecision({ iteration: true, editCount }), { free: true });
  }
});

test('fourth iteration and later are charged', () => {
  assert.deepEqual(editChargeDecision({ iteration: true, editCount: 3 }), { free: false });
  assert.deepEqual(editChargeDecision({ iteration: true, editCount: 4 }), { free: false });
});

test('root render is never free', () => {
  for (const editCount of [0, 1, 2]) {
    assert.deepEqual(editChargeDecision({ iteration: false, editCount }), { free: false });
  }
});

test('missing or invalid edit count is charged', () => {
  for (const editCount of [undefined, NaN, Infinity, '', null, 1.5, '2']) {
    assert.deepEqual(editChargeDecision({ iteration: true, editCount }), { free: false });
  }
  assert.deepEqual(editChargeDecision({ iteration: true }), { free: false });
});

test('model credits default to one without models', () => {
  assert.equal(modelCreditsFor('seedream', []), 1);
  assert.equal(modelCreditsFor('seedream', undefined), 1);
});

test('model credits match the short render model id', () => {
  assert.equal(modelCreditsFor('flux-3-image', models), 2);
  assert.equal(modelCreditsFor('seedream', models), 1);
});

test('model credits also match the full model_id', () => {
  assert.equal(modelCreditsFor('black-forest-labs/flux-3-image', models), 2);
  assert.equal(modelCreditsFor('bytedance/seedream', models), 1);
});

test('unknown model falls back to one credit', () => {
  assert.equal(modelCreditsFor('unknown/model', models), 1);
  assert.equal(modelCreditsFor(null, models), 1);
});

test('inactive model falls back to one credit', () => {
  assert.equal(modelCreditsFor('legacy', models), 1);
  assert.equal(modelCreditsFor('legacy/model', models), 1);
});

test('invalid credit values fall back to one credit', () => {
  const broken = [{ id: 'broken', model_id: 'broken/model', credits: 0, active: true, sort: 1 }];
  assert.equal(modelCreditsFor('broken', broken), 1);
  assert.equal(modelCreditsFor('broken/model', broken), 1);
});

test('edits inherit the parent model', () => {
  assert.equal(modelForEdit('seedream', models), 'seedream');
  assert.equal(modelForEdit('flux-3-image', models), 'flux-3-image');
  assert.equal(modelForEdit('legacy', models), 'legacy');
});

test('rootEditCountSql is a parameterized count of edits under a root', () => {
  const rootId = 'root-123';
  const { sql, params } = rootEditCountSql(rootId);
  assert.equal(typeof sql, 'string');
  assert.ok(sql.includes('root_render_id = $1'));
  assert.ok(sql.includes('id <> $1'));
  assert.ok(!sql.includes(rootId), 'SQL должен оставаться параметризованным, без подстановки id');
  assert.deepEqual(params, [rootId]);
});

test('root render charges modelCredits against balance', () => {
  assert.deepEqual(chargeForEnqueue({ iteration: false, editCount: 0, modelCredits: 2, balance: 1 }), { ok: false, needed: 2 });
  assert.deepEqual(chargeForEnqueue({ iteration: false, editCount: 0, modelCredits: 2, balance: 2 }), { ok: true, delta: -2 });
  assert.deepEqual(chargeForEnqueue({ iteration: false, editCount: 0, modelCredits: 1, balance: 5 }), { ok: true, delta: -1 });
});

test('free edits are free regardless of balance', () => {
  for (const editCount of [0, 1, 2]) {
    assert.deepEqual(chargeForEnqueue({ iteration: true, editCount, modelCredits: 2, balance: 0 }), { ok: true, delta: 0 });
  }
});

test('paid edits require exactly one credit', () => {
  assert.deepEqual(chargeForEnqueue({ iteration: true, editCount: 3, modelCredits: 2, balance: 0 }), { ok: false, needed: 1 });
  assert.deepEqual(chargeForEnqueue({ iteration: true, editCount: 4, modelCredits: 2, balance: 1 }), { ok: true, delta: -1 });
});

test('invalid editCount is charged (fail closed)', () => {
  for (const editCount of [undefined, null, -1, 1.5, NaN, '2', Infinity]) {
    assert.deepEqual(chargeForEnqueue({ iteration: true, editCount, modelCredits: 2, balance: 0 }), { ok: false, needed: 1 });
    assert.deepEqual(chargeForEnqueue({ iteration: true, editCount, modelCredits: 2, balance: 1 }), { ok: true, delta: -1 });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

const { FREE_EDITS, editChargeDecision, modelCreditsFor, modelForEdit } = await import('../src/billing.js');

const models = [
  { id: 1, label: 'Стандарт', model_id: 'standard/model', credits: 1, active: true, sort: 1 },
  { id: 2, label: 'Премиум', model_id: 'premium/model', credits: 2, active: true, sort: 2 },
  { id: 3, label: 'Старая', model_id: 'legacy/model', credits: 5, active: false, sort: 3 },
];

test('free edits limit is three', () => {
  assert.equal(FREE_EDITS, 3);
});

test('first three iterations are free', () => {
  for (const editCount of [0, 1, 2]) {
    assert.deepEqual(editChargeDecision({ iteration: true, editCount }), { free: true });
  }
});

test('fourth iteration is charged', () => {
  assert.deepEqual(editChargeDecision({ iteration: true, editCount: 3 }), { free: false });
  assert.deepEqual(editChargeDecision({ iteration: true, editCount: 4 }), { free: false });
});

test('root render is never free', () => {
  for (const editCount of [0, 1, 2]) {
    assert.deepEqual(editChargeDecision({ iteration: false, editCount }), { free: false });
  }
});

test('missing edit count counts as zero free edits', () => {
  assert.deepEqual(editChargeDecision({ iteration: true }), { free: true });
});

test('model credits default to one without models', () => {
  assert.equal(modelCreditsFor('standard/model', []), 1);
  assert.equal(modelCreditsFor('standard/model', undefined), 1);
});

test('model credits come from the matching active model', () => {
  assert.equal(modelCreditsFor('premium/model', models), 2);
  assert.equal(modelCreditsFor('standard/model', models), 1);
});

test('unknown model falls back to one credit', () => {
  assert.equal(modelCreditsFor('unknown/model', models), 1);
  assert.equal(modelCreditsFor(null, models), 1);
});

test('inactive model falls back to one credit', () => {
  assert.equal(modelCreditsFor('legacy/model', models), 1);
});

test('invalid credit values fall back to one credit', () => {
  const broken = [{ id: 1, model_id: 'broken/model', credits: 0, active: true, sort: 1 }];
  assert.equal(modelCreditsFor('broken/model', broken), 1);
});

test('edits inherit the parent model', () => {
  assert.equal(modelForEdit('standard/model', models), 'standard/model');
  assert.equal(modelForEdit('premium/model', models), 'premium/model');
  assert.equal(modelForEdit('legacy/model', models), 'legacy/model');
});

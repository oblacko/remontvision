import test from 'node:test';
import assert from 'node:assert/strict';

// Чистые хелперы без БД — не импортируем src/db.js.
const { resolveModelSelection, inheritPrivate, modelCreditsOrOne, validateModelInput } = await import('../src/modelconfig.js');

const models = [
  { id: 'flux-3-image', label: 'FLUX 3 Image', model_id: 'black-forest-labs/flux-3-image', credits: 1, active: true, sort: 0 },
  { id: 'seedream', label: 'Стандарт', model_id: 'bytedance/seedream', credits: 2, active: true, sort: 1 },
  { id: 'legacy', label: 'Старая', model_id: 'legacy/model', credits: 5, active: false, sort: 0 },
];

test('default resolution prefers the runtime render model match', () => {
  assert.deepEqual(
    resolveModelSelection(undefined, models, 'bytedance/seedream'),
    { key: 'seedream', credits: 2 },
  );
});

test('default resolution falls back to first active by sort', () => {
  assert.deepEqual(
    resolveModelSelection(undefined, models, 'nonexistent/model'),
    { key: 'flux-3-image', credits: 1 },
  );
});

test('default resolution falls back to null key and one credit on empty table', () => {
  assert.deepEqual(resolveModelSelection(undefined, [], null), { key: null, credits: 1 });
  assert.deepEqual(resolveModelSelection(undefined, undefined, null), { key: null, credits: 1 });
});

test('explicit model resolves by short id', () => {
  assert.deepEqual(resolveModelSelection('seedream', models, null), { key: 'seedream', credits: 2 });
});

test('explicit model resolves by full model_id', () => {
  assert.deepEqual(
    resolveModelSelection('black-forest-labs/flux-3-image', models, null),
    { key: 'flux-3-image', credits: 1 },
  );
});

test('explicit unknown model is rejected', () => {
  assert.equal(resolveModelSelection('unknown/model', models, null), null);
});

test('explicit inactive model is rejected', () => {
  assert.equal(resolveModelSelection('legacy', models, null), null);
  assert.equal(resolveModelSelection('legacy/model', models, null), null);
});

test('explicit empty string is treated as omitted', () => {
  assert.deepEqual(resolveModelSelection('', models, null), { key: 'flux-3-image', credits: 1 });
});

test('credit value below one is clamped to one', () => {
  assert.equal(modelCreditsOrOne(0), 1);
  assert.equal(modelCreditsOrOne(-1), 1);
  assert.equal(modelCreditsOrOne(NaN), 1);
  assert.equal(modelCreditsOrOne(undefined), 1);
  assert.equal(modelCreditsOrOne(2), 2);
});

test('private flag inherits strictly from the parent render', () => {
  assert.equal(inheritPrivate(true), true);
  assert.equal(inheritPrivate(false), false);
  assert.equal(inheritPrivate(undefined), false);
  assert.equal(inheritPrivate(null), false);
});

// ---------- validateModelInput (админский CRUD моделей, без БД) ----------

test('valid model input normalizes to a row', () => {
  assert.deepEqual(validateModelInput({
    id: 'Flux-3-Image', label: ' FLUX 3 Image ', model_id: ' black-forest-labs/flux-3-image ',
    credits: 1, art_direction_enabled: true, active: true, sort: 3,
  }), {
    value: {
      id: 'flux-3-image', label: 'FLUX 3 Image', model_id: 'black-forest-labs/flux-3-image',
      credits: 1, art_direction_enabled: true, active: true, sort: 3,
    },
  });
});

test('missing sort defaults to zero', () => {
  assert.equal(validateModelInput({ id: 'flux-3-image', label: 'X', model_id: 'm', credits: 1, art_direction_enabled: true, active: true }).value.sort, 0);
});

test('booleans default to true and accept string forms', () => {
  assert.equal(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1 }).value.art_direction_enabled, true);
  assert.equal(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1 }).value.active, true);
  assert.equal(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1, art_direction_enabled: 'false', active: '0' }).value.art_direction_enabled, false);
  assert.equal(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1, art_direction_enabled: 'false', active: '0' }).value.active, false);
});

test('rejects non-latin id', () => {
  assert.ok(validateModelInput({ id: 'Модель', label: 'X', model_id: 'm', credits: 1 }).error);
  assert.ok(validateModelInput({ id: 'a', label: 'X', model_id: 'm', credits: 1 }).error);
  assert.ok(validateModelInput({ id: 'a'.repeat(41), label: 'X', model_id: 'm', credits: 1 }).error);
  assert.ok(validateModelInput({ id: 'a b', label: 'X', model_id: 'm', credits: 1 }).error);
});

test('rejects empty label or model_id', () => {
  assert.ok(validateModelInput({ id: 'm1', label: '', model_id: 'm', credits: 1 }).error);
  assert.ok(validateModelInput({ id: 'm1', label: '  ', model_id: 'm', credits: 1 }).error);
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: '', credits: 1 }).error);
});

test('rejects credits below one or non-integer', () => {
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 0 }).error);
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1.5 }).error);
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: 'm' }).error);
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 'два' }).error);
});

test('rejects non-integer sort', () => {
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1, sort: 1.5 }).error);
  assert.ok(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1, sort: 'x' }).error);
});

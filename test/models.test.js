import test from 'node:test';
import assert from 'node:assert/strict';

// Чистые хелперы без БД — не импортируем src/db.js.
const { resolveModelSelection, resolveDefaultModelKey, inheritPrivate, modelCreditsOrOne, validateModelInput, privateAllowed, isArtDirectionEnabled, setRenderModelsForTests } = await import('../src/modelconfig.js');

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

// ---------- resolveDefaultModelKey (подсветка модели по умолчанию в UI) ----------

test('default key prefers the runtime render model match', () => {
  assert.equal(resolveDefaultModelKey(models, 'bytedance/seedream'), 'seedream');
});

test('default key falls back to first active by sort', () => {
  assert.equal(resolveDefaultModelKey(models, 'nonexistent/model'), 'flux-3-image');
  assert.equal(resolveDefaultModelKey(models, null), 'flux-3-image');
});

test('default key is the first list row on an empty active table', () => {
  assert.equal(resolveDefaultModelKey([], null), null);
  assert.equal(resolveDefaultModelKey(undefined, null), null);
  assert.equal(resolveDefaultModelKey(null, null), null);
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

test('empty string is falsy for boolean fields', () => {
  assert.equal(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1, art_direction_enabled: '' }).value.art_direction_enabled, false);
  assert.equal(validateModelInput({ id: 'm1', label: 'X', model_id: 'm', credits: 1, active: '' }).value.active, false);
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

// ---------- privateAllowed (приватность только после покупки, без БД) ----------

test('private is allowed when not requested', () => {
  assert.equal(privateAllowed(undefined, false), true);
  assert.equal(privateAllowed(null, false), true);
  assert.equal(privateAllowed(false, false), true);
  assert.equal(privateAllowed('0', false), true);
  assert.equal(privateAllowed('', false), true);
});

test('private is allowed only with a purchase when requested', () => {
  assert.equal(privateAllowed(true, true), true);
  assert.equal(privateAllowed('1', true), true);
  assert.equal(privateAllowed('true', true), true);
  assert.equal(privateAllowed(true, false), false);
  assert.equal(privateAllowed('1', false), false);
  assert.equal(privateAllowed('true', false), false);
});

// ---------- isArtDirectionEnabled (per-model флаг + глобальный env-потолок, без БД) ----------

// Временная подстановка env ART_DIRECTION_ENABLED (или его удаление) на время теста.
function withArtDirectionEnv(value, fn) {
  const previous = process.env.ART_DIRECTION_ENABLED;
  if (value === undefined) delete process.env.ART_DIRECTION_ENABLED;
  else process.env.ART_DIRECTION_ENABLED = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.ART_DIRECTION_ENABLED;
    else process.env.ART_DIRECTION_ENABLED = previous;
  }
}

test('model flag false disables art direction when env is unset or true', () => {
  setRenderModelsForTests([
    { id: 'flux-3-image', model_id: 'black-forest-labs/flux-3-image', art_direction_enabled: false, active: true },
    { id: 'seedream', model_id: 'bytedance/seedream', art_direction_enabled: true, active: true },
  ]);
  withArtDirectionEnv(undefined, () => {
    assert.equal(isArtDirectionEnabled('flux-3-image'), false);
    assert.equal(isArtDirectionEnabled('black-forest-labs/flux-3-image'), false);
    assert.equal(isArtDirectionEnabled('seedream'), true);
  });
  withArtDirectionEnv('true', () => {
    assert.equal(isArtDirectionEnabled('flux-3-image'), false);
    assert.equal(isArtDirectionEnabled('seedream'), true);
  });
});

test('unknown model key defaults to true when env is unset', () => {
  setRenderModelsForTests([{ id: 'flux-3-image', model_id: 'black-forest-labs/flux-3-image', art_direction_enabled: true, active: true }]);
  withArtDirectionEnv(undefined, () => {
    assert.equal(isArtDirectionEnabled('missing'), true);
    assert.equal(isArtDirectionEnabled(null), true);
    assert.equal(isArtDirectionEnabled(undefined), true);
  });
});

test('env false is a global ceiling even when the model row flag is true', () => {
  setRenderModelsForTests([
    { id: 'flux-3-image', model_id: 'black-forest-labs/flux-3-image', art_direction_enabled: true, active: true },
  ]);
  withArtDirectionEnv('0', () => {
    assert.equal(isArtDirectionEnabled('flux-3-image'), false);
    assert.equal(isArtDirectionEnabled('black-forest-labs/flux-3-image'), false);
    assert.equal(isArtDirectionEnabled('missing'), false);
    assert.equal(isArtDirectionEnabled(null), false);
  });
});

test('env false disables art direction for unknown keys too', () => {
  setRenderModelsForTests([]);
  withArtDirectionEnv('false', () => {
    assert.equal(isArtDirectionEnabled('missing'), false);
    assert.equal(isArtDirectionEnabled(null), false);
  });
});

const { priceForResolution, sanitizeResolutionPrices } = await import('../src/modelcaps.js');

test('priceForResolution falls back to base credits', () => {
  assert.equal(priceForResolution(null, '2K', 1), 1);
  assert.equal(priceForResolution({ '2K': 2, '4K': 4 }, '2K', 1), 2);
  assert.equal(priceForResolution({ '2K': 2 }, '1K', 1), 1);
});

test('sanitizeResolutionPrices keeps only allowed resolutions', () => {
  assert.deepEqual(sanitizeResolutionPrices({ '2K': 2, '8K': 9, bad: 'x' }, ['1K', '2K', '4K']), { '2K': 2 });
  assert.deepEqual(sanitizeResolutionPrices({ '1K': 1 }, ['1K', '2K']), { '1K': 1 });
  assert.deepEqual(sanitizeResolutionPrices(null, ['1K']), {});
});

const { resolutionAllowed } = await import('../src/modelcaps.js');

test('resolutionAllowed rejects 4K for FLUX 2 Pro', () => {
  assert.equal(resolutionAllowed('black-forest-labs/flux-2-pro', '4K'), false);
});

test('resolutionAllowed accepts 2K for FLUX 3 Image', () => {
  assert.equal(resolutionAllowed('black-forest-labs/flux-3-image', '2K'), true);
});

test('resolutionAllowed rejects empty resolution', () => {
  assert.equal(resolutionAllowed('black-forest-labs/flux-3-image', ''), false);
});

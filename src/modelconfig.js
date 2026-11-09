// Текущие модели хранятся в app_settings, с фолбэком на переменные окружения.
// Админка может переключать render-модель без рестарта; следующая генерация уже использует новую.
const DEFAULTS = {
  render: process.env.RENDER_MODEL || 'black-forest-labs/flux-3-image',
  edit: process.env.EDIT_MODEL || '',
  vision: process.env.VISION_MODEL || 'google/gemini-3.1-pro-preview',
  resolution: process.env.RENDER_RESOLUTION || '1K',
  aspectRatio: process.env.RENDER_ASPECT_RATIO || 'auto',
};
const state = { ...DEFAULTS };

export function getModelConfig() {
  return { ...state };
}

export async function loadModelConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys(['model.render', 'model.edit', 'model.vision', 'model.resolution', 'model.aspect_ratio']);
    for (const row of rows) {
      if (row.key === 'model.render' && row.value) state.render = row.value;
      if (row.key === 'model.edit') state.edit = row.value || '';
      if (row.key === 'model.vision' && row.value) state.vision = row.value;
      if (row.key === 'model.resolution' && row.value) state.resolution = row.value;
      if (row.key === 'model.aspect_ratio' && row.value) state.aspectRatio = row.value;
    }
  } catch { /* таблицы может ещё не быть — остаёмся на env */ }
  return getModelConfig();
}

// ---------- выбор модели и приватность рендера (чистые функции без БД) ----------

// Нормализация цены модели в кредитах: БД гарантирует credits >= 1 (CHECK),
// но для DB-free тестов и защитного кода значение меньше 1 трактуем как 1.
export function modelCreditsOrOne(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// Разрешение модели рендера для запроса.
// requestedKey — явно переданный `model` из тела (null/undefined/'' = не задан).
// models — строки render_models (активность перепроверяем по полю active).
// defaultModelId — runtime-модель рендера из конфига (getModelConfig().render),
// чтобы дефолт предпочитал строку с совпадающим model_id.
// Возвращает { key, credits } (key = render_models.id, короткий ключ API) либо
// null, если requestedKey задан, но такой активной модели нет (→ HTTP 400).
export function resolveModelSelection(requestedKey, models, defaultModelId = null) {
  const active = (Array.isArray(models) ? models : []).filter(m => m && m.active === true);
  const match = key => active.find(m => m.id === key || m.model_id === key);

  if (requestedKey !== undefined && requestedKey !== null && requestedKey !== '') {
    const found = match(String(requestedKey));
    return found ? { key: found.id, credits: modelCreditsOrOne(found.credits) } : null;
  }

  const preferred = defaultModelId ? active.find(m => m.model_id === defaultModelId) : null;
  const sorted = [...active].sort(
    (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.id).localeCompare(String(b.id)),
  );
  const chosen = preferred || sorted[0];
  if (!chosen) return { key: null, credits: 1 };
  return { key: chosen.id, credits: modelCreditsOrOne(chosen.credits) };
}

// Правка всегда наследует флаг приватности от родительского рендера;
// клиентский `private` у правки игнорируется.
export function inheritPrivate(parentIsPrivate) {
  return parentIsPrivate === true;
}

export async function saveModelConfig({ render, edit, vision, resolution, aspectRatio }) {
  if (render) state.render = render;
  if (edit !== undefined) state.edit = String(edit || '');
  if (vision) state.vision = vision;
  if (resolution) state.resolution = resolution;
  if (aspectRatio) state.aspectRatio = aspectRatio;
  const { q } = await import('./db.js');
  await q.setSetting('model.render', state.render);
  await q.setSetting('model.edit', state.edit);
  await q.setSetting('model.vision', state.vision);
  await q.setSetting('model.resolution', state.resolution);
  await q.setSetting('model.aspect_ratio', state.aspectRatio);
  return getModelConfig();
}

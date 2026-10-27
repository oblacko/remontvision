// Текущие модели хранятся в app_settings, с фолбэком на переменные окружения.
// Админка может переключать render-модель без рестарта; следующая генерация уже использует новую.
const DEFAULTS = {
  render: process.env.RENDER_MODEL || 'google/gemini-3.1-flash-image-preview',
  vision: process.env.VISION_MODEL || 'google/gemini-3-flash-preview',
};
const state = { ...DEFAULTS };

export function getModelConfig() {
  return { ...state };
}

export async function loadModelConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys(['model.render', 'model.vision']);
    for (const row of rows) {
      if (row.key === 'model.render' && row.value) state.render = row.value;
      if (row.key === 'model.vision' && row.value) state.vision = row.value;
    }
  } catch { /* таблицы может ещё не быть — остаёмся на env */ }
  return getModelConfig();
}

export async function saveModelConfig({ render, vision }) {
  if (render) state.render = render;
  if (vision) state.vision = vision;
  const { q } = await import('./db.js');
  await q.setSetting('model.render', state.render);
  await q.setSetting('model.vision', state.vision);
  return getModelConfig();
}

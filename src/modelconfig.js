// Текущие модели хранятся в app_settings, с фолбэком на переменные окружения.
// Админка может переключать render-модель без рестарта; следующая генерация уже использует новую.
const DEFAULTS = {
  render: process.env.RENDER_MODEL || 'google/gemini-3.1-flash-image-preview',
  vision: process.env.VISION_MODEL || 'google/gemini-3-flash-preview',
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
    const rows = await q.settingsByKeys(['model.render', 'model.vision', 'model.resolution', 'model.aspect_ratio']);
    for (const row of rows) {
      if (row.key === 'model.render' && row.value) state.render = row.value;
      if (row.key === 'model.vision' && row.value) state.vision = row.value;
      if (row.key === 'model.resolution' && row.value) state.resolution = row.value;
      if (row.key === 'model.aspect_ratio' && row.value) state.aspectRatio = row.value;
    }
  } catch { /* таблицы может ещё не быть — остаёмся на env */ }
  return getModelConfig();
}

export async function saveModelConfig({ render, vision, resolution, aspectRatio }) {
  if (render) state.render = render;
  if (vision) state.vision = vision;
  if (resolution) state.resolution = resolution;
  if (aspectRatio) state.aspectRatio = aspectRatio;
  const { q } = await import('./db.js');
  await q.setSetting('model.render', state.render);
  await q.setSetting('model.vision', state.vision);
  await q.setSetting('model.resolution', state.resolution);
  await q.setSetting('model.aspect_ratio', state.aspectRatio);
  return getModelConfig();
}

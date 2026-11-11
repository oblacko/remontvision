// Ключ кэша анализа комнаты. Один и тот же фото/стиль/концепт/мебель/размеры —
// один и тот же результат трёх vision-агентов; любое изменение инвалидирует кэш.
import crypto from 'node:crypto';

function normalizeDimensions(dimensions) {
  if (!dimensions) return 'none';
  const round = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? String(Math.round(number * 10) / 10) : '';
  };
  return [
    round(dimensions.width),
    round(dimensions.length),
    round(dimensions.height),
    round(dimensions.bedLength),
    String(dimensions.orientation || '').trim().toLowerCase(),
  ].join('x');
}

export function roomAnalysisKey({
  photoPath = '',
  shellPath = '',
  style = '',
  conceptId = '',
  keepFurniture = true,
  dimensions = null,
} = {}) {
  const payload = JSON.stringify({
    photo: String(photoPath || ''),
    shell: String(shellPath || ''),
    style: String(style || ''),
    concept: String(conceptId || ''),
    keepFurniture: Boolean(keepFurniture),
    dimensions: normalizeDimensions(dimensions),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Кэшируем только полный анализ: ошибка любого vision-агента не должна
// замораживать пустой/частичный результат для повторного рендера.
export function shouldCacheRoomAnalysis({ cached = false, failed = false } = {}) {
  return !cached && !failed;
}

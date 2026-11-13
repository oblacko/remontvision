// Ключи кэша анализа комнаты, разнесённые по артефактам: facts/repair и layout
// не зависят от стиля, art direction — зависит. Смена стиля не инвалидирует
// style-независимые шаги (repair/layout) и платит за vision только за направление.
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

const hashPayload = payload => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

// Хэш содержимого брифа (функциональное назначение комнаты / request_text).
// Без новой колонки в БД — вычисляется на лету из текста брифа.
export function briefHash(brief = '') {
  const text = String(brief || '').replace(/\s+/g, ' ').trim();
  return text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) : 'none';
}

// facts/repair: только фото и shell — без стиля и концепта.
export function factsKey({ photoPath = '', shellPath = '' } = {}) {
  return hashPayload({
    photo: String(photoPath || ''),
    shell: String(shellPath || ''),
  });
}

// layout: комната, размеры, пустая ли комната и бриф — без стиля.
export function layoutKey({ roomId = '', dimensions = null, keepFurniture = true, briefHash = '' } = {}) {
  return hashPayload({
    room: String(roomId || ''),
    dimensions: normalizeDimensions(dimensions),
    keepFurniture: Boolean(keepFurniture),
    brief: String(briefHash || ''),
  });
}

// art direction: всё, включая стиль/концепт и бриф.
export function artDirectionKey({ photoPath = '', shellPath = '', style = '', conceptId = '', keepFurniture = true, dimensions = null, briefHash = '' } = {}) {
  return hashPayload({
    photo: String(photoPath || ''),
    shell: String(shellPath || ''),
    style: String(style || ''),
    concept: String(conceptId || ''),
    keepFurniture: Boolean(keepFurniture),
    dimensions: normalizeDimensions(dimensions),
    brief: String(briefHash || ''),
  });
}

// Кэшируем только полный артефакт: ошибка любого vision-агента не должна
// замораживать пустой/частичный результат для повторного рендера.
export function shouldCacheRoomAnalysis({ cached = false, failed = false } = {}) {
  return !cached && !failed;
}

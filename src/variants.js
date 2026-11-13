// Чистые хелперы вариантов генерации: до 10 рендеров на комнату,
// каждый оплачивается как отдельный рендер.
export const MAX_VARIANTS = 10;

export function parseVariantsCount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_VARIANTS, Math.floor(n));
}

// Ошибку комнаты ставим, только если ни один рендер комнаты ещё не готов:
// иначе упавший вариант «затирал» бы успешный результат соседа.
export function shouldMarkRoomError(roomStatus, hasDoneSibling) {
  if (hasDoneSibling) return false;
  return roomStatus !== 'done';
}

// Что делать со статусом комнаты после неудачи рендера.
// error — если других готовых дизайнов нет; done — если упала правка при живом
// родителе (иначе комната навсегда остаётся в rendering и блокирует действия).
export function roomStatusAfterFailure({ roomStatus, hasDoneSibling, iteration } = {}) {
  if (shouldMarkRoomError(roomStatus, hasDoneSibling)) return 'error';
  if (iteration) return 'done';
  return null;
}

export function pluralVariants(n) {
  const m = n % 100;
  const d = n % 10;
  if (m >= 11 && m <= 14) return 'вариантов';
  if (d === 1) return 'вариант';
  if (d >= 2 && d <= 4) return 'варианта';
  return 'вариантов';
}

// Повтор разрешён только для комнаты в состоянии ошибки и когда ни один
// вариант ещё не в работе (иначе можно повторно списать кредит поверх очереди).
export function retryAllowed(roomStatus, hasActiveSibling = false) {
  return roomStatus === 'error' && !hasActiveSibling;
}

export const VARIANT_ITEMS_ERROR = 'Некорректный список дизайнов';

// Правка — рендер с родителем. request_text не признак правки: у базовых
// мульти-стиль рендеров он тоже заполнен подписью «Стиль: … · концепция: …».
export function isIterationRender(render) {
  return Boolean(render && render.parent_render_id);
}

// Стиль и концепт рендера: новые рендеры (style задан) авторитетны, включая
// concept=null («Без концепции»); у старых (style=null) — фолбэк на комнату.
export function resolveRenderStyleConcept(render, room) {
  const hasRenderStyle = render?.style != null;
  return {
    style: render?.style || room?.style || null,
    concept: hasRenderStyle ? (render?.concept ?? null) : (room?.concept_key ?? null),
  };
}

// Разбор списка вариантов «стиль + необязательный концепт» из POST /api/rooms.
// items — JSON-строка (multipart) или массив; 1..8 пар. Без items — legacy:
// N копий одного стиля (старые клиенты). Неизвестный концепт отбрасывается в null.
export function parseVariantItems(raw, { legacyStyle = '', legacyConcept = null, legacyVariants = 1, allowedConcepts = new Set() } = {}) {
  const allowed = allowedConcepts instanceof Set ? allowedConcepts : new Set();
  const pickConcept = value => (typeof value === 'string' && allowed.has(value) ? value : null);

  if (raw === undefined || raw === null || raw === '') {
    const style = String(legacyStyle || '').trim();
    if (!style) return { items: [], error: VARIANT_ITEMS_ERROR };
    const count = parseVariantsCount(legacyVariants);
    const concept = pickConcept(legacyConcept);
    return { items: Array.from({ length: count }, () => ({ style, concept })), error: null };
  }

  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return { items: [], error: VARIANT_ITEMS_ERROR }; }
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_VARIANTS) {
    return { items: [], error: VARIANT_ITEMS_ERROR };
  }
  const items = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return { items: [], error: VARIANT_ITEMS_ERROR };
    const style = String(entry.style ?? '').trim().slice(0, 80);
    if (!style) return { items: [], error: VARIANT_ITEMS_ERROR };
    items.push({ style, concept: pickConcept(entry.concept) });
  }
  return { items, error: null };
}

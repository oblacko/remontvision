// Чистые хелперы вариантов генерации: до 8 рендеров на комнату,
// каждый оплачивается как отдельный рендер.
export const MAX_VARIANTS = 8;

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

export function pluralVariants(n) {
  const m = n % 100;
  const d = n % 10;
  if (m >= 11 && m <= 14) return 'вариантов';
  if (d === 1) return 'вариант';
  if (d >= 2 && d <= 4) return 'варианта';
  return 'вариантов';
}

// Повтор разрешён только для комнаты в состоянии ошибки.
export function retryAllowed(roomStatus) {
  return roomStatus === 'error';
}

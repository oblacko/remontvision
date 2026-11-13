// GC осиротевших комнат: комната без единого рендера, старше ROOM_GC_DAYS и не в
// активной очистке. Чистые функции вынесены отдельно для тестов без БД.
const DEFAULT_DAYS = 7;

// Сколько дней комната должна прожить без рендеров, чтобы стать кандидатом на удаление.
export function roomGcDays(raw = process.env.ROOM_GC_DAYS) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.floor(n);
}

// Финальный фильтр поверх SQL (который уже отсеял комнаты с рендерами): возраст и
// cleanup_status. Не трогаем комнаты, которые ещё в очереди/обработке очистки.
export function shouldGcRoom(room, { days = DEFAULT_DAYS, now = Date.now() } = {}) {
  if (!room) return false;
  const status = room.cleanup_status;
  if (status === 'queued' || status === 'processing') return false;
  const created = room.created_at ? new Date(room.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return false;
  return created < now - days * 24 * 60 * 60 * 1000;
}

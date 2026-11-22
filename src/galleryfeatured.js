// Курируемый список рендеров для блока «Галерея» на лендинге (REM-56).
//
// Правило G3 (бриф Growth REM-53): в галерею можно включать только рендеры
// с письменным разрешением владельца/правообладателя. Пока список не подтверждён,
// массив пуст, и лента реальных дизайнов на лендинге скрыта (порог <4 карточек).
// Наполнение id — контентная задача Growth, не схема и не миграция БД.
//
// Каждая запись: { id, roomType, style }.
//  - id — uuid рендера (таблица renders);
//  - roomType — отображаемое имя комнаты («Спальня», «Гостиная (зал)», …) —
//    берётся из записи, потому что q.getRender не джойнит комнату;
//  - style — подпись стиля; в выводе стиль берётся из БД (render.style),
//    это поле — запасной вариант на случай пустого render.style.
//
// Приоритет комнат и семейств — из спеки REM-55 §3: спальня и гостиная в приоритете,
// кухня ≤1, стили из разных семейств.
export const FEATURED_RENDERS = [
  // { id: '<uuid>', roomType: 'Спальня', style: 'Скандинавский' },
];

// Канонические 6 комнат для ряда ссылок /gallery/{slug} (SEO-бриф REM-54 §3).
// Slug вычисляется сервером через slugify() в маршруте /api/gallery/featured.
export const GALLERY_ROOMS = ['Спальня', 'Гостиная (зал)', 'Кухня', 'Кабинет', 'Санузел', 'Детская'];

// Пары { entry, render } → публичный DTO. Отбрасывает недоделанные/приватные рендеры
// и рендеры без картинки; недопустимые id уже отфильтрованы (render === null).
export function buildFeaturedItems(pairs) {
  return pairs
    .filter(({ render }) => render && render.status === 'done' && render.image_path && !render.is_private)
    .map(({ entry, render }) => ({
      id: render.id,
      roomType: entry.roomType || '',
      style: render.style || entry.style || '',
      imageUrl: `/gallery/img/${encodeURIComponent(render.id)}`,
      shareToken: render.share_token || null,
    }));
}

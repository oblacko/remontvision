// Словарь для SEO-текстов галереи: отображаемое имя комнаты и родительный падеж
// для описания («готовые AI-дизайны {родительный}»). В выдаче «Гостиная (зал)»
// показываем просто «Гостиная» (аудит REM-40 §8).
export const ROOM_SEO = {
  'Спальня': { title: 'Спальня', genitive: 'спальни' },
  'Гостиная (зал)': { title: 'Гостиная', genitive: 'гостиной' },
  'Детская': { title: 'Детская', genitive: 'детской' },
  'Кухня': { title: 'Кухня', genitive: 'кухни' },
  'Санузел': { title: 'Санузел', genitive: 'санузла' },
  'Кладовка': { title: 'Кладовка', genitive: 'кладовки' },
  'Прихожая': { title: 'Прихожая', genitive: 'прихожей' },
  'Столовая': { title: 'Столовая', genitive: 'столовой' },
  'Кабинет': { title: 'Кабинет', genitive: 'кабинета' },
  'Другое': { title: 'Другие комнаты', genitive: 'других комнат' },
};

// Тонкие разделы галереи: не выводим в sitemap и room-nav и помечаем noindex
// (аудит REM-40 §9). Сами страницы остаются доступны по прямой ссылке.
export const GALLERY_NOINDEX_ROOMS = new Set(['Другое', 'Кладовка']);

export function roomSeo(name) {
  return ROOM_SEO[name] || { title: String(name || ''), genitive: String(name || '').toLowerCase() };
}

// Русская плюрализация: 1 дизайн, 2 дизайна, 5 дизайнов.
export function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Ссылки на поиск по позиции: это выдача магазина, а не найденный товар.
// Отдельно от карточек каталога: в UI должны быть три разных типа результата.
const SHOPS = [
  { key: 'hoff', label: 'Hoff', build: q => `https://hoff.ru/search/?q=${q}` },
  { key: 'ozon', label: 'Ozon', build: q => `https://www.ozon.ru/search/?text=${q}` },
  { key: 'wb', label: 'Wildberries', build: q => `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}` },
  { key: 'ym', label: 'Яндекс Маркет', build: q => `https://market.yandex.ru/search?text=${q}` },
];

export function buildShopSearchLinks(label, { style = '', color = '', material = '' } = {}) {
  const query = [label, style, material, color].filter(Boolean).join(' ').trim();
  if (!query) return [];
  const encoded = encodeURIComponent(query);
  return SHOPS.map(shop => ({
    shop: shop.key,
    label: shop.label,
    url: shop.build(encoded),
    type: 'search',
    query,
  }));
}

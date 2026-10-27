// Тип комнаты: ограничивает набор товаров и явно задаёт назначение помещения в промпте.
// Это защищает от «кровати с умывальником» и случайных люстр из чужих категорий.
export const ROOM_TYPES = [
  {
    name: 'Гостиная (зал)', prompt: 'living room', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no kitchen cabinets/countertop/sink, no bathroom fixtures or toilet.',
  },
  {
    name: 'Спальня', prompt: 'bedroom', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No kitchen, no sink/faucet, no toilet/shower/bathroom fixtures. A bed and bedside tables are appropriate.',
  },
  {
    name: 'Детская', prompt: 'children\'s room', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No kitchen, no bar area, no bathroom fixtures. Keep the room child-safe and appropriate for children.',
  },
  {
    name: 'Кухня', prompt: 'kitchen', categories: ['tile', 'paint', 'countertop', 'faucet', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no toilet, no shower or bathtub. Kitchen sink, faucet, cooktop and countertop are appropriate.',
  },
  {
    name: 'Санузел', prompt: 'bathroom / WC', categories: ['tile', 'paint', 'countertop', 'faucet', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no sofa, no kitchen cabinets/cooktop. A sink, faucet, toilet and shower/bath are appropriate.',
  },
  {
    name: 'Кладовка', prompt: 'storage room / pantry', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no sofa, no kitchen sink/cooktop, no bathroom fixtures. Shelving and storage are appropriate.',
  },
  {
    name: 'Прихожая', prompt: 'entryway / hallway', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no kitchen, no bathroom fixtures. A bench, wardrobe, mirror and shoe storage are appropriate.',
  },
  {
    name: 'Столовая', prompt: 'dining room', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no kitchen sink/cooktop, no bathroom fixtures. A dining table and chairs are appropriate.',
  },
  {
    name: 'Кабинет', prompt: 'home office', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no kitchen, no bathroom fixtures. A desk, office chair and shelving are appropriate.',
  },
  {
    name: 'Балкон / лоджия', prompt: 'balcony / loggia', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no kitchen, no bathroom fixtures. Plants, compact seating and storage are appropriate.',
  },
  {
    name: 'Гардеробная', prompt: 'walk-in closet', categories: ['tile', 'paint', 'light', 'outlets', 'cabinet'],
    forbid: 'No bed, no sofa, no kitchen, no bathroom fixtures. Rails, shelving and a mirror are appropriate.',
  },
  {
    name: 'Другое', prompt: 'room of the type shown in the source photo',
    categories: ['tile', 'paint', 'countertop', 'faucet', 'light', 'outlets', 'cabinet'],
    forbid: 'Keep the room purpose exactly as in the source photo. Do not add fixtures from another room type.',
  },
];

const byName = new Map(ROOM_TYPES.map(type => [type.name.toLowerCase(), type]));
export const ROOM_TYPE_NAMES = ROOM_TYPES.map(type => type.name);

export function roomTypeByName(name) {
  return byName.get(String(name || '').trim().toLowerCase()) || null;
}

export function categoriesForRoomType(name) {
  return roomTypeByName(name)?.categories || null;
}

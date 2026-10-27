// Тип комнаты — это не только запрет «кровати с умывальником».
// Он задаёт слоты материалов, что сохранять, что менять и рекомендации по электрике.
// categories — какие товары вообще допустимы; slots — что реально выбираем в смету.
export const ROOM_TYPES = [
  {
    name: 'Гостиная (зал)',
    prompt: 'living room',
    categories: ['floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the sofa, armchairs, coffee table, TV/media console and their positions; walls, windows, doors, ceiling height and camera angle',
    change: 'floor finish, wall finish, lighting, textiles, decor and styling. You may restyle upholstery and add layered lighting, but keep the furniture footprints realistic.',
    guidance: 'A sofa or armchairs, coffee table, TV/media console, shelving, rug and layered lighting are appropriate.',
    forbid: 'No bed, no kitchen cabinets, countertop, sink or faucet, no toilet, shower or bathroom fixtures. Do not replace the floor with large-format porcelain tile unless a floor product is provided.',
    electrical: [
      { title: 'Розетки у дивана', text: '2–4 розетки + USB, 300 мм от пола, чтобы заряжать технику и торшер.' },
      { title: 'ТВ-зона', text: '4 розетки + интернет за ТВ-панелью, скрытый кабель-канал.' },
      { title: 'Свет', text: 'Люстра, бра и торшер — отдельные группы; проходные выключатели у двух входов.' },
    ],
  },
  {
    name: 'Спальня',
    prompt: 'bedroom',
    categories: ['floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the bed, bedside tables, wardrobe and their positions; walls, windows, doors, ceiling height and camera angle. Keep the bed proportions realistic.',
    change: 'floor finish, wall finish, ceiling and bedside lighting, textiles, headboard/upholstery and styling. Do not move the bed to another wall.',
    guidance: 'A comfortable bed with an upholstered headboard, two bedside tables, soft textiles, a wardrobe and calm layered lighting are appropriate.',
    forbid: 'No kitchen, no sink/faucet, no toilet, shower or bathroom fixtures, no kitchen cabinets or countertop, no large-format porcelain floor tile. The floor must stay wood, laminate, carpet or vinyl unless a floor product explicitly says otherwise.',
    electrical: [
      { title: 'Розетки у кровати', text: 'По 2 розетки + USB с каждой стороны, 300 мм от пола.' },
      { title: 'Выключатели', text: 'Проходной у входа и у изголовья; отдельный сценарий на бра.' },
      { title: 'ТВ и рабочее место', text: '4 розетки + интернет за ТВ; 2–4 розетки у стола, 900 мм.' },
    ],
  },
  {
    name: 'Детская',
    prompt: "children's room",
    categories: ['floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the bed, desk, storage and their positions; architecture and camera angle. Keep the room child-safe and practical.',
    change: 'floor finish, wall finish, lighting, textiles, decor and styling. Keep surfaces wipeable and safe.',
    guidance: 'A single or bunk bed, desk, storage, playful accents and child-safe materials are appropriate.',
    forbid: 'No kitchen, no bar area, no bathroom fixtures, no adult bedroom styling, no fragile decor at child height. Keep the room child-safe and appropriate for children.',
    electrical: [
      { title: 'У кровати', text: '2 розетки с защитными шторками + ночник.' },
      { title: 'Рабочее место', text: '2–4 розетки + USB у стола, 900 мм; отдельный свет.' },
      { title: 'Безопасность', text: 'УЗО на линии, розетки вне зоны доступа малышей.' },
    ],
  },
  {
    name: 'Кухня',
    prompt: 'kitchen',
    categories: ['floor', 'paint', 'tile', 'skirting', 'countertop', 'cabinet', 'faucet', 'sink', 'light', 'outlets', 'appliance'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint'] },
      { key: 'backsplash', categories: ['tile'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'countertop', categories: ['countertop'] },
      { key: 'faucet', categories: ['faucet'] },
      { key: 'sink', categories: ['sink'] },
      { key: 'light', categories: ['light'] },
      { key: 'appliance', categories: ['appliance'] },
      { key: 'outlets', categories: ['outlets'] },
    ],
    keep: 'the cabinet run, sink, cooktop, oven, hood, plumbing and electrical points; walls, windows, doors, ceiling height and camera angle. Do not move the sink or cooktop.',
    change: 'cabinet fronts, countertop, backsplash, floor, wall paint, lighting, faucet, sink and appliances. Keep the work triangle functional.',
    guidance: 'Kitchen cabinets, countertop, sink, faucet, cooktop or oven, hood and practical layered lighting are appropriate.',
    forbid: 'No bed, no toilet, no shower or bathtub, no living-room furniture. Do not turn the room into a bedroom or living room.',
    electrical: [
      { title: 'Фартук', text: '4–6 розеток на 1000–1100 мм, разбить на группы.' },
      { title: 'Техника', text: 'Отдельные линии для варочной, духовки, посудомойки, холодильника и вытяжки.' },
      { title: 'Свет', text: 'Общий свет, подсветка фартука и острова — отдельные группы.' },
    ],
  },
  {
    name: 'Санузел',
    prompt: 'bathroom / WC',
    categories: ['floor', 'tile', 'paint', 'countertop', 'cabinet', 'faucet', 'sink', 'toilet', 'shower', 'bathtub', 'light', 'outlets'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'tile', categories: ['tile'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'countertop', categories: ['countertop'] },
      { key: 'faucet', categories: ['faucet'] },
      { key: 'sink', categories: ['sink'] },
      { key: 'toilet', categories: ['toilet'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
    ],
    keep: 'the plumbing positions, toilet, sink, shower/bath footprint, waterproofing and camera angle. Do not move wet zones.',
    change: 'wall and floor tile, vanity, countertop, fixtures, mirror, lighting and styling. Keep everything moisture-resistant.',
    guidance: 'A vanity, sink, mirror, toilet, shower or bath and moisture-resistant materials are appropriate.',
    forbid: 'No bed, no sofa, no kitchen cabinets or cooktop, no living-room furniture, no wood floor in wet zones.',
    electrical: [
      { title: 'Зеркало', text: 'Розетка и свет 1800–2000 мм, IP44.' },
      { title: 'Стиральная машина', text: 'Отдельная линия и УЗО; розетка вне зоны душа.' },
      { title: 'Тёплый пол', text: 'Терморегулятор у входа, отдельная линия.' },
    ],
  },
  {
    name: 'Кладовка',
    prompt: 'storage room / pantry',
    categories: ['floor', 'paint', 'light', 'outlets', 'cabinet'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
    ],
    keep: 'shelving and storage positions; architecture and camera angle.',
    change: 'floor, walls, shelving fronts, lighting and practical storage.',
    guidance: 'Shelving, boxes and practical lighting are appropriate.',
    forbid: 'No bed, no sofa, no kitchen sink/cooktop, no bathroom fixtures. Do not turn it into a living space.',
    electrical: [
      { title: 'Свет', text: 'Датчик движения или выключатель у входа.' },
      { title: 'Розетка', text: 'Одна розетка для пылесоса/зарядки у входа.' },
    ],
  },
  {
    name: 'Прихожая',
    prompt: 'entryway / hallway',
    categories: ['floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'cabinet', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'wardrobe, bench and shoe storage positions; doors, walls and camera angle.',
    change: 'floor, walls, cabinet fronts, lighting, textiles and styling. Keep durable materials near the entrance.',
    guidance: 'A bench, wardrobe, mirror, shoe storage and durable floor materials are appropriate.',
    forbid: 'No bed, no kitchen, no bathroom fixtures. Do not add living-room furniture.',
    electrical: [
      { title: 'У входа', text: 'Розетка для пылесоса и зарядки, 300 мм.' },
      { title: 'Шкаф', text: 'Подсветка ниши и розетка внутри шкафа.' },
      { title: 'Свет', text: 'Проходной выключатель и датчик движения.' },
    ],
  },
  {
    name: 'Столовая',
    prompt: 'dining room',
    categories: ['floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the dining table, chairs, sideboard and their positions; architecture and camera angle.',
    change: 'floor, walls, lighting, textiles, decor and styling. The pendant should relate to the table.',
    guidance: 'A dining table, chairs, sideboard and pendant light are appropriate.',
    forbid: 'No bed, no kitchen sink/cooktop, no bathroom fixtures. Do not add a sofa or kitchen cabinets.',
    electrical: [
      { title: 'Стол', text: 'Розетка у стола для техники, скрытая в полу или у плинтуса.' },
      { title: 'Свет', text: 'Подвес над столом на отдельной группе с диммером.' },
    ],
  },
  {
    name: 'Кабинет',
    prompt: 'home office',
    categories: ['floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'desk, chair, shelving and their positions; architecture and camera angle.',
    change: 'floor, walls, lighting, textiles, storage fronts and styling. Keep the workspace ergonomic.',
    guidance: 'A desk, ergonomic office chair, shelving and task lighting are appropriate.',
    forbid: 'No bed, no kitchen, no bathroom fixtures. Do not add living-room furniture.',
    electrical: [
      { title: 'Стол', text: '4–6 розеток + интернет, 900 мм; отдельная линия для техники.' },
      { title: 'Свет', text: 'Общий свет + task-свет на столе, тёплый и нейтральный сценарии.' },
    ],
  },
  {
    name: 'Балкон / лоджия',
    prompt: 'balcony / loggia',
    categories: ['floor', 'paint', 'light', 'outlets'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
    ],
    keep: 'glazing, railing, structural elements and camera angle. Do not merge the balcony with the room.',
    change: 'floor, walls/ceiling, lighting and weather-resistant styling.',
    guidance: 'Plants, compact seating, storage and weather-resistant materials are appropriate.',
    forbid: 'No bed, no kitchen, no bathroom fixtures. Keep it as a balcony, not a full room.',
    electrical: [
      { title: 'Розетка', text: 'IP44 у пола для техники и подсветки.' },
      { title: 'Свет', text: 'Влагостойкий светильник, отдельный выключатель.' },
    ],
  },
  {
    name: 'Гардеробная',
    prompt: 'walk-in closet',
    categories: ['floor', 'paint', 'light', 'outlets', 'cabinet'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
    ],
    keep: 'rails, shelving, storage positions and camera angle.',
    change: 'floor, walls, cabinet fronts, integrated lighting and styling.',
    guidance: 'Rails, shelving, a mirror and integrated lighting are appropriate.',
    forbid: 'No bed, no sofa, no kitchen, no bathroom fixtures. Do not add living-room furniture.',
    electrical: [
      { title: 'Свет', text: 'Подсветка полок и датчик движения.' },
      { title: 'Розетка', text: 'Одна розетка у входа для зарядки/пылесоса.' },
    ],
  },
  {
    name: 'Другое',
    prompt: 'room of the type shown in the source photo',
    categories: ['floor', 'paint', 'wallpaper', 'tile', 'skirting', 'countertop', 'cabinet', 'faucet', 'sink', 'toilet', 'shower', 'bathtub', 'light', 'outlets', 'appliance', 'textile'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
    ],
    keep: 'the existing room purpose, architecture, large furniture and camera angle.',
    change: 'finishes, lighting, textiles and styling that match the room purpose shown in the source photo.',
    guidance: 'Keep the room purpose exactly as in the source photo.',
    forbid: 'Do not add fixtures from another room type. Do not change the room purpose.',
    electrical: [
      { title: 'Электрика', text: 'Розетки и выключатели по фактическому сценарию комнаты; уточните зоны у дизайнера.' },
    ],
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

export function slotsForRoomType(name) {
  return roomTypeByName(name)?.slots || [];
}

export function electricalForRoomType(name) {
  return roomTypeByName(name)?.electrical || [];
}

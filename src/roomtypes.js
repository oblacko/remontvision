// Тип комнаты — это не только запрет «кровати с умывальником».
// Он задаёт слоты материалов, что сохранять, что менять и рекомендации по электрике.
// categories — какие товары вообще допустимы; slots — что реально выбираем в смету.
const DEFAULT_ROOM_TYPES = [
  {
    name: 'Гостиная (зал)',
    prompt: 'living room',
    categories: ['sofa', 'armchair', 'coffee_table', 'rug', 'floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'sofa', categories: ['sofa'] },
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'coffee_table', categories: ['coffee_table'] },
      { key: 'armchair', categories: ['armchair'] },
      { key: 'light', categories: ['light'] },
      { key: 'rug', categories: ['rug'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the sofa, armchairs, coffee table, TV/media console and their realistic proportions; the architecture, camera, walls, windows, doors and ceiling height. Do not block doors or windows.',
    change: 'floor finish, wall finish, lighting, textiles, decor and styling. Replace or restyle the sofa, armchairs, coffee table and storage using the listed furniture. You may rearrange freestanding furniture to improve composition and flow while keeping it functional.',
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
    categories: ['bed', 'wardrobe', 'rug', 'floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'bed', categories: ['bed'] },
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'light', categories: ['light'] },
      { key: 'wardrobe', categories: ['wardrobe'] },
      { key: 'rug', categories: ['rug'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the bed, bedside tables, wardrobe and their realistic proportions; the architecture, camera, walls, windows, doors and ceiling height. Keep the bed functional and do not block doors or windows.',
    change: 'floor finish, wall finish, ceiling and bedside lighting, textiles, and replace or restyle the bed, headboard and wardrobe using the listed furniture. You may move the bed and other freestanding furniture to improve composition and flow, but keep the layout realistic and functional.',
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
    categories: ['bed', 'desk', 'storage', 'rug', 'floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'bed', categories: ['bed'] },
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'desk', categories: ['desk'] },
      { key: 'storage', categories: ['storage'] },
      { key: 'rug', categories: ['rug'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the bed, desk, storage and their realistic proportions; the architecture, camera, walls, windows and doors. Keep the room child-safe and practical.',
    change: 'floor finish, wall finish, lighting, textiles, decor and styling. Replace or restyle the bed, desk and storage using the listed furniture. You may rearrange the bed, desk and storage for a better safe layout.',
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
      { key: 'backsplash', categories: ['tile'] },
      { key: 'countertop', categories: ['countertop'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'wall', categories: ['paint'] },
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
    keep: 'the room envelope: walls, windows, doors, ceiling, floor level, waterproofing and camera angle. Wet zones must stay functional, but the fixture layout can be redesigned inside the room.',
    change: 'wall and floor tile, vanity, countertop, faucets, mirror, lighting, styling and fixture layout inside the room. Keep everything moisture-resistant and keep 60 cm clear in front of every fixture.',
    guidance: 'Design the best functional layout for the stated dimensions. Choose compact fixtures that fit, keep 60 cm clear in front of each, and do not exceed the room width.',
    forbid: 'No bed, no sofa, no kitchen cabinets or cooktop, no living-room furniture, no wood floor in wet zones, no widened bathroom, no fixture or furniture that does not fit the room, no new ceiling coves unless already present.',
    electrical: [
      { title: 'Зеркало', text: 'Розетка и свет 1800–2000 мм, IP44.' },
      { title: 'Стиральная машина', text: 'Отдельная линия и УЗО; розетка вне зоны душа.' },
      { title: 'Тёплый пол', text: 'Терморегулятор у входа, отдельная линия.' },
    ],
  },
  {
    name: 'Кладовка',
    prompt: 'storage room / pantry',
    categories: ['storage', 'floor', 'paint', 'light', 'outlets', 'cabinet'],
    slots: [
      { key: 'storage', categories: ['storage'] },
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
    categories: ['storage', 'bench', 'floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'cabinet', 'textile'],
    slots: [
      { key: 'storage', categories: ['storage'] },
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'bench', categories: ['bench'] },
      { key: 'cabinet', categories: ['cabinet'] },
      { key: 'light', categories: ['light'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'wardrobe, bench and shoe storage and their realistic proportions; doors, walls and camera angle.',
    change: 'floor, walls, cabinet fronts, lighting, textiles and styling. You may rearrange freestanding storage and the bench for better flow. Keep durable materials near the entrance.',
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
    categories: ['dining_table', 'dining_chair', 'sideboard', 'rug', 'floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'dining_table', categories: ['dining_table'] },
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'dining_chair', categories: ['dining_chair'] },
      { key: 'sideboard', categories: ['sideboard'] },
      { key: 'rug', categories: ['rug'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'the dining table, chairs, sideboard and their realistic proportions; the architecture, camera, walls, windows and doors.',
    change: 'floor, walls, lighting, textiles, decor and styling. Replace or restyle the dining table, chairs and sideboard using the listed furniture. You may rearrange the table, chairs and sideboard for a better composition; keep circulation around the table.',
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
    categories: ['desk', 'office_chair', 'storage', 'rug', 'floor', 'paint', 'wallpaper', 'skirting', 'light', 'outlets', 'textile'],
    slots: [
      { key: 'desk', categories: ['desk'] },
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint', 'wallpaper'] },
      { key: 'office_chair', categories: ['office_chair'] },
      { key: 'storage', categories: ['storage'] },
      { key: 'rug', categories: ['rug'] },
      { key: 'light', categories: ['light'] },
      { key: 'skirting', categories: ['skirting'] },
      { key: 'outlets', categories: ['outlets'] },
      { key: 'textile', categories: ['textile'] },
    ],
    keep: 'desk, chair, shelving and their realistic proportions; the architecture, camera, walls, windows and doors.',
    change: 'floor, walls, lighting, textiles, storage fronts and styling. Replace or restyle the desk, chair and storage using the listed furniture. You may reposition freestanding furniture for a better composition, keeping the workspace ergonomic.',
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
    categories: ['storage', 'floor', 'paint', 'light', 'outlets', 'cabinet'],
    slots: [
      { key: 'storage', categories: ['storage'] },
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

const STYLING_BY_ROOM = {
  'Спальня': 'Dress the bed like an editorial shoot: layered linen bedding, duvet, mixed-texture pillows, a throw, bedside books, a carafe and warm lamps. Add a rug, floor-length curtains, framed art, a plant, ceramics and a sculptural object. Use warm layered lighting and tactile materials. Hide the radiator completely behind a flush wall-colored grille; no white panel under the window. Remove the old TV or mount it flush with hidden cables. Add a warm cove or wall wash and bedside pools of light. Replace old blinds with floor-length curtains or a clean Roman blind; hide the cornice. Add framed art above the bed, a throw and cushions, and a headboard ledge or open shelf with 3–5 styled objects. Place a closed modern laptop or headphones on the nightstand or console and one small plush toy on the bed or chair — visible but neat, never on the floor.',
  'Гостиная (зал)': 'Style the sofa with cushions and a throw; add a rug, coffee-table books, ceramics, a tray, candles, art, plants, a floor lamp and a sculptural chair. Layer textiles and warm light; make it feel collected, not staged. If there is a TV, mount it flush with hidden cables or use a frame TV; cover the radiator with a slim grille. Add a warm cove or wall wash. Replace old blinds with floor-length curtains or a clean Roman blind; hide the cornice. Add a gallery wall, open shelving with books and ceramics, and a modern laptop, headphones or speaker styled on the console or coffee table — visible and on a surface, never on the floor. Hide all cables, chargers and straps.',
  'Кухня': 'Style with a wooden board, ceramics, herbs, a bowl of fruit, a runner, a small plant and warm under-cabinet light. Keep counters uncluttered; make it look like a real home, not a showroom. Use warm under-cabinet LED, hood light and hidden cable management; no exposed wires. Replace old window treatments with a clean Roman/roller blind. Add cookbooks, ceramics and a small framed print; no laptop on the kitchen counter.',
  'Санузел': 'Fold towels, add soap, a tray, a plant, a mirror, warm spa lighting and a small stool. Make it feel like a boutique hotel bathroom. Use a backlit mirror and niche light; hide pipes and cables. Replace old window treatments with a clean moisture-resistant blind. Add a small framed print, folded towels and a plant; no electronics in the wet zone.',
  'Столовая': 'Set the table with ceramics, glassware, a linen runner, candles and a small vase. Style the sideboard with art, books and a lamp; add a plant and a pendant that relates to the table. Add a warm cove or wall wash; hide cables and the radiator. Replace old blinds with floor-length curtains. Style the sideboard with art, books, candles and ceramics; add a pendant and table setting.',
  'Кабинет': 'Style the desk with a lamp, books, ceramics, a plant and a tray. Add art, a rug, shelving details and a comfortable chair; make it feel calm and productive. Add a shelf backlight and desk lamp; manage all cables. Replace old blinds with floor-length curtains or a clean Roman blind. Add an open MacBook-style laptop, headphones, books, a pinboard and framed art on the desk and shelves. The laptop must be visible on the desk; keep all electronics on surfaces and hide cables.',
  'Детская': 'Add soft textiles, books, toys, art, a rug and a night light; keep it playful but styled, safe and not cluttered. Hide cables and the radiator; use soft warm light. Replace old blinds with soft curtains or a clean roller blind. Add 2–3 plush toys, books, art and a night light in a tasteful, uncluttered way. Keep plush toys on the bed or shelf, never on the floor.',
  'Прихожая': 'Style with a bench, tray, mirror, hooks, a plant, a runner and warm light; make the first impression inviting. Add console or wardrobe backlight; hide cables and the radiator. Replace old blinds with a clean Roman/roller blind. Style the console with a tray, art, a plant and a mirror; add a bench cushion or throw.',
  'Балкон / лоджия': 'Add plants, a small table, a chair, textiles and warm light; make it a cozy retreat.',
  'Гардеробная': 'Style shelves with folded textiles, boxes, a mirror and warm integrated light.',
  'Кладовка': 'Keep it practical: boxes, labels, shelving and warm light; no decor clutter.',
  'Другое': 'Add tasteful textiles, art, plants, books, ceramics and warm layered lighting; make it feel finished and lived-in.',
};
const ROOM_CATEGORIES = new Set(DEFAULT_ROOM_TYPES.flatMap(type => type.categories));
DEFAULT_ROOM_TYPES.forEach((type, index) => {
  type.styling = STYLING_BY_ROOM[type.name] || STYLING_BY_ROOM['Другое'];
  type.active = type.active !== false;
  type.sort = Number.isFinite(type.sort) ? type.sort : index;
});

export const ROOM_TYPES = [];
export const ROOM_TYPE_NAMES = [];
let byName = new Map();

const clone = value => structuredClone(value);
const unique = values => [...new Set(values)];

function cleanText(value, field, max = 8000) {
  const out = String(value ?? '').trim();
  if (out.length > max) throw new Error(`${field}: максимум ${max} символов`);
  return out;
}

function stringList(value, field, max = 80) {
  if (!Array.isArray(value)) throw new Error(`${field}: нужен массив`);
  const out = unique(value.map(item => cleanText(item, field, max)).filter(Boolean));
  if (!out.length) throw new Error(`${field}: нужен хотя бы один элемент`);
  return out;
}

function normalizeRoomType(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Тип комнаты должен быть объектом');
  const name = cleanText(input.name, 'Название', 80);
  if (!name) throw new Error('У типа комнаты должно быть название');
  const prompt = cleanText(input.prompt, `«${name}»: prompt`, 300);
  if (!prompt) throw new Error(`«${name}»: нужен английский prompt для модели`);
  const categories = stringList(input.categories, `«${name}»: categories`);
  for (const category of categories) {
    if (!ROOM_CATEGORIES.has(category)) throw new Error(`«${name}»: неизвестная категория ${category}`);
  }
  const slots = Array.isArray(input.slots) ? input.slots : [];
  const normalizedSlots = slots.map((slot, slotIndex) => {
    const key = cleanText(slot?.key, `«${name}»: слот ${slotIndex + 1}`, 80);
    if (!key) throw new Error(`«${name}»: у слота нет key`);
    const slotCategories = stringList(slot?.categories, `«${name}»/${key}: categories`);
    for (const category of slotCategories) {
      if (!categories.includes(category)) throw new Error(`«${name}»/${key}: категория ${category} не входит в categories комнаты`);
    }
    return { key, categories: slotCategories };
  });
  const seenSlots = new Set();
  for (const slot of normalizedSlots) {
    if (seenSlots.has(slot.key)) throw new Error(`«${name}»: слот ${slot.key} повторяется`);
    seenSlots.add(slot.key);
  }
  const electrical = Array.isArray(input.electrical)
    ? input.electrical.map((item, itemIndex) => ({
        title: cleanText(item?.title, `«${name}»: электрика ${itemIndex + 1}`, 200),
        text: cleanText(item?.text, `«${name}»: электрика ${itemIndex + 1}`, 1000),
      })).filter(item => item.title || item.text)
    : [];
  return {
    name,
    prompt,
    categories,
    slots: normalizedSlots,
    keep: cleanText(input.keep, `«${name}»: keep`),
    change: cleanText(input.change, `«${name}»: change`),
    guidance: cleanText(input.guidance, `«${name}»: guidance`),
    forbid: cleanText(input.forbid, `«${name}»: forbid`),
    electrical,
    styling: cleanText(input.styling, `«${name}»: styling`) || STYLING_BY_ROOM[name] || STYLING_BY_ROOM['Другое'],
    active: input.active !== false,
    sort: Number.isFinite(Number(input.sort)) ? Number(input.sort) : index,
  };
}

export function validateRoomTypes(input) {
  if (!Array.isArray(input) || !input.length) throw new Error('Нужен непустой список типов комнат');
  if (input.length > 50) throw new Error('Слишком много типов комнат');
  const list = input.map((item, index) => normalizeRoomType(item, index));
  const seen = new Set();
  for (const type of list) {
    const key = type.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Тип комнаты «${type.name}» повторяется`);
    seen.add(key);
  }
  if (!list.some(type => type.name === 'Другое')) {
    throw new Error('Нужен системный тип «Другое»: он используется как fallback для старых и неизвестных комнат');
  }
  if (!list.some(type => type.active !== false)) {
    throw new Error('Должен остаться хотя бы один активный тип комнаты');
  }
  return list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru'));
}

function applyRoomTypes(list) {
  const next = clone(list);
  ROOM_TYPES.splice(0, ROOM_TYPES.length, ...next);
  ROOM_TYPE_NAMES.splice(0, ROOM_TYPE_NAMES.length, ...next.map(type => type.name));
  byName = new Map(next.map(type => [type.name.toLowerCase(), type]));
}

applyRoomTypes(DEFAULT_ROOM_TYPES);

export function getRoomTypeConfig() {
  return clone(ROOM_TYPES);
}

export function getRoomTypeDefaults() {
  return clone(DEFAULT_ROOM_TYPES);
}

export function activeRoomTypeNames() {
  return ROOM_TYPES.filter(type => type.active !== false).map(type => type.name);
}

export function isRoomTypeActive(name) {
  return roomTypeByName(name)?.active === true;
}

export function setRoomTypesForTests(list) {
  applyRoomTypes(validateRoomTypes(list));
}

export const ROOM_TYPES_KEY = 'roomtypes.config.v1';

export async function loadRoomTypes() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([ROOM_TYPES_KEY]);
    const raw = rows.find(row => row.key === ROOM_TYPES_KEY)?.value;
    applyRoomTypes(raw ? validateRoomTypes(JSON.parse(raw)) : DEFAULT_ROOM_TYPES);
  } catch (e) {
    console.error('[roomtypes] не удалось загрузить настройки:', String(e.message || e).slice(0, 300));
    applyRoomTypes(DEFAULT_ROOM_TYPES);
  }
  return getRoomTypeConfig();
}

export async function saveRoomTypes(input) {
  const next = validateRoomTypes(input);
  const { q } = await import('./db.js');
  await q.setSetting(ROOM_TYPES_KEY, JSON.stringify(next));
  applyRoomTypes(next);
  return getRoomTypeConfig();
}

export async function resetRoomTypes() {
  const { q } = await import('./db.js');
  await q.deleteSetting(ROOM_TYPES_KEY);
  applyRoomTypes(DEFAULT_ROOM_TYPES);
  return getRoomTypeConfig();
}

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

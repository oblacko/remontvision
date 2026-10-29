export const PROCUREMENT_TEMPLATE_VERSION = '2026-10-29-list-v1';

const genericQuery = ({ label, color, material, subtype }) =>
  [label, subtype, color, material, 'купить'].filter(Boolean).join(' ');

export const PROCUREMENT_CATEGORIES = {
  bed: { label: 'Кровать', layer: 'hero', mode: 'visual' },
  nightstand: { label: 'Прикроватная тумба', layer: 'hero', mode: 'visual' },
  wardrobe: { label: 'Шкаф', layer: 'hero', mode: 'visual' },
  sofa: { label: 'Диван', layer: 'hero', mode: 'visual' },
  armchair: { label: 'Кресло', layer: 'hero', mode: 'visual' },
  coffee_table: { label: 'Журнальный стол', layer: 'hero', mode: 'visual' },
  dining_table: { label: 'Обеденный стол', layer: 'hero', mode: 'visual' },
  dining_chair: { label: 'Обеденный стул', layer: 'hero', mode: 'visual' },
  sideboard: { label: 'Комод или консоль', layer: 'hero', mode: 'visual' },
  desk: { label: 'Рабочий стол', layer: 'hero', mode: 'visual' },
  office_chair: { label: 'Рабочее кресло', layer: 'hero', mode: 'visual' },
  storage: { label: 'Стеллаж или система хранения', layer: 'hero', mode: 'visual' },
  bench: { label: 'Банкетка', layer: 'hero', mode: 'visual' },
  rug: { label: 'Ковёр', layer: 'hero', mode: 'visual' },
  light: { label: 'Светильник', layer: 'hero', mode: 'visual' },
  decor: { label: 'Декор', layer: 'hero', mode: 'visual' },

  floor: { label: 'Напольное покрытие', layer: 'finish', mode: 'text' },
  walls: { label: 'Отделка стен', layer: 'finish', mode: 'text' },
  ceiling: { label: 'Отделка потолка', layer: 'finish', mode: 'text' },
  skirting: { label: 'Плинтус', layer: 'finish', mode: 'text' },
  tile: { label: 'Плитка', layer: 'finish', mode: 'text' },
  paint: { label: 'Краска для стен', layer: 'finish', mode: 'text' },
  wallpaper: { label: 'Обои', layer: 'finish', mode: 'text' },
  countertop: { label: 'Столешница', layer: 'builtin', mode: 'text' },
  cabinet: { label: 'Кухонный гарнитур или фасады', layer: 'builtin', mode: 'text' },
  faucet: { label: 'Смеситель', layer: 'builtin', mode: 'text' },
  sink: { label: 'Мойка или раковина', layer: 'builtin', mode: 'text' },
  toilet: { label: 'Унитаз', layer: 'builtin', mode: 'text' },
  shower: { label: 'Душевая система', layer: 'builtin', mode: 'text' },
  bathtub: { label: 'Ванна', layer: 'builtin', mode: 'text' },
  appliance: { label: 'Встроенная техника', layer: 'builtin', mode: 'text' },
  mirror: { label: 'Зеркало', layer: 'builtin', mode: 'text' },

  curtains: { label: 'Шторы', layer: 'textile', mode: 'text' },
  bedding: { label: 'Постельное бельё', layer: 'textile', mode: 'text' },
  textile: { label: 'Текстиль', layer: 'textile', mode: 'text' },

  mattress: { label: 'Матрас', layer: 'completeness', mode: 'rule', note: 'Нужно уточнить размер кровати и матраса' },
  underlay: { label: 'Подложка под напольное покрытие', layer: 'completeness', mode: 'rule', note: 'Подбирается по типу пола' },
  curtain_track: { label: 'Карниз или трек для штор', layer: 'completeness', mode: 'rule', note: 'Подбирается по длине окна' },
  lamps: { label: 'Лампы для светильников', layer: 'completeness', mode: 'rule', note: 'Подбираются по цоколю и мощности' },
  fasteners: { label: 'Крепёж и расходники', layer: 'completeness', mode: 'rule', note: 'Добавьте после выбора основных позиций' },
  handles: { label: 'Ручки и фурнитура', layer: 'completeness', mode: 'rule', note: 'Подбираются по фасадам' },
  plinth: { label: 'Цоколь и заглушки', layer: 'completeness', mode: 'rule', note: 'Подбираются по гарнитуру' },
  sealant: { label: 'Герметик и клей', layer: 'completeness', mode: 'rule', note: 'Расходник для монтажа' },
  waterproofing: { label: 'Гидроизоляция', layer: 'completeness', mode: 'rule', note: 'Нужна для мокрых зон' },
  trap: { label: 'Трап и слив', layer: 'completeness', mode: 'rule', note: 'Подбирается по типу душа' },
  ventilation: { label: 'Вентиляция', layer: 'completeness', mode: 'rule', note: 'Проверьте существующую систему' },
  hooks: { label: 'Крючки и органайзеры', layer: 'completeness', mode: 'rule', note: 'Добавьте по месту' },
};

const T = (...keys) => keys;
const baseFinish = T('floor', 'walls', 'ceiling', 'skirting');

export const PROCUREMENT_ROOM_TEMPLATES = {
  'Гостиная (зал)': {
    hero: T('sofa', 'armchair', 'coffee_table', 'storage', 'light', 'rug', 'decor'),
    finish: baseFinish,
    textile: T('curtains'),
    completeness: T('underlay', 'curtain_track', 'lamps', 'fasteners'),
  },
  'Спальня': {
    hero: T('bed', 'nightstand', 'wardrobe', 'light', 'rug', 'decor'),
    finish: baseFinish,
    textile: T('curtains', 'bedding'),
    completeness: T('mattress', 'underlay', 'curtain_track', 'lamps', 'fasteners'),
  },
  'Детская': {
    hero: T('bed', 'desk', 'storage', 'light', 'rug', 'decor'),
    finish: baseFinish,
    textile: T('curtains', 'bedding'),
    completeness: T('mattress', 'underlay', 'curtain_track', 'lamps', 'fasteners'),
  },
  'Кухня': {
    hero: T('light', 'decor'),
    finish: T('floor', 'walls', 'ceiling', 'tile', 'skirting'),
    builtin: T('cabinet', 'countertop', 'sink', 'faucet', 'appliance'),
    completeness: T('handles', 'plinth', 'underlay', 'sealant', 'fasteners'),
  },
  'Санузел': {
    hero: T('light'),
    finish: T('floor', 'walls', 'ceiling', 'tile'),
    builtin: T('toilet', 'sink', 'faucet', 'shower', 'bathtub', 'cabinet', 'mirror'),
    completeness: T('waterproofing', 'trap', 'sealant', 'ventilation', 'fasteners'),
  },
  'Кладовка': {
    hero: T('storage', 'light'),
    finish: T('floor', 'walls', 'ceiling'),
    completeness: T('fasteners'),
  },
  'Прихожая': {
    hero: T('storage', 'bench', 'mirror', 'light'),
    finish: baseFinish,
    textile: T('textile'),
    completeness: T('hooks', 'fasteners'),
  },
  'Столовая': {
    hero: T('dining_table', 'dining_chair', 'sideboard', 'light', 'rug', 'decor'),
    finish: baseFinish,
    textile: T('curtains'),
    completeness: T('underlay', 'curtain_track', 'lamps', 'fasteners'),
  },
  'Кабинет': {
    hero: T('desk', 'office_chair', 'storage', 'light', 'rug', 'decor'),
    finish: baseFinish,
    textile: T('curtains'),
    completeness: T('underlay', 'curtain_track', 'lamps', 'fasteners'),
  },
};

export function getProcurementTemplate(roomType) {
  const exact = PROCUREMENT_ROOM_TEMPLATES[roomType];
  if (exact) return { room_type: roomType, ...exact };
  return {
    room_type: roomType || 'Комната',
    hero: T('storage', 'light', 'decor'),
    finish: baseFinish,
    completeness: T('lamps', 'fasteners'),
  };
}

export function categoryMeta(key) {
  return PROCUREMENT_CATEGORIES[key] || null;
}

export function categoryLabel(key) {
  return categoryMeta(key)?.label || key;
}

export function categoryQuery(key, context = {}) {
  const meta = categoryMeta(key);
  if (!meta) return genericQuery({ label: key, ...context });
  return genericQuery({
    label: meta.label,
    subtype: context.subtype,
    color: context.color,
    material: context.material,
  });
}

export function templateCategoryKeys(template) {
  return ['hero', 'finish', 'builtin', 'textile', 'completeness']
    .flatMap(layer => (template[layer] || []).map(key => ({ key, layer })));
}

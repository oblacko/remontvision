// Классы материалов и человекочитаемые названия слотов.
// Бюджет-сумма больше не управляет подбором: продукты выбираются по классу.
export const PRICE_TIERS = ['start', 'comfort', 'premium', 'atelier'];

export const PRICE_TIER_META = {
  start: {
    key: 'start',
    name: 'Старт',
    promptName: 'Start',
    short: 'Практично и аккуратно',
    description: 'Доступные, но нормальные материалы: ламинат, керамика, painted MDF, базовые fixtures.',
    prompt: 'practical affordable materials: laminate, ceramic tile, painted MDF, basic steel or chrome fixtures. Keep the result clean and believable, not cheap-looking.',
  },
  comfort: {
    key: 'comfort',
    name: 'Комфорт',
    promptName: 'Comfort',
    short: 'Лучший баланс',
    description: 'Средний сегмент: инженерная доска, кварц, качественные фасады, латунь/сталь, нормальный свет.',
    prompt: 'balanced mid-range materials: engineered wood, quartz or compact countertops, quality painted or veneered cabinetry, warm brass or steel fixtures, layered lighting.',
  },
  premium: {
    key: 'premium',
    name: 'Премиум',
    promptName: 'Premium',
    short: 'Статусные материалы',
    description: 'Выразительные фактуры: натуральный камень, массив, дизайнерский свет, брендовая сантехника.',
    prompt: 'premium materials: natural stone, solid wood, designer lighting, branded plumbing, rich tactile finishes and refined details.',
  },
  atelier: {
    key: 'atelier',
    name: 'Ателье',
    promptName: 'Atelier',
    short: 'Дизайнерские решения',
    description: 'Редкие фактуры, авторский свет, кастомные решения и коллекционные предметы.',
    prompt: 'exceptional atelier-level materials: rare stone, custom joinery, artisan lighting, collectible fixtures, one-of-a-kind details. Still realistic and livable.',
  },
};

export const SLOT_LABELS = {
  bed: 'bed',
  wardrobe: 'wardrobe',
  sofa: 'sofa',
  armchair: 'armchair',
  coffee_table: 'coffee table',
  dining_table: 'dining table',
  dining_chair: 'dining chair',
  sideboard: 'sideboard',
  desk: 'desk',
  office_chair: 'office chair',
  storage: 'storage / shelving',
  bench: 'bench',
  rug: 'rug',
  floor: 'floor finish',
  wall: 'wall finish',
  backsplash: 'kitchen backsplash',
  tile: 'wall tile',
  skirting: 'skirting boards',
  countertop: 'countertop',
  cabinet: 'cabinet fronts / vanity',
  faucet: 'faucet',
  sink: 'sink',
  toilet: 'toilet',
  shower: 'shower',
  bathtub: 'bathtub',
  light: 'ceiling light / pendant',
  outlets: 'sockets and switches',
  appliance: 'built-in appliance',
  textile: 'textiles and curtains',
};

export const SLOT_LABELS_RU = {
  bed: 'Кровать',
  wardrobe: 'Шкаф',
  sofa: 'Диван',
  armchair: 'Кресло',
  coffee_table: 'Журнальный стол',
  dining_table: 'Обеденный стол',
  dining_chair: 'Стулья',
  sideboard: 'Комод / консоль',
  desk: 'Рабочий стол',
  office_chair: 'Рабочее кресло',
  storage: 'Хранение',
  bench: 'Банкетка',
  rug: 'Ковёр',
  floor: 'Пол',
  wall: 'Стены',
  backsplash: 'Фартук',
  tile: 'Плитка',
  skirting: 'Плинтус',
  countertop: 'Столешница',
  cabinet: 'Фасады',
  faucet: 'Смеситель',
  sink: 'Раковина',
  toilet: 'Унитаз',
  shower: 'Душ',
  bathtub: 'Ванна',
  light: 'Свет',
  outlets: 'Розетки',
  appliance: 'Техника',
  textile: 'Текстиль',
};

export function normalizeTier(value, fallback = 'comfort') {
  return PRICE_TIERS.includes(value) ? value : fallback;
}

export function tierDistance(a, b) {
  const ia = PRICE_TIERS.indexOf(a);
  const ib = PRICE_TIERS.indexOf(b);
  if (ia < 0 || ib < 0) return 3;
  return Math.abs(ia - ib);
}

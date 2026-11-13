// Каталог дизайнера: 10 стилей × 10 концепций по designer-agent-instruction-v1.
// Данные фиксированные: агент выбирает и комбинирует, но не выдумывает стили.
// Матрица совместимости: ok — прямо, weaken — ослабленная форма, conflict — запрет.

export const DESIGN_STYLE_ORDER = [
  'minimalism', 'scandinavian', 'japandi', 'loft', 'neoclassic',
  'eco', 'dark_contemporary', 'art_deco', 'mediterranean', 'memphis_accent',
];

export const DESIGN_STYLES = [
  {
    id: 'minimalism',
    name: 'Современный минимализм',
    palette: { base: '#F5F3EF', support: '#C9C4BB', dark: '#2E2E2C', accent: '#B7A99A' },
    materials: 'матовые МДФ, микроцемент, стекло, скрытый профиль',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['soft', 'even'] },
      { key: 'texture', values: ['matte', 'satin'] },
      { key: 'density', values: ['airy', 'tonal'] },
    ],
    prompt_en: 'modern minimalism interior, warm off-white and greige palette, matte MDF, microcement, glass, hidden profiles, calm neutral, soft diffuse daylight',
  },
  {
    id: 'scandinavian',
    name: 'Скандинавский',
    palette: { base: '#FAF8F4', support: '#D8CFC2', dark: '#8A9A8B', accent: '#C26D5A' },
    materials: 'светлый дуб, белёный текстиль, шерсть, керамика',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['soft', 'airy'] },
      { key: 'texture', values: ['tactile', 'matte'] },
      { key: 'contrast', values: ['low', 'tonal'] },
    ],
    prompt_en: 'scandinavian interior, light oak, white walls, natural linen, wool, ceramic, soft natural daylight, functional minimalism, warm and airy',
  },
  {
    id: 'japandi',
    name: 'Джапанди',
    palette: { base: '#EDE8DF', support: '#B9B0A2', dark: '#4A4A45', accent: '#7A8377' },
    materials: 'дуб, тёмный орех, рисовая бумага, лён',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['soft', 'shadowed'] },
      { key: 'texture', values: ['tactile', 'matte'] },
      { key: 'density', values: ['minimal', 'layered'] },
    ],
    prompt_en: 'japandi interior, warm minimalism, natural oak, dark walnut, rice paper, linen, wabi-sabi, calm earthy palette, tactile materials',
  },
  {
    id: 'loft',
    name: 'Лофт',
    palette: { base: '#B0A89A', support: '#6E6A63', dark: '#4A4640', accent: '#A8563A' },
    materials: 'кирпич, бетон, чёрный металл, кожа',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['contrast', 'dramatic'] },
      { key: 'texture', values: ['raw', 'refined'] },
      { key: 'density', values: ['sparse', 'layered'] },
    ],
    prompt_en: 'industrial loft, exposed brick and concrete, black metal, warm wood, leather, large windows, raw tactile textures',
  },
  {
    id: 'neoclassic',
    name: 'Неоклассика',
    palette: { base: '#F2EDE4', support: '#D6CCBA', dark: '#9A8F7D', accent: '#1F3A5F' },
    materials: 'паркет ёлочкой, лепной карниз, латунь, бархат',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['soft', 'formal'] },
      { key: 'texture', values: ['satin', 'matte'] },
      { key: 'contrast', values: ['low', 'tonal'] },
    ],
    prompt_en: 'neoclassical interior, chevron parquet, wall moldings, warm neutrals, subtle brass, velvet, timeless proportions',
  },
  {
    id: 'eco',
    name: 'Эко / органический модерн',
    palette: { base: '#EAE4D8', support: '#C8B89A', dark: '#7C8A6E', accent: '#A4713E' },
    materials: 'лён, ратанг, натуральный камень, живая зелень',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['soft', 'dappled'] },
      { key: 'texture', values: ['tactile', 'matte'] },
      { key: 'density', values: ['airy', 'layered'] },
    ],
    prompt_en: 'organic modern interior, linen, rattan, natural stone, living greenery, warm earthy palette, tactile materials, wellness mood',
  },
  {
    id: 'dark_contemporary',
    name: 'Тёмный контемпорари',
    palette: { base: '#232323', support: '#3A3A38', dark: '#1A1A19', accent: '#C9A227' },
    materials: 'шпон дымчатого дуба, графит, латунь, тёмный камень',
    axes: [
      { key: 'temperature', values: ['warm', 'neutral'] },
      { key: 'light', values: ['moody', 'dramatic'] },
      { key: 'texture', values: ['matte', 'satin'] },
      { key: 'contrast', values: ['high', 'tonal'] },
    ],
    prompt_en: 'dark contemporary interior, smoked oak veneer, graphite, brass, dark stone, moody layered lighting, dramatic contrast',
  },
  {
    id: 'art_deco',
    name: 'Ар-деко',
    palette: { base: '#EFE8DB', support: '#C9A961', dark: '#1E2A38', accent: '#6E3B3B' },
    materials: 'геометричная интарсия, бархат, мрамор, золото',
    axes: [
      { key: 'temperature', values: ['warm', 'cool'] },
      { key: 'light', values: ['glamorous', 'soft'] },
      { key: 'texture', values: ['polished', 'satin'] },
      { key: 'contrast', values: ['high', 'tonal'] },
    ],
    prompt_en: 'art deco interior, geometric inlay, velvet, marble, gold, rich jewel tones, glamorous, symmetrical composition',
  },
  {
    id: 'mediterranean',
    name: 'Средиземноморский',
    palette: { base: '#F7F3EA', support: '#E3D5B8', dark: '#A8B5A0', accent: '#3F6E8E' },
    materials: 'побелка, терракота, кованое железо, состаренное дерево',
    axes: [
      { key: 'temperature', values: ['warm', 'sunlit'] },
      { key: 'light', values: ['soft', 'bright'] },
      { key: 'texture', values: ['tactile', 'matte'] },
      { key: 'contrast', values: ['low', 'tonal'] },
    ],
    prompt_en: 'mediterranean interior, whitewashed plaster, terracotta, wrought iron, aged wood, warm sunlight, olive and dusty-blue accents',
  },
  {
    id: 'memphis_accent',
    name: 'Мемфис-акцент',
    palette: { base: '#F4F1EC', support: '#DAD4C8', dark: '#2E2E2C', accent: '#E4583E' },
    materials: 'глянцевый пластик, ламинат, хром',
    axes: [
      { key: 'temperature', values: ['neutral', 'warm'] },
      { key: 'light', values: ['even', 'contrast'] },
      { key: 'texture', values: ['glossy', 'matte'] },
      { key: 'geometry', values: ['playful', 'graphic'] },
    ],
    prompt_en: 'memphis accent interior, neutral shell, glossy plastic, laminate, chrome, one or two bold accent objects, playful geometry',
  },
];

export const DESIGN_CONCEPTS = [
  {
    id: 'accent_block',
    name: 'Акцентный блок',
    main_move: 'один тёмный или насыщенный объём (стена, нижние фасады), остальное — нейтральная рама',
    quiet_areas: 'верх стен, потолок',
  },
  {
    id: 'monochrome_depth',
    name: 'Монохромная глубина',
    main_move: 'один цвет в 3–4 тональностях; контраст фактур вместо цвета',
    quiet_areas: 'пол',
  },
  {
    id: 'heavy_light',
    name: 'Тяжёлое × лёгкое',
    main_move: 'массивный предмет против воздушного (тёмный диван + прозрачный стол)',
    quiet_areas: 'потолок',
  },
  {
    id: 'light_sculpture',
    name: 'Свет как скульптура',
    main_move: 'линии подсветки и световые пятна как главный приём',
    quiet_areas: 'дневные поверхности',
  },
  {
    id: 'nature_focus',
    name: 'Природный фокус',
    main_move: 'одно живое крупное (дерево, камень, зелень) — центр композиции',
    quiet_areas: 'всё вне фокуса',
  },
  {
    id: 'graphic_rhythm',
    name: 'Графический ритм',
    main_move: 'повторяющийся мотив — рейки, панели, арки, вертикали',
    quiet_areas: 'одна стена минимум без ритма',
  },
  {
    id: 'asymmetric_balance',
    name: 'Асимметричный баланс',
    main_move: 'разновесные массы, уравновешенные по визуальному весу',
    quiet_areas: 'периметр',
  },
  {
    id: 'tactile_base',
    name: 'Тактильная база',
    main_move: 'выразительность — фактуры (штукатурка, лён, ковка), цвет нейтрален',
    quiet_areas: 'цвет нейтрален везде',
  },
  {
    id: 'one_exception',
    name: 'Один предмет-исключение',
    main_move: 'спокойная рама + один сильный дизайнерский объект',
    quiet_areas: 'всё кроме объекта',
  },
  {
    id: 'horizontal_division',
    name: 'Горизонтальное деление',
    main_move: 'светлый низ / тёмный верх (или наоборот), поясок',
    quiet_areas: 'центральная зона',
  },
].map(item => ({ ...item, description: `${item.main_move}. Спокойные зоны: ${item.quiet_areas}.` }));

// Матрица: concept -> значения по DESIGN_STYLE_ORDER.
// ok / weaken / conflict. 83 ok, 10 weaken, 7 conflict.
const MATRIX = {
  accent_block:        ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'weaken', 'ok', 'ok', 'ok'],
  monochrome_depth:    ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'weaken', 'ok', 'conflict'],
  heavy_light:         ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
  light_sculpture:     ['ok', 'weaken', 'ok', 'weaken', 'ok', 'ok', 'ok', 'ok', 'weaken', 'ok'],
  nature_focus:        ['ok', 'ok', 'ok', 'ok', 'weaken', 'ok', 'ok', 'conflict', 'ok', 'ok'],
  graphic_rhythm:      ['weaken', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
  asymmetric_balance:  ['ok', 'ok', 'ok', 'ok', 'conflict', 'ok', 'ok', 'weaken', 'ok', 'ok'],
  tactile_base:        ['ok', 'ok', 'ok', 'ok', 'weaken', 'ok', 'ok', 'conflict', 'ok', 'conflict'],
  one_exception:       ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'weaken', 'ok', 'conflict'],
  horizontal_division: ['ok', 'ok', 'conflict', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
};

export const WEAKEN_PARAMS = {
  'accent_block:dark_contemporary': 'инверсия: светлый блок на тёмном фоне',
  'monochrome_depth:art_deco': 'монохром допустим при сохранении золотых акцентов',
  'light_sculpture:scandinavian': 'только вечерний сценарий, дневной свет остаётся главным',
  'light_sculpture:loft': 'треки допустимы, но скульптурность не главный ход',
  'light_sculpture:mediterranean': 'лампы и свечи вместо LED-линий',
  'graphic_rhythm:minimalism': 'ритм только на одной стене',
  'nature_focus:neoclassic': 'природа только в керамике и букетах, не живые массивы',
  'asymmetric_balance:art_deco': 'радиальная асимметрия допустима, боковая — нет',
  'tactile_base:neoclassic': 'фактуры только в текстиле, поверхности гладкие',
  'one_exception:art_deco': 'исключение обязано цитировать формы ар-деко',
};

const styleIndex = new Map(DESIGN_STYLES.map((style, index) => [style.id, index]));
const styleByIdMap = new Map(DESIGN_STYLES.map(style => [style.id, style]));
const conceptByIdMap = new Map(DESIGN_CONCEPTS.map(concept => [concept.id, concept]));

export function styleById(id) {
  return styleByIdMap.get(String(id || '')) || null;
}

export function conceptById(id) {
  return conceptByIdMap.get(String(id || '')) || null;
}

export function compatibilityOf(styleId, conceptId) {
  const index = styleIndex.get(String(styleId || ''));
  const row = MATRIX[String(conceptId || '')];
  if (index === undefined || !row) return 'conflict';
  return row[index];
}

export function compatibilityNote(styleId, conceptId) {
  return WEAKEN_PARAMS[`${conceptId}:${styleId}`] || '';
}

function allOkPairs() {
  const pairs = [];
  for (const style of DESIGN_STYLES) {
    for (const concept of DESIGN_CONCEPTS) {
      if (compatibilityOf(style.id, concept.id) === 'ok') {
        pairs.push({ style_id: style.id, concept_id: concept.id });
      }
    }
  }
  return pairs;
}

// «На усмотрение ИИ»: случайная совместимая пара без повторов.
// Если все ok-пары уже использованы — берём любую ok-пару (без conflict).
export function pickRandomCompatiblePair({ usedPairs = [], rng = Math.random } = {}) {
  const used = new Set(usedPairs);
  const ok = allOkPairs();
  const fresh = ok.filter(pair => !used.has(`${pair.style_id}:${pair.concept_id}`));
  const pool = fresh.length ? fresh : ok;
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return { ...pool[index] };
}

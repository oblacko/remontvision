// Контракт и нормализация практического гайда «Как воплотить этот дизайн».
// Чистые функции без БД — используются и сервером, и тестами.
import { getArchitectPrompt } from './architectprompts.js';

export const SECTION_TITLES = {
  buy: 'Что подобрать',
  calc: 'Что включить в расчёт',
  check: 'До заказа и начала работ',
  start: 'С чего начать',
};

export const SECTION_ICONS = {
  buy: 'shopping',
  calc: 'calculator',
  check: 'check',
  start: 'rocket',
};

// Закрытый набор иконок: ключи совпадают с картой в web/src/pages/Room.tsx.
export const BREAKDOWN_ICON_KEYS = [
  'palette', 'layers', 'paint', 'wallpaper', 'sofa', 'armchair', 'bed', 'table',
  'lamp', 'lightbulb', 'refrigerator', 'cooktop', 'utensils', 'hood', 'washing',
  'shower', 'water', 'ruler', 'zap', 'calculator', 'coins', 'receipt', 'check',
  'shield', 'rocket', 'flag', 'arrow', 'hammer', 'wrench', 'box', 'door', 'blinds',
  'shopping', 'tag', 'sparkles',
];

const ICON_SET = new Set(BREAKDOWN_ICON_KEYS);
const SECTION_KEYS = Object.keys(SECTION_TITLES);
const CARD_LIMITS = { top: 3, buy: 5, calc: 3, check: 3, start: 1 };

const text = (value, max = 300) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const icon = (value, fallback = 'sparkles') => {
  const key = text(value, 40).toLowerCase();
  return ICON_SET.has(key) ? key : fallback;
};

export const BREAKDOWN_SCHEMA = `Верни СТРОГО один JSON без markdown-обёрток:
{
  "title": "Как воплотить этот дизайн",
  "lead": "одна строка: что повторить, что купить и что проверить",
  "top_cards": [
    {"icon":"иконка из списка","title":"до 6 слов","preview":"до 20 слов"}
  ],
  "sections": [
    {"key":"buy","icon":"shopping","preview":"до 18 слов","cards":[
      {"icon":"иконка","name":"предмет или отделка","traits":"видимые признаки","clarify":"один параметр уточнить"}
    ]},
    {"key":"calc","icon":"calculator","preview":"до 18 слов","cards":[
      {"icon":"иконка","element":"элемент","note":"какие позиции включить или исключить"}
    ]},
    {"key":"check","icon":"check","preview":"до 18 слов","cards":[
      {"icon":"иконка","what":"что согласовать","when":"до какого действия","why":"зачем"}
    ]},
    {"key":"start","icon":"rocket","preview":"до 18 слов","cards":[
      {"icon":"иконка","action":"одно действие сейчас","why":"что оно позволит проверить"}
    ]}
  ]
}

Правила контракта:
- top_cards — до 3 карточек. sections — только непустые, каждая key один раз.
- buy — до 5 позиций, calc — до 3, check — до 3, start — ровно 1.
- icon — только из списка: ${BREAKDOWN_ICON_KEYS.join(', ')}. Не выдумывай другие имена.
- Весь ответ — до 350 слов. Никаких длинных абзацев.
- Не повторяй один вывод в разных разделах.
- Неприменимые разделы не выводи.
- Все тексты — на русском. Только JSON.`;

export function buildBreakdownSystem() {
  const prompt = getArchitectPrompt('breakdown');
  return [
    prompt?.system || '',
    BREAKDOWN_SCHEMA,
  ].filter(Boolean).join('\n\n');
}

const dimensionText = dimensions => {
  const { width, length, height } = dimensions || {};
  if (width == null || length == null) return '';
  const heightText = height == null ? '' : ` × ${String(height).replace('.', ',')} м`;
  return `${width} × ${length}${heightText}`;
};

export function buildBreakdownUser({ roomType, style, priceTier, budget, dimensions } = {}) {
  const dims = dimensionText(dimensions);
  return [
    'Тип изображения: сгенерированный дизайн.',
    roomType ? `Тип комнаты: ${roomType}.` : '',
    style ? `Стиль: ${style}.` : '',
    priceTier ? `Класс материалов: ${priceTier}.` : '',
    budget != null ? `Бюджет: ${Math.round(Number(budget))} тыс. ₽.` : '',
    dims ? `Размеры (оценка по изображению): ${dims}.` : '',
    'Не выдумывай отсутствующие данные. Если данных не хватает, обозначь это в разделе «С чего начать».',
  ].filter(Boolean).join('\n');
}

function normalizeTopCard(raw) {
  const title = text(raw?.title, 120);
  if (!title) return null;
  return {
    icon: icon(raw?.icon),
    title,
    preview: text(raw?.preview, 200),
  };
}

function normalizeCard(key, raw) {
  const fallbackIcon = SECTION_ICONS[key] || 'sparkles';
  const cardIcon = icon(raw?.icon, fallbackIcon);
  if (key === 'buy') {
    const name = text(raw?.name, 120) || text(raw?.title, 120);
    if (!name) return null;
    return {
      icon: cardIcon,
      name,
      traits: text(raw?.traits, 300),
      clarify: text(raw?.clarify, 300),
    };
  }
  if (key === 'calc') {
    const element = text(raw?.element, 160) || text(raw?.title, 160) || text(raw?.name, 160);
    if (!element) return null;
    return {
      icon: cardIcon,
      element,
      note: text(raw?.note, 400) || text(raw?.body, 400),
    };
  }
  if (key === 'check') {
    const what = text(raw?.what, 200) || text(raw?.title, 200);
    if (!what) return null;
    return {
      icon: cardIcon,
      what,
      when: text(raw?.when, 200),
      why: text(raw?.why, 300),
    };
  }
  const action = text(raw?.action, 200) || text(raw?.title, 200) || text(raw?.body, 200);
  if (!action) return null;
  return {
    icon: cardIcon,
    action,
    why: text(raw?.why, 300),
  };
}

const readSections = parsed => {
  if (Array.isArray(parsed?.sections)) return parsed.sections;
  if (parsed?.sections && typeof parsed.sections === 'object') {
    return Object.entries(parsed.sections).map(([key, value]) => ({ key, ...(value || {}) }));
  }
  return [];
};

export function normalizeBreakdown(parsed = {}) {
  if (!parsed || typeof parsed !== 'object') return null;

  const topCards = (Array.isArray(parsed.top_cards) ? parsed.top_cards : [])
    .map(normalizeTopCard)
    .filter(Boolean)
    .slice(0, CARD_LIMITS.top);

  const sections = [];
  for (const raw of readSections(parsed)) {
    const key = text(raw?.key, 40);
    if (!SECTION_KEYS.includes(key) || sections.some(section => section.key === key)) continue;
    const cards = (Array.isArray(raw.cards) ? raw.cards : [])
      .map(card => normalizeCard(key, card))
      .filter(Boolean)
      .slice(0, CARD_LIMITS[key]);
    if (!cards.length) continue;
    sections.push({
      key,
      icon: icon(raw.icon, SECTION_ICONS[key]),
      title: text(raw.title, 120) || SECTION_TITLES[key],
      preview: text(raw.preview, 200),
      cards,
    });
  }

  if (!topCards.length && !sections.length) return null;

  return {
    version: 2,
    title: text(parsed.title, 120) || 'Как воплотить этот дизайн',
    lead: text(parsed.lead, 200),
    top_cards: topCards,
    sections,
  };
}

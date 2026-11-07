// Контракт и нормализация разбора интерьера: что подобрать + почему это важно.
// Чистые функции без БД — используются сервером и тестами.
import { getArchitectPrompt } from './architectprompts.js';

export const BREAKDOWN_VERSION = 4;

// Закрытый набор иконок: ключи совпадают с картой в GuideIcon.tsx.
export const BREAKDOWN_ICON_KEYS = [
  'palette', 'layers', 'paint', 'wallpaper', 'sofa', 'armchair', 'bed', 'table',
  'lamp', 'lightbulb', 'refrigerator', 'cooktop', 'utensils', 'hood', 'washing',
  'shower', 'water', 'ruler', 'zap', 'calculator', 'coins', 'receipt', 'check',
  'shield', 'rocket', 'flag', 'arrow', 'hammer', 'wrench', 'box', 'door', 'blinds',
  'shopping', 'tag', 'sparkles',
];

const ICON_SET = new Set(BREAKDOWN_ICON_KEYS);
const MAX_CARDS = 5;

const text = (value, max = 300) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const icon = (value, fallback = 'sparkles') => {
  const key = text(value, 40).toLowerCase();
  return ICON_SET.has(key) ? key : fallback;
};

const color = value => {
  const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
};

export const BREAKDOWN_SCHEMA = `Верни СТРОГО один JSON без markdown-обёрток:
{
  "title": "Что подобрать",
  "lead": "одна строка: что важно сохранить при подборе",
  "cards": [
    {
      "icon": "table",
      "name": "Обеденный стол",
      "traits": "светлое дерево, тонкие ножки, прямоугольная столешница",
      "clarify": "длину и ширину по месту у окна",
      "why": "единственный тёплый материал связывает холодную кухню",
      "hex": "#A6784F"
    }
  ],
  "lighting": {
    "plan": "линейная LED-щель в колонне, подсветка фартука и точечные по потолку",
    "temperature": "2700–3000K, тёплая",
    "why": "нижний свет делает фартук светящейся полосой, а вертикальная щель даёт акцент без люстры"
  }
}

Правила контракта:
- cards — до 5 позиций.
- name — что подобрать, без слова «купить».
- traits — видимые признаки, которые сохранить.
- clarify — один параметр, который уточнить до покупки.
- why — почему это важно для образа: контраст, повторение, свет, тепло, ритм.
- hex — цвет из изображения, только если очевиден; иначе не указывай. Формат #RRGGBB.
- icon — только из списка: ${BREAKDOWN_ICON_KEYS.join(', ')}.
- lighting — как применить свет именно здесь: plan, temperature, why.
- Не выдумывай бренды, цены, ссылки и точные материалы.
- Все тексты — на русском. Только JSON.`;

export function buildBreakdownSystem() {
  const prompt = getArchitectPrompt('breakdown');
  return [prompt?.system || '', BREAKDOWN_SCHEMA].filter(Boolean).join('\n\n');
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
    'Не выдумывай отсутствующие данные. Если данных не хватает, отрази это в параметре для уточнения.',
  ].filter(Boolean).join('\n');
}

function normalizeCard(raw) {
  const name = text(raw?.name, 120) || text(raw?.title, 120);
  if (!name) return null;
  return {
    icon: icon(raw?.icon),
    name,
    traits: text(raw?.traits, 300),
    clarify: text(raw?.clarify, 300),
    why: text(raw?.why, 300),
    hex: color(raw?.hex),
  };
}

export function normalizeBreakdown(parsed = {}) {
  if (!parsed || typeof parsed !== 'object') return null;
  const cards = (Array.isArray(parsed.cards) ? parsed.cards : [])
    .map(normalizeCard)
    .filter(Boolean)
    .slice(0, MAX_CARDS);
  if (!cards.length) return null;

  const lightingRaw = parsed.lighting && typeof parsed.lighting === 'object' ? parsed.lighting : null;
  const lighting = lightingRaw ? {
    plan: text(lightingRaw.plan, 300),
    temperature: text(lightingRaw.temperature, 120),
    why: text(lightingRaw.why, 300),
  } : null;

  return {
    version: BREAKDOWN_VERSION,
    title: text(parsed.title, 120) || 'Что подобрать',
    lead: text(parsed.lead, 200),
    cards,
    lighting: lighting && (lighting.plan || lighting.temperature || lighting.why) ? lighting : null,
  };
}

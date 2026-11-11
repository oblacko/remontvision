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
  },
  "objects": [
    {
      "id": "sofa-1",
      "category": "furniture_major",
      "label": "диван",
      "description": "светло-серый, низкий, с тонкими подлокотниками",
      "bbox": [0.1, 0.45, 0.42, 0.28],
      "confidence": 0.8,
      "note": "материал и точные габариты не определить по фото"
    }
  ]
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
- objects — карта объектов, до 12 значимых позиций: пол, стены, потолок, двери и окна,
  крупная и встроенная мебель, освещение, сантехника, значимый текстиль и отделка.
  Не включай бытовые мелочи (пылесос, мелкий декор, посуда) и не теряй двери, окна и пол.
- category — только: floor, walls, ceiling, door, window, furniture_major, furniture_builtin,
  lighting, sanitary, textile_finish.
- bbox — [x, y, w, h] в долях кадра 0..1 от левого верхнего угла; весь предмет, не обрезай.
- Дверь выводи только если видно полотно целиком или большую его часть. Если виден
  лишь край, наличник у границы кадра или проём уходит за кадр — не выводи дверь вовсе:
  ложная рамка хуже пропуска.
- confidence — 0..1; если меньше 0.6, обязательно опиши сомнение в note.
- В note — что нельзя определить по картинке (материал, точный размер, бренд).
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

export function buildBreakdownUser({ roomType, style, priceTier, budget, dimensions, repairScope, designDirection, layoutPlan } = {}) {
  const dims = dimensionText(dimensions);
  const scope = ['floor', 'ceiling', 'walls', 'doors', 'windows']
    .map(key => {
      const item = repairScope?.[key];
      if (!item?.action) return '';
      return `${key}: ${[item.action, item.material, item.why].filter(Boolean).join(' · ')}`;
    })
    .filter(Boolean);
  const move = designDirection?.mainMove?.action
    ? `${designDirection.mainMove.target ? `${designDirection.mainMove.target} — ` : ''}${designDirection.mainMove.action}${designDirection.mainMove.effect ? ` · ${designDirection.mainMove.effect}` : ''}`
    : '';
  const layout = layoutPlan?.strategy || '';
  return [
    'Тип изображения: сгенерированный дизайн.',
    roomType ? `Тип комнаты: ${roomType}.` : '',
    style ? `Стиль: ${style}.` : '',
    priceTier ? `Класс материалов: ${priceTier}.` : '',
    budget != null ? `Бюджет: ${Math.round(Number(budget))} тыс. ₽.` : '',
    dims ? `Размеры (оценка по изображению): ${dims}.` : '',
    'Это результат уже принятых решений — не противоречь им и не переизобретай:',
    designDirection?.concept ? `- Направление: ${designDirection.concept}` : '',
    move ? `- Главный ход: ${move}` : '',
    layout ? `- Планировка: ${layout}` : '',
    scope.length ? `- Ремонт: ${scope.join('; ')}` : '',
    'Не выдумывай отсутствующие данные. Если данных не хватает, отрази это в параметре для уточнения.',
  ].filter(Boolean).join('\n');
}

const OBJECT_CATEGORIES = new Set(['floor','walls','ceiling','door','window','furniture_major','furniture_builtin','lighting','sanitary','textile_finish']);
const clamp01 = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
};
const normalizeObject = (raw, index) => {
  const label = text(raw?.label, 80);
  const category = text(raw?.category, 40).toLowerCase();
  if (!label || !OBJECT_CATEGORIES.has(category)) return null;
  const rawBox = Array.isArray(raw?.bbox) && raw.bbox.length === 4 ? raw.bbox.map(clamp01) : null;
  const bbox = rawBox && rawBox.every(value => value !== null) && rawBox[2] > 0 && rawBox[3] > 0 ? rawBox : null;
  const confidence = Number(raw?.confidence);
  return {
    id: text(raw?.id, 60) || `${category}-${index + 1}`,
    category,
    label,
    description: text(raw?.description, 240),
    bbox,
    area: bbox ? bbox[2] * bbox[3] : 0,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    note: text(raw?.note, 240),
  };
};

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

  const objects = (Array.isArray(parsed.objects) ? parsed.objects : [])
    .map(normalizeObject)
    .filter(Boolean)
    .sort((a, b) => b.area - a.area)
    .slice(0, 12);

  return {
    version: BREAKDOWN_VERSION,
    title: text(parsed.title, 120) || 'Что подобрать',
    lead: text(parsed.lead, 200),
    cards,
    lighting: lighting && (lighting.plan || lighting.temperature || lighting.why) ? lighting : null,
    objects,
  };
}

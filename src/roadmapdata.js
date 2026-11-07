// Контракт и нормализация роадмапа ремонта: этапы в порядке работ + карточки.
// Чистые функции без БД — используются сервером и тестами.
import { getArchitectPrompt } from './architectprompts.js';
import { BREAKDOWN_ICON_KEYS } from './breakdowndata.js';

export const ROADMAP_VERSION = 1;

export const PHASE_TITLES = {
  demolition: 'Демонтаж и подготовка',
  rough: 'Черновые работы',
  electrics: 'Электрика',
  plumbing: 'Сантехника и вентиляция',
  walls: 'Стены',
  floor: 'Пол',
  ceiling: 'Потолок',
  doors: 'Двери и окна',
  lighting: 'Освещение',
  painting: 'Покраска и финиш',
  finish: 'Финиш и мебель',
};

const ICON_SET = new Set(BREAKDOWN_ICON_KEYS);
const MAX_SECTIONS = 10;
const MAX_CARDS = 8;

const text = (value, max = 300) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const icon = (value, fallback = 'hammer') => {
  const key = text(value, 40).toLowerCase();
  return ICON_SET.has(key) ? key : fallback;
};

export const ROADMAP_SCHEMA = `Верни СТРОГО один JSON без markdown-обёрток:
{
  "title": "Роадмап ремонта",
  "sections": [
    {
      "key": "demolition",
      "title": "Демонтаж и подготовка",
      "icon": "hammer",
      "cards": ["Снять старые обои", "Вынести мебель", "Защитить пол"]
    }
  ]
}

Правила контракта:
- 5–9 этапов, в каждом 3–8 карточек.
- key — короткий латинский идентификатор этапа, уникальный.
- title — понятное название этапа по-русски.
- cards — массив строк, каждая строка — конкретная работа или покупка.
- icon — только из списка: ${BREAKDOWN_ICON_KEYS.join(', ')}.
- Этапы идут в порядке выполнения ремонта.
- Неприменимые этапы не выводи.
- Все тексты — на русском. Только JSON.`;

export function buildRoadmapSystem() {
  const prompt = getArchitectPrompt('roadmap');
  return [prompt?.system || '', ROADMAP_SCHEMA].filter(Boolean).join('\n\n');
}

const REPAIR_LABELS = [
  ['floor', 'Пол'],
  ['ceiling', 'Потолок'],
  ['walls', 'Стены'],
  ['doors', 'Двери'],
  ['windows', 'Окна'],
];

export function buildRoadmapUser({ roomType, style, priceTier, repairScope } = {}) {
  const lines = [
    'Тип изображения: сгенерированный дизайн.',
    roomType ? `Тип комнаты: ${roomType}.` : '',
    style ? `Стиль: ${style}.` : '',
    priceTier ? `Класс материалов: ${priceTier}.` : '',
  ].filter(Boolean);

  const scopeLines = REPAIR_LABELS
    .map(([key, label]) => {
      const item = repairScope?.[key];
      if (!item?.action) return '';
      const details = [item.action, item.material, item.why].filter(Boolean).join(' · ');
      return `- ${label}: ${details}`;
    })
    .filter(Boolean);
  if (scopeLines.length) lines.push('Уже принятые решения (repair_scope):', ...scopeLines);

  lines.push('Не выдумывай отсутствующие данные и работы, которых не требует этот интерьер.');
  return lines.join('\n');
}

const readSections = parsed => {
  if (Array.isArray(parsed?.sections)) return parsed.sections;
  if (parsed?.sections && typeof parsed.sections === 'object') {
    return Object.entries(parsed.sections).map(([key, value]) => ({ key, ...(value || {}) }));
  }
  return [];
};

export function normalizeRoadmap(parsed = {}) {
  if (!parsed || typeof parsed !== 'object') return null;

  const sections = [];
  for (const raw of readSections(parsed)) {
    if (sections.length >= MAX_SECTIONS) break;
    const key = text(raw?.key, 60) || `phase-${sections.length + 1}`;
    if (sections.some(section => section.key === key)) continue;
    const cards = (Array.isArray(raw.cards) ? raw.cards : [])
      .map(card => text(typeof card === 'string' ? card : card?.text, 200))
      .filter(Boolean)
      .slice(0, MAX_CARDS);
    if (!cards.length) continue;
    sections.push({
      key,
      title: text(raw.title, 120) || PHASE_TITLES[key] || `Этап ${sections.length + 1}`,
      icon: icon(raw.icon),
      sort: sections.length,
      cards,
    });
  }

  if (!sections.length) return null;
  return {
    version: ROADMAP_VERSION,
    title: text(parsed.title, 120) || 'Роадмап ремонта',
    sections,
  };
}

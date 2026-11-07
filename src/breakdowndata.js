// Контракт и нормализация пошагового разбора интерьера.
// Чистые функции без БД — используются и сервером, и тестами.
import { getArchitectPrompt } from './architectprompts.js';

export const SECTION_TITLES = {
  repeat: 'Как повторить этот интерьер',
  check: 'Что проверить до ремонта',
  buy: 'Что купить',
  save: 'Где можно сэкономить',
  change: 'Что можно изменить',
};

const SECTION_KEYS = Object.keys(SECTION_TITLES);
const NEXT_KINDS = new Set(['change', 'apply']);
const CARD_LIMITS = { buy: 8, change: 3, default: 5 };

const text = (value, max = 300) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};
const list = (value, max = 5) => (Array.isArray(value) ? value : [])
  .map(item => text(item, 400))
  .filter(Boolean)
  .slice(0, max);

export const BREAKDOWN_SCHEMA = `Верни СТРОГО один JSON без markdown-обёрток:
{
  "title": "Ваш интерьер — в деталях",
  "lead": "одна строка: что сохранить, проверить и подобрать",
  "top_cards": [
    {"title":"до 6 слов","preview":"до 18 слов","action":"Что измерить / Что сохранить / Какие образцы","body":"объяснение","details":["конкретный шаг","что уточнить"]}
  ],
  "sections": [
    {"key":"repeat|check|buy|save|change","title":"описательный заголовок","preview":"до 18 слов","cards":[
      {"title":"...","preview":"...","action":"...","body":"...","details":["..."]}
    ]}
  ],
  "next_action": {"label":"Добавить изменение / Применить изменения","kind":"change|apply"},
  "questions": ["до 3 вопросов, которые сильнее всего изменят рекомендации"]
}

Правила контракта:
- top_cards — 1–3 карточки. sections — только непустые, каждая key встречается один раз.
- Для key="buy" карточка: {"name":"...","traits":"видимые признаки","clarify":"что уточнить и какие размеры","custom":"готовое изделие или на заказ"}.
- Для key="change" карточка: {"title":"...","preview":"...","body":"...","effort":"подбор предмета | частичная переделка | требует проектирования","edit_instruction":"самодостаточная инструкция для редактирования изображения"}.
- Для остальных разделов карточка: {"title":"...","preview":"...","action":"...","body":"...","details":["..."]}.
- edit_instruction пиши так, чтобы правку можно было применить к изображению без дополнительных пояснений.
- next_action — только действие редактора: «Добавить изменение» (change) или «Применить изменения» (apply). Если для вывода не хватает данных, не создавай кнопку, а задай вопрос в questions.
- Не заполняй разделы ради объёма. Только применимые к этому помещению выводы.
- Все тексты — на русском. Только JSON.`;

const PROGRESSIVE_RULES = `Формат ответа — маршрут для интерфейса, а не статья.
Сначала 1–3 самых полезных вывода, затем до пяти раскрываемых разделов (только непустые). Заголовки описательные, без кликбейта. В карточке сначала вывод, затем одна строка «зачем открывать», внутри — объяснение и конкретный шаг.
Не дублируй карточки первого уровня внутри разделов: связывай их с подробностью.`;

export function buildBreakdownSystem() {
  const prompt = getArchitectPrompt('breakdown');
  return [
    prompt?.system || '',
    PROGRESSIVE_RULES,
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
    'Не выдумывай отсутствующие данные. Если данных не хватает, выполни доступный разбор и задай до 3 вопросов в конце.',
  ].filter(Boolean).join('\n');
}

function normalizeGenericCard(raw) {
  const title = text(raw?.title, 120);
  if (!title) return null;
  return {
    title,
    preview: text(raw?.preview, 200),
    action: text(raw?.action, 80),
    body: text(raw?.body, 800),
    details: list(raw?.details, 6),
  };
}

function normalizeBuyCard(raw) {
  const name = text(raw?.name, 120) || text(raw?.title, 120);
  if (!name) return null;
  return {
    name,
    traits: text(raw?.traits, 300),
    clarify: text(raw?.clarify, 300),
    custom: text(raw?.custom, 120),
  };
}

function normalizeChangeCard(raw) {
  const title = text(raw?.title, 120);
  const editInstruction = text(raw?.edit_instruction, 400);
  if (!title && !editInstruction) return null;
  return {
    title: title || editInstruction.slice(0, 80),
    preview: text(raw?.preview, 200),
    body: text(raw?.body, 800),
    effort: text(raw?.effort, 80),
    edit_instruction: editInstruction,
  };
}

function normalizeCard(key, raw) {
  if (key === 'buy') return normalizeBuyCard(raw);
  if (key === 'change') return normalizeChangeCard(raw);
  return normalizeGenericCard(raw);
}

export function normalizeBreakdown(parsed = {}) {
  if (!parsed || typeof parsed !== 'object') return null;

  const topCards = (Array.isArray(parsed.top_cards) ? parsed.top_cards : [])
    .map(normalizeGenericCard)
    .filter(Boolean)
    .slice(0, 3);

  const sections = [];
  for (const raw of Array.isArray(parsed.sections) ? parsed.sections : []) {
    const key = text(raw?.key, 40);
    if (!SECTION_KEYS.includes(key) || sections.some(section => section.key === key)) continue;
    const limit = CARD_LIMITS[key] || CARD_LIMITS.default;
    const cards = (Array.isArray(raw.cards) ? raw.cards : [])
      .map(card => normalizeCard(key, card))
      .filter(Boolean)
      .slice(0, limit);
    if (!cards.length) continue;
    sections.push({
      key,
      title: text(raw.title, 120) || SECTION_TITLES[key],
      preview: text(raw.preview, 200),
      cards,
    });
  }

  if (!topCards.length && !sections.length) return null;

  const nextKind = text(parsed.next_action?.kind, 40);
  const nextLabel = text(parsed.next_action?.label, 80);
  const nextAction = NEXT_KINDS.has(nextKind) && nextLabel
    ? { label: nextLabel, kind: nextKind }
    : null;

  return {
    title: text(parsed.title, 120) || 'Ваш интерьер — в деталях',
    lead: text(parsed.lead, 200),
    top_cards: topCards,
    sections,
    next_action: nextAction,
    questions: list(parsed.questions, 3),
  };
}

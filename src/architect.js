// Разбор готового рендера архитектором: подсказки, палитра, электрика и предметы.
// Один vision-вызов заменяет parseRender + matchCatalog + buildAnalysis + architecture QA.
const ARCHITECT_MODEL = process.env.ARCHITECT_MODEL
  || process.env.SEARCH_VISION_MODEL
  || 'deepseek/deepseek-v4.1-flash-1017';

import { getArchitectPrompt } from './architectprompts.js';
import { callAgentJson } from './openrouteragent.js';
import { validateChanges } from './agentcontracts.js';

// Категории совпадают с catalog-service, чтобы найденные предметы сразу искались в Hoff.
export const ARCHITECT_CATEGORIES = [
  'bed', 'mattress', 'sofa', 'armchair', 'office_chair', 'dining_chair', 'bench',
  'wardrobe', 'sideboard', 'storage', 'dining_table', 'coffee_table', 'desk',
  'dressing_table', 'cabinet', 'countertop', 'light', 'rug', 'mirror', 'clock',
  'decor', 'decor_art', 'curtain', 'bedding', 'textile', 'wall_covering',
  'floor_covering', 'tile', 'skirting', 'faucet', 'sink', 'shower', 'bathtub',
  'toilet', 'appliance',
];

const CATEGORY_SET = new Set(ARCHITECT_CATEGORIES);
const VISIBILITY = new Set(['seen', 'hidden', 'not_seen']);
const PRIORITY = new Set(['high', 'medium', 'low']);
export const CHANGE_LAYERS = ['floor', 'walls', 'ceiling', 'doors', 'windows', 'light', 'furniture', 'storage', 'textile'];
const CHANGE_LAYER_SET = new Set(CHANGE_LAYERS);
const CHANGE_EFFORT = new Set(['low', 'medium', 'high']);
const MICRO_CHANGE = /(подвинуть|сдвинуть|переставить|поправить|повернуть|поднять|опустить|сдвиг|микро)/i;
const DECOR_WORD = /(ваз|подушк|постер|картин|растен|свеч|статуэтк|декор|книг)/i;
const RUG_WORD = /(ковер|ковёр|палас)/i;

const clampText = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const asArray = value => (Array.isArray(value) ? value : []);

function hex(value) {
  const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function bbox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [x, y, w, h] = value.map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const fix = (n, fallback) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback));
  return [fix(x, 0), fix(y, 0), Math.max(0.01, fix(w, 1)), Math.max(0.01, fix(h, 1))];
}

function normalizeRoom(room) {
  const source = room && typeof room === 'object' ? room : {};
  const surface = value => {
    if (!value || typeof value !== 'object') return null;
    const out = {
      color: clampText(value.color, 80),
      material: clampText(value.material, 120),
    };
    if (!out.color && !out.material) return null;
    return out;
  };
  return {
    type: clampText(source.type, 80),
    style: clampText(source.style, 80),
    lighting: clampText(source.lighting, 200),
    walls: surface(source.walls),
    floor: surface(source.floor),
    ceiling: surface(source.ceiling),
  };
}

function normalizeSurfaces(parsed) {
  const list = asArray(parsed.surfaces).map(item => {
    if (!item || typeof item !== 'object') return null;
    const surface = clampText(item.surface, 40).toLowerCase();
    if (!surface) return null;
    const out = {
      surface,
      description: clampText(item.description, 200),
      color: clampText(item.color, 80),
      material: clampText(item.material, 120),
      hex: hex(item.hex),
    };
    return out.description || out.hex ? out : null;
  }).filter(Boolean).slice(0, 10);
  return list;
}

function normalizeItems(parsed) {
  return asArray(parsed.items).map(item => {
    if (!item || typeof item !== 'object') return null;
    const category = clampText(item.category, 40).toLowerCase();
    const label = clampText(item.label, 120);
    if (!label || !CATEGORY_SET.has(category)) return null;
    return {
      key: clampText(item.key, 40) || category,
      label,
      category,
      subtype: clampText(item.subtype, 120),
      color: clampText(item.color, 80),
      material: clampText(item.material, 120),
      shape: clampText(item.shape, 120),
      search_query: clampText(item.search_query, 160) || [label, item.subtype, item.color, item.material].filter(Boolean).join(' ').slice(0, 160),
      keywords: asArray(item.keywords).map(k => clampText(k, 60)).filter(Boolean).slice(0, 6),
      bbox: bbox(item.bbox),
      confidence: Number.isFinite(Number(item.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : null,
      visibility: VISIBILITY.has(item.visibility) ? item.visibility : 'seen',
    };
  }).filter(Boolean).slice(0, 20);
}

function normalizeHints(parsed) {
  return asArray(parsed.hints).map(item => {
    if (!item || typeof item !== 'object') return null;
    const action = clampText(item.action, 200);
    if (!action) return null;
    return {
      target: clampText(item.target, 60),
      action,
      why: clampText(item.why, 240),
      priority: PRIORITY.has(item.priority) ? item.priority : 'medium',
    };
  }).filter(Boolean).slice(0, 6);
}

function normalizeElectrical(parsed) {
  return asArray(parsed.electrical).map(item => {
    if (!item || typeof item !== 'object') return null;
    const title = clampText(item.title, 80);
    const text = clampText(item.text, 240);
    if (!title && !text) return null;
    return { title: title || 'Электрика', text };
  }).filter(Boolean).slice(0, 6);
}

function normalizeTextList(value, limit = 6) {
  return asArray(value).map(item => clampText(item, 240)).filter(Boolean).slice(0, limit);
}

export function normalizeChanges(parsed) {
  const seen = new Set();
  return asArray(parsed.changes).map(item => {
    if (!item || typeof item !== 'object') return null;
    const layer = clampText(item.layer, 40).toLowerCase();
    if (!CHANGE_LAYER_SET.has(layer)) return null;
    const current = clampText(item.current, 240);
    const change = clampText(item.change, 240);
    if (!current || !change) return null;
    const impact = Number(item.impact);
    if (!Number.isFinite(impact)) return null;
    // Микропозиции и декор не показываем даже в разрешённом слое.
    if (MICRO_CHANGE.test(change)) return null;
    if (DECOR_WORD.test(change)) return null;
    if (layer === 'textile' && RUG_WORD.test(change)) return null;
    const key = `${layer}|${change}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      layer,
      label: clampText(item.label, 60) || layer,
      current,
      change,
      impact: Math.max(0, Math.min(1, impact)),
      effort: CHANGE_EFFORT.has(item.effort) ? item.effort : 'medium',
      target: clampText(item.target, 60) || layer,
    };
  }).filter(Boolean).sort((a, b) => b.impact - a.impact).slice(0, 6);
}

export function normalizeArchitect(parsed = {}) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const items = normalizeItems(source);
  return {
    room: normalizeRoom(source.room),
    palette: asArray(source.palette).map(item => {
      if (!item || typeof item !== 'object') return null;
      const color = hex(item.hex);
      if (!color) return null;
      return { name: clampText(item.name, 80) || color, hex: color, where: clampText(item.where, 120) };
    }).filter(Boolean).slice(0, 8),
    surfaces: normalizeSurfaces(source),
    items,
    strengths: normalizeTextList(source.strengths),
    issues: normalizeTextList(source.issues),
    hints: normalizeHints(source),
    changes: normalizeChanges(source),
    electrical: normalizeElectrical(source),
    summary: source.summary && typeof source.summary === 'object' ? {
      concept: clampText(source.summary.concept, 400),
      palette: clampText(source.summary.palette, 300),
      materials: clampText(source.summary.materials, 300),
      electrical: clampText(source.summary.electrical, 300),
      next_steps: normalizeTextList(source.summary.next_steps, 6),
    } : null,
  };
}

const ANALYSIS_SCHEMA = `Дополнительно к changes верни анализ готового кадра в том же JSON:
{
  "room": {"type":"...","style":"...","lighting":"...","walls":{"color":"...","material":"..."},"floor":{"color":"...","material":"..."},"ceiling":{"color":"...","material":"..."}},
  "palette": [{"name":"...","hex":"#RRGGBB","where":"стены/пол/мебель"}],
  "surfaces": [{"surface":"walls|floor|ceiling|backsplash|countertop|textile","description":"...","color":"...","material":"...","hex":"#RRGGBB"}],
  "items": [{
    "key":"sofa|bed|wardrobe|...",
    "label":"название по-русски",
    "category":"одна из категорий ниже",
    "subtype":"тип/форма",
    "color":"цвет",
    "material":"материал",
    "shape":"силуэт",
    "search_query":"короткий запрос для каталога",
    "keywords":["3-6 слов"],
    "bbox":[x,y,w,h],
    "confidence":0.0,
    "visibility":"seen|hidden|not_seen"
  }],
  "strengths": ["что получилось хорошо"],
  "issues": ["что объективно не так"],
  "electrical": [{"title":"Розетки у кровати","text":"где и на какой высоте"}],
  "summary": {"concept":"...","palette":"...","materials":"...","electrical":"...","next_steps":["..."]}
}
Правила анализа:
- Все тексты для пользователя — строго на русском.
- bbox нормирован 0..1: [x, y, ширина, высота].
- category — только из списка: ${ARCHITECT_CATEGORIES.join(', ')}.
- Если предмета нет в кадре — не выдумывай его.
- electrical — практичные рекомендации по розеткам и свету, без проекта электроснабжения.
- summary заполняй только для финального разбора; для промежуточного оставь null.
- Никаких цен и ссылок: товары подберёт каталог.
- Верни ОДИН JSON: поля changes из основного промта плюс поля этого анализа.`;

const CHANGES_SCHEMA = `Обязательный контракт changes (не удалять при редактировании промта):
{"changes":[{"layer":"floor|walls|ceiling|doors|windows|light|furniture|storage|textile","label":"...","current":"...","change":"...","impact":0.0,"effort":"low|medium|high","target":"..."}]}
Только крупные значимые замены. Декор, арт, ковры и микроперестановки запрещены. Максимум 6 пунктов.`;

function buildSystem(mode) {
  const reviewer = getArchitectPrompt('reviewer');
  const criteria = getArchitectPrompt('criteria');
  return [
    reviewer.system,
    criteria ? `КРИТЕРИЙ ПРИЁМКИ:\n${criteria.system}` : '',
    CHANGES_SCHEMA,
    ANALYSIS_SCHEMA,
    mode === 'final' ? 'Это финальный результат: обязательно заполни summary.' : 'Это промежуточный результат: summary = null.',
  ].filter(Boolean).join('\n\n');
}

function buildUserPrompt({ roomType, style, priceTier, mode }) {
  return [
    `Тип комнаты: ${roomType || 'определи сам'}.`,
    `Стиль: ${style || 'определи сам'}.`,
    `Класс материалов: ${priceTier || 'comfort'}.`,
    mode === 'final'
      ? 'Это финальный результат. Заполни summary: концепция, палитра, материалы, электрика, что осталось купить.'
      : 'Это промежуточный результат. Дай подсказки, что улучшить, и не заполняй summary.',
    'Опиши все видимые предметы и отделку. Разбирай только то, что реально видно.',
  ].join('\n');
}

function toParsed(architect) {
  const visible = architect.items
    .filter(item => item.visibility === 'seen')
    .map(item => ({
      label: item.label,
      bbox: item.bbox,
      area: item.bbox ? Number((item.bbox[2] * item.bbox[3]).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.area - a.area);
  return {
    items: architect.items,
    surfaces: architect.surfaces,
    visible,
    electrical: architect.electrical.length ? architect.electrical : undefined,
  };
}

export async function reviewDesign({
  imageDataUrl,
  roomType = 'Другое',
  style = '',
  priceTier = 'comfort',
  mode = 'hints',
  vision = null,
  sessionId = null,
} = {}) {
  if (!imageDataUrl) return null;
  const callVision = vision || (await import('./openrouter.js')).visionJson;
  const system = buildSystem(mode);
  const user = buildUserPrompt({ roomType, style, priceTier, mode });
  let parsed = {};
  let cost = null;
  try {
    if (vision) {
      const first = await callVision({ system, user, images: [imageDataUrl], model: ARCHITECT_MODEL });
      parsed = first?.parsed || {};
      cost = first?.cost ?? null;
    } else {
      try {
        const agent = await callAgentJson({
          instructions: system,
          inputText: user,
          images: [imageDataUrl],
          model: ARCHITECT_MODEL,
          maxCostUsd: Number(process.env.ARCHITECT_MAX_COST_USD || 0.02),
          maxSteps: 2,
          sessionId,
        });
        if (agent.parsed) {
          parsed = agent.parsed;
          cost = agent.cost ?? null;
        }
      } catch { /* fallback на visionJson ниже */ }
      if (!parsed || !Object.keys(parsed).length) {
        const legacy = await callVision({ system, user, images: [imageDataUrl], model: ARCHITECT_MODEL });
        parsed = legacy?.parsed || {};
        cost = legacy?.cost ?? null;
      }
    }
  } catch {
    return null;
  }
  const validatedChanges = validateChanges(parsed);
  if (validatedChanges) parsed = { ...parsed, changes: validatedChanges };
  let architect = normalizeArchitect(parsed);
  const empty = !architect.items.length && !architect.hints.length && !architect.changes.length && !architect.surfaces.length;
  if (empty && ARCHITECT_MODEL) {
    try {
      const retry = await callVision({ system, user, images: [imageDataUrl], model: null });
      const retryArchitect = normalizeArchitect(retry?.parsed || {});
      if (retryArchitect.items.length || retryArchitect.hints.length || retryArchitect.changes.length || retryArchitect.surfaces.length) {
        architect = retryArchitect;
        parsed = retry?.parsed || {};
        cost = (cost || 0) + (retry?.cost || 0);
      }
    } catch { /* остаётся первый пустой результат */ }
  }
  if (!architect.items.length && !architect.hints.length && !architect.changes.length && !architect.surfaces.length) return null;
  return { parsed: toParsed(architect), architect, cost: cost ?? null };
}

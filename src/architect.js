// Разбор готового рендера архитектором: подсказки, палитра, электрика и предметы.
// Один vision-вызов заменяет parseRender + matchCatalog + buildAnalysis + architecture QA.
const ARCHITECT_MODEL = process.env.ARCHITECT_MODEL
  || process.env.SEARCH_VISION_MODEL
  || 'deepseek/deepseek-v4.1-flash-1017';

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
export const LAYER_KEYS = ['walls', 'floor', 'furniture', 'light', 'ceiling', 'textile', 'decor', 'storage', 'appliances', 'art'];
const LAYER_SET = new Set(LAYER_KEYS);
const LAYER_EFFORT = new Set(['low', 'medium', 'high']);

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

function normalizeLayers(parsed) {
  return asArray(parsed.layers).map(item => {
    if (!item || typeof item !== 'object') return null;
    const key = clampText(item.key, 40).toLowerCase();
    if (!LAYER_SET.has(key)) return null;
    const actions = asArray(item.actions).map(action => {
      if (!action || typeof action !== 'object') return null;
      const text = clampText(action.action, 200);
      if (!text) return null;
      return {
        target: clampText(action.target, 60) || key,
        action: text,
        why: clampText(action.why, 240),
      };
    }).filter(Boolean).slice(0, 4);
    const impact = Number(item.impact);
    return {
      key,
      label: clampText(item.label, 60) || key,
      current: clampText(item.current, 240),
      impact: Number.isFinite(impact) ? Math.max(0, Math.min(1, impact)) : 0,
      effort: LAYER_EFFORT.has(item.effort) ? item.effort : 'medium',
      risk: LAYER_EFFORT.has(item.risk) ? item.risk : 'medium',
      preserve: clampText(item.preserve, 200),
      actions,
    };
  }).filter(Boolean).sort((a, b) => b.impact - a.impact).slice(0, 8);
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
    layers: normalizeLayers(source),
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

const SYSTEM = `Ты — архитектор интерьера и товаровед. Смотришь на готовую визуализацию комнаты и разбираешь её для пользователя.
Верни строго JSON без текста вокруг:
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
  "hints": [{"target":"sofa|walls|light|...","action":"что сделать","why":"зачем","priority":"high|medium|low"}],
  "layers": [{
    "key":"walls|floor|furniture|light|ceiling|textile|decor|storage|appliances|art",
    "label":"Стены",
    "current":"что сейчас: цвет, материал, состояние",
    "impact":0.0,
    "effort":"low|medium|high",
    "risk":"low|medium|high",
    "preserve":"что нельзя трогать",
    "actions":[{"target":"walls","action":"конкретная правка","why":"что это даст дизайну"}]
  }],
  "electrical": [{"title":"Розетки у кровати","text":"где и на какой высоте"}],
  "summary": {"concept":"...","palette":"...","materials":"...","electrical":"...","next_steps":["..."]}
}
Правила:
- Все тексты для пользователя — строго на русском: strengths, issues, hints.action, hints.why, layers.label, layers.current, layers.preserve, layers.actions.action, layers.actions.why, electrical.title, electrical.text и summary. Никаких английских формулировок в этих полях.
- bbox нормирован 0..1: [x, y, ширина, высота].
- category — только из списка: ${ARCHITECT_CATEGORIES.join(', ')}.
- Если предмета нет в кадре — не выдумывай его.
- hints — максимум 6, каждая привязана к конкретному объекту или поверхности.
- layers — карта того, что влияет на интерьер. Сначала стены, пол, крупная мебель, свет, потолок, текстиль и декор, но порядок определяется реальным влиянием: impact 0..1, сортировка по убыванию. Для каждого слоя — что сейчас, что можно изменить, усилие, риск и что нельзя трогать. actions — максимум 4 конкретные точечные правки.
- electrical — практичные рекомендации по розеткам, выключателям и свету, без проекта электроснабжения.
- summary заполняй только для финального разбора; для промежуточного оставь null.
- Никаких цен и ссылок: товары подберёт каталог.`;

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
} = {}) {
  if (!imageDataUrl) return null;
  const callVision = vision || (await import('./openrouter.js')).visionJson;
  const user = buildUserPrompt({ roomType, style, priceTier, mode });
  let parsed = {};
  let cost = null;
  try {
    const first = await callVision({ system: SYSTEM, user, images: [imageDataUrl], model: ARCHITECT_MODEL });
    parsed = first?.parsed || {};
    cost = first?.cost ?? null;
  } catch {
    return null;
  }
  let architect = normalizeArchitect(parsed);
  const empty = !architect.items.length && !architect.hints.length && !architect.surfaces.length;
  if (empty && ARCHITECT_MODEL) {
    try {
      const retry = await callVision({ system: SYSTEM, user, images: [imageDataUrl], model: null });
      const retryArchitect = normalizeArchitect(retry?.parsed || {});
      if (retryArchitect.items.length || retryArchitect.hints.length || retryArchitect.surfaces.length) {
        architect = retryArchitect;
        parsed = retry?.parsed || {};
        cost = (cost || 0) + (retry?.cost || 0);
      }
    } catch { /* остаётся первый пустой результат */ }
  }
  if (!architect.items.length && !architect.hints.length && !architect.surfaces.length) return null;
  return { parsed: toParsed(architect), architect, cost: cost ?? null };
}

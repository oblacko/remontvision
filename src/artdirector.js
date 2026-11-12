// Арт-директор: vision-проход по реальному фото, который пишет авторское
// арт-направление под конкретную комнату и выбранный стиль. Результат
// вставляется в промт генерации отдельным блоком ART DIRECTION.
import { visionJson } from './openrouter.js';
import { roomTypeByName } from './roomtypes.js';
import { getArchitectPrompt } from './architectprompts.js';
import { callAgentJson } from './openrouteragent.js';
import { validateRepairScope, validateDesignDirection } from './agentcontracts.js';
import { styleById, conceptById, compatibilityOf, compatibilityNote } from './designdata.js';
import { isArtDirectionEnabled } from './modelconfig.js';

// Категории, которые арт-директор может просить из каталога. Локальный список,
// чтобы не зависеть от searchvision.js (он может отличаться в разных сборках).
const PRODUCT_PLAN_CATEGORIES = [
  'bed', 'sofa', 'dining_table', 'coffee_table', 'armchair', 'light', 'rug',
  'decor', 'decor_art', 'appliance', 'faucet', 'sink', 'shower', 'bathtub',
  'toilet', 'cabinet', 'sideboard', 'desk', 'office_chair', 'storage', 'curtain', 'mirror',
];

// Модель арт-директора. Пусто — VISION_MODEL (админка/модели). Можно задать
// отдельно, например deepseek/deepseek-v4.1-flash-1017, чтобы не трогать остальной vision.
const ART_DIRECTOR_MODEL = process.env.ART_DIRECTOR_MODEL || 'deepseek/deepseek-v4.1-flash-1017';

const clampText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// lighting может прийти строкой (старый формат) или объектом ambient/task/accent.
function lightingText(value) {
  if (!value) return '';
  if (typeof value === 'string') return clampText(value, 320);
  if (typeof value === 'object') {
    return ['ambient', 'task', 'accent', 'temperature', 'direction']
      .map(key => (value[key] ? `${key}: ${clampText(value[key], 160)}` : ''))
      .filter(Boolean)
      .join('; ')
      .slice(0, 400);
  }
  return '';
}

// План товаров: что арт-директор хочет видеть в кадре (2-4 позиции).
function normalizeProductPlan(value) {
  if (!Array.isArray(value)) return [];
  const measure = v => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return value.map(item => {
    if (!item || typeof item !== 'object') return null;
    const category = String(item.category || '').trim();
    if (!PRODUCT_PLAN_CATEGORIES.includes(category)) return null;
    const query = clampText(item.query || item.label || '', 200);
    if (!query) return null;
    return {
      slot: clampText(item.slot || category, 40),
      category,
      query,
      color: clampText(item.color, 80),
      material: clampText(item.material, 80),
      max_w_cm: measure(item.max_w_cm),
      max_l_cm: measure(item.max_l_cm),
      why: clampText(item.why, 200),
    };
  }).filter(Boolean).slice(0, 4);
}

function normalizePalette(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') {
      const hex = /^#[0-9a-f]{6}$/i.test(item) ? item : null;
      return { hex, name: item.slice(0, 40) };
    }
    const hex = /^#[0-9a-f]{6}$/i.test(String(item?.hex || '')) ? String(item.hex) : null;
    return { hex, name: clampText(item?.name, 40) || hex || '' };
  }).filter(item => item.name || item.hex).slice(0, 6);
}

function normalizeConfidence(value) {
  const raw = String(value || '').toLowerCase();
  return ['low', 'medium', 'high'].includes(raw) ? raw : 'low';
}

// Архитектор сам оценивает габариты по фото. Размеры нужны промту для масштаба,
// но пользователь их не вводит: иначе перспектива и обрезка дают неверные метры.
export function normalizeRoomDimensions(value) {
  if (!value || typeof value !== 'object') return null;
  const round = v => Math.round(Number(v) * 10) / 10;
  const width = Number(value.width_m ?? value.width);
  const length = Number(value.length_m ?? value.length);
  const height = Number(value.height_m ?? value.height);
  if (![width, length, height].every(Number.isFinite) || width < 1 || width > 30 || length < 1 || length > 30 || height < 2 || height > 10) return null;
  return {
    width: round(width),
    length: round(length),
    height: round(height),
    confidence: normalizeConfidence(value.confidence),
  };
}

// Объектив влияет на восприятие масштаба: широкий угол растягивает ближний план.
export function normalizeLens(value) {
  if (!value || typeof value !== 'object') return null;
  const focal = Number(value.focal_length_mm ?? value.focal_mm);
  const type = String(value.type || '').toLowerCase();
  const distortion = String(value.distortion || '').toLowerCase();
  return {
    focal_length_mm: Number.isFinite(focal) && focal > 0 ? Math.round(focal) : null,
    type: ['wide', 'normal', 'tele'].includes(type) ? type : null,
    distortion: ['strong', 'mild', 'none'].includes(distortion) ? distortion : null,
    correction: clampText(value.correction, 240),
    confidence: normalizeConfidence(value.confidence),
  };
}

const REPAIR_ACTIONS = {
  floor: ['replace', 'level', 'refinish', 'keep'],
  ceiling: ['level', 'paint', 'keep'],
  walls: ['paint', 'wallpaper', 'plaster', 'keep'],
  doors: ['replace', 'paint', 'keep'],
  windows: ['paint', 'fill', 'keep'],
};

// Дверь/окно нельзя выдумывать по цветной полосе, краю стены или проёму без полотна.
const UNCERTAIN_EVIDENCE = /(фрагмент|похоже|возможно|вероятно|не видно|частично|предполож|обрез|край стены|цветн.*полос|тень)/i;
const CLEAR_DOOR = /(дверь|дверн|полотно|наличник|ручк|петл|створк)/i;
const CLEAR_WINDOW = /(окно|оконн|рама|створк|подоконник|откос|стеклопакет)/i;

// null — не видно/данных нет; keep — видно и сохраняем; неизвестный action — отбрасываем.
export function normalizeRepairScope(value) {
  const source = value && typeof value === 'object' ? value : {};
  const one = (key) => {
    const item = source[key];
    if (!item || typeof item !== 'object') return null;
    const action = String(item.action || '').toLowerCase();
    if (!REPAIR_ACTIONS[key].includes(action)) return null;
    const why = clampText(item.why, 240);
    if (key === 'doors' && (!CLEAR_DOOR.test(why) || UNCERTAIN_EVIDENCE.test(why))) return null;
    if (key === 'windows' && (!CLEAR_WINDOW.test(why) || UNCERTAIN_EVIDENCE.test(why))) return null;
    return {
      action,
      material: clampText(item.material, 120),
      style: clampText(item.style, 120),
      why,
    };
  };
  return {
    floor: one('floor'),
    ceiling: one('ceiling'),
    walls: one('walls'),
    doors: one('doors'),
    windows: one('windows'),
    storage: Array.isArray(source.storage)
      ? source.storage.map(item => clampText(item, 120)).filter(Boolean).slice(0, 6)
      : [],
    style_dir: clampText(source.style_dir, 300),
  };
}

const REPAIR_MODEL = process.env.ARCHITECT_MODEL || process.env.ART_DIRECTOR_MODEL || 'deepseek/deepseek-v4.1-flash-1017';

const REPAIR_SCOPE_SCHEMA = `Обязательный контракт repair_scope (не удалять при редактировании промта):
{"floor":{"action":"replace|level|refinish|keep","material":"...","why":"..."},"ceiling":{"action":"level|paint|keep","why":"..."},"walls":{"action":"paint|wallpaper|plaster|keep","why":"..."},"doors":{"action":"replace|paint|keep","style":"...","why":"..."},"windows":{"action":"paint|fill|keep","why":"..."},"storage":["..."],"style_dir":"..."}
null — не видно/данных нет; keep — сохранить. Дверь/окно — только если явно видны (полотно, рама, створка, ручка, наличник); цветная полоса или проём без полотна — null. Только JSON.`;

export async function buildRepairScope({
  originalImageDataUrl,
  cleanedImageDataUrl = null,
  roomType = 'Другое',
  style = '',
  styleDescription = '',
  sessionId = null,
} = {}) {
  if (!originalImageDataUrl) return null;
  const builder = getArchitectPrompt('builder');
  const criteria = getArchitectPrompt('criteria');
  const system = `${builder.system}\n\n${REPAIR_SCOPE_SCHEMA}\n\n${criteria ? `КРИТЕРИЙ ПРИЁМКИ:\n${criteria.system}` : ''}`;
  const user = [
    `Тип комнаты: ${roomType || 'определи сам'}.`,
    `Стиль: ${style || 'определи сам'}.`,
    styleDescription ? `Бриф стиля: ${styleDescription}` : '',
    cleanedImageDataUrl
      ? 'Изображение 1 — original_photo: исходное состояние и отделка. Изображение 2 — cleaned_shell: очищенная комната, основа планировки и свободного пространства. Различия после очистки не считай выполненным ремонтом.'
      : 'Одно изображение — original_photo: исходное состояние комнаты.',
    'Определи полный объём ремонта и верни JSON по схеме.',
  ].filter(Boolean).join('\n');
  try {
    let parsed = null;
    let totalCost = null;
    try {
      const agent = await callAgentJson({
        instructions: system,
        inputText: user,
        images: [originalImageDataUrl, cleanedImageDataUrl].filter(Boolean),
        model: REPAIR_MODEL,
        maxCostUsd: Number(process.env.REPAIR_SCOPE_MAX_COST_USD || 0.02),
        maxSteps: 2,
        sessionId,
      });
      if (agent.parsed) {
        parsed = agent.parsed;
        totalCost = agent.cost ?? null;
      }
    } catch { /* fallback на visionJson ниже */ }
    if (!parsed) {
      const legacy = await visionJson({
        system,
        user,
        images: [originalImageDataUrl, cleanedImageDataUrl].filter(Boolean),
        model: REPAIR_MODEL,
        sessionId,
      });
      parsed = legacy.parsed;
      totalCost = legacy.cost ?? null;
    }
    const validated = validateRepairScope(parsed);
    let repairScope = normalizeRepairScope(validated || parsed);
    const isEmpty = !repairScope.floor && !repairScope.ceiling && !repairScope.walls
      && !repairScope.doors && !repairScope.windows && !repairScope.storage.length && !repairScope.style_dir;
    if (isEmpty && REPAIR_MODEL) {
      try {
        const retry = await visionJson({
          system,
          user,
          images: [originalImageDataUrl, cleanedImageDataUrl].filter(Boolean),
          model: null,
          sessionId,
        });
        const retryValidated = validateRepairScope(retry.parsed || {});
        const retryScope = normalizeRepairScope(retryValidated || retry.parsed || {});
        const retryEmpty = !retryScope.floor && !retryScope.ceiling && !retryScope.walls
          && !retryScope.doors && !retryScope.windows && !retryScope.storage.length && !retryScope.style_dir;
        if (!retryEmpty) {
          repairScope = retryScope;
          totalCost = (totalCost || 0) + (retry.cost || 0);
        }
      } catch { /* остаётся первый пустой результат */ }
    }
    return { repairScope, lens: normalizeLens(parsed.lens), cost: totalCost, promptVersion: builder.version };
  } catch {
    return null;
  }
}

const DIRECTION_SCHEMA = `{"style_id":"...","concept_id":"...","compatibility":"ok|weaken","concept":"...","main_move":{"target":"...","action":"...","effect":"..."},"supporting_moves":[{"target":"...","action":"...","effect":"..."}],"palette_hex":{"base":"#RRGGBB","support":"#RRGGBB","dark":"#RRGGBB","accent":"#RRGGBB"},"focal_point":"...","focal_zone":"window|wall|center|ceiling|floor|perimeter","quiet_areas":["..."],"materials_story":["..."],"prompt_en":"...","novelty_class":"novel|balance|safe","avoid":["..."]}`;

function paletteToArtDirection(paletteHex = {}) {
  const labels = { base: 'основной', support: 'поддерживающий', dark: 'тёмный', accent: 'акцент' };
  return Object.entries(labels)
    .map(([key, name]) => (paletteHex[key] ? { hex: paletteHex[key], name } : null))
    .filter(Boolean);
}

export function normalizeDirection(parsed, { styleId = '', conceptId = '', compatibility = null } = {}) {
  const validated = validateDesignDirection(parsed || {});
  if (!validated) return null;
  return {
    styleId: styleId || validated.style_id,
    conceptId: conceptId || validated.concept_id,
    compatibility: compatibility || validated.compatibility || 'ok',
    concept: validated.concept,
    mainMove: validated.main_move,
    supportingMoves: validated.supporting_moves,
    focalPoint: validated.focal_point,
    focalZone: validated.focal_zone,
    quietAreas: validated.quiet_areas,
    materialsStory: validated.materials_story,
    noveltyClass: validated.novelty_class,
    text: validated.prompt_en || '',
    palette: paletteToArtDirection(validated.palette_hex),
    materials: validated.materials_story.join(', '),
    mood: validated.concept,
    avoid: validated.avoid.join('; '),
  };
}

// Один промт арт-директора: факты с фото + (при выбранной концепции) замысел.
// Без концепции или при конфликтной паре — facts_only, чтобы простые рендеры не дорожали.
export function composeArtDirectionPrompt({
  roomType = 'Другое',
  style = '',
  styleDescription = '',
  dimensions = null,
  keepFurniture = true,
  styleId = '',
  conceptId = '',
  usedDirections = [],
} = {}) {
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || roomType || 'room';
  const styleCard = styleById(styleId) || null;
  const concept = conceptId ? conceptById(conceptId) : null;
  const compatibility = styleCard && concept ? compatibilityOf(styleCard.id, concept.id) : null;
  const factsOnly = !concept || !styleCard || compatibility === 'conflict';
  const hasDimensions = dimensions
    && Number(dimensions.width) > 0
    && Number(dimensions.length) > 0
    && Number(dimensions.height) > 0;
  const dims = hasDimensions
    ? `Реальные размеры комнаты переданы как опорные: ширина ${dimensions.width} м, длина ${dimensions.length} м, высота ${dimensions.height} м. Проверь их по перспективе и объективу.`
    : 'Размеры не заданы: определи ширину, длину и высоту по фотографии с учётом объектива и перспективы.';
  const note = !factsOnly ? compatibilityNote(styleCard.id, concept.id) : '';
  const history = !factsOnly && Array.isArray(usedDirections) && usedDirections.length
    ? `Последние проекты пользователя (не повторяй main_move и focal_zone): ${usedDirections.slice(-5).map(item => JSON.stringify(item)).join('; ')}.`
    : '';
  const cards = !factsOnly
    ? [
        styleCard ? `Карточка стиля: ${styleCard.name} (id: ${styleCard.id}). Палитра: base ${styleCard.palette.base}, support ${styleCard.palette.support}, dark ${styleCard.palette.dark}, accent ${styleCard.palette.accent}. Материалы: ${styleCard.materials}. Промпт стиля (EN): ${styleCard.prompt_en}.` : '',
        `Карточка концепции: ${concept.name} (id: ${concept.id}). Главный ход: ${concept.main_move}. Спокойные зоны: ${concept.quiet_areas}.`,
        `Совместимость пары: ${compatibility}.${note ? ` Ослабленная форма: ${note}.` : ''}`,
        compatibility === 'weaken' ? 'Пара допустима только в ослабленной форме: сохрани главный ход концепции, но приглуши его.' : '',
        history,
      ].filter(Boolean)
    : [];
  const system = factsOnly
    ? getArchitectPrompt('designer').system
    : `${getArchitectPrompt('designer').system}

ДОПОЛНИТЕЛЬНО — ЗАМЫСЕЛ В ПОЛЕ "direction"
${getArchitectPrompt('direction').system}

Верни замысел не отдельным ответом, а полем "direction" внутри общего JSON. Контракт поля:
${DIRECTION_SCHEMA}
Правила: HEX бери из палитры стиля (base/support/dark не меняй, accent можно сместить внутри hue-семьи); prompt_en — только позитивные формулировки, без "no"/"without"/"avoid"/"do not"; main_move и focal_zone не повторяй из истории.`;
  const user = [
    `Тип комнаты: ${roomName}.`,
    `Выбранный стиль: ${style || 'подбери сам под комнату и свет'}.`,
    styleDescription ? `Бриф стиля: ${styleDescription}` : '',
    dims,
    keepFurniture
      ? 'Сохраняй существующую мебель, планировку и архитектуру; обновляй отделку, свет и текстиль.'
      : 'Комната пустая: мебель убрана. Проектируй наполнение с нуля, сохраняя архитектуру, окна, двери, потолок и инженерные точки.',
    ...cards,
    factsOnly
      ? 'Напиши авторское арт-направление для этой конкретной комнаты. Только JSON.'
      : 'Одним ответом собери факты по фото и авторский замысел в поле "direction". Только JSON.',
  ].filter(Boolean).join('\n');
  return { system, user, factsOnly, compatibility, style: styleCard, concept };
}

export async function buildArtDirection({
  imageDataUrl,
  roomType = 'Другое',
  style = '',
  styleDescription = '',
  dimensions = null,
  keepFurniture = true,
  sessionId = null,
  modelKey = null,
  styleId = '',
  conceptId = '',
  usedDirections = [],
} = {}) {
  if (!isArtDirectionEnabled(modelKey) || !imageDataUrl) return null;
  const prompt = composeArtDirectionPrompt({
    roomType, style, styleDescription, dimensions, keepFurniture, styleId, conceptId, usedDirections,
  });

  const buildFields = source => ({
    palette: normalizePalette(source.palette),
    existingFurniture: Array.isArray(source.existing_furniture)
      ? source.existing_furniture.map(item => clampText(item, 100)).filter(Boolean).slice(0, 12)
      : null,
    roomDimensions: normalizeRoomDimensions(source.room_dimensions),
    lens: normalizeLens(source.lens),
    focalPoint: clampText(source.focal_point, 240),
    featureWall: clampText(source.feature_wall, 240),
    materials: clampText(source.materials, 320),
    materialContrasts: clampText(source.material_contrasts, 320),
    lighting: lightingText(source.lighting),
    ergonomics: clampText(source.ergonomics, 320),
    designRecipe: clampText(source.design_recipe, 320),
    textiles: clampText(source.textiles, 240),
    decor: clampText(source.decor, 240),
    mood: clampText(source.mood, 200),
    avoid: clampText(source.avoid, 240),
    productPlan: normalizeProductPlan(source.product_plan),
  });
  const buildText = (source, fields) => {
    let text = clampText(source.prompt, 1800);
    if (!text) {
      text = [
        fields.mood,
        fields.designRecipe ? `Design recipe: ${fields.designRecipe}.` : '',
        fields.materialContrasts ? `Material contrasts: ${fields.materialContrasts}.` : '',
        fields.featureWall ? `Feature wall: ${fields.featureWall}.` : '',
        fields.materials ? `Materials: ${fields.materials}.` : '',
        fields.lighting ? `Lighting: ${fields.lighting}.` : '',
        fields.ergonomics ? `Ergonomics: ${fields.ergonomics}.` : '',
        fields.textiles ? `Textiles: ${fields.textiles}.` : '',
        fields.decor ? `Decor: ${fields.decor}.` : '',
      ].filter(Boolean).join(' ');
    }
    return text;
  };
  const apply = source => {
    const fields = buildFields(source);
    const direction = (!prompt.factsOnly && source?.direction && typeof source.direction === 'object')
      ? normalizeDirection(source.direction, {
          styleId: prompt.style?.id || styleId,
          conceptId: prompt.concept?.id || conceptId,
          compatibility: prompt.compatibility,
        })
      : null;
    return { fields, direction, text: direction?.text || buildText(source, fields) };
  };

  let { parsed, cost } = await visionJson({ system: prompt.system, user: prompt.user, images: [imageDataUrl], model: ART_DIRECTOR_MODEL, sessionId });
  let result = apply(parsed);
  // Страховка: пустой текст или запрошенный, но отсутствующий замысел — один повтор.
  if ((!result.text || (!prompt.factsOnly && !result.direction)) && ART_DIRECTOR_MODEL) {
    const retry = await visionJson({ system: prompt.system, user: prompt.user, images: [imageDataUrl], model: null, sessionId });
    parsed = retry.parsed;
    cost = (cost || 0) + (retry.cost || 0);
    result = apply(parsed);
  }
  if (!result.text) return null;
  return {
    ...result.fields,
    text: result.text,
    direction: result.direction,
    factsOnly: prompt.factsOnly,
    directionRequested: !prompt.factsOnly,
    cost: cost ?? null,
  };
}
const BRIEF_SYSTEM = `Ты арт-директор и эксперт по интерьерной фотографии. По одной фотографии комнаты оцени помещение и предложи направление дизайна.
Опирайся на типовые размеры: дверь 2.0-2.1 м, длина кровати 2.0 м, глубина кухонных шкафов 0.6 м, высота стула 0.45 м, рост человека, плитка и панели. Учитывай перспективу и ширину объектива.
Верни строго JSON без текста вокруг:
{
  "room_type_guess": "тип комнаты по-русски",
  "room_type_confidence": "low|medium|high",
  "width_m": number,
  "length_m": number,
  "height_m": number,
  "bed_present": boolean,
  "confidence": "low|medium|high",
  "architecture": {"windows": number, "doors": number, "builtins": ["..."], "radiators": boolean, "ceiling": "кратко"},
  "existing_furniture": ["крупные предметы"],
  "style_suggestions": [{"name": "Скандинавский", "rationale": "почему подходит этой комнате"}],
  "reasoning": "кратко по-русски",
  "assumptions": ["..."]
}
Правила:
- Размеры в метрах, округляй до 0.1; при неясном масштабе дай разумную оценку и confidence low.
- style_suggestions — 2-3 варианта из списка: Скандинавский, Джапанди, Ваби-саби, Органик модерн, Тёплый минимализм, Биофильный, Современная классика, Средиземноморский модерн.
- Никаких выдуманных измерений и лишнего текста. Только JSON.`;

export async function analyzeRoomBrief({ imageDataUrl, roomType = '' } = {}) {
  if (!imageDataUrl) return null;
  const user = `Тип комнаты (если известен): ${roomType || 'определи сам'}. Оцени помещение и предложи направление.`;
  const { parsed, cost } = await visionJson({ system: BRIEF_SYSTEM, user, images: [imageDataUrl], model: ART_DIRECTOR_MODEL });
  const measure = (value, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) return null;
    return Math.round(number * 10) / 10;
  };
  const conf = value => (['low', 'medium', 'high'].includes(value) ? value : 'low');
  const arch = parsed.architecture && typeof parsed.architecture === 'object' ? parsed.architecture : {};
  const architecture = {
    windows: Number.isFinite(Number(arch.windows)) ? Math.max(0, Math.round(Number(arch.windows))) : null,
    doors: Number.isFinite(Number(arch.doors)) ? Math.max(0, Math.round(Number(arch.doors))) : null,
    builtins: Array.isArray(arch.builtins) ? arch.builtins.map(item => clampText(item, 80)).filter(Boolean).slice(0, 6) : [],
    radiators: arch.radiators === true,
    ceiling: clampText(arch.ceiling, 120),
  };
  const styleSuggestions = Array.isArray(parsed.style_suggestions)
    ? parsed.style_suggestions
        .map(item => ({
          name: clampText(typeof item === 'string' ? item : item?.name, 80),
          rationale: clampText(typeof item === 'string' ? '' : item?.rationale, 200),
        }))
        .filter(item => item.name)
        .slice(0, 3)
    : [];
  return {
    room_type_guess: clampText(parsed.room_type_guess, 80),
    room_type_confidence: conf(parsed.room_type_confidence),
    width_m: measure(parsed.width_m, 1.5, 20),
    length_m: measure(parsed.length_m, 1.5, 30),
    height_m: measure(parsed.height_m, 2, 6),
    bed_present: parsed.bed_present === true,
    confidence: conf(parsed.confidence),
    architecture,
    existing_furniture: Array.isArray(parsed.existing_furniture)
      ? parsed.existing_furniture.map(item => clampText(item, 100)).filter(Boolean).slice(0, 10)
      : [],
    style_suggestions: styleSuggestions,
    reasoning: clampText(parsed.reasoning, 300),
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.map(item => clampText(item, 160)).filter(Boolean).slice(0, 4)
      : [],
    cost: cost ?? null,
  };
}

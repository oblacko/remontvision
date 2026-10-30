// Арт-директор: vision-проход по реальному фото, который пишет авторское
// арт-направление под конкретную комнату и выбранный стиль. Результат
// вставляется в промт генерации отдельным блоком ART DIRECTION.
import { visionJson } from './openrouter.js';
import { roomTypeByName } from './roomtypes.js';

export const ART_DIRECTION_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.ART_DIRECTION_ENABLED ?? 'true'));

const clampText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function normalizeFixtures(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') return { type: clampText(item, 60), position: '' };
    return { type: clampText(item?.type, 60), position: clampText(item?.position, 80) };
  }).filter(item => item.type).slice(0, 10);
}

function normalizeLayoutItems(value) {
  if (!Array.isArray(value)) return [];
  const number = value => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return value.map(item => ({
    type: clampText(item?.type, 50),
    description: clampText(item?.description, 160),
    widthCm: number(item?.width_cm),
    depthCm: number(item?.depth_cm),
    heightCm: number(item?.height_cm),
    position: clampText(item?.position, 140),
    clearanceCm: number(item?.clearance_cm),
  })).filter(item => item.type).slice(0, 12);
}

function normalizeZones(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    zone: clampText(item?.zone, 40),
    items: Array.isArray(item?.items)
      ? item.items.map(entry => clampText(entry, 80)).filter(Boolean).slice(0, 6)
      : (typeof item?.items === 'string' ? [clampText(item.items, 80)] : []),
    position: clampText(item?.position, 100),
  })).filter(item => item.zone).slice(0, 8);
}

function normalizeFeatures(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => clampText(entry, 100)).filter(Boolean).slice(0, 8);
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

const DIRECTIVE_SYSTEM = `Ты ведущий арт-директор и пространственный планировщик интерьеров. На входе — фотография реальной комнаты, её тип, точные размеры и выбранный стиль.
Сначала внимательно изучи комнату: определи функцию, всю крупную мебель и функциональные зоны, а не только окна и двери. Затем придумай планировку под размеры, сохраняя назначение комнаты.
Верни строго JSON без текста вокруг:
{
  "room_function": "teen_bedroom | adult_bedroom | child_bedroom | office | living | other",
  "bed_type": "single | small_double | double | king | none",
  "existing_fixtures": [{"type":"desk 120x60","position":"left wall under TV"},{"type":"single bed 90x200","position":"right wall"}],
  "functional_zones": [{"zone":"sleep","items":["single bed 90x200"],"position":"right wall"},{"zone":"study","items":["desk 120x60"],"position":"left wall under TV"},{"zone":"storage","items":["wardrobe 120x60"],"position":"right wall near door"}],
  "keep_features": ["floral mural on the right wall","built-in wardrobe on the right"],
  "layout_items": [{"type":"desk","description":"slim oak desk with a black task lamp","width_cm":120,"depth_cm":60,"height_cm":75,"position":"left wall under the TV","clearance_cm":70}],
  "layout_plan": "English: exact sizes in cm, positions and walkways for the WHOLE room, including sleep/study/storage/media zones",
  "framing_note": "English: what the camera sees, what may stay out of frame, and what must not be crammed into the shot",
  "palette": [{"hex":"#RRGGBB","name":"кратко"}],
  "focal_point": "главный акцент композиции",
  "feature_wall": "акцентная стена/плоскость и её обработка",
  "materials": "ключевые материалы и фактуры",
  "lighting": "схема света: ambient/task/accent и температура",
  "textiles": "текстиль и шторы",
  "decor": "декор, искусство, растения, предметы",
  "mood": "настроение и атмосфера",
  "avoid": "чего избегать именно в этой комнате",
  "prompt": "90-150 слов на английском: дизайн комнаты с этой точной планировкой и функцией"
}
Правила:
- room_function: определи по фото. Если есть письменный стол, детские рисунки, односпальная кровать — это teen_bedroom/child_bedroom, а НЕ adult_bedroom.
- existing_fixtures: перечисли ВСЮ крупную мебель и зоны, не только фиксированные: кровать (тип/размер), письменный стол, шкаф, стеллажи, ТВ, акцентная стена/мурал, окно/дверь/радиатор. Если на стене есть мурал или роспись — обязательно укажи это в existing_fixtures и keep_features.
- functional_zones: sleep, study, storage, media, play — с предметами и позицией.
- keep_features: сильные существующие элементы (мурал, роспись, панно, декоративная стена, встроенный шкаф, ниша), которые нельзя закрашивать или убирать без явного указания. Если на стене есть мурал — обязательно сохрани его в keep_features и в prompt.
- bed_type: если на фото односпальная кровать — single (90–120 см). Не заменяй single на double. small_double 140, double 160, king 180–200.
- layout_items ОБЯЗАН включать письменный стол/рабочее место, если на фото есть study-зона или room_function teen/child. Не заменяй стол креслом, банкеткой или «лаунж-зоной».
- layout_plan должен сохранять функциональную программу: sleep + study + storage + media, а не только кровать.
- Строго соблюдай размеры комнаты и SCALE PLAN. Сумма ширины мебели и проходов не может превышать ширину/длину комнаты. Если не влезает — уменьшай мебель или убирай второй предмет. Проход минимум 60 см, комфортно 80 см.
- Не рисуй кровать/диван шире комнаты и не оставляй 10 см «прохода». Проверяй арифметику до того, как писать prompt.
- Мебель можно переставлять в пределах комнаты; стены, окна, двери, потолок, камеру и объём комнаты не меняй.
- layout_items: реальные предметы с description (материал/цвет/форма), width_cm/depth_cm/height_cm, position и clearance_cm.
- framing_note: на английском. Комната может вмещать больше, чем видно в кадре. Опиши, что реально видит камера, что может остаться за кадром и что нельзя впихивать в кадр.
- framing_note НЕ может убирать или прятать архитектуру: двери, окна, стены, потолок, радиатор и объём комнаты всегда остаются на своих местах. За кадром могут быть только мебель и декор.
- Тип кровати с фото важнее SCALE PLAN: если на фото single/маленькая кровать, используй 90–120 см, даже если SCALE PLAN предлагает 160.
- Не копируй старую отделку и хлам с фото; проектируй новое, но сохраняй функцию и сильные features.
- prompt — на английском, связный текст без markdown, без кавычек вокруг. Начни с функции и точной планировки, затем опиши finishes, мебель, свет, текстиль и декор.`;

export async function buildArtDirection({
  imageDataUrl,
  roomType = 'Другое',
  style = '',
  styleDescription = '',
  dimensions = null,
  keepFurniture = true,
  scalePlan = '',
} = {}) {
  if (!ART_DIRECTION_ENABLED || !imageDataUrl) return null;
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || roomType || 'room';
  const hasDimensions = dimensions
    && Number(dimensions.width) > 0
    && Number(dimensions.length) > 0
    && Number(dimensions.height) > 0;
  const dims = hasDimensions
    ? `Реальные размеры комнаты: ширина ${dimensions.width} м, длина ${dimensions.length} м, высота ${dimensions.height} м. Держи масштаб мебели, проходы и пропорции в этих рамках.`
    : 'Размеры не заданы: оцени масштаб по фотографии.';
  const user = [
    `Тип комнаты: ${roomName}.`,
    `Выбранный стиль: ${style || 'подбери сам под комнату и свет'}.`,
    styleDescription ? `Бриф стиля: ${styleDescription}` : '',
    dims,
    scalePlan ? `SCALE PLAN (HARD, из детерминированного планировщика):\n${scalePlan}` : '',
    keepFurniture
      ? 'Мебель можно заменить и переставить. Стены, окна, двери, потолок, камеру и объём комнаты не менять.'
      : 'Старую мебель и сантехнику можно заменить и переставить в пределах комнаты. Стены, окна, двери, потолок, камеру и объём комнаты не менять.',
    'Сначала перечисли existing_fixtures с их положением. Затем выбери мебель и размеры, которые физически влезают в комнату с проходами. Затем напиши layout_items, layout_plan на всю комнату, framing_note (что видит камера и что можно не показывать) и prompt. Не пытайся впихнуть всё, что помещается в комнату, в один кадр.',
  ].filter(Boolean).join('\n');
  const { parsed, cost } = await visionJson({ system: DIRECTIVE_SYSTEM, user, images: [imageDataUrl] });
  const fields = {
    palette: normalizePalette(parsed.palette),
    focalPoint: clampText(parsed.focal_point, 240),
    featureWall: clampText(parsed.feature_wall, 240),
    materials: clampText(parsed.materials, 320),
    lighting: clampText(parsed.lighting, 320),
    textiles: clampText(parsed.textiles, 240),
    decor: clampText(parsed.decor, 240),
    mood: clampText(parsed.mood, 200),
    avoid: clampText(parsed.avoid, 240),
  };
  const roomFunction = clampText(parsed.room_function, 40);
  const bedType = clampText(parsed.bed_type, 20);
  const existingFixtures = normalizeFixtures(parsed.existing_fixtures);
  const functionalZones = normalizeZones(parsed.functional_zones);
  const keepFeatures = normalizeFeatures(parsed.keep_features);
  const layoutItems = normalizeLayoutItems(parsed.layout_items);
  const layoutPlan = clampText(parsed.layout_plan, 1200)
    || layoutItems.map(item => `${item.type}${item.description ? ` (${item.description})` : ''}${item.widthCm ? ` ${item.widthCm} cm` : ''}${item.depthCm ? ` × ${item.depthCm} cm` : ''}${item.position ? ` — ${item.position}` : ''}${item.clearanceCm ? `, clearance ${item.clearanceCm} cm` : ''}`).join('; ');
  const framingNote = clampText(parsed.framing_note, 600);
  let text = clampText(parsed.prompt, 1800);
  if (!text) {
    text = [
      fields.mood,
      fields.featureWall ? `Feature wall: ${fields.featureWall}.` : '',
      fields.materials ? `Materials: ${fields.materials}.` : '',
      fields.lighting ? `Lighting: ${fields.lighting}.` : '',
      fields.textiles ? `Textiles: ${fields.textiles}.` : '',
      fields.decor ? `Decor: ${fields.decor}.` : '',
      fields.avoid ? `Avoid: ${fields.avoid}.` : '',
    ].filter(Boolean).join(' ');
  }
  if (!text) return null;
  return {
    ...fields,
    roomFunction,
    bedType,
    existingFixtures,
    functionalZones,
    keepFeatures,
    layoutItems,
    layoutPlan,
    framingNote,
    text,
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
  const { parsed, cost } = await visionJson({ system: BRIEF_SYSTEM, user, images: [imageDataUrl] });
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

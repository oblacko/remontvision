// Арт-директор: vision-проход по реальному фото, который пишет авторское
// арт-направление под конкретную комнату и выбранный стиль. Результат
// вставляется в промт генерации отдельным блоком ART DIRECTION.
import { visionJson } from './openrouter.js';
import { roomTypeByName } from './roomtypes.js';

// Категории, которые арт-директор может просить из каталога. Локальный список,
// чтобы не зависеть от searchvision.js (он может отличаться в разных сборках).
const PRODUCT_PLAN_CATEGORIES = [
  'bed', 'sofa', 'dining_table', 'coffee_table', 'armchair', 'light', 'rug',
  'decor', 'decor_art', 'appliance', 'faucet', 'sink', 'shower', 'bathtub',
  'toilet', 'cabinet', 'sideboard', 'desk', 'office_chair', 'storage', 'curtain', 'mirror',
];

export const ART_DIRECTION_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.ART_DIRECTION_ENABLED ?? 'true'));
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

const DIRECTIVE_SYSTEM = `Ты ведущий арт-директор интерьерного бюро, эксперт по эргономике и композиции. На входе — фотография реальной комнаты, её тип, размеры и выбранный стиль.
Твоя задача — придумать авторское арт-направление именно для ЭТОЙ комнаты, а не взять шаблон стиля. Смотри на реальный свет, пропорции, архитектуру, материалы и ракурс на фото.
Верни строго JSON без текста вокруг:
{
  "palette": [{"hex":"#RRGGBB","name":"кратко"}],
  "focal_point": "главный акцент композиции",
  "feature_wall": "акцентная стена/плоскость и её обработка",
  "materials": "ключевые материалы и фактуры",
  "material_contrasts": "пары контрастов: мат/глянец, тёплый/холодный, крупная/мелкая фактура",
  "lighting": {"ambient":"...","task":"...","accent":"...","temperature":"2700–3000K","direction":"..."},
  "ergonomics": "проходы, высоты мебели, свес света над столом, эргономичные зоны",
  "design_recipe": "композиционные приёмы: 60-30-10 по цвету, ритм, негативное пространство, фокус",
  "textiles": "текстиль и шторы",
  "decor": "декор, искусство, растения, предметы",
  "mood": "настроение и атмосфера",
  "avoid": "чего избегать именно в этой комнате",
  "product_plan": [{"slot":"bed","category":"bed","query":"кровать мягкая беж дуб","color":"беж","material":"дуб","max_w_cm":180,"max_l_cm":220,"why":"главная зона сна"}],
  "prompt": "90-150 слов на английском: цельный art direction для image-модели"
}
Правила:
- Палитра 4-6 гармоничных цветов под стиль и естественный свет на фото, с hex.
- Опирайся на архитектуру на фото: сохраняй существующие стены, окна, двери, потолок и объёмы.
- Создавай авторскую, но реалистичную композицию; не копируй мебель с референсов.
- Если размеры переданы — держи масштаб мебели и проходы в этих рамках.
- Думай как дизайнер: эргономика, жизненные сценарии, контраст фактур, правило 60-30-10, слои света и негативное пространство.
- Поле prompt — на английском, связный текст без markdown и без кавычек. Формулируй ТОЛЬКО позитивно: описывай, что должно быть в кадре (материалы, свет, композиция), а не чего быть не должно. Не используй "no", "without", "avoid", "do not" в поле prompt.
- Поле avoid — только про стиль и настроение (например, «избегай холодной гаммы»), не про архитектуру.
- product_plan — 2-4 ключевых предмета, которые задают комнату. Первым идёт главный крупный предмет: кровать для спальни, диван для гостиной, обеденный стол для столовой. Всегда добавь свет (category "light") и один декор (category "decor"). Для кухни добавь технику (appliance), для санузла — сантехнику (faucet/sink/shower/bathtub/toilet). Каждый предмет: category строго из списка (bed, sofa, dining_table, coffee_table, armchair, light, rug, decor, decor_art, appliance, faucet, sink, shower, bathtub, toilet, cabinet, sideboard, desk, office_chair, storage, curtain, mirror), query по-русски для поиска, color, material, max_w_cm и max_l_cm (из размеров комнаты, оставь запас на проходы), why. Если размеры неизвестны — оставь max_*_cm пустыми.`;

export async function buildArtDirection({
  imageDataUrl,
  roomType = 'Другое',
  style = '',
  styleDescription = '',
  dimensions = null,
  keepFurniture = true,
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
    keepFurniture
      ? 'Существующую мебель можно заменить и переставить; архитектуру, окна, двери и потолок сохранить.'
      : 'Существующую мебель можно заменить; архитектуру, окна, двери и потолок сохранить.',
    'Напиши авторское арт-направление для этой конкретной комнаты.',
  ].filter(Boolean).join('\n');
  const { parsed, cost } = await visionJson({ system: DIRECTIVE_SYSTEM, user, images: [imageDataUrl], model: ART_DIRECTOR_MODEL });
  const fields = {
    palette: normalizePalette(parsed.palette),
    focalPoint: clampText(parsed.focal_point, 240),
    featureWall: clampText(parsed.feature_wall, 240),
    materials: clampText(parsed.materials, 320),
    materialContrasts: clampText(parsed.material_contrasts, 320),
    lighting: lightingText(parsed.lighting),
    ergonomics: clampText(parsed.ergonomics, 320),
    designRecipe: clampText(parsed.design_recipe, 320),
    textiles: clampText(parsed.textiles, 240),
    decor: clampText(parsed.decor, 240),
    mood: clampText(parsed.mood, 200),
    avoid: clampText(parsed.avoid, 240),
    productPlan: normalizeProductPlan(parsed.product_plan),
  };
  let text = clampText(parsed.prompt, 1800);
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
  if (!text) return null;
  return { ...fields, text, cost: cost ?? null };
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

import { visionJson } from './openrouter.js';

export const DEFAULT_VISION_PROMPT = `Ты — аналитик интерьера для подбора реальных товаров по фото. Верни строго JSON без текста вокруг:
{
  "photo_quality": {"score": 0.0, "recommend_mode": "A"},
  "objects": [{
    "category": "bed",
    "label": "Кровать",
    "description": "краткое описание видимого предмета",
    "color": "беж",
    "material": "дуб",
    "style": "скандинавский",
    "hex": "#E8DCC8",
    "size": "160×200",
    "search_query": "кровать деревянная 160 беж скандинавский",
    "bbox": [0.1, 0.2, 0.6, 0.5],
    "confidence": 0.9,
    "visibility": "seen"
  }]
}
Правила:
- Отметь до 12 ключевых позиций, которые реально можно купить: мебель, свет, текстиль, декор, отделка стен и пола.
- Обязательно добавь отделку, если она видна:
  - стены: category "wall_covering"; label по факту — "Панорамные обои", "Фотообои", "Обои" или "Краска для стен"; в description — узор/мотив/цвет; в search_query — тип, узор и цвет.
  - пол: category "floor_covering"; label по факту — "Ламинат", "Инженерная доска", "Паркет", "Керамогранит", "Винил" или "Ковролин"; в description — материал, цвет и рисунок; в search_query — тип, материал и цвет.
- Для стены bbox — видимая площадь стены, для пола — видимая площадь пола. Если поверхность не видна или неясна — не добавляй.
- bbox — нормализованные координаты [x, y, w, h] от 0 до 1 относительно всего кадра; если предмет не видно, null.
- Без брендов, цен и выдуманных артикулов.
- Описывай видимые материал, цвет и форму; для кровати не путай бельё с каркасом, для светильника — плафон и подвес.
- search_query — короткий запрос по-русски для поиска аналога (тип, материал, цвет, размер).
- photo_quality.score — 0..1, насколько фото пригодно для подбора; recommend_mode = "A" для чётких фото, "B" для мелких, перекрывающихся или шумных предметов.
- visibility: seen для видимых, hidden для очевидно нужных но скрытых, not_seen если не применимо.
Только JSON.`;

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function trimmed(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeSearchVision(raw, { maxObjects = 12 } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const quality = source.photo_quality && typeof source.photo_quality === 'object'
    ? source.photo_quality
    : {};
  const score = finiteNumber(quality.score);
  const recommendMode = String(quality.recommend_mode ?? '').toUpperCase() === 'B' ? 'B' : 'A';

  const limit = Number.isFinite(maxObjects) ? Math.max(0, Math.floor(maxObjects)) : 10;
  const sourceObjects = Array.isArray(source.objects) ? source.objects : [];
  const objects = [];

  for (const item of sourceObjects) {
    if (objects.length >= limit) break;
    if (!item || typeof item !== 'object') continue;

    const label = trimmed(item.label, 160);
    const searchQuery = trimmed(item.search_query, 200);
    if (!label || !searchQuery) continue;

    const bboxInput = item.bbox;
    const bbox = Array.isArray(bboxInput) && bboxInput.length === 4
      ? bboxInput.map(finiteNumber)
      : null;
    const normalizedBbox = bbox && bbox.every(v => v !== null)
      ? bbox.map(clamp01)
      : null;

    const confidence = finiteNumber(item.confidence);
    const hex = String(item.hex ?? '').trim();

    objects.push({
      index: objects.length,
      category: trimmed(item.category, 40),
      label,
      description: trimmed(item.description, 300),
      color: trimmed(item.color, 80),
      material: trimmed(item.material, 80),
      style: trimmed(item.style, 80),
      hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex : null,
      size: trimmed(item.size, 80),
      search_query: searchQuery,
      bbox: normalizedBbox,
      confidence: confidence === null ? null : clamp01(confidence),
      visibility: ['seen', 'hidden', 'not_seen'].includes(item.visibility) ? item.visibility : 'seen',
    });
  }

  return {
    photo_quality: {
      score: score === null ? null : clamp01(score),
      recommend_mode: recommendMode,
    },
    objects,
  };
}

export async function parseSearchImage(imageB64, mime = 'image/png', {
  model = null,
  prompt = null,
  roomType = '',
  maxObjects = 12,
} = {}) {
  if (!imageB64 || !String(imageB64).trim()) {
    throw new Error('Нет изображения для анализа');
  }

  const { parsed, cost } = await visionJson({
    system: prompt || DEFAULT_VISION_PROMPT,
    user: `Разбери фото для поиска товаров. Тип комнаты: ${roomType || 'определи сам'}.`,
    images: [`data:${mime};base64,${imageB64}`],
    model,
  });

  return {
    ...normalizeSearchVision(parsed, { maxObjects }),
    raw: parsed,
    cost,
  };
}

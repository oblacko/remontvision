// Клиент OpenRouter: рендер через Image API, разбор рендера через chat/completions (vision).
// Документация: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
// Если задан HTTPS_PROXY/S3-прокси — гоним через него (нативный fetch env-прокси не читает).

import { roomTypeByName } from './roomtypes.js';
import { getModelConfig } from './modelconfig.js';
import { supportsAdvancedOptions, modelFamily, supportsResolution } from './modelcaps.js';
import { PRICE_TIER_META, SLOT_LABELS, normalizeTier } from './pricing.js';
import { getPromptConfig } from './promptconfig.js';

const BASE = 'https://openrouter.ai/api/v1';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
if (proxyUrl) {
  const { setGlobalDispatcher, ProxyAgent } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[openrouter] используется прокси: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`);
}

export const MOCK_MODE = !process.env.OPENROUTER_API_KEY;

const HTTP_REFERER = process.env.APP_URL || 'http://localhost:3000';
const TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 120_000);
export const MAX_REFERENCES = 4; // сколько референсов уходит в генерацию (проверяй supported_parameters модели)

// --- логирование: json-строки для юнит-экономики и отладки ---
export function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': HTTP_REFERER,
    'X-Title': 'remontvision',
  };
}

// fetch с таймаутом и экспоненциальным бэкоффом. 4xx (кроме 429) не повторяем.
async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = TIMEOUT_MS } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      if (r.ok) return r;
      const body = (await r.text()).slice(0, 300);
      lastErr = new Error(`${url}: ${r.status} ${body}`);
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? new Error(`${url}: timeout ${timeoutMs}ms`) : e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt);
    attempt++;
  }
  throw lastErr;
}

let INPUT_REFS_OK = true;
export const supportsInputRefs = () => INPUT_REFS_OK;

export async function listImageModels() {
  if (MOCK_MODE) return { mock: true, models: [] };
  const r = await fetch(`${BASE}/images/models`, { headers: headers() });
  if (!r.ok) throw new Error(`models: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return (data.data || data.models || []).map(m => ({
    id: m.id,
    input_refs: Boolean(m.supported_parameters?.input_references),
  }));
}

// Проверка конфига при старте: неверный slug рендер-модели = каждый рендер жжёт 502.
export async function assertConfig() {
  if (MOCK_MODE) return;
  const { render: renderModel, vision: visionModel } = getModelConfig();
  const models = await listImageModels();
  const render = models.find(m => m.id === renderModel);
  if (!render) {
    throw new Error(
      `RENDER_MODEL="${renderModel}" нет в списке image-моделей OpenRouter (получено ${models.length} шт.). ` +
      `Проверьте slug: curl https://openrouter.ai/api/v1/images/models -H "Authorization: Bearer $OPENROUTER_API_KEY" ` +
      `либо откройте GET /api/models у приложения.`
    );
  }
  INPUT_REFS_OK = Boolean(render.input_refs);
  if (!INPUT_REFS_OK) {
    log({ event: 'config_warning', msg: `модель ${renderModel} не поддерживает input_references — референсы товаров в генерацию не уйдут` });
  }
  try {
    const r = await fetchWithRetry(`${BASE}/models`, { headers: headers() }, { retries: 1, timeoutMs: 15_000 });
    const data = await r.json();
    const ids = (data.data || []).map(m => m.id);
    if (!ids.includes(visionModel)) {
      log({ event: 'config_warning', msg: `VISION_MODEL="${visionModel}" не найдена среди chat-моделей — этап разбора рендера будет падать` });
    }
  } catch (e) {
    log({ event: 'config_warning', msg: `не удалось сверить VISION_MODEL: ${String(e.message || e).slice(0, 200)}` });
  }
  log({ event: 'config_ok', render_model: renderModel, vision_model: visionModel });
}

const STYLES = {
  'Современный': 'modern minimalist interior, clean architectural lines, handleless matte cabinetry, warm layered lighting, refined materials, calm neutral palette',
  'Светлый': 'bright airy interior, white and light wood palette, lots of natural light, scandinavian, warm and calm',
  'Тёмный': 'moody dark interior, deep graphite and walnut, layered warm lighting, premium hotel feel',
  'Классика': 'classic interior, elegant moldings, warm wood, brass details, timeless proportions',
  'Скандинавский': 'scandinavian interior, light oak, white walls, linen, soft natural light, functional minimalism',
  'Лофт': 'industrial loft, exposed concrete or brick, black metal, warm wood, large windows, raw textures',
  'Джапанди': 'japandi interior, warm minimalism, natural oak, linen, wabi-sabi, calm earthy palette',
  'Неоклассика': 'neoclassical interior, elegant wall moldings, warm neutrals, subtle brass, timeless',
  'Минимализм': 'minimalist interior, clean lines, neutral palette, hidden storage, soft indirect lighting',
  'Тёмный модерн': 'dark modern interior, graphite and walnut, moody lighting, premium materials, dramatic contrast',
  'Бохо': 'bohemian interior, layered textiles, rattan, plants, warm earthy colors, relaxed artisanal styling',
  'Ар-деко': 'art deco interior, brass, velvet, geometric patterns, rich jewel tones',
  'Кантри': 'country interior, natural wood, cozy textiles, warm rustic details, handmade character',
  'Референс пользователя': 'the uploaded style reference',
};

const PALETTES = {
  mono: 'monochrome palette',
  analogous: 'analogous color palette',
  complementary: 'complementary color accents',
  split: 'split-complementary color accents',
};
const ACCENTS = {
  forest: 'olive green',
  sand: 'sandy beige',
  terra: 'terracotta',
  dust: 'dusty blue',
  graphite: 'graphite',
};

function imageRolesText(imageMap = []) {
  if (!imageMap.length) return 'Image 1 is the source room. Preserve its geometry, camera angle and architecture.';
  return ['IMAGE ROLES:']
    .concat(imageMap.map((m, i) => `${i + 1}. ${m.role}${m.label ? ` — ${m.label}` : ''}`))
    .join('\n');
}

function productsText(products = []) {
  if (!products.length) return 'No specific product references. Use materials and fixtures appropriate for the room, style and material class.';
  return products.map((p, i) => {
    const attrs = Object.entries(p.attrs || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    const slot = p.slot ? `${SLOT_LABELS[p.slot] || p.slot}: ` : '';
    const ref = p.has_ref ? 'reference image attached' : 'no reference image — use the described color/finish only';
    const dims = p.dimensions?.text ? ` [dimensions: ${p.dimensions.text}]` : '';
    return `${i + 1}. ${slot}${p.name}${p.brand ? ` (${p.brand})` : ''} — ${p.category}${dims}${attrs ? ` [${attrs}]` : ''} (${ref})`;
  }).join('\n');
}

export function buildPrompt({
  style,
  priceTier = 'comfort',
  budget,
  requestText,
  iteration,
  products = [],
  palette = 'none',
  accent = 'none',
  hasStyleRef = false,
  userStyleRef = false,
  styleDescription = '',
  roomType = 'Другое',
  keepFurniture = true,
  useCatalog = true,
  imageMap = [],
}) {
  const tierKey = normalizeTier(priceTier);
  const tier = PRICE_TIER_META[tierKey];
  const styleDesc = styleDescription || STYLES[style] || STYLES['Современный'];
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || 'room shown in the source photo';
  const keep = keepFurniture
    ? String(room?.keep || 'camera angle, perspective, walls, windows, doors, ceiling height and room proportions').replace(/\.+$/, '')
    : 'the architecture, camera, perspective, walls, windows, doors, ceiling height, room proportions, built-ins, plumbing and electrical points';
  const fullChange = String(room?.change || 'finishes, lighting, textiles, decor and styling that match the chosen style').replace(/\.+$/, '');
  const change = keepFurniture
    ? fullChange.split(/(?<=[.!?])\s+/).filter(sentence => !/\b(replace|restyle|rearrange)\b/i.test(sentence)).join(' ')
    : fullChange;
  const roomRules = room ? `${room.guidance} ${room.forbid}`.replace(/\s+/g, ' ').trim() : 'Keep the room purpose exactly as in the source photo.';
  const styling = room?.styling || 'Add tasteful textiles, art, plants, books, ceramics and warm layered lighting; make it feel finished and lived-in.';
  const rules = getPromptConfig();
  const furnitureRule = keepFurniture ? rules.furnitureOn : rules.furnitureOff;
  const catalogText = useCatalog
    ? productsText(products)
    : 'No catalog products are used for this render. Choose materials, lighting and furniture that best fit the style and the room. Do not add a product list or estimate.';
  const catalogRule = useCatalog ? rules.catalogOn : rules.catalogOff;
  const roles = imageRolesText(imageMap);

  if (iteration) {
    return `${roles}
This is a ${roomName}. Apply ONLY this change to the interior: "${requestText}".
Keep everything else exactly as in the source image: camera, geometry, architecture, large furniture, floor, walls, lighting and decor.
Do not restyle the room. Do not move objects. Photorealistic result.`;
  }

  const styleRefText = hasStyleRef
    ? (userStyleRef
      ? 'The user style reference guides only the mood, light, palette, materials and level of styling. Do not copy its furniture, fixtures, layout, windows, architecture, camera angle or composition. The source room remains the only authority for geometry.'
      : 'The style reference guides only the mood, light direction and temperature, palette, material character and level of styling. Do not copy its furniture, fixtures, layout, windows, architecture, camera angle or composition. The source room remains the only authority for geometry.')
    : 'There is no separate style reference. Build the photographic language from the style description, room and material constraints.';
  const colors = [
    PALETTES[palette] ? `Color scheme: ${PALETTES[palette]}.` : '',
    ACCENTS[accent] ? `Accent color: ${ACCENTS[accent]}.` : '',
  ].filter(Boolean).join(' ');

  return `${roles}

TASK
Create a photorealistic, aspirational editorial photograph of this ${roomName} after a deep renovation in ${styleDesc} style.
The result must feel like a completed designer renovation with a genuine WOW effect: the kind of image that makes the viewer want to live in this room and save it to a Pinterest board. It must not look like a moodboard, a sterile furniture showroom or an empty staged flat.
Deeply transform the finishes, lighting, textiles, decor and styling while keeping the architecture believable and buildable.
This is the art-direction pass. Design the strongest room first; do not turn the image into a catalog assembly. Specific hero products can be attached later in separate local edits.

KEEP EXACTLY
${keep}.
Keep the room purpose exactly as a ${roomName}. Do not move plumbing, electrical points, windows or doors.

FURNITURE MODE
${furnitureRule}

CHANGE / DEEP TRANSFORMATION
${change}.
If a floor product is listed below, replace the floor finish with it. If no floor product is listed, preserve the existing floor. The same applies to walls: change only when a wall finish is listed.
Keep the result functional, keep realistic dimensions, and do not block doors or windows.

COMPOSITION
Keep the camera and architecture. Create a strong focal point, balanced composition and believable depth. Freestanding furniture may be moved only when furniture replacement is allowed; built-ins, plumbing and electrical points stay in place. No distorted geometry, no floating objects, no duplicate furniture.

LIGHTING DESIGN — THE MAIN WOW TOOL
${rules.lighting}

CLEANUP / REALISM
${rules.cleanup}

WINDOW STYLING
${rules.window}

ROOM RULES
${roomRules}

LIFE & STYLING — THIS IS WHERE THE WOW EFFECT COMES FROM
${styling}
Add generous but tasteful small details: layered textiles, cushions, throws, curtains, rugs, framed art, books, ceramics, candles, trays, plants and sculptural objects. Use warm layered lighting — ceiling, bedside/floor lamps, cove and accent light — with soft shadows and tactile material contrast. Layer soft textures and warm pools of light. The room must feel cozy, inhabited, warm, calm and aspirational, like a boutique hotel suite or a designer portfolio. Never a bare mattress, empty walls or a cold showroom.

PINTEREST-LEVEL STYLING
${rules.pinterest}
${rules.extra ? `
EXTRA ART DIRECTION
${rules.extra}` : ''}

CATALOG / MATERIALS
${catalogRule}

MATERIAL CONSTRAINTS — TEXT ONLY, NO PRODUCT IMAGES
${catalogText}
Use these text descriptions only as constraints for finishes, colors, formats and physical scale. Match large surfaces (floor, walls, countertop, cabinet fronts) to the listed material where visible. Tile/plank patterns must match the stated format. Do not force a material into the frame if it is not visible. Choose furniture, lighting, decor and composition for the strength of the design rather than trying to depict the estimate. Small decor, plants, textiles, art and books are encouraged to complete the styling.

STYLE
${styleRefText}
${colors}

MATERIAL CLASS
${tier.promptName || tier.name} — ${tier.prompt}
The selected materials already match this class; keep the rest of the room consistent with it.

OUTPUT
${rules.photo} ${rules.avoid}`;
}

// Короткий промт для правки: один target + один референс, без полного стилевого промта.
export function buildEditPrompt({ roomType = 'Другое', target = null, instruction = '', hasRef = false, refLabel = '', refDimensions = '' }) {
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || 'room';
  const targetLabel = SLOT_LABELS[target] || 'the requested element';
  const roles = hasRef
    ? `IMAGE ROLES:\nImage 1 — current interior render. Edit only the target object.\nImage 2 — reference for the new ${targetLabel}${refLabel ? ` — ${refLabel}` : ''}${refDimensions ? `, dimensions ${refDimensions}` : ''}.`
    : 'IMAGE ROLES:\nImage 1 — current interior render. Edit only the target object.';
  return `${roles}

This is a ${roomName}.
Change only the ${targetLabel}. ${instruction}
Match the reference's shape, color, material and finish${hasRef ? '' : ' from the described material'}${refDimensions ? ` and its real dimensions (${refDimensions})` : ''}. Keep the size and realistic position appropriate for the room.
The product reference describes only the product. Ignore its background, studio lighting, camera angle, staging and photographic style; preserve the interior's own light and composition.
Keep everything else exactly as in Image 1: camera, geometry, walls, floor, furniture, decor and lighting. Do not restyle the room. Do not move objects. Do not add extra furniture or fixtures.
Photorealistic result, no text, no watermarks, no people.`;
}

// OpenRouter принимает только фиксированные пропорции — подбираем ближайшую к реальному фото.
const ASPECTS = [
  [1, 1], [2, 3], [3, 2], [3, 4], [4, 3],
  [4, 5], [5, 4], [9, 16], [16, 9],
];
export function snapAspect(width, height, allowed = null) {
  if (!width || !height) return '3:2';
  const list = Array.isArray(allowed) && allowed.length
    ? allowed.filter(a => a && a !== 'auto').map(a => String(a).split(':').map(Number)).filter(([w, h]) => w > 0 && h > 0)
    : ASPECTS;
  if (!list.length) return '3:2';
  const r = Math.log(width / height);
  let best = '3:2', bestD = Infinity;
  for (const [w, h] of list) {
    const d = Math.abs(r - Math.log(w / h));
    if (d < bestD) { bestD = d; best = `${w}:${h}`; }
  }
  return best;
}

export async function generateRender({ prompt, sourceImageB64, referenceImagesB64 = [], aspectRatio }) {
  return generateWithModel(getModelConfig().render, { prompt, sourceImageB64, referenceImagesB64, aspectRatio });
}

// Пустой каркас: отдельная модель/промт/разрешение из админки, только исходник, без style/product refs.
export async function generateCleanupRender({ prompt, sourceImageB64, aspectRatio, model, resolution, aspect }) {
  return generateWithModel(model, {
    prompt,
    sourceImageB64,
    referenceImagesB64: [],
    aspectRatio,
    resolutionOverride: resolution,
    aspectOverride: aspect,
    allowChatFallback: false,
  });
}

async function generateWithModel(model, { prompt, sourceImageB64, referenceImagesB64, aspectRatio, resolutionOverride = null, aspectOverride = null, allowChatFallback = null }) {
  const productRefs = INPUT_REFS_OK ? referenceImagesB64 : [];
  const refs = [
    { type: 'image_url', image_url: { url: sourceImageB64 } },
    ...productRefs.map(b => ({ type: 'image_url', image_url: { url: b } })),
  ];
  const cfg = getModelConfig();
  const advanced = supportsAdvancedOptions(model);
  const configAspect = aspectOverride || cfg.aspectRatio;
  // auto из настроек — это «подстройся под источник»; конкретную пропорцию всё равно
  // считаем по исходнику, чтобы не потерять края при финальном fitAspect.
  const aspect = advanced ? (configAspect === 'auto' ? (aspectRatio || 'auto') : configAspect) : (aspectRatio || '3:2');
  // resolution поддерживают Seedream и FLUX 3 Image Klein; FLUX 2 Pro — нет.
  const resolution = advanced && supportsResolution(model) ? (resolutionOverride || cfg.resolution || '1K') : null;
  const body = {
    model,
    prompt,
    aspect_ratio: aspect,
    input_references: refs,
    ...(resolution ? { resolution } : {}),
  };

  const chatBody = {
    model,
    messages: [
      { role: 'user', content: [
        { type: 'text', text: prompt },
        ...refs.map(r => ({ type: 'image_url', image_url: r.image_url })),
      ]},
    ],
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: aspect },
  };

  let lastErr, spent = 0;
  const attempts = [[`${BASE}/images`, body]];
  // chat-completions как fallback имеет смысл только для моделей с image-output в чате.
  // Seedream/FLUX — image-only, их fallback всегда даёт 404 и прячет реальную ошибку /images.
  const allowChat = allowChatFallback === null ? !['seedream', 'flux'].includes(modelFamily(model)) : allowChatFallback;
  if (allowChat) attempts.push([`${BASE}/chat/completions`, chatBody]);
  for (const [attempt, [endpoint, payload]] of attempts.entries()) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(150_000),
      });
      const data = await r.json().catch(() => ({}));
      const cost = typeof data.usage?.cost === 'number' ? data.usage.cost : 0;
      spent += cost;
      if (!r.ok) {
        lastErr = new Error(`${endpoint} ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
        lastErr.cost = cost;
        log({ event: 'render_attempt_error', model, endpoint, attempt: attempt + 1, status: r.status, cost_usd: cost || null, error: String(lastErr.message).slice(0, 500) });
        continue;
      }
      const b64out =
        data.choices?.[0]?.message?.images?.[0]?.image_url?.url?.match(/base64,(.+)$/)?.[1] ||
        data.data?.[0]?.b64_json;
      if (!b64out) {
        lastErr = new Error(`${endpoint}: нет картинки в ответе`);
        lastErr.cost = cost;
        log({ event: 'render_no_image', model, endpoint, attempt: attempt + 1, cost_usd: cost || null });
        continue;
      }
      log({
        event: 'render_endpoint',
        model,
        endpoint,
        attempt: attempt + 1,
        aspect_ratio: aspect,
        resolution,
        refs: refs.length,
        cost_usd: spent || null,
      });
      return { b64: b64out, cost: spent || null, model, endpoint, refs: refs.length, attempts: attempt + 1 };
    } catch (e) {
      lastErr = e;
      log({ event: 'render_attempt_error', model, endpoint, attempt: attempt + 1, error: String(e.message || e).slice(0, 300) });
    }
  }
  if (lastErr) lastErr.cost = spent || lastErr.cost;
  throw lastErr || new Error('generation failed');
}


// Генерация изображения только по тексту (для нейтральных room shells под стилевые референсы).
export async function generateFromText({ prompt, aspectRatio = '3:2' }) {
  const model = getModelConfig().render;
  const cfg = getModelConfig();
  const advanced = supportsAdvancedOptions(model);
  const resolution = advanced && supportsResolution(model) ? (cfg.resolution || '1K') : null;
  const body = {
    model,
    prompt,
    aspect_ratio: advanced ? (cfg.aspectRatio === 'auto' ? aspectRatio : cfg.aspectRatio) : aspectRatio,
    ...(resolution ? { resolution } : {}),
  };
  let lastErr, spent = 0;
  const attempts = [[`${BASE}/images`, body]];
  if (!['seedream', 'flux'].includes(modelFamily(model))) attempts.push([`${BASE}/chat/completions`, {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: body.aspect_ratio },
  }]);
  for (const [attempt, [endpoint, payload]] of attempts.entries()) {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(150_000) });
      const data = await r.json().catch(() => ({}));
      const cost = typeof data.usage?.cost === 'number' ? data.usage.cost : 0;
      spent += cost;
      if (!r.ok) { lastErr = new Error(`${endpoint} ${r.status}: ${JSON.stringify(data).slice(0, 500)}`); lastErr.cost = cost; continue; }
      const b64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url?.match(/base64,(.+)$/)?.[1] || data.data?.[0]?.b64_json;
      if (!b64) { lastErr = new Error(`${endpoint}: нет картинки`); lastErr.cost = cost; continue; }
      log({ event: 'text_image_endpoint', model, endpoint, attempt: attempt + 1, aspect_ratio: body.aspect_ratio, cost_usd: spent || null });
      return { b64, cost: spent || null, model, endpoint };
    } catch (e) { lastErr = e; }
  }
  if (lastErr) lastErr.cost = spent || lastErr.cost;
  throw lastErr || new Error('text image generation failed');
}

// Оценка стилевого референса: стиль, комната, красота, наличие материалов.
export async function scoreStyleReference(imageB64, mime, { style, roomType } = {}) {
  const sys = `Ты арт-директор интерьерного сервиса. Оцени изображение как референс стиля.
Верни строго JSON:
{"style_score":0-10,"room_score":0-10,"beauty_score":0-10,"product_score":0-10,"total":0-10,"issues":["..."],"verdict":"approve|reject"}
style_score — насколько это заявленный стиль; room_score — совпадает ли тип комнаты; beauty_score — редакционное качество, свет, композиция, материалы; product_score — видны ли качественные материалы/мебель/свет, пригодные для дизайна; total — итоговая оценка. issues — только реальные проблемы. Без текста вокруг JSON.`;
  const user = `Стиль: ${style || 'не указан'}. Тип комнаты: ${roomType || 'не указан'}. Оцени этот референс.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: getModelConfig().vision,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: user },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageB64}` } },
        ]},
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { parsed = {}; }
  const num = v => Math.max(0, Math.min(10, Number(v) || 0));
  const out = {
    style_score: num(parsed.style_score),
    room_score: num(parsed.room_score),
    beauty_score: num(parsed.beauty_score),
    product_score: num(parsed.product_score),
    total: num(parsed.total || ((num(parsed.style_score) + num(parsed.room_score) + num(parsed.beauty_score) + num(parsed.product_score)) / 4)),
    issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6) : [],
    verdict: parsed.verdict === 'approve' ? 'approve' : 'reject',
    cost: data.usage?.cost ?? null,
  };
  return out;
}

export async function assessProductEdit({ parentImageUrl, editedImageUrl, productImageUrl, productName = '', target = '' }) {
  const sys = `Ты проверяешь точечную замену товара в интерьерном рендере. Сравни три изображения в порядке передачи: 1 — исходный рендер, 2 — рендер после замены, 3 — карточка товара.
Верни строго JSON без текста вокруг:
{"architecture_preserved":boolean,"product_match":boolean,"no_artifacts":boolean,"quality_not_worse":boolean,"issues":["кратко по-русски"]}
architecture_preserved — камера, архитектура, окна, двери и все объекты кроме целевого сохранены.
product_match — целевой объект виден и узнаваемо совпадает с товаром по форме, цвету, материалу и пропорциям; фон карточки не важен.
no_artifacts — нет дублей, деформаций, плавающих объектов и новых посторонних предметов.
quality_not_worse — свет, композиция, фотографичность и общий визуальный уровень не стали хуже.
Все проверки обязательны. Не угадывай: при сомнении ставь false и объясняй в issues.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: getModelConfig().vision,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: `Проверь замену «${target || 'объект'}» на товар «${productName || 'без названия'}».` },
          { type: 'image_url', image_url: { url: parentImageUrl } },
          { type: 'image_url', image_url: { url: editedImageUrl } },
          { type: 'image_url', image_url: { url: productImageUrl } },
        ] },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { parsed = {}; }
  const checks = {
    architecture_preserved: parsed.architecture_preserved === true,
    product_match: parsed.product_match === true,
    no_artifacts: parsed.no_artifacts === true,
    quality_not_worse: parsed.quality_not_worse === true,
  };
  const accepted = Object.values(checks).every(Boolean);
  return {
    status: accepted ? 'accepted' : 'rejected',
    accepted,
    checks,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 6) : [],
    cost: data.usage?.cost ?? null,
  };
}

// Vision: читаем готовый рендер и достаём материалы, поверхности, электрику и подсказки.
export async function parseRender(renderB64, mime = 'image/png') {
  const sys = `Ты — анализатор интерьерных рендеров. Верни строго JSON-объект без текста вокруг:
{
  "items": [{"category": "bed|wardrobe|sofa|armchair|coffee_table|dining_table|dining_chair|sideboard|desk|office_chair|storage|bench|rug|floor|paint|wallpaper|tile|skirting|countertop|cabinet|faucet|sink|toilet|shower|bathtub|light|outlets|appliance|textile", "description": "кратко по-русски", "keywords": ["3-5 ключевых слов"]}],
  "surfaces": [{"surface": "walls|floor|ceiling|cabinets|countertop|backsplash|textile|trim", "description": "кратко по-русски", "hex": "#RRGGBB"}],
  "visible": ["bed","sofa","pendant light","floor","walls","kitchen cabinets","toilet","shower","..."],
  "electrical": [{"title": "кратко по-русски", "text": "рекомендация по розеткам/свету для этой комнаты"}]
}
Правила:
- items — только реальные отделочные материалы, сантехника, свет, электрика и текстиль. Без декора и растений.
- surfaces — 3-6 главных поверхностей; hex — приблизительный цвет на картинке, без RAL-кодов.
- visible — крупные объекты, которые реально видно.
- electrical — 3-5 практичных рекомендаций с учётом планировки на картинке.
Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: getModelConfig().vision,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: 'Разбери этот интерьер:' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${renderB64}` } },
        ]},
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '{}');
  } catch {
    parsed = {};
  }
  const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
  return {
    items,
    surfaces: Array.isArray(parsed.surfaces) ? parsed.surfaces : [],
    visible: Array.isArray(parsed.visible) ? parsed.visible : [],
    electrical: Array.isArray(parsed.electrical) ? parsed.electrical : [],
    cost: data.usage?.cost ?? null,
  };
}

// Простой матчинг: ключевые слова + штраф за несовпадение цвета. v2 — эмбеддинги.
const COLOR_HINTS = {
  'белый': ['бел', 'светл'],
  'бежевый': ['беж', 'светл'],
  'серый': ['сер', 'камен'],
  'грейдж': ['грейдж', 'сер', 'камен'],
  'графит': ['графит', 'темн', 'черн'],
  'черный': ['черн', 'темн'],
  'тёмный': ['темн', 'графит', 'черн'],
  'темный': ['темн', 'графит', 'черн'],
  'светлый': ['светл', 'бел', 'беж'],
  'антрацит': ['антрацит', 'темн', 'черн'],
  'латунь': ['латун', 'золот', 'brass'],
  'золотой': ['золот', 'латун'],
  'хром': ['хром', 'серебр'],
  'сталь': ['стал', 'серебр'],
  'дерево': ['дерев', 'древес'],
  'коричневый': ['корич', 'дерев', 'орех'],
  'орех': ['орех', 'корич', 'дерев'],
  'оливковый': ['олив', 'зелен', 'шалфей'],
  'терракота': ['террак', 'оранж', 'красн'],
  'меловой': ['мелов', 'бел', 'светл'],
  'песочный': ['песоч', 'беж', 'светл'],
};

export function matchCatalog(items, products) {
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е');
  const results = [];
  for (const it of items.slice(0, 12)) {
    const words = [...(it.keywords || []), it.description || '', it.category || ''].map(norm);
    const text = words.join(' ');
    let best = null, bestScore = 0;
    for (const p of products) {
      if (p.category !== it.category) continue;
      const pwords = norm(p.keywords).split(',').map(w => w.trim());
      let score = pwords.filter(w => w && words.some(x => x.includes(w) || w.includes(x))).length / Math.max(pwords.length, 1);
      const color = norm((p.attrs || {})['цвет'] || '').split(/[ ,/]+/)[0];
      const hints = COLOR_HINTS[color] || (color ? [color] : []);
      if (hints.length && !hints.some(h => text.includes(h))) score *= 0.5;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore >= 0.34) results.push({ product: best, score: bestScore });
  }
  const seen = new Map();
  for (const r of results) if (!seen.has(r.product.id) || seen.get(r.product.id).score < r.score) seen.set(r.product.id, r);
  return [...seen.values()];
}

// Vision для «Найти товары»: подробная карточка видимых предметов и поверхностей.
export async function parseProcurementImage(renderB64, mime = 'image/png', { roomType = '' } = {}) {
  const sys = `Ты — аналитик интерьерного рендера для подбора товаров. Верни строго JSON без текста вокруг:
{
  "room_type": "тип комнаты по-русски",
  "style": "кратко стиль",
  "items": [{
    "key": "bed|nightstand|wardrobe|sofa|armchair|coffee_table|dining_table|dining_chair|sideboard|desk|office_chair|storage|bench|rug|light|decor|floor|walls|ceiling|skirting|tile|paint|wallpaper|countertop|cabinet|faucet|sink|toilet|shower|bathtub|appliance|mirror|curtains|bedding|textile",
    "label": "название предмета по-русски",
    "subtype": "подтип: например прямой диван, подвесной светильник, ламинат",
    "description": "краткое описание",
    "color": "цвет",
    "material": "материал/фактура",
    "shape": "форма/силуэт",
    "keywords": ["3-6 поисковых слов"],
    "bbox": [x, y, w, h],
    "confidence": 0.0,
    "visibility": "seen|hidden|not_seen"
  }],
  "surfaces": [{"surface": "floor|walls|ceiling|backsplash|countertop|textile", "description": "кратко", "color": "цвет", "material": "материал", "hex": "#RRGGBB"}]
}
Правила:
- bbox — нормализованные координаты [x,y,w,h] от 0 до 1 относительно всего кадра; если предмет не видно, null.
- items — только предметы и отделка, которые реально помогут купить аналог. Без брендов, цен и выдуманных артикулов.
- Не добавляй личные вещи, провода, скрытые коммуникации.
- Для сантехники, техники и отделки указывай видимые признаки.
- visibility=seen для видимых, hidden для очевидно нужных, но скрытых (матрас, подложка), not_seen если не применимо.
Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: getModelConfig().vision,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: `Разбери рендер для подбора товаров. Тип комнаты: ${roomType || 'определи сам'}.` },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${renderB64}` } },
        ] },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { parsed = {}; }
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
  const clamp = v => (v === null ? null : Math.max(0, Math.min(1, v)));
  const items = Array.isArray(parsed.items) ? parsed.items.map(item => {
    const bbox = Array.isArray(item?.bbox) && item.bbox.length === 4
      ? item.bbox.map(clamp)
      : null;
    return {
      key: String(item?.key || '').toLowerCase().slice(0, 40),
      label: String(item?.label || '').slice(0, 160),
      subtype: String(item?.subtype || '').slice(0, 160),
      description: String(item?.description || '').slice(0, 300),
      color: String(item?.color || '').slice(0, 80),
      material: String(item?.material || '').slice(0, 80),
      shape: String(item?.shape || '').slice(0, 80),
      keywords: Array.isArray(item?.keywords) ? item.keywords.map(String).slice(0, 6) : [],
      bbox,
      confidence: num(item?.confidence),
      visibility: ['seen', 'hidden', 'not_seen'].includes(item?.visibility) ? item.visibility : 'seen',
    };
  }).filter(item => item.key && item.label).slice(0, 30) : [];
  const surfaces = Array.isArray(parsed.surfaces) ? parsed.surfaces.map(s => ({
    surface: String(s?.surface || '').toLowerCase().slice(0, 40),
    description: String(s?.description || '').slice(0, 300),
    color: String(s?.color || '').slice(0, 80),
    material: String(s?.material || '').slice(0, 80),
    hex: /^#[0-9a-f]{6}$/i.test(String(s?.hex || '')) ? String(s.hex) : null,
  })).slice(0, 8) : [];
  return {
    room_type: String(parsed.room_type || roomType || '').slice(0, 80),
    style: String(parsed.style || '').slice(0, 120),
    items,
    surfaces,
    cost: data.usage?.cost ?? null,
  };
}

// Сравнение фрагмента рендера с фото товара. Возвращает 0-100 и объяснение.
export async function scoreProductMatch({ referenceImageUrl, candidateImageUrl, itemDescription = '', candidateName = '' }) {
  const sys = `Ты сравниваешь предмет на интерьерном рендере с фото товара из магазина.
Верни строго JSON: {"score":0-100,"color":0-100,"material":0-100,"shape":0-100,"size":0-100,"reasons":["кратко по-русски"]}
score — общее визуальное сходство именно тип/форма/цвет/материал, не цена и не бренд.
80+ — очень похожий товар; 70-79 — допустимая альтернатива; ниже — не тот товар.
При сомнении снижай score. Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: getModelConfig().vision,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: `Предмет на рендере: ${itemDescription || 'без описания'}. Товар: ${candidateName || 'без названия'}.` },
          { type: 'image_url', image_url: { url: referenceImageUrl } },
          { type: 'image_url', image_url: { url: candidateImageUrl } },
        ] },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { parsed = {}; }
  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
  return {
    score,
    breakdown: {
      color: Math.max(0, Math.min(100, Number(parsed.color) || 0)),
      material: Math.max(0, Math.min(100, Number(parsed.material) || 0)),
      shape: Math.max(0, Math.min(100, Number(parsed.shape) || 0)),
      size: Math.max(0, Math.min(100, Number(parsed.size) || 0)),
    },
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 5) : [],
    cost: data.usage?.cost ?? null,
  };
}

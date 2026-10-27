// Клиент OpenRouter: рендер через Image API, разбор рендера через chat/completions (vision).
// Документация: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
// Если задан HTTPS_PROXY/S3-прокси — гоним через него (нативный fetch env-прокси не читает).

import { roomTypeByName } from './roomtypes.js';
import { getModelConfig } from './modelconfig.js';
import { supportsAdvancedOptions } from './modelcaps.js';
import { PRICE_TIER_META, SLOT_LABELS, normalizeTier } from './pricing.js';

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
  imageMap = [],
}) {
  const tierKey = normalizeTier(priceTier);
  const tier = PRICE_TIER_META[tierKey];
  const styleDesc = styleDescription || STYLES[style] || STYLES['Современный'];
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || 'room shown in the source photo';
  const keep = String(room?.keep || 'camera angle, perspective, walls, windows, doors, ceiling height and room proportions').replace(/\.+$/, '');
  const change = String(room?.change || 'finishes, lighting, textiles, decor and styling that match the chosen style').replace(/\.+$/, '');
  const roomRules = room ? `${room.guidance} ${room.forbid}`.replace(/\s+/g, ' ').trim() : 'Keep the room purpose exactly as in the source photo.';
  const roles = imageRolesText(imageMap);

  if (iteration) {
    return `${roles}
This is a ${roomName}. Apply ONLY this change to the interior: "${requestText}".
Keep everything else exactly as in the source image: camera, geometry, architecture, large furniture, floor, walls, lighting and decor.
Do not restyle the room. Do not move objects. Photorealistic result.`;
  }

  const styleRefText = hasStyleRef
    ? (userStyleRef
      ? 'The user style reference is the primary target. Follow its mood, materials, palette, furniture character and level of detail. Do not copy its layout, architecture or camera angle.'
      : 'The style reference defines the target mood, materials, palette, furniture character and level of detail. Do not copy its layout, architecture or camera angle.')
    : 'There is no separate style reference. Build the style from the description and the selected materials.';
  const colors = [
    PALETTES[palette] ? `Color scheme: ${PALETTES[palette]}.` : '',
    ACCENTS[accent] ? `Accent color: ${ACCENTS[accent]}.` : '',
  ].filter(Boolean).join(' ');

  return `${roles}

TASK
Create a photorealistic, editorial-quality photograph of this ${roomName} after a deep renovation in ${styleDesc} style.
The result must feel like a completed designer renovation, not a moodboard or a furniture showroom. Deeply transform the finishes, lighting, textiles, decor and styling while keeping the architecture believable and buildable.

KEEP EXACTLY
${keep}.
Keep the room purpose exactly as a ${roomName}. Do not move plumbing, electrical points, windows or doors.

CHANGE / DEEP TRANSFORMATION
${change}.
If a floor product is listed below, replace the floor finish with it. If no floor product is listed, preserve the existing floor. The same applies to walls: change only when a wall finish is listed.
You may restyle upholstery, headboards and cabinet fronts, but keep the size and realistic position of large furniture.

ROOM RULES
${roomRules}

MATERIAL PALETTE — use these products where they fit
${productsText(products)}
Use the palette as the material and color source. For large surfaces (floor, walls, countertop, cabinet fronts), match the listed product exactly. For lighting, plumbing and sockets, match the form and finish where visible. Use the listed dimensions as physical scale: furniture must look its real size relative to the room, and tile/plank patterns must match the stated format. Do not shrink a 220 cm sofa into an armchair or turn a 60×120 tile into a mosaic. Do not force a product into the frame if it is not visible from this camera angle. Do not add unlisted large furniture or fixtures. Small decor, plants and textiles may be added to complete the styling.

STYLE
${styleRefText}
${colors}

MATERIAL CLASS
${tier.promptName || tier.name} — ${tier.prompt}
The selected products already match this class; keep the rest of the room consistent with it.

OUTPUT
Photorealistic interior photograph, natural realistic lighting, believable materials, correct proportions, high detail, livable styling. No text, no watermarks, no people, no extra windows or doors, no duplicated furniture, no distorted geometry, no cartoon or CGI look.`;
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

async function generateWithModel(model, { prompt, sourceImageB64, referenceImagesB64, aspectRatio }) {
  const productRefs = INPUT_REFS_OK ? referenceImagesB64 : [];
  const refs = [
    { type: 'image_url', image_url: { url: sourceImageB64 } },
    ...productRefs.map(b => ({ type: 'image_url', image_url: { url: b } })),
  ];
  const cfg = getModelConfig();
  const advanced = supportsAdvancedOptions(model);
  // auto из настроек — это «подстройся под источник»; конкретную пропорцию всё равно
  // считаем по исходнику, чтобы не потерять края при финальном fitAspect.
  const aspect = advanced ? (cfg.aspectRatio === 'auto' ? (aspectRatio || 'auto') : cfg.aspectRatio) : (aspectRatio || '3:2');
  const resolution = advanced ? (cfg.resolution || '1K') : null;
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
  for (const [attempt, [endpoint, payload]] of [[`${BASE}/images`, body], [`${BASE}/chat/completions`, chatBody]].entries()) {
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
        lastErr = new Error(`${endpoint} ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
        lastErr.cost = cost;
        log({ event: 'render_attempt_error', model, endpoint, attempt: attempt + 1, status: r.status, cost_usd: cost || null });
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
  const body = {
    model,
    prompt,
    aspect_ratio: advanced ? (cfg.aspectRatio === 'auto' ? aspectRatio : cfg.aspectRatio) : aspectRatio,
    ...(advanced && cfg.resolution ? { resolution: cfg.resolution } : {}),
  };
  let lastErr, spent = 0;
  for (const [attempt, [endpoint, payload]] of [[`${BASE}/images`, body], [`${BASE}/chat/completions`, {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: body.aspect_ratio },
  }]].entries()) {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(150_000) });
      const data = await r.json().catch(() => ({}));
      const cost = typeof data.usage?.cost === 'number' ? data.usage.cost : 0;
      spent += cost;
      if (!r.ok) { lastErr = new Error(`${endpoint} ${r.status}: ${JSON.stringify(data).slice(0, 300)}`); lastErr.cost = cost; continue; }
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

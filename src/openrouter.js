// Клиент OpenRouter: рендер через Image API, разбор рендера через chat/completions (vision).
// Документация: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
// Если задан HTTPS_PROXY/S3-прокси — гоним через него (нативный fetch env-прокси не читает).

import { roomTypeByName } from './roomtypes.js';
import { getModelConfig } from './modelconfig.js';
import { supportsAdvancedOptions, modelFamily, supportsResolution } from './modelcaps.js';
import { PRICE_TIER_META, SLOT_LABELS, normalizeTier } from './pricing.js';
import { getPromptConfig } from './promptconfig.js';
import { buildScalePlan } from './scaleplan.js';

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
let imageChain = Promise.resolve();
let lastImageStart = 0;
const IMAGE_MIN_GAP_MS = Math.max(0, Number(process.env.IMAGE_MIN_GAP_MS || 10_000));

function withImageSlot(fn) {
  const run = imageChain.then(async () => {
    const wait = Math.max(0, IMAGE_MIN_GAP_MS - (Date.now() - lastImageStart));
    if (wait) await sleep(wait);
    lastImageStart = Date.now();
    return fn();
  });
  imageChain = run.catch(() => {});
  return run;
}


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
      if (r.status === 429) {
        const retryAfter = Number(r.headers.get('retry-after') || 0);
        if (retryAfter > 0) await sleep(Math.min(20_000, retryAfter * 1000));
      }
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

// Единый vision-запрос с JSON-ответом. Используется арт-директором и другими
// вспомогательными анализами, чтобы не дублировать парсинг/заголовки.
export async function visionJson({ system = '', user = '', images = [], model = null } = {}) {
  if (MOCK_MODE) return { parsed: {}, cost: null };
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: model || getModelConfig().vision,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        {
          role: 'user',
          content: [
            { type: 'text', text: user },
            ...images.filter(Boolean).map(url => ({ type: 'image_url', image_url: { url } })),
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { parsed = {}; }
  return { parsed, cost: data.usage?.cost ?? null };
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
  'Ваби-саби': 'wabi-sabi interior, rough lime plaster, clay, reclaimed wood, undyed linen, raw stone, imperfection, 2200–2700K soft light',
  'Органик модерн': 'organic modern interior, clean curved silhouettes, travertine, white oak, bouclé, linen, rattan, warm indirect 2700–3000K light',
  'Тёплый минимализм': 'warm minimalist interior, off-white and greige, hidden storage, pale wood, textured plaster, one saturated accent, 2700–3000K indirect light',
  'Биофильный': 'biophilic interior, living wall, abundant plants, warm wood, textured stone, cork and jute, full-spectrum daylight with 3000K evening light',
  'Современная классика': 'modern heritage interior, updated moldings and paneling, warm white and tobacco, walnut, velvet, marble, unlacquered brass, layered 2700K light',
  'Новый максимализм': 'new maximalist interior, curated jewel tones, velvet, silk, brass, dark wood, gallery wall, layered dramatic 2700K light',
  'Средиземноморский модерн': 'Mediterranean modern interior, warm lime plaster, terracotta, arches, rattan, linen, unglazed ceramics, warm 3000–3500K light',
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

function fillTemplate(text, vars = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] == null ? '' : String(vars[key]));
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
  dimensions = null,
  artDirection = '',
  layoutPlan = '',
  framingNote = '',
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
  const change = fullChange
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !(keepFurniture ? /\b(replace|restyle|rearrange|reposition|move)\b/i : /\b(rearrange|reposition|move)\b/i).test(sentence))
    .join(' ') || 'Update surface finishes, textiles, lighting and decor without changing the room layout.';
  const roomRules = room ? `${room.guidance} ${room.forbid}`.replace(/\s+/g, ' ').trim() : 'Keep the room purpose exactly as in the source photo.';
  const styling = 'Add tasteful textiles, art, plants, books, ceramics and warm layered lighting; make it feel finished and lived-in. All decor must stay inside the existing wall, floor and ceiling planes. Use only existing shelves, ledges and niches; never add a new built-in, ledge, cove or wall panel.';
  const wetRoom = /санузел|ванн|туалет|bath|wc/i.test(roomName);
  const furniturePlacement = wetRoom
    ? 'Follow the FURNITURE PLAN exactly. Keep at least 60 cm clear in front of every fixture; use compact fixtures; do not exceed the room width or block the door swing.'
    : 'Follow the FURNITURE PLAN exactly. Place each item only where the plan says; keep the stated walkways clear; do not place a bed, sofa or wardrobe wider or longer than the plan.';
  const livedInDetails = /спальн|bedroom/i.test(roomName)
    ? 'slippers by the bed, a ceramic mug on the nightstand, an open book, a laptop on the desk, a soft throw, a cat curled on the bed or chair'
    : /гостин|зал|living/i.test(roomName)
      ? 'a coffee cup on the table, an open book, a laptop, a soft throw, a cat on the sofa'
      : /кухн|kitchen/i.test(roomName)
        ? 'a coffee cup, a cutting board with fruit, a linen towel, a cat on a chair (never on the counter)'
        : /санузел|ванн|туалет|bath/i.test(roomName)
          ? 'folded towels, soap, a candle, a small plant, slippers (no food, laptop or cat in the wet zone)'
          : 'a coffee cup, an open book, a soft throw, a small plant, a cat on a chair';
  const rules = getPromptConfig();
  const furnitureRule = keepFurniture ? rules.furnitureOn : rules.furnitureOff;
  const catalogText = useCatalog
    ? productsText(products)
    : 'No catalog products are used for this render. Choose materials, lighting and furniture that best fit the style and the room. Do not add a product list or estimate.';
  const catalogRule = useCatalog ? rules.catalogOn : rules.catalogOff;
  const roles = imageRolesText(imageMap);
  const hasRoomDimensions = Boolean(dimensions
    && Number(dimensions.width) > 0
    && Number(dimensions.length) > 0
    && Number(dimensions.height) > 0);
  const dimensionsText = hasRoomDimensions
    ? fillTemplate(rules.dimensions, {
        room: roomName,
        width: Number(dimensions.width),
        length: Number(dimensions.length),
        height: Number(dimensions.height),
        orientation: dimensions.orientation || 'not specified by the user',
      })
    : '';
  const scalePlanInner = hasRoomDimensions
    ? buildScalePlan({ roomType, ...dimensions })
    : '';
  const scalePlanText = scalePlanInner
    ? fillTemplate(rules.scalePlan, { room: roomName, plan: scalePlanInner })
    : '';
  const bedText = Number(dimensions?.bedLength) > 0
    ? fillTemplate(rules.bed, { room: roomName, bed_length: Number(dimensions.bedLength) })
    : '';
  const radiatorsText = fillTemplate(rules.radiators, { room: roomName });
  const scaleText = [dimensionsText, scalePlanText, bedText, radiatorsText].filter(Boolean).join('\n\n');
  const architectureLock = `ARCHITECTURE LOCK — HIGHEST PRIORITY
This is the SAME physical room, not a new room. This is a cosmetic renovation only. The source image is a photograph of the actual room; do not redesign its architecture.
LOCKED INVARIANTS — do not violate any of these:
- Camera: same position, eye height, focal length, perspective, horizon, framing, crop and aspect ratio. Same left/right and top/bottom composition. No zoom, pan, tilt, room widening or narrowing.
- Room volume: same width, depth, ceiling height, wall planes, floor plane, soffits, beams, columns, niches and arches. Do not add, remove, move, resize, open or close any wall, window, door, niche, beam, column, arch, cove, ceiling recess, skylight or room volume.
- Windows: same count, size, shape, position, sill, reveal, frame, glazing bars and radiator niche. Do not add a second window. Do not widen, raise, lower or move the window.
- Doors: same count, size, position, frame, handle and swing. Do not add a doorway, hallway or second room.
- Built-ins are architecture, not furniture: built-in wardrobes, mirrored wardrobe, kitchen cabinets, shelving, niches, wall panels, banquettes, media walls and radiator grilles. Preserve their exact footprint, depth, height, bay divisions, shelf spacing and vertical dividers. Do not remove shelves, add niches, change the ceiling line, add beams or columns.
- Electrical: preserve the exact position of every visible outlet, switch, ceiling light point, radiator, pipe, vent, TV and wall-mounted item. New lights may use only existing points; do not add new recessed, cove, track or wall lights.
- Mirrors and reflections are reflections, not openings: do not turn a mirrored wardrobe or mirror reflection into a window, door or new room.
- If a design idea conflicts with any locked invariant, keep the architecture and change the finish or decor instead.`;

  if (iteration) {
    return `${roles}

${architectureLock}

Apply ONLY this change to the interior: "${requestText}".
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
Create a photorealistic, aspirational editorial photograph of the SAME ${roomName} after a furniture and finish redesign in the selected style.
This is not a new room and not a structural renovation: the walls, windows, doors, ceiling, room volume and camera must remain identical to the source. Furniture and fixtures may be rearranged inside the room, but every item must fit the stated dimensions and the FURNITURE PLAN.
The result must feel like a completed designer renovation with a genuine WOW effect: the kind of image that makes the viewer want to live in this room and save it to a Pinterest board. It must not look like a moodboard, a sterile furniture showroom or an empty staged flat.
This is the art-direction pass. Design the strongest room first; do not turn the image into a catalog assembly. Specific hero products can be attached later in separate local edits.

${architectureLock}
${artDirection ? `\nART DIRECTION — BESPOKE FOR THIS ROOM\nWritten by the art director from the source photo. Follow it for palette, materials, focal point, lighting, textiles and styling. If it conflicts with the ARCHITECTURE LOCK, the scale plan or the furniture plan, keep the architecture, dimensions and furniture plan.\n${artDirection}\n` : ''}
${scaleText ? `\n${scaleText}\n` : ''}
${layoutPlan ? `\nFURNITURE PLAN — HARD DIMENSIONS (OVERRIDES ART DIRECTION)\n${layoutPlan}\nUse exactly these furniture sizes, positions and walkways. Do not show furniture larger than the plan or block the stated walkways. If the ART DIRECTION suggests a larger item or a different position, follow this plan and shrink or remove the conflicting item. Keep the room the same physical width and do not widen it. The plan describes the WHOLE room, not the whole frame: the camera may see only part of it. Do not force out-of-frame items into the shot; omit them instead of cramming or moving them.\n` : ''}
${framingNote ? `\nVISIBLE COMPOSITION — DO NOT CRAM\n${framingNote}\nThe camera sees only part of the room. Do not force every planned item into the frame; items outside the frame may be omitted. Do not move furniture just to make it visible. The image must read as a natural photo of the room, not a catalog of everything that fits.\n` : ''}
KEEP EXACTLY
${keep}.
Keep the room purpose exactly as a ${roomName}. Do not move plumbing, electrical points, windows or doors.

FURNITURE MODE
${furnitureRule}

FURNITURE PLACEMENT
${furniturePlacement}

CHANGE / DEEP TRANSFORMATION
${change}.
If a floor product is listed below, change only its surface finish; do not change the floor plane or geometry. If no floor product is listed, preserve the existing floor. Style words such as "light oak" refer to furniture and joinery only, not to replacing the floor unless a floor product is explicitly listed. The same applies to walls: change only the surface finish when a wall finish is listed.
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
Add generous but tasteful small details: layered textiles, cushions, throws, curtains, rugs, framed art, books, ceramics, candles, trays, plants and sculptural objects. All decor must sit inside the existing room volume; do not alter wall, floor or ceiling planes, corners, perspective, plinth or room proportions. Use warm layered lighting — ceiling, bedside/floor lamps, cove and accent light — with soft shadows and tactile material contrast. Layer soft textures and warm pools of light. The room must feel cozy, inhabited, warm, calm and aspirational, like a boutique hotel suite or a designer portfolio. Never a bare mattress, empty walls or a cold showroom.

LIVED-IN DETAILS — MAKE IT FEEL REAL
Add 2–4 of these naturally: ${livedInDetails}. A pet (cat) is allowed only if it looks realistic and does not block architecture, furniture or walkways; otherwise omit it. Do not turn the room into clutter.

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

STYLE BRIEF
${styleDesc}

STYLE REFERENCE
${styleRefText}
The art reference is for palette, materials and light temperature ONLY. Ignore all architecture in the reference: windows, doors, sloped ceilings, niches, bay windows, beams, room size, layout and camera. Do not transfer any architectural feature from the reference.
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
LOCKED INVARIANTS — HIGHEST PRIORITY:
- The same physical room, camera position, eye height, focal length, perspective, framing and aspect ratio.
- Preserve room layout, ceiling height, window placement and size, wall positions, doorways, plinth, floor plane, built-ins, niches, columns and beams.
- Built-in shelving, wardrobe, kitchen cabinets, niches and wall panels are architecture, not furniture: preserve footprint, depth, height, bay divisions, shelf spacing and vertical dividers. Do not remove shelves or add niches.
- Preserve existing electrical points: outlets, switches and ceiling light positions. Do not add new light points, coves, tracks or recesses.
- If a design idea conflicts with a locked invariant, keep the architecture and change only the target object.
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

export async function generateRender({ prompt, sourceImageB64, referenceImagesB64 = [], aspectRatio, model = null }) {
  return generateWithModel(model || getModelConfig().render, { prompt, sourceImageB64, referenceImagesB64, aspectRatio });
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
  const allowChat = allowChatFallback === null
    ? !/^(?:bytedance-seed\/seedream|black-forest-labs\/flux|openai\/gpt-image|krea\/)/.test(model)
    : allowChatFallback;
  if (allowChat) attempts.push([`${BASE}/chat/completions`, chatBody]);
  for (const [attempt, [endpoint, payload]] of attempts.entries()) {
    try {
      let r;
      for (let tryNo = 0; tryNo < 4; tryNo++) {
        const doFetch = () => fetch(endpoint, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(150_000),
        });
        r = endpoint.endsWith('/images') ? await withImageSlot(doFetch) : await doFetch();
        if (r.status === 429 && tryNo < 3) {
          const retryAfter = Number(r.headers.get('retry-after') || 0);
          const wait = Math.max(10, Math.min(60, retryAfter || (10 * 2 ** tryNo)));
          log({ event: 'render_rate_limited', model, endpoint, attempt: tryNo + 1, wait_s: wait });
          await sleep(wait * 1000);
          continue;
        }
        break;
      }
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

// Vision: оцениваем реальные габариты комнаты по фото. Это подсказка, а не измерение.
export async function estimateRoomDimensions(imageB64, mime = 'image/jpeg', { roomType = '' } = {}) {
  const sys = `Ты эксперт по интерьерной фотографии и оценке масштаба. По одной фотографии комнаты оцени её реальные внутренние габариты.
Опирайся на типовые размеры: дверь 2.0–2.1 м, длина кровати 2.0 м, глубина кухонных шкафов 0.6 м, высота стула 0.45 м, плитка/панели, рост человека. Учитывай перспективу и ширину объектива, не путай визуальную ширину с реальной.
Верни строго JSON без текста вокруг:
{"width_m": number, "length_m": number, "height_m": number, "bed_present": boolean, "confidence": "low|medium|high", "reasoning": "кратко по-русски", "assumptions": ["..."]}
width_m — ширина комнаты, length_m — длина, height_m — высота от пола до потолка, в метрах. Округляй до 0.1 м. Не выдумывай точность: если масштаб неочевиден, дай разумную оценку и confidence low. Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: getModelConfig().vision,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: `Тип комнаты: ${roomType || 'не указан'}. Оцени внутренние габариты.` },
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
  const measure = (value, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) return null;
    return Math.round(number * 10) / 10;
  };
  const confidence = ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low';
  return {
    width_m: measure(parsed.width_m, 1.5, 20),
    length_m: measure(parsed.length_m, 1.5, 30),
    height_m: measure(parsed.height_m, 2, 6),
    bed_present: parsed.bed_present === true,
    confidence,
    reasoning: String(parsed.reasoning || '').slice(0, 300),
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String).slice(0, 4).map(s => s.slice(0, 160)) : [],
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
- Для кровати описывай каркас, изголовье и ножки. Не описывай цвет постельного белья как цвет кровати.
- Для светильника описывай форму плафона, материал, цвет и подвес. Не путай светильник с окном.
- bbox — координаты всего предмета включая изголовье/ножки; не обрезай предмет.
- visibility=seen для видимых, hidden для очевидно нужных, но скрытых (матрас, подложка), not_seen если не применимо.
Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: process.env.PROCUREMENT_VISION_MODEL || 'google/gemini-3.1-pro-preview',
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
Верни строго JSON: {"score":0-100,"color":0-100,"material":0-100,"shape":0-100,"size":0-100,"reasons":["кратко по-русски"],"next_query":"если score<70 — короткий запрос на русском, который поможет найти более близкий товар"}
score — общее визуальное сходство именно тип/форма/цвет/материал, не цена и не бренд.
80+ — очень похожий товар; 70-79 — допустимая альтернатива; ниже — не тот товар.
Карточка товара часто на белом фоне: не снижай оценку за фон, ракурс и освещение, сравнивай сам предмет.
При сомнении снижай score. Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: process.env.PROCUREMENT_VISION_MODEL || 'google/gemini-3.1-pro-preview',
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
    next_query: typeof parsed.next_query === 'string' ? parsed.next_query.slice(0, 160) : null,
    cost: data.usage?.cost ?? null,
  };
}

// Architecture QA: сравниваем исходное фото и результат, чтобы не отдавать "другую комнату".
export async function assessArchitecture({ sourceImageUrl, renderImageUrl }) {
  const sys = `Ты проверяешь, сохранил ли сгенерированный интерьер архитектуру исходной комнаты.
Image 1 — исходное фото. Image 2 — сгенерированный рендер.
Верни строго JSON:
{"architecture_preserved":true|false,"camera_preserved":true|false,"windows_preserved":true|false,"doors_preserved":true|false,"room_proportions_preserved":true|false,"builtins_preserved":true|false,"ceiling_preserved":true|false,"issues":["..."]}
Проверяй ТОЛЬКО архитектуру, не мебель, не отделку, не декор, не свет и не цвет.
- camera_preserved: та же камера, ракурс, высота глаз, фокусное расстояние, кадрирование.
- windows_preserved: то же количество, размер и положение окон.
- doors_preserved: то же количество, размер и положение дверей/проёмов.
- room_proportions_preserved: та же ширина, глубина, высота потолка и пропорции комнаты; комната не расширена и не сужена.
- builtins_preserved: те же встроенные шкафы, стеллажи, ниши, зеркальные панели, радиаторы и розетки.
- ceiling_preserved: плоскость потолка не изменена; допускаются существующие швы, стыки панелей и отражения света.
Если добавлено/убрано/перемещено окно, дверь, проём, мансардное окно, ниша, балка, колонна, или изменены пропорции комнаты/ракурс — architecture_preserved=false.
Игнорируй новые швы на потолке, отражения, покраску, мебель, шторы, декор и освещение. Только JSON.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: process.env.ARCHITECTURE_QA_MODEL || 'google/gemini-3.1-pro-preview',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: 'Проверь архитектуру комнаты.' },
          { type: 'image_url', image_url: { url: sourceImageUrl } },
          { type: 'image_url', image_url: { url: renderImageUrl } },
        ] },
      ],
      response_format: { type: 'json_object' },
    }),
  }, { retries: 4, timeoutMs: 30_000 });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { parsed = {}; }
  const checks = {
    architecture_preserved: parsed.architecture_preserved === true,
    camera_preserved: parsed.camera_preserved === true,
    windows_preserved: parsed.windows_preserved === true,
    doors_preserved: parsed.doors_preserved === true,
    room_proportions_preserved: parsed.room_proportions_preserved === true,
    builtins_preserved: parsed.builtins_preserved === true,
    ceiling_preserved: parsed.ceiling_preserved === true,
  };
  const accepted = checks.camera_preserved &&
    checks.windows_preserved &&
    checks.doors_preserved &&
    checks.room_proportions_preserved &&
    checks.ceiling_preserved;
  return {
    accepted,
    checks,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 8) : [],
    cost: data.usage?.cost ?? null,
  };
}

export async function assessDimensions({ sourceImageUrl, renderImageUrl, roomType = '', dimensions = null, plan = '', framing = '' }) {
  const w = Number(dimensions?.width) || 0;
  const l = Number(dimensions?.length) || 0;
  const h = Number(dimensions?.height) || 0;
  const system = `Ты строгий QA-инженер по эргономике интерьера. Image 1 — исходная/пустая комната, Image 2 — рендер.
Проверяй ТОЛЬКО то, что видно в кадре. Не требуй показать предметы, которые находятся вне кадра или за камерой: план описывает всю комнату, а кадр — только её часть.
Верни строго JSON:
{"accepted":true|false,"score":0-10,"checks":{"furniture_fits":true|false,"walkways_clear":true|false,"no_oversized":true|false,"room_not_widened":true|false},"issues":["..."]}
- furniture_fits: мебель по размеру соответствует комнате и плану.
- walkways_clear: проходы не заблокированы; там, где это видно, минимум ~60 см.
- no_oversized: нет кровати/дивана/шкафа, которые явно шире/длиннее комнаты или плана.
- room_not_widened: комната не расширена и не растянута.
Если предмета не видно в кадре — это НЕ ошибка. Не придумывай проблемы. Только JSON.`;
  const user = `Комната: ${roomType || 'room'}. Размеры: ${w}×${l}×${h} м. План на всю комнату: ${plan || 'нет'}. Что видит камера: ${framing || 'определи по фото'}. Оцени видимую композицию.`;
  const { parsed, cost } = await visionJson({ system, user, images: [sourceImageUrl, renderImageUrl] });
  const checks = {
    furniture_fits: parsed.checks?.furniture_fits === true,
    walkways_clear: parsed.checks?.walkways_clear === true,
    no_oversized: parsed.checks?.no_oversized === true,
    room_not_widened: parsed.checks?.room_not_widened === true,
  };
  const accepted = parsed.accepted === true
    || (checks.furniture_fits && checks.walkways_clear && checks.no_oversized && checks.room_not_widened);
  return {
    accepted,
    score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
    checks,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 5) : [],
    cost: cost ?? null,
  };
}

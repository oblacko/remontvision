// Редактируемые из админки правила базового промта. Хранятся в app_settings (prompt.rules.v1).
// Код комнат, стилей и товаров остаётся в roomtypes/openrouter, а art direction — здесь.
export const PROMPT_FIELDS = [
  { key: 'lighting', label: 'Свет', help: 'Главный вау-инструмент: слои, cove, подсветка, запреты.' },
  { key: 'dimensions', label: 'Размеры комнаты', help: 'Реальные метры: {room}, {width}, {length}, {height}, {orientation}.' },
  { key: 'geometryLock', label: 'Геометрия — нерушимая секция', help: 'Метры и запреты на окна/двери/высоту/перспективу: {measurements}, {openings}.' },
  { key: 'scalePlan', label: 'План масштаба', help: 'Обёртка вокруг вычисленного плана мебели и проходов: {room}, {plan}.' },
  { key: 'bed', label: 'Кровать', help: 'Длина кровати: {room}, {bed_length}.' },
  { key: 'radiators', label: 'Радиаторы', help: 'Вентилируемые экраны; не выдумывать радиаторы и не закрывать вентиляцию.' },
  { key: 'cleanup', label: 'Уборка и техника', help: 'Что убрать/спрятать: радиатор, ТВ, провода, старые вещи.' },
  { key: 'window', label: 'Окна и текстиль', help: 'Шторы, жалюзи, карнизы, тюль.' },
  { key: 'pinterest', label: 'Pinterest-стайлинг', help: 'Арт, полки, мелочи, техника, плюш, 3–5 сцен.' },
  { key: 'photo', label: 'Фотография', help: 'Камера, свет, плёнка, color grading, запрет CGI.' },
  { key: 'furnitureOn', label: 'Мебель: оставить', help: 'Правило, когда «Оставить мебель» включено.' },
  { key: 'furnitureOff', label: 'Мебель: не учитывать', help: 'Правило, когда мебель можно убрать/заменить.' },
  { key: 'catalogOn', label: 'Каталог: включён', help: 'Как использовать товары и смету.' },
  { key: 'catalogOff', label: 'Каталог: выключен', help: 'Свободный дизайн без товаров.' },
  { key: 'extra', label: 'Дополнительно', help: 'Свободный текст, добавляется в конец art direction.' },
  { key: 'avoid', label: 'Запреты', help: 'Негативный список в конце промта.' },
];

export const DEFAULT_PROMPT_CONFIG = {
  lighting: 'Draw light only from the existing electrical points and ceiling/wall positions. Keep the ceiling plane flat; a subtle warm LED strip is allowed only if a cove already exists in the source. Layer warm 2700–3000K light through the existing ceiling fixture and plug-in lamps such as a floor lamp near seating and a small table lamp where the composition needs a soft pool. Choose each fixture for the interior rather than copying a fixture from an art reference. Keep every source warm and softly diffused, with bulbs and wiring concealed.',
  dimensions: `ROOM DIMENSIONS AND SCALE — MANDATORY
Room type: {room}.
Known clear internal dimensions:
- Room width: {width} metres.
- Room length: {length} metres.
- Finished floor-to-ceiling height: {height} metres.
Dimension orientation: {orientation}
These measurements describe the existing room. Use them as real-world scale constraints for furniture selection and arrangement. Preserve the source photo geometry, camera position, perspective and framing; keep the apparent room width, depth and ceiling height identical to Image 1.
Scale all furniture consistently with these dimensions. Arrange furniture so that doors can open and windows, heating controls and storage remain accessible. Account for the physical depth of radiator covers when arranging furniture and circulation routes; treat radiator covers as real three-dimensional objects.
If the proposed composition is too crowded, choose smaller supporting furniture or omit secondary pieces. Keep the room dimensions unchanged and keep furniture naturally scaled.
Keep the final image free of dimension lines, arrows, labels, floor plans or measurement text.`,
  geometryLock: `GEOMETRY LOCK — IMMUTABLE INVARIANTS
{measurements}
This is the same physical room with the same camera. Keep every invariant exactly as in Image 1:
- Windows: keep the exact count, position, width, height, sill level, reveal depth, frame and glazing bars. The window set stays unchanged.
- Doors: keep the exact count, position, width, height, frame, swing and threshold. The doorway set stays unchanged.
- Ceiling: keep the exact height and flat plane.
- Perspective: keep the same camera position, eye height, focal length, horizon, framing and aspect ratio.
- Walls: keep the same wall planes, corners, columns, beams, niches and soffits.
- Floor plane: keep the same level and geometry; change only the surface finish.
- If a design idea conflicts with any invariant, change only the finish, furniture or decor.
{openings}`,
  scalePlan: `SCALE PLAN — FURNITURE MUST FIT THESE CONSTRAINTS
{plan}
Use these sizes and clearances as real-world constraints for any furniture that is added, replaced or moved. Keep furniture naturally scaled and keep the room dimensions and camera view unchanged. If the requested composition is impossible, choose smaller furniture and show the honest compromise.`,
  bed: `BED SIZE — MANDATORY
Include a bed with an overall external length of exactly {bed_length} metres, measured from the head end to the foot end, including its frame. This measurement refers to the whole bed, not just the mattress.
The bed width is not specified. Choose a width appropriate to the room’s layout and available circulation space.
Keep the bed realistically proportioned at its full {bed_length} m length. Choose a headboard and footboard that fit within that overall length and leave comfortable circulation.`,
  radiators: `RADIATOR COVERS — REQUIRED WHEN RADIATORS ARE PRESENT
If any heating radiators are visible in Image 1, visually conceal each of them behind a purpose-designed decorative radiator cover. Keep the actual radiator and heating connections in their original positions; keep the heating system unchanged.
Design the covers as understated elements coordinated with the room’s palette, materials and selected style:
- Clean, simple proportions.
- A visually lightweight, slatted or perforated front.
- Warm off-white, a matching wall colour or a suitable natural-wood appearance.
Use one coherent cover design throughout the room.
Show a clearly ventilated construction:
- An open grille, spaced slats or substantial perforations at the front.
- An unobstructed lower air inlet.
- A continuous upper grille or open outlet for rising warm air.
Avoid a sealed box or a solid cabinet that visually traps the radiator behind an unventilated surface.
Keep thermostatic valve heads and controls accessible and outside the enclosed warm-air pocket. Show valve heads outside the cover.
Make the front panel appear removable for maintenance. Allow plausible clearance around the radiator without inventing precise installation dimensions.
Keep the cover proportionate to the existing radiator. Keep it as a slim grille rather than a full wall of cabinetry or an oversized bench. Keep the top clear of upholstered seating, cushions or storage.
Where the radiator is beneath a window:
- Preserve the window’s dimensions and original position.
- Keep the cover below the window opening.
- Keep the window fully operable.
- Keep the upper ventilation outlet clear of curtains and objects.
Keep separate wall ventilation grilles and air vents uncovered. Add radiator covers only where radiators are actually present.
These covers are part of the visual design concept, not a technical installation specification.`,
  cleanup: 'Remove visual noise: old TVs, cable boxes, exposed wires, dangling cables, window air conditioners, old chandeliers, tired wall art, cheap plastic blinds, old roller blinds, torn or yellowed curtains, clutter and visible meters. Keep the window sill, the wall plane under the window, the radiator niche and all built-ins exactly as they are. Replace only the radiator body with a flush wall-colored grille of the same size while keeping the niche and the wall unchanged. Keep built-in wardrobes, mirrored wardrobes, kitchen cabinets, shelving and niches. If a TV stays, mount it flush with hidden cables or use a frame TV; otherwise remove it. Keep all cables concealed.',
  window: 'Dress the window with treatments that hang from the existing ceiling/wall line: floor-length curtains, linen sheers or a clean Roman/roller blind. Keep the window opening exactly as in Image 1 — same height, width, sill and reveal. Keep the ceiling line unchanged and leave it without a cornice niche. Replace cheap plastic horizontal or vertical blinds, torn curtains and bare windows with treatments appropriate to the style.',
  pinterest: 'Make the room feel like a saved Pinterest reference: fully furnished, curated, layered and personal, with 3–5 styled vignettes rather than random clutter. Leave every area fully finished, not empty or half-done. Add art only on existing wall planes; place shelves on existing ledges or use freestanding furniture. Keep the architecture unchanged; keep niches, ledges, wall panels, beams, columns and built-ins exactly as in Image 1. Include at least one art grouping (2–4 frames) or one large poster, one styled surface using existing shelves, a console, a ledge or a freestanding table, floor-length curtains or a clean blind, and layered textiles (throw, cushions or rug). Textiles: floor-length curtains, throws, cushions, rugs, table runners. Walls: framed art, posters, a small gallery wall, textile panel or wall hanging. Shelves: open shelving with books, ceramics, vases, candles, small sculptures, records and plants. Personal objects: a modern laptop (MacBook-style), headphones, a speaker, a camera, magazines. Place them on a desk, nightstand, console, shelf, coffee table or bed — always on a surface. A laptop may be open on a desk or closed on a nightstand/console. Keep chargers, cables, camera straps and loose wires hidden. Plush toys are allowed only in a children\'s room or a bedroom: one or two, styled on a chair, bed or shelf. Keep plush toys out of bathrooms, kitchens and adult living rooms. Keep the composition tasteful and intentional: every object should look collected and purposeful. The scene must feel personal, like a boutique hotel suite or a designer portfolio.',
  furnitureOn: 'Preserve existing large furniture and functional zones. Restyle or replace pieces in place. Keep furniture aligned with outlets, radiators and built-ins; keep the same sides and general arrangement. Built-ins and mirror panels are architecture and stay exactly as they are.',
  furnitureOff: 'Replace and restyle existing loose furniture in place; remove old TV, cables, clutter, cheap blinds and torn curtains. Keep all architecture and built-ins exactly: wardrobes, mirrored wardrobes, kitchen cabinets, shelving, niches, wall panels and radiator grilles. Keep the same functional zones as the source photo and leave the room fully finished, not empty or half-finished.',
  catalogOn: 'The listed products are the material palette. The estimate is built from them.',
  catalogOff: 'CATALOG DISABLED: design freely from the style; the estimate will not be generated.',
  photo: 'Photorealistic editorial interior photograph, 24–35mm wide angle, natural window light or warm golden hour, soft shadows, subtle film grain, realistic color grading, medium-format look, high detail, 8k. The image must look like a real photograph, not a 3D render or CGI.',
  extra: '',
  avoid: 'FINAL STATE — the image must show a single, real, completed room from the same camera position as Image 1. The exact windows and doors of Image 1 remain unchanged. The ceiling height, wall planes, floor plane, corners and room proportions stay identical to the source. Furniture is realistically scaled, placed for clear circulation and keeps all openings clear and walkable. The lighting is warm, layered and softly diffused. Cables, chargers and old electronics are hidden or removed. Heating is concealed by coherent ventilated grilles. The composition is curated and intentional, not cluttered or showroom-sterile. Surfaces are clean, unmarked and free of text, watermarks and people.'
};

const KEY = 'prompt.rules.v1';
let cache = { ...DEFAULT_PROMPT_CONFIG };

const cleanConfig = (input = {}) => {
  const out = {};
  for (const field of PROMPT_FIELDS) {
    if (!(field.key in input)) continue;
    const value = String(input[field.key] ?? '');
    if (value.length > 8000) throw new Error(`Слишком длинный текст: ${field.label}`);
    out[field.key] = value.trim();
  }
  return out;
};

export function getPromptConfig() {
  return { ...cache };
}

export function getPromptDefaults() {
  return { ...DEFAULT_PROMPT_CONFIG };
}

export function setPromptConfigForTests(patch) {
  cache = { ...DEFAULT_PROMPT_CONFIG, ...cleanConfig(patch) };
}

export async function loadPromptConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([KEY]);
    const raw = rows.find(r => r.key === KEY)?.value;
    cache = raw ? { ...DEFAULT_PROMPT_CONFIG, ...cleanConfig(JSON.parse(raw)) } : { ...DEFAULT_PROMPT_CONFIG };
  } catch {
    cache = { ...DEFAULT_PROMPT_CONFIG };
  }
  return getPromptConfig();
}

export async function savePromptConfig(patch) {
  const next = { ...cache, ...cleanConfig(patch) };
  const { q } = await import('./db.js');
  await q.setSetting(KEY, JSON.stringify(next));
  cache = next;
  return getPromptConfig();
}

export async function resetPromptConfig() {
  const { q } = await import('./db.js');
  await q.setSetting(KEY, JSON.stringify(DEFAULT_PROMPT_CONFIG));
  cache = { ...DEFAULT_PROMPT_CONFIG };
  return getPromptConfig();
}

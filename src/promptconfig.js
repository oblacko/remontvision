// Редактируемые из админки правила базового промта. Хранятся в app_settings (prompt.rules.v1).
// Код комнат, стилей и товаров остаётся в roomtypes/openrouter, а art direction — здесь.
export const PROMPT_FIELDS = [
  { key: 'lighting', label: 'Свет', help: 'Главный вау-инструмент: слои, cove, подсветка, запреты.' },
  { key: 'dimensions', label: 'Размеры комнаты', help: 'Реальные метры: {room}, {width}, {length}, {height}, {orientation}.' },
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
  lighting: 'Use only the existing electrical points and ceiling/wall positions. Do not add new ceiling recesses, coves, tracks, wall-wash fixtures, sconces, niches or second pendant points. If a cove already exists in the source, a subtle warm LED strip is allowed; otherwise keep the ceiling plane flat. Use warm 2700–3000K light, layered with existing fixtures and plug-in lamps. No new architectural lighting, no boob lights, no cold white light, no visible bulbs or dangling wires. Choose the fixture for the interior composition; do not copy a fixture from an art reference or catalog card.',
  dimensions: `ROOM DIMENSIONS AND SCALE — MANDATORY
Room type: {room}.
Known clear internal dimensions:
- Room width: {width} metres.
- Room length: {length} metres.
- Finished floor-to-ceiling height: {height} metres.
Dimension orientation: {orientation}
These measurements describe the existing room. Use them as real-world scale constraints for furniture selection and arrangement, not as permission to reshape the source room. Preserve the source photo geometry, camera position, perspective and framing. Do not increase the apparent room width or depth, raise the ceiling or stretch the image.
Scale all furniture consistently with these dimensions. Arrange furniture so that doors can open and windows, heating controls and storage remain accessible. Account for the physical depth of radiator covers when arranging furniture and circulation routes. Do not treat radiator covers as flat wall graphics.
If the proposed composition is too crowded, choose smaller supporting furniture or omit secondary pieces. Do not change the room dimensions. Do not unnaturally shrink furniture to fit.
Do not show dimension lines, arrows, labels, floor plans or measurement text in the final image.`,
  scalePlan: `SCALE PLAN — FURNITURE MUST FIT THESE CONSTRAINTS
{plan}
Use these sizes and clearances as real-world constraints for any furniture that is added, replaced or moved. Do not overscale furniture, do not shrink it unnaturally, and do not change the room dimensions or camera view to make the plan fit. If the requested composition is impossible, choose smaller furniture and show the honest compromise.`,
  bed: `BED SIZE — MANDATORY
Include a bed with an overall external length of exactly {bed_length} metres, measured from the head end to the foot end, including its frame. This measurement refers to the whole bed, not just the mattress.
The bed width is not specified. Choose a width appropriate to the room’s layout and available circulation space.
Keep the bed realistically proportioned. Do not shorten, stretch or visually compress it to make the arrangement fit. Avoid an oversized headboard or footboard that increases the overall bed length beyond {bed_length} metres.`,
  radiators: `RADIATOR COVERS — REQUIRED WHEN RADIATORS ARE PRESENT
If any heating radiators are visible in Image 1, visually conceal each of them behind a purpose-designed decorative radiator cover. Keep the actual radiator and heating connections in their original positions. Do not remove, relocate or replace the heating system.
Design the covers as understated elements coordinated with the room’s palette, materials and selected style:
- Clean, simple proportions.
- A visually lightweight, slatted or perforated front.
- Warm off-white, a matching wall colour or a suitable natural-wood appearance.
Use one coherent cover design throughout the room.
Show a clearly ventilated construction:
- An open grille, spaced slats or substantial perforations at the front.
- An unobstructed lower air inlet.
- A continuous upper grille or open outlet for rising warm air.
Do not create a sealed box or a solid cabinet that visually traps the radiator behind an unventilated surface.
Keep thermostatic valve heads and controls accessible and outside the enclosed warm-air pocket. Do not depict an ordinary thermostatic valve head sealed inside the cover.
Make the front panel appear removable for maintenance. Allow plausible clearance around the radiator without inventing precise installation dimensions.
Keep the cover proportionate to the existing radiator. Do not extend it into a full wall of cabinetry or an oversized bench. Do not add upholstered seating, cushions or storage on top.
Where the radiator is beneath a window:
- Preserve the window’s dimensions and original position.
- Keep the cover below the window opening.
- Do not obstruct window operation.
- Do not cover the upper ventilation outlet with curtains or objects.
Do not cover separate wall ventilation grilles or air vents. Do not invent radiators or radiator covers where none are present.
These covers are part of the visual design concept, not a technical installation specification.`,
  cleanup: 'Remove visual noise: old TVs, cable boxes, exposed wires, dangling cables, window air conditioners, old chandeliers, old wall art, cheap plastic blinds, old roller blinds, torn or yellowed curtains, clutter and visible meters. Keep the window sill, the wall plane under the window, the radiator niche and all built-ins exactly as they are. Replace only the radiator body with a flush wall-colored grille of the same size; never remove the niche or change the wall. Keep built-in wardrobes, mirrored wardrobe, kitchen cabinets, shelving and niches. If a TV remains, mount it flush with hidden cables or use a frame TV; otherwise remove it. No visible cables anywhere.',
  window: 'Replace old blinds and curtains with new treatments that hang from the existing ceiling/wall line. Do not raise, widen, lower or move the window opening; do not add a cornice niche or alter the ceiling line. Use floor-length curtains, linen sheers or a clean Roman/roller blind. Never keep cheap plastic horizontal or vertical blinds, torn curtains or a bare window unless the style explicitly calls for it. No new window.',
  pinterest: 'Make it look like a saved Pinterest reference: fully furnished, curated, layered and personal, with 3–5 styled vignettes rather than random clutter. Do not leave the room empty or half-finished. Add art only on existing wall planes, shelves only on existing ledges or freestanding within the room; do not add niches, ledges, wall panels, beams, columns or new built-ins. MUST INCLUDE at least one art grouping (2–4 frames) or one large poster, a styled surface using existing shelves/console/ledge or a freestanding table, floor-length curtains or a clean blind, and layered textiles (throw, cushions or rug). Do not add a new shelf, ledge or niche. Textiles: floor-length curtains, throws, cushions, rugs, table runners. Walls: framed art, posters, a small gallery wall, textile panel or wall hanging. Shelves: open shelving with books, ceramics, vases, candles, small sculptures, records and plants. Personal objects: a modern laptop (MacBook-style), headphones, a speaker, a camera, magazines. Place them on a desk, nightstand, console, shelf, coffee table or bed — never on the floor or rug. A laptop may be open on a desk or closed on a nightstand/console. Hide chargers, cables, camera straps and loose wires. Plush toys: only in a children\'s room or a bedroom, one or two, styled on a chair, bed or shelf — never on the floor. Never in bathrooms, kitchens or adult living rooms. Keep it tasteful and uncluttered: every object should look intentional, not scattered. The scene must feel personal and collected, not like a furniture showroom.',
  furnitureOn: 'Preserve existing large furniture and functional zones. Restyle or replace in place; do not move pieces aligned with outlets, radiators or built-ins; do not swap sides or rearrange the room. Built-ins and mirror panels are architecture and must stay.',
  furnitureOff: 'Replace and restyle existing loose furniture in place; remove old TV, cables, clutter, cheap blinds and torn curtains. Keep all architecture and built-ins exactly: wardrobes, mirrored wardrobe, kitchen cabinets, shelving, niches, wall panels and radiator grilles. Keep the same functional zones as the source photo; do not change the room layout or architecture. Do not leave the room empty or half-finished.',
  catalogOn: 'The listed products are the material palette. The estimate is built from them.',
  catalogOff: 'CATALOG DISABLED: design freely from the style; the estimate will not be generated.',
  photo: 'Photorealistic editorial interior photograph, 24–35mm wide angle, natural window light or warm golden hour, soft shadows, subtle film grain, realistic color grading, medium-format look, high detail, 8k. It must look like a real photograph, not a 3D render or CGI.',
  extra: '',
  avoid: 'No text, no watermarks, no people, no new windows, no extra windows, no resized windows, no new doors, no new doorways, no new walls, no widened room, no changed ceiling height, no new niches, no new beams, no new columns, no new skylights, no new room, no changed camera, no changed perspective, no moved radiator, no moved outlets, no duplicated shelves, no warped shelves, no duplicated furniture, no distorted geometry, no cartoon or CGI look, no bare mattress, no empty walls, no sterile showroom feeling, no visible radiator panel, no exposed radiators, no old TV with dangling cables, no generic chandelier, no mismatched light fixtures, no cold flat lighting, no random clutter, no old electronics, no electronics on the floor or rug, no loose cables, chargers or camera straps, no plush toys in bathrooms or kitchens, no old plastic blinds, no torn curtains, no empty shelves, no oversized furniture, no furniture blocking walkways, no bed wider than the room, no sofa longer than the room, no impossible furniture scale, no widened room, no new ceiling coves unless already present.',
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

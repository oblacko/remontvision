// Вариативность на уровне комнаты: акцент только из палитры стиля, ротация по seed,
// avoid-список из предыдущих рендеров. Единая точка входа — pickVariety.
import crypto from 'node:crypto';
import { DESIGN_STYLES } from './designdata.js';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_AVOID_ITEMS = 5;
const USED_WINDOW = 5;

// Нейтральные акценты композиции: не меняют планировку и не спорят с геометрией.
const EMPHASIS = [
  'lead with the existing window wall and daylight',
  'lead with a central furniture grouping and keep the perimeter calm',
  'lead with floor-to-ceiling material texture and one low horizontal line',
  'lead with a single sculptural accent object on the existing focal plane',
];
// Когда мебель и планировку сохраняем, новизна живёт в отделке, свете и декоре.
const KEEP_FURNITURE_EMPHASIS = [
  'lead with light and material contrast',
  'lead with textile layering and a calm wall finish',
  'lead with wall finish, art and one sculptural accent',
  'lead with the existing focal wall and warmer layered light',
];

function hashIndex(seed, size) {
  if (!size) return 0;
  const hash = crypto.createHash('sha256').update(String(seed || '')).digest();
  // 32-битный индекс без смещения первого байта: hash[0] % size смещён в пользу
  // младших значений, а readUInt32BE даёт равномерный слот.
  return hash.readUInt32BE(0) % size;
}

export function resolveStylePalette({ styleName = '', styleKey = '' } = {}) {
  const byName = DESIGN_STYLES.find(style => style.name === styleName);
  if (byName?.palette) return byName.palette;
  const byKey = DESIGN_STYLES.find(style => style.id === styleKey);
  return byKey?.palette || null;
}

// Карточка стиля по имени или id. Палитра резолвится через resolveStylePalette,
// оси — из карточки напрямую (мягкие модификаторы, не трогают палитру/акцент).
function resolveStyleCard({ styleName = '', styleKey = '' } = {}) {
  return DESIGN_STYLES.find(style => style.name === styleName)
    || DESIGN_STYLES.find(style => style.id === styleKey)
    || null;
}

// Детерминированный выбор значений осей по seed: для каждой оси свой хэш-слот,
// поэтому оси независимы и воспроизводимы при одном seed.
function pickAxes(card, seed) {
  const axes = Array.isArray(card?.axes) ? card.axes : [];
  return axes
    .map(axis => {
      const values = Array.isArray(axis?.values) ? axis.values : [];
      if (!axis?.key || !values.length) return null;
      return { key: String(axis.key), value: values[hashIndex(`${seed}:axes:${axis.key}`, values.length)] };
    })
    .filter(Boolean);
}

// Ротация по seed: акцент берём только из палитры стиля (accent → support → dark).
export function pickStyleAccent(palette, seed = '') {
  if (!palette) return null;
  const colors = [palette.accent, palette.support, palette.dark].filter(value => HEX.test(String(value || '')));
  if (!colors.length) return null;
  return colors[hashIndex(seed, colors.length)];
}

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

// Единая точка входа вариативности комнаты.
// room — запись комнаты (keep_furniture); style — запись стиля (name/key), резолвится
// в карточку DESIGN_STYLES с палитрой; seed — renderId; used — направления прошлых
// рендеров комнаты (для avoid-списка). Детерминизм по seed: акцент и emphasis берутся
// только из seed, avoid — из used.
export function pickVariety(room = {}, style = null, seed = '', used = []) {
  const styleName = style?.name ?? room?.style ?? '';
  const styleKey = style?.key ?? '';
  const keepFurniture = room?.keep_furniture !== false;
  const card = resolveStyleCard({ styleName, styleKey });
  const palette = card?.palette || null;
  const accent = pickStyleAccent(palette, seed);
  const emphasisOptions = keepFurniture ? KEEP_FURNITURE_EMPHASIS : EMPHASIS;
  const emphasis = emphasisOptions[hashIndex(`${seed}:emphasis`, emphasisOptions.length)];
  const previous = (Array.isArray(used) ? used : [])
    .filter(item => item && typeof item === 'object')
    .slice(-USED_WINDOW);

  const focalZones = [...new Set(previous.map(item => clean(item.focalZone)).filter(Boolean))];
  const mainMoves = [...new Set(previous.map(item => clean(item.mainMove)).filter(Boolean))];
  const paletteDirections = [...new Set(previous.flatMap(item => Array.isArray(item.palette) ? item.palette.map(clean).filter(Boolean) : []))];

  const avoid = [];
  if (focalZones.length) avoid.push(`focal zone: ${focalZones.join(', ')}`);
  if (mainMoves.length) avoid.push(`main move: ${mainMoves.join(', ')}`);
  if (paletteDirections.length) avoid.push(`palette direction: ${paletteDirections.join(', ')}`);
  if (previous.length && !keepFurniture) avoid.push('the same furniture arrangement and decor vignette as the previous render of this room');

  return {
    version: 1,
    seed: String(seed || ''),
    styleName,
    keepFurniture: Boolean(keepFurniture),
    accent,
    axes: pickAxes(card, seed),
    emphasis,
    avoid: avoid.slice(0, MAX_AVOID_ITEMS),
    previousCount: previous.length,
  };
}

// Оси как отдельный блок-модификатор: мягкая вариация внутри стиля, не спорит
// с палитрой, акцентом и геометрией. Пусто, если у стиля нет осей или значений.
export function axesPrompt(variety) {
  const axes = Array.isArray(variety?.axes) ? variety.axes.filter(axis => axis?.key && axis?.value) : [];
  if (!axes.length) return '';
  return [
    'STYLE AXES — SOFT VARIATION',
    'These are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.',
    ...axes.map(axis => `- ${axis.key}: ${axis.value}`),
  ].join('\n');
}

export function variabilityPrompt(variety) {
  if (!variety) return '';
  const lines = ['VARIABILITY — ROOM-LEVEL NOVELTY'];
  if (variety.emphasis) lines.push(`Composition emphasis: ${variety.emphasis}.`);
  lines.push(variety.avoid.length
    ? `Do not repeat: ${variety.avoid.join('; ')}. ${variety.keepFurniture
        ? 'Keep the existing furniture positions and layout; vary only finish, decor, lighting and the accent within the style palette.'
        : 'Choose a visibly different composition while keeping the geometry lock and the style palette.'}`
    : 'This is the first render of this room: there are no previous choices to avoid. Set a clear room-level idea.');
  if (variety.accent) lines.push(`Use exactly one accent colour from the style palette: ${variety.accent}. Do not introduce any other accent hue.`);
  const axes = axesPrompt(variety);
  if (axes) lines.push(axes);
  return lines.join('\n');
}

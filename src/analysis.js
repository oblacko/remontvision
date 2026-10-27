// Пост-анализ рендера: поверхности → RAL, рекомендации по электрике, быстрые правки.
import { electricalForRoomType, roomTypeByName } from './roomtypes.js';
import { PRICE_TIER_META, SLOT_LABELS_RU, tierDistance } from './pricing.js';

const SURFACE_LABELS = {
  walls: 'Стены',
  floor: 'Пол',
  ceiling: 'Потолок',
  cabinets: 'Фасады',
  cabinet: 'Фасады',
  countertop: 'Столешница',
  backsplash: 'Фартук',
  textile: 'Текстиль',
  trim: 'Плинтус и столярка',
};

// Компактная таблица RAL Classic для ближайшего соответствия оттенку с рендера.
// Коды и hex — ориентировочные; в UI всегда подписано «ориентировочно».
export const RAL_CLASSIC = [
  ['RAL 9010', 'Pure white', '#F1EDE1'], ['RAL 9003', 'Signal white', '#FFFFFF'],
  ['RAL 9016', 'Traffic white', '#F1F1F1'], ['RAL 9001', 'Cream', '#E9E0D2'],
  ['RAL 9002', 'Grey white', '#D7D5C9'], ['RAL 1013', 'Oyster white', '#EAE6DA'],
  ['RAL 1015', 'Light ivory', '#E6D2B5'], ['RAL 1019', 'Grey beige', '#A48F7A'],
  ['RAL 1036', 'Pearl gold', '#8D6B4B'], ['RAL 3012', 'Beige red', '#C6846E'],
  ['RAL 6003', 'Olive green', '#4D5D3C'], ['RAL 6011', 'Reseda green', '#6B7C5B'],
  ['RAL 7013', 'Brown grey', '#57554C'], ['RAL 7016', 'Anthracite grey', '#383E42'],
  ['RAL 7021', 'Black grey', '#2F3234'], ['RAL 7035', 'Light grey', '#D7D7D7'],
  ['RAL 7040', 'Window grey', '#9DA0A2'], ['RAL 7047', 'Telegrey 4', '#CFD0CF'],
  ['RAL 8003', 'Clay brown', '#7A4B2A'], ['RAL 8017', 'Chocolate brown', '#442F29'],
  ['RAL 8022', 'Black brown', '#1C1C1C'], ['RAL 9005', 'Jet black', '#0A0A0A'],
  ['RAL 9011', 'Graphite black', '#27292B'], ['RAL 5000', 'Violet blue', '#354D73'],
  ['RAL 5014', 'Pigeon blue', '#637D96'], ['RAL 2003', 'Pastel orange', '#F9A25B'],
  ['RAL 2004', 'Pure orange', '#E25303'], ['RAL 3003', 'Ruby red', '#8D1D2C'],
  ['RAL 3005', 'Wine red', '#5B1F24'], ['RAL 5008', 'Grey blue', '#2A3A4A'],
  ['RAL 5024', 'Pastel blue', '#7A9AB0'], ['RAL 6002', 'Leaf green', '#2A4A2A'],
  ['RAL 6021', 'Pale green', '#8AA88A'], ['RAL 7006', 'Beige grey', '#7A6A5A'],
  ['RAL 7030', 'Stone grey', '#8A8A7A'], ['RAL 7032', 'Pebble grey', '#B0B0A0'],
  ['RAL 7044', 'Silk grey', '#B0B0A0'], ['RAL 8001', 'Ochre brown', '#9A6A2A'],
  ['RAL 8019', 'Grey brown', '#3A2A1A'], ['RAL 1018', 'Zinc yellow', '#F8B735'],
];

function parseHex(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToLab({ r, g, b }) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function nearestRal(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const lab = rgbToLab(rgb);
  let best = null;
  let bestD = Infinity;
  for (const [code, name, ralHex] of RAL_CLASSIC) {
    const ralRgb = parseHex(ralHex);
    if (!ralRgb) continue;
    const ralLab = rgbToLab(ralRgb);
    const d = Math.sqrt((lab.L - ralLab.L) ** 2 + (lab.a - ralLab.a) ** 2 + (lab.b - ralLab.b) ** 2);
    if (d < bestD) { bestD = d; best = { code, name, hex: ralHex, distance: Number(d.toFixed(1)) }; }
  }
  return best;
}

const RAL_SURFACES = new Set(['walls', 'ceiling', 'cabinets', 'cabinet']);

export function normalizeSurfaces(surfaces) {
  if (!Array.isArray(surfaces)) return [];
  return surfaces
    .filter(s => s && s.surface && s.hex)
    .slice(0, 8)
    .map(s => {
      const surface = String(s.surface).toLowerCase();
      return {
        surface,
        label: SURFACE_LABELS[surface] || String(s.surface),
        description: String(s.description || '').slice(0, 200),
        hex: String(s.hex).slice(0, 20),
        // RAL — только для окрашиваемых поверхностей; дерево/плитку не переводим в RAL.
        ral: RAL_SURFACES.has(surface) ? nearestRal(s.hex) : null,
      };
    });
}

export function normalizeElectrical(roomType, electrical) {
  if (Array.isArray(electrical) && electrical.length >= 2) {
    return electrical
      .filter(e => e && (e.title || e.text))
      .slice(0, 6)
      .map(e => ({ title: String(e.title || 'Электрика').slice(0, 80), text: String(e.text || '').slice(0, 240) }));
  }
  return electricalForRoomType(roomType);
}

function roomMatches(product, roomType) {
  const raw = String(product.room_types || '').trim();
  if (!raw) return true;
  return raw.split(',').map(s => s.trim()).includes(roomType);
}

function styleTags(product) {
  return String(product.style_tags || '').toLowerCase().replace(/ё/g, 'е').split(',').map(s => s.trim()).filter(Boolean);
}

const STYLE_TAGS = {
  'Современный': ['современный', 'минимализм', 'лофт'],
  'Светлый': ['светлый', 'скандинавский', 'скандинавия'],
  'Тёмный': ['тёмный', 'темный', 'премиум', 'тёмный модерн'],
  'Классика': ['классика', 'неоклассика', 'ар-деко'],
  'Скандинавский': ['скандинавский', 'скандинавия', 'светлый'],
  'Лофт': ['лофт', 'современный'],
  'Джапанди': ['джапанди', 'минимализм', 'светлый'],
  'Неоклассика': ['неоклассика', 'классика'],
  'Минимализм': ['минимализм', 'современный'],
  'Тёмный модерн': ['тёмный модерн', 'тёмный', 'темный'],
  'Бохо': ['бохо', 'кантри'],
  'Ар-деко': ['ар-деко', 'неоклассика'],
  'Кантри': ['кантри', 'бохо'],
  'Референс пользователя': [],
};

function matchStyle(product, style) {
  const tags = styleTags(product);
  if (!tags.length) return 0.5;
  const wanted = STYLE_TAGS[style] || [];
  if (!wanted.length) return 0.5;
  const primary = String(style || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (tags.includes(primary)) return 1;
  return tags.some(t => wanted.includes(t)) ? 0.6 : 0;
}

const SUGGEST_BY_ROOM = {
  'Спальня': ['light', 'floor', 'wall', 'textile'],
  'Гостиная (зал)': ['light', 'floor', 'wall', 'textile'],
  'Детская': ['light', 'floor', 'wall', 'textile'],
  'Кухня': ['backsplash', 'countertop', 'faucet', 'light'],
  'Санузел': ['tile', 'floor', 'faucet', 'light'],
  'Прихожая': ['light', 'floor', 'cabinet'],
  'Столовая': ['light', 'floor', 'wall'],
  'Кабинет': ['light', 'floor', 'wall'],
  'Балкон / лоджия': ['floor', 'light'],
  'Гардеробная': ['light', 'cabinet'],
  'Кладовка': ['light', 'floor'],
  'Другое': ['light', 'floor', 'wall'],
};

function shortName(name) {
  return String(name || '').replace(/[«»"]/g, '').trim();
}

export function buildSuggestions({ roomType, products, currentProducts = [], priceTier = 'comfort', style = '' }) {
  const room = roomTypeByName(roomType);
  if (!room) return [];
  const currentIds = new Set(currentProducts.map(p => Number(p.id)));
  const targets = SUGGEST_BY_ROOM[roomType] || SUGGEST_BY_ROOM['Другое'];
  const out = [];
  for (const target of targets) {
    const slot = room.slots.find(s => s.key === target);
    if (!slot) continue;
    const candidates = products
      .filter(p => p.active !== false && !currentIds.has(Number(p.id)))
      .filter(p => slot.categories.includes(p.category))
      .filter(p => roomMatches(p, roomType))
      .map(p => ({
        p,
        tier: tierDistance(p.price_tier || 'comfort', priceTier),
        style: matchStyle(p, style),
      }))
      .filter(x => x.tier <= 1 && x.style > 0)
      .sort((a, b) => a.tier - b.tier || b.style - a.style || Number(a.p.price) - Number(b.p.price));
    const pick = candidates[0]?.p;
    if (!pick) continue;
    const label = `${SLOT_LABELS_RU[target] || SLOT_LABELS_RU.light}: ${shortName(pick.name)}`;
    out.push({
      target,
      label,
      product_id: Number(pick.id),
      image_url: pick.image_path ? `/products/${String(pick.image_path).split('/').pop()}` : (pick.image_url || null),
    });
  }
  return out.slice(0, 4);
}

export function buildAnalysis({ roomType, parsed = {}, products = [], currentProducts = [], priceTier = 'comfort', style = '' }) {
  const surfaces = normalizeSurfaces(parsed.surfaces);
  const electrical = normalizeElectrical(roomType, parsed.electrical);
  const suggestions = buildSuggestions({ roomType, products, currentProducts, priceTier, style });
  return {
    surfaces,
    electrical,
    suggestions,
    visible: Array.isArray(parsed.visible) ? parsed.visible.slice(0, 20) : [],
    price_tier: priceTier,
    tier_name: PRICE_TIER_META[priceTier]?.name || PRICE_TIER_META.comfort.name,
  };
}

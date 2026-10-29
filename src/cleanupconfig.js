// Очистка комнаты перед дизайном: модели, промт и настройки из админки.
// Применяется только когда пользователь выключил «Оставить мебель».
import { roomTypeByName } from './roomtypes.js';

export const CLEANUP_KEY = 'cleanup.config.v1';

export const DEFAULT_CLEANUP_CONFIG = {
  enabled: false,
  model: 'black-forest-labs/flux-3-image-klein',
  resolution: '1K',
  aspect_ratio: 'auto',
  prompt: 'Based on the reference photo, show the same {room} as a completely empty bare shell. Keep ONLY {keep}. Preserve the exact room dimensions, proportions, window opening, door positions, ceiling height and camera perspective. Remove {remove}. Leave bare walls, bare floor, empty window opening, no light fixtures, no people, no text, no watermark. Clean empty room ready for interior design, photorealistic, natural daylight.',
};

const KEEP_BASE = 'the exact room architecture: walls, ceiling, floor, window opening, door, ceiling height, exact proportions and camera perspective';
const REMOVE_BASE = 'EVERYTHING else: bed, sofa, tables, chairs, wardrobe, cabinets, mirror, TV, chandelier, light fixtures, blinds, curtains, plants, radiator, pouf, stool, shelves, wall art, decor, rugs, textiles, all loose objects and clutter';

const KEEP_BY_ROOM = {
  'Кухня': `${KEEP_BASE}; built-in kitchen cabinets, countertop, sink, cooktop, hood, plumbing and electrical points`,
  'Санузел': `${KEEP_BASE}; fixed plumbing, toilet, sink, shower/bath, waterproofing and tiled wet zones`,
};

const REMOVE_BY_ROOM = {
  'Кухня': 'all loose objects, decor, plants, curtains, blinds, wall art, rugs, dishes, small appliances, everything on the counters, and all freestanding furniture; keep built-in cabinets, countertop, sink, cooktop, hood, plumbing and electrical points',
  'Санузел': 'all loose objects, decor, plants, curtains, blinds, rugs, mirror, toiletries and freestanding furniture; keep fixed plumbing, toilet, sink, shower/bath, waterproofing and tiled wet zones',
};

let cache = { ...DEFAULT_CLEANUP_CONFIG };

const validate = (input = {}) => {
  const out = {};
  if ('enabled' in input) out.enabled = Boolean(input.enabled);
  if ('model' in input) {
    const model = String(input.model || '').trim();
    if (!model) throw new Error('Нужна модель очистки');
    out.model = model;
  }
  if ('resolution' in input) out.resolution = String(input.resolution || '').trim();
  if ('aspect_ratio' in input) out.aspect_ratio = String(input.aspect_ratio || 'auto').trim();
  if ('prompt' in input) {
    const prompt = String(input.prompt || '');
    if (prompt.length > 8000) throw new Error('Промт очистки слишком длинный');
    out.prompt = prompt.trim();
  }
  return out;
};

export function getCleanupConfig() {
  return { ...cache };
}

export function getCleanupDefaults() {
  return { ...DEFAULT_CLEANUP_CONFIG };
}

export function setCleanupConfigForTests(patch) {
  cache = { ...DEFAULT_CLEANUP_CONFIG, ...validate(patch) };
}

export async function loadCleanupConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([CLEANUP_KEY]);
    const raw = rows.find(r => r.key === CLEANUP_KEY)?.value;
    cache = raw ? { ...DEFAULT_CLEANUP_CONFIG, ...validate(JSON.parse(raw)) } : { ...DEFAULT_CLEANUP_CONFIG };
  } catch {
    cache = { ...DEFAULT_CLEANUP_CONFIG };
  }
  return getCleanupConfig();
}

export async function saveCleanupConfig(patch) {
  const next = { ...cache, ...validate(patch) };
  const { q } = await import('./db.js');
  await q.setSetting(CLEANUP_KEY, JSON.stringify(next));
  cache = next;
  return getCleanupConfig();
}

export async function resetCleanupConfig() {
  const { q } = await import('./db.js');
  await q.setSetting(CLEANUP_KEY, JSON.stringify(DEFAULT_CLEANUP_CONFIG));
  cache = { ...DEFAULT_CLEANUP_CONFIG };
  return getCleanupConfig();
}

export function buildCleanupPrompt(roomType = 'Другое') {
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || 'room';
  const keep = KEEP_BY_ROOM[roomType] || KEEP_BASE;
  const remove = REMOVE_BY_ROOM[roomType] || REMOVE_BASE;
  const template = cache.prompt || DEFAULT_CLEANUP_CONFIG.prompt;
  if (template.includes('{')) {
    return template
      .replaceAll('{room}', roomName)
      .replaceAll('{keep}', keep)
      .replaceAll('{remove}', remove);
  }
  return template;
}

// Zod-контракты агентов. SDK не даёт outputSchema для callModel,
// поэтому валидируем JSON сами — до того, как он попадёт в промт или UI.
import { z } from 'zod';

const RepairAction = z.enum([
  'replace', 'level', 'refinish', 'paint', 'plaster', 'wallpaper', 'fill', 'keep',
]);

const RepairItem = z.object({
  action: RepairAction,
  material: z.string().optional().default(''),
  style: z.string().optional().default(''),
  why: z.string().optional().default(''),
  visible: z.boolean().optional().default(true),
}).nullable();

export const RepairScopeSchema = z.object({
  floor: RepairItem.optional().default(null),
  ceiling: RepairItem.optional().default(null),
  walls: RepairItem.optional().default(null),
  doors: RepairItem.optional().default(null),
  windows: RepairItem.optional().default(null),
  storage: z.array(z.string()).optional().default([]),
  style_dir: z.string().optional().default(''),
});

export const ChangeSchema = z.object({
  layer: z.enum(['floor', 'walls', 'ceiling', 'doors', 'windows', 'light', 'furniture', 'storage', 'textile']),
  label: z.string().min(1),
  current: z.string().min(1),
  change: z.string().min(1),
  impact: z.number().min(0).max(1),
  effort: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  target: z.string().optional().default(''),
});

export const ChangesSchema = z.object({
  changes: z.array(ChangeSchema).max(6).default([]),
});

export const SearchItemSchema = z.object({
  label: z.string().min(1),
  category: z.string().min(1),
  search_query: z.string().optional().default(''),
  offer_ids: z.array(z.string()).optional().default([]),
  why: z.string().optional().default(''),
});

export const SearchResultSchema = z.object({
  room: z.record(z.string(), z.unknown()).optional().default({}),
  items: z.array(SearchItemSchema).max(20).default([]),
});

const UNCERTAIN = /(фрагмент|похоже|возможно|вероятно|не видно|частично|предполож|обрез|край стены|цветн.*полос|тень)/i;
const CLEAR_DOOR = /(дверь|дверн|полотно|наличник|ручк|петл|створк)/i;
const CLEAR_WINDOW = /(окно|оконн|рама|створк|подоконник|откос|стеклопакет)/i;

export function validateRepairScope(value) {
  if (!value || typeof value !== 'object') return null;
  const scope = {
    floor: null, ceiling: null, walls: null, doors: null, windows: null,
    storage: Array.isArray(value.storage)
      ? value.storage.map(item => String(item)).filter(Boolean).slice(0, 6)
      : [],
    style_dir: typeof value.style_dir === 'string' ? value.style_dir : '',
  };
  for (const key of ['floor', 'ceiling', 'walls', 'doors', 'windows']) {
    const parsed = RepairItem.safeParse(value[key]);
    if (!parsed.success) continue;
    const item = parsed.data;
    if (!item) continue;
    const clear = key === 'doors' ? CLEAR_DOOR : key === 'windows' ? CLEAR_WINDOW : null;
    if (clear && (item.visible === false || !clear.test(item.why) || UNCERTAIN.test(item.why))) continue;
    scope[key] = item;
  }
  return scope;
}

export function validateChanges(value) {
  if (!value || !Array.isArray(value.changes)) return null;
  return value.changes
    .map(item => {
      const parsed = ChangeSchema.safeParse(item);
      return parsed.success ? parsed.data : null;
    })
    .filter(Boolean)
    .slice(0, 6);
}

export function validateSearchResult(value) {
  if (!value || typeof value !== 'object') return null;
  const items = Array.isArray(value.items)
    ? value.items.map(item => {
        const parsed = SearchItemSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      }).filter(Boolean).slice(0, 20)
    : [];
  return {
    room: value.room && typeof value.room === 'object' ? value.room : {},
    items,
  };
}

// Детекция архитектурных проёмов и встроенных элементов с bbox для FLUX 3.
// bbox — сетка 0–1000: [top, left, bottom, right] относительно кадра.
import { visionJson } from './openrouter.js';

const OPENINGS_MODEL = process.env.OPENINGS_MODEL
  || process.env.ART_DIRECTOR_MODEL
  || 'deepseek/deepseek-v4.1-flash-1017';

export const BBOX_LOCK_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.BBOX_LOCK_ENABLED ?? 'true'));



const SYSTEM = `Ты — архитектор-детектор. По фотографии комнаты найди видимые окна, двери и встроенные элементы.
Верни СТРОГО JSON без текста вокруг:
{
  "windows": [{"id": "window_1", "bbox": [top, left, bottom, right], "kind": "window|balcony_door"}],
  "doors": [{"id": "door_1", "bbox": [top, left, bottom, right], "kind": "interior|entrance"}],
  "builtins": [{"id": "builtin_1", "bbox": [top, left, bottom, right], "label": "wardrobe|shelf|kitchen_cabinets|niche|media_wall|banquette"}],
  "confidence": "low|medium|high",
  "assumptions": ["..."]
}
Правила:
- bbox — целые числа 0–1000, формат [top, left, bottom, right] относительно всего кадра (top < bottom, left < right).
- Детектируй только явно видимые элементы: рама, створка, подоконник, наличник, ручка, полотно двери. Цветная полоса или проём без полотна — не дверь и не окно.
- Широкое многопанельное окно — это ОДИН оконный блок: верни один bbox на всю раму, включая все створки и импосты. Не дели его на несколько окон.
- Балконный блок: если видна балконная дверь рядом с окном, это ДВА элемента. Дверь помечай kind="balcony_door" в массиве windows; окно — kind="window". Не объединяй их в один bbox.
- Окно может быть частично за шторой или за мебелью: ищи раму, створки, подоконник и радиатор под ним.
- Встроенные шкафы, кухонные шкафы, ниши, стеллажи — только если занимают значимую площадь стены.
- Зеркала и их отражения — это отражения, а не новые проёмы; не включай их как окна/двери.
- confidence = low, если проёмы плохо видны (шторы, засветка, обрез кадра). При low можно не возвращать массивы.
- Не выдумывай элементы, которых нет на фото.

Примеры:
1. Одиночное окно посередине стены:
{"windows":[{"id":"window_1","bbox":[140,310,560,690],"kind":"window"}],"doors":[],"builtins":[],"confidence":"high","assumptions":[]}
2. Балконный блок: балконная дверь слева, окно справа:
{"windows":[{"id":"window_1","bbox":[120,540,580,920],"kind":"balcony_door"},{"id":"window_2","bbox":[120,120,580,500],"kind":"window"}],"doors":[],"builtins":[],"confidence":"high","assumptions":["балконный блок из двери и окна разделены"]}
3. Межкомнатная дверь в коридор:
{"windows":[],"doors":[{"id":"door_1","bbox":[80,720,920,980],"kind":"interior"}],"builtins":[],"confidence":"high","assumptions":[]}`;

const clampText = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function clampBbox(box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [top, left, bottom, right] = box.map(Number);
  if (![top, left, bottom, right].every(Number.isFinite)) return null;
  const t = Math.max(0, Math.min(1000, Math.round(top)));
  const l = Math.max(0, Math.min(1000, Math.round(left)));
  const b = Math.max(t, Math.min(1000, Math.round(bottom)));
  const r = Math.max(l, Math.min(1000, Math.round(right)));
  if (b - t < 20 || r - l < 20) return null;
  return [t, l, b, r];
}

function normalizeItems(items, kindMap, prefix) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const bbox = clampBbox(item?.bbox);
      if (!bbox) return null;
      const kind = String(item?.kind || '').toLowerCase();
      return {
        id: String(item?.id || `${prefix}_${index + 1}`).slice(0, 40),
        bbox,
        kind: kindMap.includes(kind) ? kind : 'unknown',
        label: clampText(item?.label, 80) || kind,
      };
    })
    .filter(Boolean);
}

export function normalizeOpenings(parsed = {}) {
  const windows = normalizeItems(parsed.windows, ['window', 'balcony_door'], 'window');
  const doors = normalizeItems(parsed.doors, ['interior', 'entrance'], 'door');
  const builtins = normalizeItems(parsed.builtins, ['wardrobe', 'shelf', 'kitchen_cabinets', 'niche', 'media_wall', 'banquette'], 'builtin');
  const confidence = ['low', 'medium', 'high'].includes(String(parsed.confidence).toLowerCase())
    ? String(parsed.confidence).toLowerCase()
    : 'low';
  const assumptions = Array.isArray(parsed.assumptions)
    ? parsed.assumptions.map(item => clampText(item, 300)).filter(Boolean)
    : [];
  return { windows, doors, builtins, confidence, assumptions };
}

export async function buildOpenings({
  imageDataUrl,
  roomType = 'Другое',
  sessionId = null,
} = {}) {
  if (!imageDataUrl) return null;
  const user = `Тип комнаты: ${roomType || 'определи сам'}. Найди окна, двери и встроенные элементы с bbox в сетке 0–1000 [top, left, bottom, right]. Если видишь балконный блок из двери и окна, обязательно раздели их на два отдельных bbox: дверь — kind="balcony_door", окно — kind="window".`;
  const { parsed, cost } = await visionJson({
    system: SYSTEM,
    user,
    images: [imageDataUrl],
    model: OPENINGS_MODEL,
    sessionId,
  });
  let result = normalizeOpenings(parsed);
  let totalCost = cost ?? null;
  if (!result.windows.length && !result.doors.length && !result.builtins.length) {
    // Повтор с более настойчивым описанием: широкие окна и двери часто
    // теряются на первом проходе, если в кадре много мебели.
    try {
      const retry = await visionJson({
        system: SYSTEM,
        user: `${user} Смотри внимательно: широкое многопанельное окно — это один блок; дверь — это полотно с наличником. Найди их даже за шторой или мебелью.`,
        images: [imageDataUrl],
        model: null,
        sessionId,
      });
      const retryResult = normalizeOpenings(retry.parsed);
      totalCost = (totalCost || 0) + (retry.cost || 0);
      if (retryResult.windows.length || retryResult.doors.length || retryResult.builtins.length) {
        result = retryResult;
      }
    } catch { /* остаётся первый результат */ }
  }
  if (!result.windows.length && !result.doors.length && !result.builtins.length) {
    return { ...result, empty: true, cost: totalCost };
  }
  return { ...result, empty: false, cost: totalCost };
}

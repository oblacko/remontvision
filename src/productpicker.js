// Подбор реальных товаров Hoff по плану арт-директора.
// Поиск: catalog-service /search-text. Отбор «красиво по размерам»: фильтр по
// габаритам из params + второй LLM-проход (по умолчанию DeepSeek V4.1 Flash).
import { searchCatalogText as defaultSearch } from './catalogclient.js';
import { visionJson as defaultVision, log as defaultLog } from './openrouter.js';
import { fetchRemoteImage as defaultFetchImage } from './remoteimage.js';

const PICK_MODEL = process.env.PRODUCT_PICK_MODEL || 'deepseek/deepseek-v4.1-flash-1017';
const MAX_CANDIDATES = 8;

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');

function firstNumber(value) {
  const match = String(value ?? '').match(/(\d+(?:[.,]\d+)?)/);
  return match ? Number(match[1].replace(',', '.')) : null;
}

// Размеры из params: Ширина/Глубина(Длина)/Высота в см (могут быть в мм).
export function parseDimensions(params = {}) {
  const find = needles => {
    for (const [key, value] of Object.entries(params || {})) {
      const k = norm(key);
      if (k.includes('спальн')) continue; // «длина/ширина спального места» — не габарит изделия
      if (needles.some(n => k.includes(n))) {
        const number = firstNumber(value);
        if (number != null) {
          // Габариты могут быть в мм — приводим к см.
          const isMm = /(^|[^a-zа-я])мм([^a-zа-я]|$)|millimet/.test(k) || /(^|[^a-zа-я])мм([^a-zа-я]|$)/.test(norm(value));
          return isMm ? Math.round(number / 10) : number;
        }
      }
    }
    return null;
  };
  return {
    width: find(['ширин', 'width']),
    length: find(['длин', 'глубин', 'depth', 'length']),
    height: find(['высот', 'height']),
  };
}

// Товар проходит по размеру, если известные габариты не больше лимита слота.
export function fitsDimensions(dims, slot = {}) {
  if (slot.max_w_cm && dims.width && dims.width > slot.max_w_cm) return false;
  if (slot.max_l_cm && dims.length && dims.length > slot.max_l_cm) return false;
  return true;
}

function pickSystemPrompt() {
  return `Ты арт-директор интерьера и закупщик. На входе — план предметов и кандидаты из реального каталога Hoff.
Выбери по одному товару на каждую позицию плана. Критерии по важности:
1) красота и уместность стилю/палитре комнаты;
2) размер: товар должен физически подходить и не превышать max_w_cm/max_l_cm;
3) материал и цвет ближе к описанию;
4) адекватная цена и наличие картинки.
Если ни один кандидат не подходит — верни для позиции offer_id: null.
Верни строго JSON: {"picks":[{"slot":"bed","offer_id":"...","why":"кратко по-русски"}]}
offer_id бери ТОЛЬКО из переданных кандидатов. Не выдумывай товары.`;
}

async function selectWithLLM({ plan, candidatesBySlot, roomType, style, deps }) {
  const vision = deps.visionJson || defaultVision;
  const payload = plan.map((slot, i) => ({
    slot: slot.slot,
    category: slot.category,
    max_w_cm: slot.max_w_cm || null,
    max_l_cm: slot.max_l_cm || null,
    desired_color: slot.color || '',
    desired_material: slot.material || '',
    why: slot.why || '',
    candidates: (candidatesBySlot[i] || []).slice(0, MAX_CANDIDATES).map(c => ({
      offer_id: String(c.offer_id),
      name: c.name,
      category: c.category,
      price: c.price,
      dims: c.dims,
      params: c.params,
    })),
  }));
  const { parsed } = await vision({
    system: pickSystemPrompt(),
    user: JSON.stringify({ roomType, style, plan: payload }),
    images: [],
    model: deps.model || PICK_MODEL,
  });
  return Array.isArray(parsed?.picks) ? parsed.picks : [];
}

// Возвращает выбранные офферы (с picture_url, ценой, affiliate_url, why) в порядке плана.
export async function pickHoffProducts({ plan = [], roomType = '', style = '', maxProducts = 3, deps = {} } = {}) {
  const search = deps.searchCatalogText || defaultSearch;
  const log = deps.log || defaultLog;
  const slots = plan.slice(0, Math.max(1, Math.min(4, maxProducts)));
  const candidatesBySlot = [];

  for (const slot of slots) {
    try {
      const { results } = await search({
        query: slot.query || slot.slot || slot.category,
        filters: { categories: [slot.category] },
        product: {
          category: slot.category,
          color: slot.color || null,
          material: slot.material || null,
          search_query: slot.query || null,
        },
        topK: 12,
      });
      const candidates = (results || [])
        .map(row => ({ ...row, dims: parseDimensions(row.params) }))
        .filter(row => fitsDimensions(row.dims, slot));
      candidatesBySlot.push(candidates);
    } catch (e) {
      log({ event: 'product_pick_search_error', slot: slot.slot, error: String(e.message || e).slice(0, 200) });
      candidatesBySlot.push([]);
    }
  }

  if (!candidatesBySlot.some(list => list.length)) return [];

  let picks = [];
  try {
    picks = await selectWithLLM({ plan: slots, candidatesBySlot, roomType, style, deps });
  } catch (e) {
    log({ event: 'product_pick_llm_error', error: String(e.message || e).slice(0, 200) });
  }
  const pickBySlot = new Map(picks.filter(p => p && p.slot).map(p => [p.slot, p]));

  const selected = [];
  slots.forEach((slot, i) => {
    const candidates = candidatesBySlot[i] || [];
    if (!candidates.length) return;
    const pick = pickBySlot.get(slot.slot);
    const chosen = pick && pick.offer_id
      ? candidates.find(c => String(c.offer_id) === String(pick.offer_id))
      : null;
    if (pick && pick.offer_id && !chosen) return; // LLM выбрал несуществующего — пропускаем слот
    const product = chosen || candidates[0];
    selected.push({ ...product, slot: slot.slot, why: pick?.why || '', picked_by: chosen ? 'llm' : 'score' });
  });
  return selected.slice(0, Math.max(1, Math.min(4, maxProducts)));
}

// Скачивает картинки выбранных товаров (SSRF-safe) → data URL для input_references.
export async function loadProductImages(products = [], deps = {}) {
  const fetchImage = deps.fetchRemoteImage || defaultFetchImage;
  const log = deps.log || defaultLog;
  const out = [];
  for (const product of products) {
    if (!product?.picture_url) continue;
    try {
      const { buffer, mime } = await fetchImage(product.picture_url);
      out.push({ ...product, b64: `data:${mime};base64,${buffer.toString('base64')}` });
    } catch (e) {
      log({ event: 'product_pick_image_error', offer_id: product.offer_id, error: String(e.message || e).slice(0, 200) });
    }
  }
  return out;
}

// Отбор товаров ДО генерации: тип комнаты × слот × класс материалов × стиль.
// Бюджет-сумма больше не управляет подбором: класс материалов задаёт уровень,
// а смета собирается из фактически выбранных товаров.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { log, MAX_REFERENCES } from './openrouter.js';
import { detectImageExt } from './imagesize.js';
import { getBuffer } from './storage.js';
import { roomTypeByName } from './roomtypes.js';
import { PRICE_TIERS, tierDistance } from './pricing.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const REFCACHE = path.join(DATA_DIR, 'refcache');
fs.mkdirSync(REFCACHE, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'products'), { recursive: true });

export const CATEGORIES = ['floor', 'paint', 'wallpaper', 'tile', 'skirting', 'countertop', 'cabinet', 'faucet', 'sink', 'toilet', 'shower', 'bathtub', 'light', 'outlets', 'appliance', 'textile'];

const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').trim();
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

export const hasImage = p => Boolean(p.image_path || p.image_url);

export function styleScore(product, style) {
  const wanted = STYLE_TAGS[style] || [];
  if (!wanted.length) return 0.5;
  if (!product.style_tags) return 0.5;
  const tags = norm(product.style_tags).split(',').map(t => t.trim()).filter(Boolean);
  if (!tags.length) return 0.5;
  return tags.some(t => wanted.includes(t)) ? 1 : 0;
}

export function productFitsRoom(product, roomType) {
  if (!roomType || roomType === 'Другое') return true;
  const raw = String(product.room_types || '').trim();
  if (!raw) return true;
  return raw.split(',').map(s => s.trim()).includes(roomType);
}

function hashPick(list, seed, key) {
  if (!list.length) return null;
  const h = crypto.createHash('sha1').update(`${seed}:${key}`).digest();
  return list[h[0] % list.length];
}

export async function curateProducts({ style, budget, priceTier = 'comfort', roomType = 'Другое', preferredIds = [], allowedCategories = null, seed = '' }) {
  const tier = PRICE_TIERS.includes(priceTier) ? priceTier : 'comfort';
  const room = roomTypeByName(roomType);
  const slots = room?.slots?.length
    ? room.slots
    : (Array.isArray(allowedCategories) && allowedCategories.length ? allowedCategories.map(c => ({ key: c, categories: [c] })) : CATEGORIES.map(c => ({ key: c, categories: [c] })));
  const all = await q.allProducts();
  const preferred = all.filter(p => preferredIds.map(Number).includes(Number(p.id)));
  const chosen = [];

  const pickForSlot = slot => {
    const preferredHere = preferred.filter(p => slot.categories.includes(p.category) && productFitsRoom(p, roomType));
    if (preferredHere.length) return preferredHere[0];

    let candidates = all
      .filter(p => p.active !== false && slot.categories.includes(p.category))
      .filter(p => productFitsRoom(p, roomType));
    if (!candidates.length) return null;

    const scored = candidates
      .map(p => ({
        p,
        tier: tierDistance(norm(p.price_tier) || 'comfort', tier),
        style: styleScore(p, style),
      }))
      .sort((a, b) => a.tier - b.tier || b.style - a.style || Number(a.p.price) - Number(b.p.price));
    if (!scored.length) return null;

    // Если под стиль нет ни одного тегированного товара — не оставляем слот пустым,
    // берём нейтральный материал того же класса.
    const styleMatched = scored.filter(x => x.style > 0);
    const pool = styleMatched.length ? styleMatched : scored;
    const bestTier = pool[0].tier;
    const bestStyle = pool.filter(x => x.tier === bestTier)[0]?.style ?? 0;
    const closest = pool.filter(x => x.tier === bestTier && x.style === bestStyle).slice(0, 4);
    return hashPick(closest, seed || String(budget || ''), slot.key)?.p || pool[0].p;
  };

  for (const slot of slots) {
    if (chosen.some(c => slot.categories.includes(c.category))) continue;
    const p = pickForSlot(slot);
    if (p) chosen.push({ ...p, slot: slot.key });
  }
  return chosen;
}

// скачать/прочитать фото товара → data URL (base64) для input_references.
// Внешние image_url кэшируем в data/refcache/<sha1>, локальные /catalog/... читаем из public.
export async function referenceImagesDetailed(products, limit = MAX_REFERENCES) {
  const out = [];
  for (const p of products) {
    if (out.length >= limit) break;
    try {
      let buf, mime;
      if (p.image_path) {
        buf = await getBuffer(p.image_path);
        mime = 'image/jpeg';
      } else if (p.image_url && String(p.image_url).startsWith('/')) {
        const local = path.join(process.cwd(), 'public', String(p.image_url).replace(/^\//, ''));
        if (!fs.existsSync(local)) throw new Error('локальная картинка не найдена');
        buf = fs.readFileSync(local);
      } else if (p.image_url) {
        const cache = path.join(REFCACHE, crypto.createHash('sha1').update(p.image_url).digest('hex'));
        if (fs.existsSync(cache)) {
          buf = fs.readFileSync(cache);
        } else {
          const r = await fetch(p.image_url, { signal: AbortSignal.timeout(10_000) });
          if (!r.ok) throw new Error(`http ${r.status}`);
          buf = Buffer.from(await r.arrayBuffer());
          fs.writeFileSync(cache, buf);
        }
      } else {
        continue;
      }
      const ext = detectImageExt(buf);
      if (ext === 'png') mime = 'image/png';
      if (ext === 'webp') mime = 'image/webp';
      out.push({ b64: `data:${mime};base64,${buf.toString('base64')}`, product: p });
    } catch (e) {
      log({ event: 'ref_image_error', product_id: p.id, url: p.image_url, error: String(e.message || e).slice(0, 200) });
    }
  }
  return out;
}

export async function referenceImages(products, limit = MAX_REFERENCES) {
  return (await referenceImagesDetailed(products, limit)).map(r => r.b64);
}

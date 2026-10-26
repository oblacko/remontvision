// Отбор товаров ДО генерации: бюджет × стиль → по кандидату из каждой категории.
// Инверсия старой схемы: не «нарисовали → подогнали каталог», а «выбрали товары →
// нарисовали с ними (референсы в генерацию) → смета = отобранные товары».
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { log, MAX_REFERENCES } from './openrouter.js';
import { detectImageExt } from './imagesize.js';
import { getBuffer } from './storage.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const REFCACHE = path.join(DATA_DIR, 'refcache');
fs.mkdirSync(REFCACHE, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'products'), { recursive: true });

// категории сметы и доля бюджета на каждую (сумма ≈ 1)
export const CATEGORIES = ['tile', 'paint', 'countertop', 'faucet', 'light', 'outlets', 'cabinet'];
const BUDGET_SHARE = { tile: 0.16, paint: 0.06, countertop: 0.26, faucet: 0.12, light: 0.13, outlets: 0.05, cabinet: 0.22 };

// нормализация тегов/стилей: «Современный» → «современный» и т.д.
const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').trim();
const STYLE_TAGS = {
  'Современный': ['современный', 'минимализм', 'лофт'],
  'Светлый':     ['светлый', 'сканди', 'скандинавский'],
  'Тёмный':      ['темный', 'тёмный', 'премиум'],
  'Классика':    ['классика', 'классический', 'неоклассика'],
};

// у товара есть фото (локальное или внешнее) — без фото в референсы не берём
export const hasImage = p => Boolean(p.image_path || p.image_url);

// скор товара под стиль: 1 = совпал тег, 0.5 = тегов нет, 0 = теги есть но не совпали
function styleScore(product, style) {
  const wanted = STYLE_TAGS[style] || STYLE_TAGS['Современный'];
  if (!product.style_tags) return 0.5;
  const tags = norm(product.style_tags).split(',').map(t => t.trim());
  return tags.some(t => wanted.includes(t)) ? 1 : 0;
}

export async function curateProducts({ style, budget }) {
  const budgetRub = budget * 1000;
  const all = await q.allProducts();
  const chosen = [];
  for (const cat of CATEGORIES) {
    const share = (BUDGET_SHARE[cat] || 0.1) * budgetRub;
    const candidates = all
      .filter(p => p.category === cat && p.price * (p.qty || 1) <= share * 1.6) // допуск 60% сверх доли
      .map(p => ({ p, s: styleScore(p, style), diff: Math.abs(p.price * (p.qty || 1) - share) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.diff - b.diff);
    if (candidates[0]) chosen.push(candidates[0].p);
  }
  return chosen;
}

// скачать/прочитать фото товара → data URL (base64) для input_references.
// Внешние image_url кэшируем в data/refcache/<sha1>.
export async function referenceImages(products) {
  const out = [];
  for (const p of products) {
    if (out.length >= MAX_REFERENCES) break;
    try {
      let buf, mime;
      if (p.image_path) {
        buf = await getBuffer(p.image_path); // диск или S3 — прозрачно
        mime = 'image/jpeg';
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
        mime = 'image/jpeg';
      } else {
        continue;
      }
      const ext = detectImageExt(buf);
      if (ext === 'png') mime = 'image/png';
      if (ext === 'webp') mime = 'image/webp';
      out.push(`data:${mime};base64,${buf.toString('base64')}`);
    } catch (e) {
      log({ event: 'ref_image_error', product_id: p.id, url: p.image_url, error: String(e.message || e).slice(0, 200) });
    }
  }
  return out;
}

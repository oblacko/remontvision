// Парсер карточек товара: цена и наличие из JSON-LD/микроразметки.
// Чистые функции держим отдельно от сети, чтобы тестировать без БД и интернета.
import { isLikelyProductUrl } from './yandexsearch.js';

const IN_STOCK = /(instock|in stock|в наличии|есть в наличии|available)/i;
const OUT_OF_STOCK = /(outofstock|out of stock|soldout|sold out|нет в наличии|нет в продаже|распродано|закончился)/i;
const PREORDER = /(preorder|pre-order|backorder|под заказ|предзаказ|ожидается)/i;
const LIMITED = /(limitedavailability|limited availability|ограничен)/i;

export function normalizeAvailability(raw) {
  const text = String(raw || '').trim();
  if (!text) return { status: 'unknown', label: 'Неизвестно' };
  if (OUT_OF_STOCK.test(text)) return { status: 'out_of_stock', label: 'Нет в наличии' };
  if (PREORDER.test(text)) return { status: 'preorder', label: 'Под заказ' };
  if (IN_STOCK.test(text) || LIMITED.test(text)) return { status: 'in_stock', label: 'В наличии' };
  return { status: 'unknown', label: 'Неизвестно' };
}

export function withBuyKeyword(query, keyword = 'купить') {
  const base = String(query || '').trim();
  const word = String(keyword || '').trim();
  if (!base || !word) return base;
  const lower = base.toLowerCase();
  if (lower.split(/\s+/).includes(word.toLowerCase())) return base;
  return `${base} ${word}`;
}

const checkedAt = () => new Date().toISOString();

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

// Обогащает результаты поиска ценой/наличием. Ошибки парсинга не роняют поиск:
// строка остаётся с исходной ценой из сниппета и availability=unknown.
export async function enrichSearchResults(results, { limit = 6, concurrency = 3 } = {}) {
  const rows = Array.isArray(results) ? results : [];
  const targets = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row?.url && isLikelyProductUrl(row.url))
    .slice(0, Math.max(0, Number(limit) || 0));

  if (targets.length === 0) return rows;

  const { inspectProductUrl } = await import('./productimport.js');
  const enriched = await mapLimit(targets, Math.max(1, Number(concurrency) || 1), async ({ row, index }) => {
    try {
      const page = await inspectProductUrl(row.url, { timeoutMs: 10_000 });
      const availability = normalizeAvailability(page.availability);
      const price = page.price == null ? row.price ?? null : Number(page.price);
      return {
        index,
        patch: {
          title: row.title || page.name || '',
          image_url: row.image_url || page.image_url || null,
          price,
          currency: page.currency || row.currency || 'RUB',
          availability: availability.status,
          price_source: page.price == null ? 'snippet' : 'jsonld',
          checked_at: checkedAt(),
        },
      };
    } catch {
      return {
        index,
        patch: {
          availability: 'unknown',
          price_source: row.price == null ? null : 'snippet',
          checked_at: checkedAt(),
        },
      };
    }
  });

  const next = rows.map(row => ({ ...row }));
  for (const item of enriched) {
    if (!item) continue;
    next[item.index] = { ...next[item.index], ...item.patch };
  }
  return next;
}

// Матчинг предметов из разбора архитектора в реальные офферы catalog-service (Hoff).
// Никаких фолбэков в чужие категории: нет товара — честно говорим об этом.
const MAX_ITEMS = 12;
const CONCURRENCY = 3;
const DEFAULT_TOP_K = 3;

const clampText = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function offerUrl(offer) {
  const raw = String(offer?.affiliate_url || offer?.canonical_url || '').trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function normalizeOffer(offer) {
  if (!offer || !offer.offer_id) return null;
  const price = Number(offer.price);
  return {
    id: String(offer.offer_id),
    name: clampText(offer.name, 240),
    price: Number.isFinite(price) ? price : null,
    currency: clampText(offer.currency, 8) || 'RUB',
    merchant: clampText(offer.merchant, 80) || null,
    url: offerUrl(offer),
    image_url: /^https?:\/\//i.test(String(offer.picture_url || '')) ? String(offer.picture_url) : null,
    erid: offer.erid ? String(offer.erid) : null,
    score: Number.isFinite(Number(offer.score)) ? Number(offer.score) : null,
    params: offer.params && typeof offer.params === 'object' ? offer.params : {},
  };
}

function searchQuery(item) {
  return clampText(
    item?.search_query
      || [item?.label, item?.subtype, item?.color, item?.material].filter(Boolean).join(' '),
    160,
  );
}

function catalogLabel(item) {
  return clampText(item?.label || item?.category || 'этой категории', 80);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function matchDesignOffers({
  items = [],
  roomType = 'Другое',
  topK = DEFAULT_TOP_K,
  limit = MAX_ITEMS,
  search = null,
} = {}) {
  const list = (Array.isArray(items) ? items : [])
    .filter(item => item && item.category)
    .slice(0, Math.max(1, Math.min(MAX_ITEMS, Number(limit) || MAX_ITEMS)));
  if (!list.length) return [];
  const searchOffers = search || (await import('./catalogclient.js')).searchCatalogText;
  const size = Math.max(1, Math.min(10, Number(topK) || DEFAULT_TOP_K));

  return mapLimit(list, CONCURRENCY, async item => {
    const query = searchQuery(item);
    try {
      const { results } = await searchOffers({
        query,
        filters: { categories: [item.category] },
        product: {
          label: item.label,
          color: item.color || undefined,
          material: item.material || undefined,
          product_type: item.subtype || undefined,
          category: item.category,
          search_query: query,
          room_type: roomType,
        },
        topK: size,
      }, { timeoutMs: 8_000 });
      const offers = (Array.isArray(results) ? results : []).map(normalizeOffer).filter(Boolean);
      return {
        item: {
          key: item.key || item.category,
          label: item.label,
          category: item.category,
          bbox: item.bbox || null,
        },
        offers,
        ...(offers.length ? {} : { note: `В каталоге нет товаров категории «${catalogLabel(item)}»` }),
      };
    } catch (e) {
      return {
        item: {
          key: item.key || item.category,
          label: item.label,
          category: item.category,
          bbox: item.bbox || null,
        },
        offers: [],
        note: `Каталог недоступен: ${clampText(e?.message || e, 160)}`,
      };
    }
  });
}

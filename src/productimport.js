// Импорт товара по ссылке: JSON-LD / OpenGraph → превью → ручное одобрение.
// Никакого автоматического попадания в каталог: только черновик + quality checks.
import crypto from 'node:crypto';
import { assertPublicUrl, fetchRemoteImage } from './remoteimage.js';
import { sanitizeImage } from './media.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { putBuffer } from './storage.js';

export const DEFAULT_IMPORT_DOMAINS = [
  'market.yandex.ru', 'leroymerlin.ru', 'obi.ru', 'hoff.ru', 'askona.ru',
  'divan.ru', 'stoolgroup.ru', 'divanboss.ru', 'mnogomebeli.ru',
  'petrovich.ru', 'vseinstrumenti.ru', 'lazurit.com',
  'sonum.ru', 'wooden-world.ru', 'mebelion.ru', 'mnogosna.ru',
  'leoparquet.ru', 'poli24.ru', 'profiplitka.ru', 'sanok.ru',
];

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const CATEGORY_WORDS = [
  ['bed', ['кровать', 'кровати', 'кровать-', 'изголовье кровати']],
  ['wardrobe', ['шкаф', 'гардероб', 'гардеробная система']],
  ['sofa', ['диван', 'софа', 'кушетка']],
  ['armchair', ['кресло', 'кресла']],
  ['coffee_table', ['журнальный стол', 'кофейный стол']],
  ['dining_table', ['обеденный стол', 'кухонный стол']],
  ['dining_chair', ['стул', 'стулья', 'табурет']],
  ['sideboard', ['комод', 'консоль', 'буфет']],
  ['desk', ['письменный стол', 'рабочий стол', 'стол компьютерный']],
  ['office_chair', ['офисное кресло', 'компьютерное кресло', 'эргономичное кресло']],
  ['storage', ['стеллаж', 'полка', 'полки', 'шкаф-стеллаж', 'хранение']],
  ['bench', ['банкетка', 'скамья', 'скамейка']],
  ['rug', ['ковер', 'ковёр', 'ковры', 'палас']],
  ['floor', ['ламинат', 'паркет', 'инженерная доска', 'массив', 'виниловая плитка', 'керамогранит', 'наливной пол', 'линолеум']],
  ['paint', ['краска', 'краска для стен', 'эмаль']],
  ['wallpaper', ['обои', 'фотообои']],
  ['tile', ['плитка', 'кабанчик', 'зеллиж', 'мозаика', 'фартук']],
  ['skirting', ['плинтус']],
  ['countertop', ['столешница']],
  ['cabinet', ['фасад', 'кухонный гарнитур', 'кухня', 'тумба']],
  ['faucet', ['смеситель', 'кран']],
  ['sink', ['раковина', 'мойка']],
  ['toilet', ['унитаз', 'биде']],
  ['shower', ['душевая', 'душ', 'поддон']],
  ['bathtub', ['ванна']],
  ['light', ['светильник', 'люстра', 'подвес', 'бра', 'торшер', 'лампа']],
  ['outlets', ['розетка', 'выключатель', 'рамка розетки']],
  ['appliance', ['духовой шкаф', 'варочная панель', 'вытяжка', 'холодильник', 'посудомоечная', 'микроволновка']],
  ['textile', ['ткань', 'шторы', 'портьера', 'тюль', 'плед', 'подушка']],
];

const ROOMS_BY_CATEGORY = {
  bed: 'Спальня,Детская',
  wardrobe: 'Спальня,Прихожая,Гардеробная',
  sofa: 'Гостиная (зал),Кабинет',
  armchair: 'Гостиная (зал),Спальня,Кабинет',
  coffee_table: 'Гостиная (зал)',
  dining_table: 'Столовая,Кухня',
  dining_chair: 'Столовая,Кухня',
  sideboard: 'Гостиная (зал),Столовая,Прихожая',
  desk: 'Кабинет,Детская,Спальня',
  office_chair: 'Кабинет',
  storage: 'Кабинет,Гостиная (зал),Детская,Кладовка,Гардеробная',
  bench: 'Прихожая,Спальня,Столовая',
  rug: 'Гостиная (зал),Спальня,Столовая,Детская',
  floor: 'Спальня,Гостиная (зал),Детская,Кухня,Санузел,Прихожая,Столовая,Кабинет,Балкон / лоджия',
  paint: 'Спальня,Гостиная (зал),Детская,Кухня,Столовая,Кабинет,Прихожая',
  wallpaper: 'Спальня,Гостиная (зал),Детская,Столовая,Кабинет,Прихожая',
  tile: 'Кухня,Санузел,Прихожая,Балкон / лоджия',
  skirting: 'Спальня,Гостиная (зал),Детская,Столовая,Кабинет,Прихожая',
  countertop: 'Кухня,Санузел',
  cabinet: 'Кухня,Санузел,Прихожая,Кладовка,Гардеробная',
  faucet: 'Кухня,Санузел', sink: 'Кухня,Санузел', toilet: 'Санузел', shower: 'Санузел', bathtub: 'Санузел',
  light: '', outlets: '', appliance: 'Кухня', textile: 'Спальня,Гостиная (зал),Детская,Столовая,Кабинет,Прихожая',
};

const TIER_PRICE = {
  bed: [45000, 90000, 160000], wardrobe: [40000, 90000, 150000],
  sofa: [60000, 130000, 220000], armchair: [25000, 60000, 100000],
  coffee_table: [15000, 40000, 80000], dining_table: [35000, 90000, 170000],
  dining_chair: [6000, 15000, 30000], sideboard: [30000, 70000, 130000],
  desk: [20000, 50000, 100000], office_chair: [15000, 35000, 70000],
  storage: [15000, 45000, 90000], bench: [15000, 35000, 65000], rug: [12000, 35000, 70000],
  floor: [1800, 4500, 9000], paint: [900, 2500, 6000], wallpaper: [1200, 3500, 9000],
  tile: [1600, 4000, 9000], skirting: [300, 700, 1500], countertop: [5000, 15000, 35000],
  cabinet: [7000, 13000, 24000], faucet: [4000, 12000, 25000], sink: [5000, 14000, 32000],
  toilet: [10000, 25000, 60000], shower: [25000, 45000, 80000], bathtub: [25000, 50000, 90000],
  light: [3000, 8000, 25000], outlets: [300, 900, 2500], appliance: [30000, 50000, 90000],
  textile: [1500, 3500, 7000],
};

const UNIT_BY_CATEGORY = {
  floor: 'м²', tile: 'м²', paint: 'л', wallpaper: 'рулон', skirting: 'м.п.', countertop: 'м.п.',
  textile: 'м', cabinet: 'м²', light: 'шт', outlets: 'шт', faucet: 'шт', sink: 'шт', toilet: 'шт',
  shower: 'шт', bathtub: 'шт', appliance: 'шт', bed: 'шт', wardrobe: 'шт', sofa: 'шт', armchair: 'шт',
  coffee_table: 'шт', dining_table: 'шт', dining_chair: 'шт', sideboard: 'шт', desk: 'шт',
  office_chair: 'шт', storage: 'шт', bench: 'шт', rug: 'шт',
};
const QTY_BY_CATEGORY = { floor: 35, tile: 12, paint: 10, wallpaper: 8, skirting: 30, countertop: 3, textile: 6, cabinet: 6, outlets: 10 };

const STYLE_WORDS = {
  'современный': ['современ', 'минимал'], 'скандинавский': ['сканди', 'scandi'],
  'лофт': ['лофт', 'loft'], 'джапанди': ['джапанд', 'japandi'],
  'неоклассика': ['неокласс', 'классик'], 'минимализм': ['минимал'],
  'тёмный модерн': ['тёмн', 'темн', 'графит'], 'бохо': ['бохо', 'boho'],
  'ар-деко': ['ар-деко', 'deco'], 'кантри': ['кантри', 'country', 'прованс'],
};

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const stripTags = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const decode = s => stripTags(String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

function meta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i'),
  ];
  for (const re of patterns) { const m = html.match(re); if (m) return decode(m[1]); }
  return '';
}

function jsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      let data = JSON.parse(m[1].trim());
      if (Array.isArray(data)) out.push(...data);
      else if (data?.['@graph']) out.push(...data['@graph']);
      else out.push(data);
    } catch { /* битый JSON-LD пропускаем */ }
  }
  return out;
}

function findProductLd(graph) {
  return graph.find(x => {
    const t = x?.['@type'];
    return Array.isArray(t) ? t.includes('Product') : t === 'Product';
  });
}

function firstImage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstImage(value[0]);
  if (typeof value === 'object') return value.url || value.contentUrl || '';
  return '';
}

function parsePrice(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  const s = String(value).replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}


function unitToCm(value, unit) {
  const n = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  const u = String(unit || 'см').toLowerCase().replace('.', '');
  if (u.startsWith('мм') || u === 'mm') return Math.round(n) / 10;
  if (u === 'м' || u === 'm') return Math.round(n * 100);
  if (u === 'in' || u === 'inch' || u === 'дюйм') return Math.round(n * 2.54 * 10) / 10;
  return Math.round(n * 10) / 10;
}

function measured(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    const v = value.value ?? value.minValue ?? value.maxValue;
    const unit = value.unitCode || value.unitText || 'CMT';
    const map = { CMT: 'см', MMT: 'мм', MTR: 'м', INH: 'in' };
    return { cm: unitToCm(v, map[unit] || unit), raw: `${v} ${map[unit] || ''}`.trim() };
  }
  const m = String(value).match(/([\d.,]+)\s*(мм|см|м|mm|cm|m|in|inch)?/i);
  if (!m) return null;
  return { cm: unitToCm(m[1], m[2] || 'см'), raw: String(value).trim() };
}

export function extractDimensions(html, ld, description = '') {
  const dims = { text: '', width_cm: null, depth_cm: null, height_cm: null, diameter_cm: null, raw: '' };
  const named = {};
  const props = [];
  if (ld?.additionalProperty) props.push(...(Array.isArray(ld.additionalProperty) ? ld.additionalProperty : [ld.additionalProperty]));
  if (Array.isArray(ld?.hasMeasurement)) props.push(...ld.hasMeasurement);
  for (const prop of props) {
    const name = norm(`${prop?.name || ''} ${prop?.propertyID || ''}`);
    const value = prop?.value ?? prop?.minValue ?? prop?.maxValue;
    if (!name || value == null) continue;
    const withUnit = (typeof value === 'object') ? value : { value, unitCode: prop.unitCode || prop.unitText };
    if (name.includes('ширин')) named.width = measured(withUnit);
    else if (name.includes('глубин')) named.depth = measured(withUnit);
    else if (name.includes('высот')) named.height = measured(withUnit);
    else if (name.includes('диаметр')) named.diameter = measured(withUnit);
    else if (name.includes('габарит') || name.includes('размер')) dims.raw = String(value);
  }
  if (ld?.width) named.width = measured(ld.width);
  if (ld?.depth) named.depth = measured(ld.depth);
  if (ld?.height) named.height = measured(ld.height);
  if (ld?.diameter) named.diameter = measured(ld.diameter);

  const text = norm(`${description} ${meta(html, 'og:description')}`);
  const triple = text.match(/(\d+(?:[.,]\d+)?)\s*[x×х]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×х]\s*(\d+(?:[.,]\d+)?))?\s*(мм|см|м)(?=\s|$|[,.;])/);
  if (triple) {
    const unit = triple[4];
    const a = unitToCm(triple[1], unit), b = unitToCm(triple[2], unit), c = triple[3] ? unitToCm(triple[3], unit) : null;
    if (!named.width) named.width = { cm: a, raw: `${triple[1]} ${unit}` };
    if (!named.depth) named.depth = { cm: b, raw: `${triple[2]} ${unit}` };
    if (c != null && !named.height) named.height = { cm: c, raw: `${triple[3]} ${unit}` };
    dims.raw = triple[0];
  }
  const one = name => {
    const re = new RegExp(`${name}\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(мм|см|м)`, 'i');
    const m = text.match(re);
    return m ? { cm: unitToCm(m[1], m[2]), raw: m[0] } : null;
  };
  named.width ||= one('ширин');
  named.depth ||= one('глубин');
  named.height ||= one('высот');
  named.diameter ||= one('диаметр');

  if (named.diameter?.cm) {
    dims.diameter_cm = named.diameter.cm;
    dims.text = `⌀${named.diameter.cm} см`;
  } else if (named.width?.cm && named.depth?.cm && named.height?.cm) {
    dims.width_cm = named.width.cm; dims.depth_cm = named.depth.cm; dims.height_cm = named.height.cm;
    dims.text = `${dims.width_cm}×${dims.depth_cm}×${dims.height_cm} см`;
  } else if (named.width?.cm && named.depth?.cm) {
    dims.width_cm = named.width.cm; dims.depth_cm = named.depth.cm;
    dims.text = `${dims.width_cm}×${dims.depth_cm} см`;
  } else if (dims.raw) {
    dims.text = dims.raw;
  } else if (named.width?.cm) {
    dims.width_cm = named.width.cm; dims.text = `${named.width.cm} см`;
  }
  return dims;
}

export function inferCategory(text) {
  const s = norm(text);
  let best = null, bestScore = 0;
  for (const [category, words] of CATEGORY_WORDS) {
    let score = 0;
    for (const w of words) if (s.includes(w)) score += w.length;
    if (score > bestScore) { bestScore = score; best = category; }
  }
  return best;
}

export function inferTier(category, price) {
  const range = TIER_PRICE[category] || [5000, 20000, 60000];
  if (!price) return 'comfort';
  if (price <= range[0]) return 'start';
  if (price <= range[1]) return 'comfort';
  if (price <= range[2]) return 'premium';
  return 'atelier';
}

function inferStyles(text) {
  const s = norm(text);
  const tags = [];
  for (const [tag, words] of Object.entries(STYLE_WORDS)) {
    if (words.some(w => s.includes(w))) tags.push(tag);
  }
  return tags.join(',');
}

function simplifyName(name) {
  return norm(name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(для|кухни|гостиной|спальни|детской|ванной|туалета|шт|см|мм|м2|м²|цвет|размер|арт|артикул|новый|новая)\b/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokens(name) {
  return new Set(simplifyName(name).split(' ').filter(w => w.length >= 3));
}

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / (A.size + B.size - common);
}

async function fetchPage(rawUrl) {
  let url = await assertPublicUrl(rawUrl);
  for (let i = 0; i <= 3; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; remontvision-import/1.0; +https://www.remontvision.ru)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.6',
      },
    });
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get('location');
      if (!location) throw new Error('Редирект без Location');
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!r.ok) throw new Error(`Страница вернула ${r.status}`);
    const mime = String(r.headers.get('content-type') || '').toLowerCase();
    if (!mime.includes('text/html') && !mime.includes('application/xhtml')) throw new Error('По ссылке не HTML-страница товара');
    const length = Number(r.headers.get('content-length') || 0);
    if (length && length > MAX_HTML_BYTES) throw new Error('Страница больше 3 МБ');
    const html = await r.text();
    if (html.length > MAX_HTML_BYTES) throw new Error('Страница больше 3 МБ');
    return { url: url.toString(), html };
  }
  throw new Error('Слишком много редиректов');
}

export function parseProductHtml(html, pageUrl = '') {
  const graph = jsonLd(html);
  const ld = findProductLd(graph);
  const offers = Array.isArray(ld?.offers) ? ld.offers[0] : (ld?.offers || {});
  const brand = typeof ld?.brand === 'object' ? (ld.brand.name || '') : (ld?.brand || '');
  const rating = ld?.aggregateRating || {};
  const title = decode(ld?.name || meta(html, 'og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''));
  const description = decode(ld?.description || meta(html, 'og:description') || meta(html, 'description') || '');
  const imageRaw = firstImage(ld?.image) || meta(html, 'og:image') || meta(html, 'twitter:image');
  const imageUrl = imageRaw ? new URL(imageRaw, pageUrl || undefined).toString() : '';
  const price = parsePrice(offers?.price ?? offers?.lowPrice ?? offers?.priceSpecification?.price ?? meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount'));
  const currency = String(offers?.priceCurrency || meta(html, 'product:price:currency') || 'RUB').toUpperCase();
  const availability = String(offers?.availability || ld?.offers?.availability || '');
  const dimensions = extractDimensions(html, ld, description);
  return {
    name: title.replace(/\s*[|—–-]\s*(купить|интернет-магазин|официальный сайт|catalog|каталог).*$/i, '').trim().slice(0, 200),
    brand: String(brand || '').slice(0, 80),
    description: description.slice(0, 1200),
    price,
    currency,
    image_url: imageUrl,
    source_url: pageUrl,
    sku: String(ld?.sku || ld?.mpn || '').slice(0, 80),
    availability,
    dimensions,
    rating: Number(rating.ratingValue) || 0,
    reviews: Number(rating.reviewCount || rating.ratingCount) || 0,
  };
}

export async function inspectProductUrl(rawUrl) {
  const { url, html } = await fetchPage(rawUrl);
  const data = parseProductHtml(html, url);
  const category = inferCategory(`${data.name} ${data.description} ${data.brand}`);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const allowedDomains = String(process.env.PRODUCT_IMPORT_DOMAINS || DEFAULT_IMPORT_DOMAINS.join(','))
    .split(',').map(s => s.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
  const allowedDomain = allowedDomains.some(d => host === d || host.endsWith(`.${d}`));
  const issues = [];
  if (!allowedDomain) issues.push(`Домен ${host} не в allowlist`);
  if (!data.name) issues.push('Не удалось извлечь название');
  if (!data.price) issues.push('Не удалось извлечь цену');
  if (!data.image_url) issues.push('Не удалось найти картинку');
  const bad = ['б/у', 'бу ', 'уценк', 'витрин', 'образец', 'распродаж', 'поврежд', 'царапин'];
  const used = bad.some(w => norm(data.name + ' ' + data.description).includes(w));
  if (used) issues.push('Похоже на б/у, уценку или витринный образец');
  return {
    url,
    domain: host,
    allowed_domain: allowedDomain,
    name: data.name,
    brand: data.brand,
    description: data.description,
    price: data.price,
    currency: data.currency,
    category,
    image_url: data.image_url,
    sku: data.sku,
    availability: data.availability,
    dimensions: data.dimensions,
    used,
    issues,
  };
}

export async function importProductFromUrl(rawUrl) {
  const { url, html } = await fetchPage(rawUrl);
  const data = parseProductHtml(html, url);
  const category = inferCategory(`${data.name} ${data.description} ${data.brand}`);
  const tier = inferTier(category, data.price);
  const rooms = category ? ROOMS_BY_CATEGORY[category] || '' : '';
  const styleTags = inferStyles(`${data.name} ${data.description}`);
  const dimensions = data.dimensions || { text: '', width_cm: null, depth_cm: null, height_cm: null, diameter_cm: null, raw: '' };
  const host = new URL(url).hostname.replace(/^www\./, '');
  const allowedDomains = String(process.env.PRODUCT_IMPORT_DOMAINS || DEFAULT_IMPORT_DOMAINS.join(','))
    .split(',').map(s => s.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
  const allowedDomain = allowedDomains.some(d => host === d || host.endsWith(`.${d}`));
  const issues = [];
  if (!allowedDomain) issues.push(`Домен ${host} не в allowlist — проверьте вручную`);
  if (!data.name) issues.push('Не удалось извлечь название');
  if (!data.price) issues.push('Не удалось извлечь цену');
  if (!data.image_url) issues.push('Не удалось найти картинку');
  const bad = ['б/у', 'бу ', 'уценк', 'витрин', 'образец', 'распродаж', 'поврежд', 'царапин'];
  const used = bad.some(w => norm(data.name + ' ' + data.description).includes(w));
  if (used) issues.push('Похоже на б/у, уценку или витринный образец');
  if (data.rating && data.rating < 4.3) issues.push(`Низкий рейтинг: ${data.rating}`);
  if (data.reviews && data.reviews < 10) issues.push(`Мало отзывов: ${data.reviews}`);
  const furniture = ['bed','wardrobe','sofa','armchair','coffee_table','dining_table','dining_chair','sideboard','desk','office_chair','storage','bench','rug'].includes(category);
  if (furniture && !dimensions.text) issues.push('Не найдены габариты — добавьте ширину/глубину/высоту вручную');
  if (dimensions.text && dimensions.width_cm && dimensions.width_cm > 400) issues.push(`Подозрительная ширина: ${dimensions.width_cm} см`);
  if (dimensions.text && dimensions.height_cm && dimensions.height_cm > 300) issues.push(`Подозрительная высота: ${dimensions.height_cm} см`);

  let imagePath = null;
  let imageExternal = data.image_url;
  let imageOk = false;
  if (data.image_url) {
    try {
      const img = await fetchRemoteImage(data.image_url);
      const clean = await sanitizeImage(img.buffer);
      const size = imageSize(clean);
      imageOk = size.width >= 600 && size.height >= 600;
      if (!imageOk) issues.push(`Маленькая картинка: ${size.width}×${size.height}`);
      const ext = detectImageExt(clean) === 'png' ? 'png' : detectImageExt(clean) === 'webp' ? 'webp' : 'jpg';
      const file = `import-${crypto.randomUUID()}.${ext}`;
      imagePath = `products/${file}`;
      await putBuffer(imagePath, clean, ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
      imageExternal = `/products/${file}`;
    } catch (e) {
      issues.push(`Картинка не скачалась: ${String(e.message || e).slice(0, 120)}`);
    }
  }

  let duplicateOf = null;
  try {
    const { q } = await import('./db.js');
    const all = await q.adminProducts();
    for (const p of all) {
      if (similarity(p.name, data.name) >= 0.72) { duplicateOf = { id: p.id, name: p.name, active: p.active !== false }; break; }
    }
  } catch { /* БД может быть недоступна в юнит-тестах */ }
  if (duplicateOf) issues.push(`Похоже на дубль: ${duplicateOf.name}`);

  let score = 100;
  if (!allowedDomain) score -= 20;
  if (!data.name) score -= 25;
  if (!data.price) score -= 20;
  if (!imageOk) score -= 25;
  if (used) score -= 20;
  if (data.rating && data.rating < 4.3) score -= 10;
  if (duplicateOf) score -= 15;
  if (furniture && !dimensions.text) score -= 10;
  score = Math.max(0, Math.min(100, score));

  return {
    url,
    domain: host,
    allowed_domain: allowedDomain,
    name: data.name,
    brand: data.brand,
    description: data.description,
    price: data.price,
    currency: data.currency,
    category,
    unit: category ? (UNIT_BY_CATEGORY[category] || 'шт') : 'шт',
    qty: category ? (QTY_BY_CATEGORY[category] || 1) : 1,
    price_tier: tier,
    room_types: rooms,
    style_tags: styleTags,
    surface: category && ['floor','paint','wallpaper','tile','skirting','countertop','cabinet','faucet','sink','toilet','shower','bathtub','light','outlets','appliance','textile'].includes(category) ? category : (category || null),
    source: host,
    url_source: data.source_url,
    image_path: imagePath,
    image_url: imageExternal,
    sku: data.sku,
    availability: data.availability,
    rating: data.rating || null,
    reviews: data.reviews || null,
    dimensions,
    attrs: {
      ...(data.brand ? { бренд: data.brand } : {}),
      ...(dimensions.text ? { габариты: dimensions.text } : {}),
      ...(data.sku ? { артикул: data.sku } : {}),
      ...(data.rating ? { рейтинг: data.rating } : {}),
      ...(data.reviews ? { отзывов: data.reviews } : {}),
    },
    quality: { score, allowed_domain: allowedDomain, used, duplicate_of: duplicateOf, image_ok: imageOk, issues },
  };
}

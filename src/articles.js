// Контент-движок: lookbook-статья = рендер-обложка + палитра + реальные товары Hoff + текст.
// Генерация идёт через тот же art-direction/picker, что и основной продукт.
import crypto from 'node:crypto';
import path from 'node:path';
import { q } from './db.js';
import { generateTextImage, visionJson, log } from './openrouter.js';
import { getModelConfig } from './modelconfig.js';
import { pickHoffProducts } from './productpicker.js';
import { detectImageExt } from './imagesize.js';
import { putBuffer } from './storage.js';
import { roomTypeByName } from './roomtypes.js';
import { PRICE_TIER_META, normalizeTier } from './pricing.js';

const ARTICLE_MODEL = process.env.ARTICLE_MODEL || 'deepseek/deepseek-v4.1-flash-1017';
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// Главные предметы по типу комнаты (для статьи — без vision-прохода).
const HERO_PLAN = {
  'Спальня': [
    { slot: 'bed', category: 'bed', query: 'кровать мягкая натуральная ткань', max_w_cm: 200, max_l_cm: 220, why: 'главная зона сна' },
    { slot: 'light', category: 'light', query: 'подвесной светильник тёплый свет', why: 'мягкий верхний свет' },
    { slot: 'decor', category: 'decor', query: 'декор ваза керамика', why: 'акцент и настроение' },
  ],
  'Гостиная (зал)': [
    { slot: 'sofa', category: 'sofa', query: 'диван мягкий натуральная ткань', max_w_cm: 300, max_l_cm: 120, why: 'главная зона отдыха' },
    { slot: 'light', category: 'light', query: 'подвесной светильник тёплый свет', why: 'верхний свет' },
    { slot: 'rug', category: 'rug', query: 'ковёр шерсть нейтральный', max_w_cm: 300, max_l_cm: 400, why: 'зонирование' },
  ],
  'Детская': [
    { slot: 'bed', category: 'bed', query: 'кровать детская деревянная', max_w_cm: 160, max_l_cm: 210, why: 'зона сна' },
    { slot: 'light', category: 'light', query: 'светильник детский тёплый', why: 'мягкий свет' },
    { slot: 'storage', category: 'storage', query: 'стеллаж хранение', why: 'хранение игрушек' },
  ],
  'Кухня': [
    { slot: 'light', category: 'light', query: 'подвесной светильник кухня', why: 'свет над столом' },
    { slot: 'appliance', category: 'appliance', query: 'техника для кухни', why: 'оборудование' },
    { slot: 'faucet', category: 'faucet', query: 'смеситель для кухни', why: 'сантехника' },
  ],
  'Санузел': [
    { slot: 'light', category: 'light', query: 'светильник для ванной', why: 'свет' },
    { slot: 'faucet', category: 'faucet', query: 'смеситель для раковины', why: 'сантехника' },
    { slot: 'decor', category: 'decor', query: 'декор для ванной', why: 'аксессуары' },
  ],
  'Столовая': [
    { slot: 'dining_table', category: 'dining_table', query: 'обеденный стол', max_w_cm: 220, max_l_cm: 110, why: 'главный предмет' },
    { slot: 'light', category: 'light', query: 'подвесной светильник над столом', why: 'свет над столом' },
    { slot: 'decor', category: 'decor', query: 'декор ваза', why: 'акцент' },
  ],
  'Кабинет': [
    { slot: 'desk', category: 'desk', query: 'письменный стол', max_w_cm: 180, max_l_cm: 80, why: 'рабочее место' },
    { slot: 'office_chair', category: 'office_chair', query: 'рабочее кресло', why: 'эргономика' },
    { slot: 'light', category: 'light', query: 'настольная лампа', why: 'рабочий свет' },
  ],
  'Прихожая': [
    { slot: 'storage', category: 'storage', query: 'шкаф прихожая', max_w_cm: 160, max_l_cm: 60, why: 'хранение' },
    { slot: 'light', category: 'light', query: 'потолочный светильник', why: 'свет' },
    { slot: 'mirror', category: 'mirror', query: 'зеркало в прихожую', why: 'акцент' },
  ],
  'Другое': [
    { slot: 'light', category: 'light', query: 'подвесной светильник тёплый свет', why: 'свет' },
    { slot: 'decor', category: 'decor', query: 'декор ваза керамика', why: 'акцент' },
    { slot: 'rug', category: 'rug', query: 'ковёр нейтральный', why: 'фактура' },
  ],
};

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(text) {
  const base = String(text || '').toLowerCase().split('')
    .map(ch => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'article';
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const ARTICLE_SYSTEM = `Ты редактор интерьерного журнала. По данным (стиль, комната, товары) напиши lookbook-статью на русском.
Верни строго JSON без текста вокруг:
{"title":"...","intro":"2-3 предложения","palette":[{"hex":"#RRGGBB","name":"кратко"}],"howto":["3-5 шагов, как собрать стиль"],"palette_notes":"1-2 предложения про палитру и материалы","product_notes":[{"offer_id":"...","note":"1 предложение, почему этот товар подходит"}],"conclusion":"1 предложение"}
Правила:
- Не выдумывай цены, ссылки и товары — используй только переданные.
- Пиши живо, конкретно, без markdown и без списков внутри строк.
- palette — 4-6 гармоничных цветов под стиль и товары, с hex.
- howto — практичные шаги (свет, фактуры, зонирование, декор).
Только JSON.`;

// Статья-рендер: текст пишется под ключевые запросы (Wordstat), объём жёстко
// задан — пакетная генерация без редактора должна проходить гейт ≥500 слов.
const ARTICLE_RENDER_SYSTEM = `Ты редактор интерьерного журнала. По данным (стиль, комната, товары, ключевые запросы) напиши статью на русском.
Верни строго JSON без текста вокруг:
{"title":"...","intro":"2-3 предложения","palette":[{"hex":"#RRGGBB","name":"кратко"}],"howto":["4-6 шагов, как повторить интерьер"],"palette_notes":"1-2 предложения про палитру и материалы","product_notes":[{"offer_id":"...","note":"1 предложение, почему товар подходит"}],"conclusion":"1 предложение"}
Правила:
- Суммарный объём intro + howto + palette_notes + product_notes + conclusion — не менее 600 слов.
- Ключевые запросы используй естественно: раскрой темы, не набивай строки ключами.
- Не выдумывай цены, ссылки и товары — используй только переданные.
- Пиши живо, конкретно, без markdown и без списков внутри строк.
- palette — 4-6 гармоничных цветов под стиль и товары, с hex.
- howto — практичные шаги (свет, фактуры, зонирование, декор).
Только JSON.`;

// Мета от автомата (пакетная генерация, решение владельца 21.11.2026):
// суффикс бренда, если укладывается в лимит выдачи, иначе обрезка по слову.
export function autoMetaTitle(title) {
  const suffix = ' — ремонтвижн';
  const clean = String(title || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Дизайн интерьера — ремонтвижн';
  if (clean.length + suffix.length <= 60) return clean + suffix;
  return clean.slice(0, 60).replace(/\s+\S*$/, '');
}

export async function generateArticle({ style = 'Скандинавский', roomType = 'Спальня', tier = 'comfort', title = '', targetQuery = '' } = {}) {
  const tierKey = normalizeTier(tier);
  const tierMeta = PRICE_TIER_META[tierKey];
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || 'room';
  const styleInfo = await q.styleByName(style);
  const styleDesc = styleInfo?.prompt_description || style;

  const coverPrompt = `Photorealistic editorial interior photograph of a ${roomName} in ${style} style. ${styleDesc}. ${tierMeta.prompt}. Natural window light, realistic materials, warm layered lighting, styled and lived-in, no people, no text, no watermark, high-end interior magazine photography.`;
  const cover = await generateTextImage({
    prompt: coverPrompt,
    aspectRatio: '3:2',
    model: getModelConfig().render,
    resolution: getModelConfig().resolution || '1K',
  });
  const coverBuf = Buffer.from(cover.b64, 'base64');
  const coverExt = detectImageExt(coverBuf);
  const slug = `${slugify(title || `${style}-${roomType}`)}-${crypto.randomBytes(3).toString('hex')}`;
  const coverKey = `covers/${slug}.${coverExt}`;
  await putBuffer(coverKey, coverBuf, MIME_BY_EXT[coverExt] || 'image/png');

  const plan = HERO_PLAN[roomType] || HERO_PLAN['Другое'];
  let picked = [];
  try {
    picked = await pickHoffProducts({ plan, roomType, style, maxProducts: 3 });
  } catch (e) {
    log({ event: 'article_products_error', style, roomType, error: String(e.message || e).slice(0, 200) });
  }
  const priceDate = new Date().toISOString().slice(0, 10);
  const products = picked.map(p => ({
    offer_id: p.offer_id, name: p.name, category: p.category, price: p.price,
    picture_url: p.picture_url, affiliate_url: p.affiliate_url, erid: p.erid, why: p.why,
    price_date: priceDate,
  }));

  const { parsed, cost: textCost } = await visionJson({
    system: ARTICLE_SYSTEM,
    user: JSON.stringify({
      style, roomType, tier: tierKey,
      products: products.map(p => ({ offer_id: p.offer_id, name: p.name, category: p.category, price: p.price })),
    }),
    images: [],
    model: ARTICLE_MODEL,
  });

  const body = {
    intro: String(parsed.intro || '').slice(0, 1200),
    palette: Array.isArray(parsed.palette) ? parsed.palette.slice(0, 6) : [],
    howto: Array.isArray(parsed.howto) ? parsed.howto.map(s => String(s).slice(0, 300)).slice(0, 5) : [],
    palette_notes: String(parsed.palette_notes || '').slice(0, 800),
    product_notes: Array.isArray(parsed.product_notes) ? parsed.product_notes.slice(0, 6) : [],
    conclusion: String(parsed.conclusion || '').slice(0, 600),
  };
  const finalTitle = String(title || parsed.title || `${style} ${roomType}: как собрать интерьер`).slice(0, 140);

  return q.createArticle({
    slug,
    title: finalTitle,
    style,
    room_type: roomType,
    tier: tierKey,
    cover_path: coverKey,
    palette: body.palette,
    body,
    products,
    status: 'draft',
    meta: {
      cover_prompt: coverPrompt,
      cover_cost: cover.cost ?? null,
      text_cost: textCost ?? null,
      model: ARTICLE_MODEL,
      cover_aspect: '3:2',
      target_query: String(targetQuery || '').trim().slice(0, 200) || null,
    },
  });
}

// Статья-рендер: обложка — готовое изображение рендера из продукта, текст —
// под ключевые запросы, в тело кладём промт рендера (кластер «промты для дизайна»).
export async function generateArticleFromRender({ render, style, roomType, tier = 'comfort', keywords = [], title = '' } = {}) {
  if (!render?.image_path) throw new Error('generateArticleFromRender: у рендера нет изображения');
  const tierKey = normalizeTier(tier);
  const room = roomTypeByName(roomType);
  const roomName = room?.prompt || 'room';
  const styleInfo = await q.styleByName(style);
  const styleDesc = styleInfo?.prompt_description || style;

  const plan = HERO_PLAN[roomType] || HERO_PLAN['Другое'];
  let picked = [];
  try {
    picked = await pickHoffProducts({ plan, roomType, style, maxProducts: 3 });
  } catch (e) {
    log({ event: 'article_products_error', style, roomType, error: String(e.message || e).slice(0, 200) });
  }
  const priceDate = new Date().toISOString().slice(0, 10);
  const products = picked.map(p => ({
    offer_id: p.offer_id, name: p.name, category: p.category, price: p.price,
    picture_url: p.picture_url, affiliate_url: p.affiliate_url, erid: p.erid, why: p.why,
    price_date: priceDate,
  }));

  const kw = (Array.isArray(keywords) ? keywords : []).map(k => String(k).trim()).filter(Boolean).slice(0, 6);
  const { parsed, cost: textCost } = await visionJson({
    system: ARTICLE_RENDER_SYSTEM,
    user: JSON.stringify({
      style, roomType, tier: tierKey, styleDescription: styleDesc, roomEnglishName: roomName,
      keywords: kw,
      products: products.map(p => ({ offer_id: p.offer_id, name: p.name, category: p.category, price: p.price })),
    }),
    images: [],
    model: ARTICLE_MODEL,
  });

  const body = {
    intro: String(parsed.intro || '').slice(0, 1200),
    palette: Array.isArray(parsed.palette) ? parsed.palette.slice(0, 6) : [],
    howto: Array.isArray(parsed.howto) ? parsed.howto.map(s => String(s).slice(0, 300)).slice(0, 6) : [],
    palette_notes: String(parsed.palette_notes || '').slice(0, 800),
    product_notes: Array.isArray(parsed.product_notes) ? parsed.product_notes.slice(0, 6) : [],
    conclusion: String(parsed.conclusion || '').slice(0, 600),
    prompt: String(render.prompt || '').slice(0, 1500) || null,
  };
  const finalTitle = String(title || parsed.title || `${style} ${roomType}: как собрать интерьер`).slice(0, 140);
  const slug = `${slugify(`${style}-${roomType}`)}-${crypto.randomBytes(3).toString('hex')}`;
  return q.createArticle({
    slug,
    title: finalTitle,
    style,
    room_type: roomType,
    tier: tierKey,
    cover_path: render.image_path,
    palette: body.palette,
    body,
    products,
    status: 'draft',
    meta: {
      model: ARTICLE_MODEL,
      text_cost: textCost ?? null,
      cover_aspect: '3:2',
      source_render_id: render.id,
      target_query: kw[0] || null,
      meta_title: autoMetaTitle(finalTitle),
      meta_description: String(parsed.intro || '').replace(/\s+/g, ' ').trim().slice(0, 155),
    },
  });
}

function productNote(body, offerId) {
  const note = (body?.product_notes || []).find(n => String(n.offer_id) === String(offerId));
  return note?.note || '';
}

// --- Гейты качества (аудит SEO 09.11.2026, §6.2/§6.3 P0): без их прохождения
// публикация заблокирована. Пороги ниже целевых значений редактора (600–900 слов):
// автомат отсекает тонкий контент, а не душит полезный.

export const MIN_ARTICLE_WORDS = 500;
export const MIN_ARTICLE_PRODUCTS = 3;

export function countArticleWords(body) {
  const parts = [
    body?.intro, body?.palette_notes, body?.conclusion,
    ...(Array.isArray(body?.howto) ? body.howto : []),
    ...(Array.isArray(body?.product_notes) ? body.product_notes.map(n => n?.note) : []),
  ];
  return parts.filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
}

// Дубль кластера style × room: одна опубликованная статья на пару (аудит §6.2 #7).
export function findPublishedDuplicate({ style, roomType }, publishedList) {
  return (publishedList || []).find(a => a.status === 'published'
    && String(a.style || '') === String(style || '')
    && String(a.room_type || '') === String(roomType || '')) || null;
}

// Причины отказа в публикации; пустой массив — статья проходит.
export function validateArticleForPublish(article, publishedList) {
  const reasons = [];
  const words = countArticleWords(article?.body || {});
  if (words < MIN_ARTICLE_WORDS) {
    reasons.push(`Мало текста: ${words} слов, нужно от ${MIN_ARTICLE_WORDS} (цель редактора 600–900)`);
  }
  const products = Array.isArray(article?.products) ? article.products : [];
  const withLink = products.filter(p => p?.affiliate_url);
  if (withLink.length < MIN_ARTICLE_PRODUCTS) {
    reasons.push(`Товаров со ссылкой ${withLink.length}, нужно от ${MIN_ARTICLE_PRODUCTS}`);
  }
  const meta = article?.meta || {};
  if (!String(meta.meta_title || '').trim()) reasons.push('Не заполнен meta_title (редактор)');
  if (!String(meta.meta_description || '').trim()) reasons.push('Не заполнена meta_description (редактор)');
  const dup = findPublishedDuplicate({ style: article?.style, roomType: article?.room_type }, publishedList || []);
  if (dup && dup.id !== article?.id) reasons.push(`Дубль кластера: уже опубликована «${dup.title}» (/${dup.slug})`);
  return reasons;
}

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatRuDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const METRIKA_COUNTER = `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
    (window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=114132104', 'ym');
    ym(114132104, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/114132104" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->`;

export function articlePage(article, { related = [] } = {}) {
  const body = article.body || {};
  const products = Array.isArray(article.products) ? article.products : [];
  const cover = article.cover_path ? `/covers/${path.basename(article.cover_path)}` : '';
  const palette = Array.isArray(article.palette) ? article.palette : [];
  const BRAND_SUFFIX = ' — ремонтвижн';
  const rawTitle = String(article.title || '');
  // Суффикс бренда только если title укладывается в ~60 символов выдачи (аудит §6.2 #18).
  const title = esc(rawTitle.length + BRAND_SUFFIX.length <= 60 ? rawTitle + BRAND_SUFFIX : rawTitle);
  const metaTitle = String(article.meta?.meta_title || '').trim();
  const pageTitle = metaTitle ? esc(metaTitle) : title;
  const description = esc(String(article.meta?.meta_description || body.intro || '').slice(0, 160));
  const canonical = `https://www.remontvision.ru/articles/${encodeURIComponent(article.slug || '')}`;

  const productCards = products.map(p => {
    const img = p.picture_url ? `<img src="${esc(p.picture_url)}" alt="${esc(p.name)}" width="600" height="600" loading="lazy">` : '';
    const price = Number(p.price) > 0 ? `${Number(p.price).toLocaleString('ru-RU')} ₽` : '';
    const link = p.affiliate_url ? `<a class="buy" href="${esc(p.affiliate_url)}" rel="nofollow sponsored" target="_blank">Купить</a>` : '';
    const erid = p.erid ? `<span class="erid">реклама · erid ${esc(p.erid)}</span>` : '';
    const note = productNote(body, p.offer_id);
    return `<article class="card">${img}<h3>${esc(p.name)}</h3>${price ? `<p class="price">${price}</p>` : ''}${note ? `<p class="note">${esc(note)}</p>` : ''}${link}${erid}</article>`;
  }).join('');

  const paletteHtml = palette.map(c => `<span class="swatch" style="background:${esc(c.hex || '#ccc')}" title="${esc(c.name || '')}"></span>`).join('');
  const howto = (body.howto || []).map(step => `<li>${esc(step)}</li>`).join('');

  const jsonLd = JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://www.remontvision.ru/' },
        { '@type': 'ListItem', position: 2, name: 'Статьи', item: 'https://www.remontvision.ru/articles' },
        { '@type': 'ListItem', position: 3, name: article.title },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: String(body.intro || '').slice(0, 300),
      image: cover ? `https://www.remontvision.ru${cover}` : undefined,
      datePublished: article.published_at || article.created_at,
      dateModified: article.updated_at || article.published_at || article.created_at,
      mainEntityOfPage: canonical,
      author: { '@type': 'Organization', name: 'ремонтвижн' },
      publisher: { '@type': 'Organization', name: 'ремонтвижн' },
    },
  ]).replace(/</g, '\\u003c');

  const relatedCards = (Array.isArray(related) ? related : []).slice(0, 4).map(a => {
    const rc = a.cover_path ? `/covers/${path.basename(a.cover_path)}` : '';
    const rimg = rc ? `<img src="${esc(rc)}" alt="${esc(a.title)}" width="600" height="400" loading="lazy">` : '';
    return `<a class="rel" href="/articles/${encodeURIComponent(a.slug)}">${rimg}<h3>${esc(a.title)}</h3></a>`;
  }).join('');

  const priceDateText = formatRuDate(products.find(p => p.price_date)?.price_date || article.published_at || article.created_at);
  // UTM + событие article_cta_click — иначе вклад статей в генерацию не отделить (аудит §6.3).
  const ctaHref = `/?utm_source=article&utm_medium=cta&utm_campaign=${encodeURIComponent(article.slug || '')}#upload`;
  const ctaClick = `ym(114132104,'reachGoal','article_cta_click',{slug:'${String(article.slug || '').replace(/'/g, '')}',position:'bottom'});`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${description}">
${cover ? `<meta property="og:image" content="https://www.remontvision.ru${cover}">` : ''}
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Raleway:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--bg:#f9f7f0;--page:#ece8de;--ink:#130f0a;--muted:#5a554c;--orange:#f3680f;--rust:#a23300;--line:#c2bdb3;--line2:#8a847a;--fh:"Raleway","Segoe UI",Arial,sans-serif;--fb:"Golos Text",system-ui,Arial,sans-serif;--fm:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--page);color:var(--ink);font:400 16px/1.65 var(--fb);-webkit-text-size-adjust:100%}
header{max-width:1000px;margin:0 auto;padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line2)}
header a{color:var(--ink);text-decoration:none;font:400 12px var(--fm);letter-spacing:.08em;text-transform:uppercase}
header a:hover{color:var(--rust)}
main{max-width:1000px;margin:0 auto;padding:32px 20px 72px}
.cover{width:100%;aspect-ratio:3/2;object-fit:cover;border:1px solid var(--line);margin:8px 0 28px}
h1{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(30px,6vw,56px);line-height:1.05;margin:0 0 16px}
.intro{font-size:20px;color:var(--muted);max-width:70ch}
h2{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(20px,3vw,28px);margin:40px 0 12px;border-top:1px solid var(--line2);padding-top:24px}
p,li{color:var(--muted)}
.swatches{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
.swatch{width:44px;height:44px;border-radius:50%;border:1px solid rgba(0,0,0,.15);display:inline-block}
ul.howto{padding-left:20px}ul.howto li{margin:8px 0}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:16px}
.card{border:1px solid var(--line);background:var(--bg);padding:14px;display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#faf8f4}
.card h3{font:500 15px/1.3 var(--fb);margin:10px 0 4px}
.price{font:500 16px/1.3 var(--fb);color:var(--ink);margin:4px 0}
.note{font-size:13px;color:var(--muted)}
.buy{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;background:var(--orange);color:var(--ink);text-decoration:none;border:1px solid var(--ink);font:500 14px var(--fb);box-shadow:3px 3px 0 var(--ink);transition:transform .12s,box-shadow .12s}
.buy:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 var(--ink);color:var(--ink)}
.erid{font:400 10px var(--fm);color:var(--muted);margin-top:6px}
.cta{margin-top:48px;padding:24px;border:1px solid var(--line2);background:var(--bg);text-align:center}
.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:12px;padding:0 24px;background:var(--orange);color:var(--ink);text-decoration:none;border:1px solid var(--ink);font:500 15px var(--fb);box-shadow:4px 4px 0 var(--ink)}
.cta a:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink);color:var(--ink)}
header nav{display:flex;gap:20px}
.pricedate{font:400 12px var(--fm);color:var(--muted);margin-top:12px}
.rel{border:1px solid var(--line);background:var(--bg);text-decoration:none;display:flex;flex-direction:column}
.rel img{width:100%;aspect-ratio:3/2;object-fit:cover;border-bottom:1px solid var(--line)}
.rel h3{font:500 15px/1.35 var(--fb);color:var(--ink);margin:0;padding:12px 14px}
.rel:hover h3{color:var(--rust)}
.prompt{border:1px solid var(--line);background:var(--bg);margin:12px 0}
.prompt summary{cursor:pointer;padding:12px 14px;font:500 14px var(--fb);color:var(--ink)}
.prompt pre{white-space:pre-wrap;word-break:break-word;margin:0;padding:0 14px 14px;font:400 12px/1.6 var(--fm);color:var(--muted)}
footer{max-width:1000px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid var(--line2);color:var(--muted);font:400 12px/1.6 var(--fm)}
@media(max-width:560px){h1{font-size:clamp(26px,9vw,34px)}main,header,footer{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><nav><a href="/articles">Все статьи</a><a href="/#upload">Создать свой дизайн</a></nav></header>
<main>
<h1>${title}</h1>
${cover ? `<img class="cover" src="${cover}" alt="${title}" width="1200" height="800">` : ''}
<p class="intro">${esc(body.intro || '')}</p>
${palette.length ? `<h2>Палитра и материалы</h2><div class="swatches">${paletteHtml}</div><p>${esc(body.palette_notes || '')}</p>` : ''}
${howto ? `<h2>Как собрать интерьер</h2><ul class="howto">${howto}</ul>` : ''}
${productCards ? `<h2>Товары из каталога Hoff</h2><div class="grid">${productCards}</div>${priceDateText ? `<p class="pricedate">Цены и наличие указаны на ${priceDateText} — проверяйте перед покупкой.</p>` : ''}` : ''}
${relatedCards ? `<h2>Читать ещё</h2><div class="grid">${relatedCards}</div>` : ''}
${body.prompt ? `<h2>Промт дизайна</h2><p>Этот интерьер создан нейросетью. Промт, которым он сделан:</p><details class="prompt"><summary>Показать промт</summary><pre>${esc(body.prompt)}</pre></details>` : ''}
${body.conclusion ? `<p>${esc(body.conclusion)}</p>` : ''}
<div class="cta"><p>Хотите так же, но для своей комнаты?</p><a href="${ctaHref}" onclick="${ctaClick}">Загрузите фото и получите дизайн</a></div>
</main>
<footer>© ремонтвижн · <a href="/articles">статьи</a> · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
${METRIKA_COUNTER}
</body>
</html>`;
}

// Хаб статей: навигация и перелинковка (аудит §5 T-02). Пока опубликованных
// статей нет, отдаём noindex — пустую страницу в индекс отдавать незачем.
export function hubPage(articles, { rooms = [] } = {}) {
  const published = (Array.isArray(articles) ? articles : []).filter(a => a.status === 'published');
  const robots = published.length ? 'index, follow' : 'noindex, follow';
  // Перелинковка по двум осям (решение владельца 21.11.2026): комнаты ведут
  // в фильтры галереи, стили — в статьи кластера.
  const roomNav = rooms.length
    ? `<h2>Комнаты</h2><nav class="tags">${rooms.map(r => `<a href="/gallery/${esc(r.slug)}">${esc(r.name)} <b>${Number(r.count) || 0}</b></a>`).join('')}</nav>`
    : '';
  const byStyle = new Map();
  for (const a of published) {
    const key = a.style || 'Без стиля';
    if (!byStyle.has(key)) byStyle.set(key, []);
    byStyle.get(key).push(a);
  }
  const styleNav = byStyle.size
    ? `<h2>Стили</h2><nav class="tags">${[...byStyle.entries()].map(([style, list]) =>
        `<a href="/articles/${encodeURIComponent(list[0].slug)}">${esc(style)} <b>${list.length}</b></a>`).join('')}</nav>`
    : '';
  const cards = published.map(a => {
    const cover = a.cover_path ? `/covers/${path.basename(a.cover_path)}` : '';
    const img = cover ? `<img src="${esc(cover)}" alt="${esc(a.title)}" width="600" height="400" loading="lazy">` : '';
    const metaBits = [a.style, a.room_type].filter(Boolean).join(' · ');
    const date = formatRuDate(a.published_at || a.created_at);
    return `<a class="card" href="/articles/${encodeURIComponent(a.slug)}">${img}<div class="card-body"><h2>${esc(a.title)}</h2><p class="meta">${esc(metaBits)}${date ? ` · ${date}` : ''}</p></div></a>`;
  }).join('');
  const list = cards
    ? `<div class="grid">${cards}</div>`
    : '<p class="empty">Первые разборы стилей и комнат скоро появятся — загляните позже.</p>';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Статьи об интерьерах — ремонтвижн</title>
<meta name="description" content="Разборы интерьеров: стиль × комната. Палитры, материалы, свет и товары с ценами — каждую идею можно примерить на свою комнату по фото.">
<meta name="robots" content="${robots}">
<link rel="canonical" href="https://www.remontvision.ru/articles">
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.remontvision.ru/articles">
<meta property="og:title" content="Статьи об интерьерах — ремонтвижн">
<meta property="og:description" content="Разборы интерьеров: стиль × комната, палитры, материалы и товары с ценами.">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Статьи об интерьерах — ремонтвижн',
    url: 'https://www.remontvision.ru/articles',
  }).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Raleway:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--bg:#f9f7f0;--page:#ece8de;--ink:#130f0a;--muted:#5a554c;--orange:#f3680f;--rust:#a23300;--line:#c2bdb3;--line2:#8a847a;--fh:"Raleway","Segoe UI",Arial,sans-serif;--fb:"Golos Text",system-ui,Arial,sans-serif;--fm:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--page);color:var(--ink);font:400 16px/1.65 var(--fb);-webkit-text-size-adjust:100%}
header{max-width:1000px;margin:0 auto;padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line2)}
header a{color:var(--ink);text-decoration:none;font:400 12px var(--fm);letter-spacing:.08em;text-transform:uppercase}
header a:hover{color:var(--rust)}
header nav{display:flex;gap:20px}
main{max-width:1000px;margin:0 auto;padding:32px 20px 72px}
h1{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(30px,6vw,56px);line-height:1.05;margin:0 0 16px}
.intro{font-size:20px;color:var(--muted);max-width:70ch}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:24px}
.card{border:1px solid var(--line);background:var(--bg);text-decoration:none;display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:3/2;object-fit:cover;border-bottom:1px solid var(--line)}
.card-body{padding:14px}
.card h2{font:500 17px/1.35 var(--fb);color:var(--ink);margin:0 0 6px;text-transform:none}
.card:hover h2{color:var(--rust)}
.meta{font:400 11px var(--fm);color:var(--muted);margin:0;letter-spacing:.06em;text-transform:uppercase}
.empty{color:var(--muted);margin-top:24px}
.cta{margin-top:48px;padding:24px;border:1px solid var(--line2);background:var(--bg);text-align:center}
.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:12px;padding:0 24px;background:var(--orange);color:var(--ink);text-decoration:none;border:1px solid var(--ink);font:500 15px var(--fb);box-shadow:4px 4px 0 var(--ink)}
.cta a:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink);color:var(--ink)}
.promo{color:var(--muted);margin-top:24px}
.promo a{color:var(--rust)}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 24px}
.tags a{border:1px solid var(--line2);padding:8px 14px;text-decoration:none;color:var(--ink);font:400 12px var(--fm);letter-spacing:.06em;text-transform:uppercase}
.tags a:hover{background:var(--bg)}
.tags b{color:var(--muted);font-weight:400;margin-left:6px}
footer{max-width:1000px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid var(--line2);color:var(--muted);font:400 12px/1.6 var(--fm)}
footer a{color:var(--muted)}
@media(max-width:560px){h1{font-size:clamp(26px,9vw,34px)}main,header,footer{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><nav><a href="/ai-dizayn-interera-po-foto">Дизайн по фото</a><a href="/#upload">Создать свой дизайн</a></nav></header>
<main>
<h1>Статьи об интерьерах</h1>
<p class="intro">Разбираем готовые интерьеры: палитра, материалы, свет и товары с ценами. Каждую идею можно примерить на свою комнату — по фотографии.</p>
${roomNav}
${styleNav}
${list}
<div class="cta"><p>Дизайн вашей комнаты по фото — за минуты</p><a href="/?utm_source=articles_hub&utm_medium=cta&utm_campaign=hub#upload">Загрузить фото</a></div>
<p class="promo">Как это работает: <a href="/ai-dizayn-interera-po-foto">дизайн интерьера по фото нейросетью</a>.</p>
</main>
<footer>© ремонтвижн · <a href="/articles">статьи</a> · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
${METRIKA_COUNTER}
</body>
</html>`;
}

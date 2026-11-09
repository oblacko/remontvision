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

export async function generateArticle({ style = 'Скандинавский', roomType = 'Спальня', tier = 'comfort', title = '' } = {}) {
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
  const products = picked.map(p => ({
    offer_id: p.offer_id, name: p.name, category: p.category, price: p.price,
    picture_url: p.picture_url, affiliate_url: p.affiliate_url, erid: p.erid, why: p.why,
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
    },
  });
}

function productNote(body, offerId) {
  const note = (body?.product_notes || []).find(n => String(n.offer_id) === String(offerId));
  return note?.note || '';
}

export function articlePage(article) {
  const body = article.body || {};
  const products = Array.isArray(article.products) ? article.products : [];
  const cover = article.cover_path ? `/covers/${path.basename(article.cover_path)}` : '';
  const palette = Array.isArray(article.palette) ? article.palette : [];
  const title = esc(article.title);
  const description = esc(String(body.intro || '').slice(0, 160));
  const canonical = `https://www.remontvision.ru/articles/${encodeURIComponent(article.slug || '')}`;

  const productCards = products.map(p => {
    const img = p.picture_url ? `<img src="${esc(p.picture_url)}" alt="${esc(p.name)}" loading="lazy">` : '';
    const price = Number(p.price) > 0 ? `${Number(p.price).toLocaleString('ru-RU')} ₽` : '';
    const link = p.affiliate_url ? `<a class="buy" href="${esc(p.affiliate_url)}" rel="nofollow sponsored" target="_blank">Купить</a>` : '';
    const erid = p.erid ? `<span class="erid">реклама · erid ${esc(p.erid)}</span>` : '';
    const note = productNote(body, p.offer_id);
    return `<article class="card">${img}<h3>${esc(p.name)}</h3>${price ? `<p class="price">${price}</p>` : ''}${note ? `<p class="note">${esc(note)}</p>` : ''}${link}${erid}</article>`;
  }).join('');

  const paletteHtml = palette.map(c => `<span class="swatch" style="background:${esc(c.hex || '#ccc')}" title="${esc(c.name || '')}"></span>`).join('');
  const howto = (body.howto || []).map(step => `<li>${esc(step)}</li>`).join('');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    image: cover ? `https://www.remontvision.ru${cover}` : undefined,
    datePublished: article.published_at || article.created_at,
    author: { '@type': 'Organization', name: 'ремонтвижн' },
    publisher: { '@type': 'Organization', name: 'ремонтвижн' },
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ремонтвижн</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${title}">
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
footer{max-width:1000px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid var(--line2);color:var(--muted);font:400 12px/1.6 var(--fm)}
@media(max-width:560px){h1{font-size:clamp(26px,9vw,34px)}main,header,footer{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><a href="/#upload">Создать свой дизайн</a></header>
<main>
<h1>${title}</h1>
${cover ? `<img class="cover" src="${cover}" alt="${title}">` : ''}
<p class="intro">${esc(body.intro || '')}</p>
${palette.length ? `<h2>Палитра и материалы</h2><div class="swatches">${paletteHtml}</div><p>${esc(body.palette_notes || '')}</p>` : ''}
${howto ? `<h2>Как собрать интерьер</h2><ul class="howto">${howto}</ul>` : ''}
${productCards ? `<h2>Товары из каталога Hoff</h2><div class="grid">${productCards}</div>` : ''}
${body.conclusion ? `<p>${esc(body.conclusion)}</p>` : ''}
<div class="cta"><p>Хотите так же, но для своей комнаты?</p><a href="/#upload">Загрузите фото и получите дизайн</a></div>
</main>
<footer>© ремонтвижн · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
    (window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=114132104', 'ym');
    ym(114132104, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/114132104" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->
</body>
</html>`;
}

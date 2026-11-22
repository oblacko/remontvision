// SSR-страницы стилей: /styles (хаб) и /styles/:key (карточка).
// По образцу src/gallery.js и src/articles.js: контент и ссылки видны без JS.
// SPA-гидрации по этим маршрутам нет: серверный HTML самодостаточен
// (не монтирует React-бандл), поэтому клиент его не перезаписывает.
//
// Источник SEO-метаданных — src/styleseo.js (STYLE_SEO, 32 записи, REM-11).
// Тексты, палитра и FAQ — src/stylecontent.js (32 записи, REM-46).
// Палитра/материалы — из БД (styles.swatches) и src/designdata.js (materials).
import fs from 'node:fs';
import path from 'node:path';
import { styleSeoByKey, STYLE_FAMILY_ORDER, CONFUSIONS } from './styleseo.js';
import { styleById } from './designdata.js';
import { styleContentByKey, STYLE_CTA } from './stylecontent.js';

const DEFAULT_BASE_URL = 'https://www.remontvision.ru';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

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

// Канонический ключ стиля -> существующий webp-ассет обложки (старые ключи файлов).
// Новые стили (REM-29) получат собственные ассеты; до этого — ближайшая обложка.
const COVER_ALIASES = {
  minimalism: 'minimal',
  scandinavian: 'scandi',
  japandi: 'japandi',
  loft: 'loft',
  neoclassic: 'neo',
  eco: 'country',
  dark_contemporary: 'dark',
  art_deco: 'deco',
  mediterranean: 'deco',
  memphis_accent: 'modern',
  // старые ключи БД (миграция 008), если останутся активными
  modern: 'modern', scandi: 'scandi', minimal: 'minimal', neo: 'neo', dark: 'dark',
  boho: 'boho', deco: 'deco', country: 'country',
  // трендовые ключи (миграция 027)
  'wabi-sabi': 'japandi', organic: 'minimal', 'warm-minimal': 'scandi',
  biophilic: 'country', heritage: 'neo', maximalism: 'deco',
};

export function styleCoverUrl(style) {
  if (style?.preset_image_path) return `/style-images/${path.basename(String(style.preset_image_path))}`;
  const key = String(style?.key || '');
  // Сгенерированная иллюстрация (style-{key}.webp) имеет приоритет над alias-обложкой —
  // то же правило, что в generatedStyleImage() из server.js. PNG удалены после сжатия (REM-47),
  // поэтому порядок webp → png → jpg (png/jpg оставлены для будущих исходников).
  for (const ext of ['webp', 'png', 'jpg']) {
    if (fs.existsSync(path.join(process.cwd(), 'web', 'dist', 'images', `style-${key}.${ext}`))) {
      return `/images/style-${key}.${ext}`;
    }
  }
  const alias = COVER_ALIASES[key];
  return alias ? `/images/style-${alias}.webp` : '/images/style-modern.webp';
}

function parseSwatches(swatches) {
  if (Array.isArray(swatches)) return swatches;
  if (typeof swatches === 'string' && swatches.trim()) {
    try {
      const parsed = JSON.parse(swatches);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

// Карточка стиля для SSR: строка БД + STYLE_SEO + палитра/материалы designdata.
export function buildStyleCard(dbStyle) {
  const key = String(dbStyle.key || '');
  const seo = styleSeoByKey(key);
  const design = styleById(key);
  const content = styleContentByKey(key);
  const name = seo?.name || dbStyle.name || key;
  const swatches = parseSwatches(dbStyle.swatches);
  const palette = swatches.length
    ? swatches.map(s => ({ hex: String(s.hex || ''), name: String(s.name || '') }))
    : (design?.palette
      ? Object.entries(design.palette).map(([label, hex]) => ({ hex, name: label }))
      : (content?.palette || []));
  const lead = String(dbStyle.description || seo?.description || '').trim();
  return {
    key,
    name,
    h1: seo?.h1 || dbStyle.name || name,
    title: seo?.title || `${name} в интерьере — ремонтвижн`,
    description: seo?.description || lead || '',
    tier: seo?.tier ?? null,
    family: seo?.family || '',
    target_query: seo?.target_query || '',
    frequency: seo?.frequency ?? null,
    lead,
    palette,
    materials: design?.materials || content?.materials || '',
    cover_url: styleCoverUrl(dbStyle),
    updated_at: dbStyle.updated_at || null,
  };
}

// Соседние стили того же семейства (для блока «Похожие стили»).
export function relatedStyleCards(allCards, card, limit = 6) {
  return (allCards || []).filter(c => c.key !== card.key && c.family && c.family === card.family).slice(0, limit);
}

// Пары «часто путают»: ключи из CONFUSIONS, присутствующие в каталоге.
export function confusionStyleCards(allCards, card, limit = 3) {
  const byKey = new Map((allCards || []).map(c => [c.key, c]));
  return (CONFUSIONS[card.key] || [])
    .map(key => byKey.get(key))
    .filter(Boolean)
    .slice(0, limit);
}

function groupByFamily(cards) {
  const groups = [];
  const used = new Set();
  for (const family of STYLE_FAMILY_ORDER) {
    const members = (cards || []).filter(c => c.family === family);
    if (members.length) {
      groups.push({ family, members });
      members.forEach(c => used.add(c.key));
    }
  }
  const orphans = (cards || []).filter(c => !used.has(c.key));
  if (orphans.length) groups.push({ family: 'Другие', members: orphans });
  return groups;
}

const SHELL_CSS = `:root{--bg:#f9f7f0;--page:#ece8de;--ink:#130f0a;--muted:#5a554c;--orange:#f3680f;--rust:#a23300;--line:#c2bdb3;--line2:#8a847a;--fh:"Raleway","Segoe UI",Arial,sans-serif;--fb:"Golos Text",system-ui,Arial,sans-serif;--fm:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--page);color:var(--ink);font:400 16px/1.65 var(--fb);-webkit-text-size-adjust:100%}
header{max-width:1100px;margin:0 auto;padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line2)}
header a{color:var(--ink);text-decoration:none;font:400 12px var(--fm);letter-spacing:.08em;text-transform:uppercase}
header a:hover{color:var(--rust)}
header nav{display:flex;gap:20px}
main{max-width:1100px;margin:0 auto;padding:32px 20px 72px}
h1{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(28px,5vw,48px);line-height:1.05;margin:0 0 16px}
h2{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(20px,3vw,28px);margin:40px 0 12px;border-top:1px solid var(--line2);padding-top:24px}
.intro,.lead{color:var(--muted);max-width:72ch}
.kicker{font:400 12px var(--fm);letter-spacing:.1em;text-transform:uppercase;color:var(--rust);margin:0 0 8px}
.cta{margin-top:48px;padding:24px;border:1px solid var(--line2);background:var(--bg);text-align:center}
.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:12px;padding:0 24px;background:var(--orange);color:var(--ink);text-decoration:none;border:1px solid var(--ink);font:500 15px var(--fb);box-shadow:4px 4px 0 var(--ink)}
.cta a:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink);color:var(--ink)}
footer{max-width:1100px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid var(--line2);color:var(--muted);font:400 12px/1.6 var(--fm)}
footer a{color:var(--muted)}`;

export function stylesHubPage(cards, { baseUrl = DEFAULT_BASE_URL } = {}) {
  const count = (cards || []).length;
  const title = 'Стили интерьера: все направления с палитрами — ремонтвижн';
  const description = 'Каталог стилей интерьера: современные, классика, тёплые природные и акцентные направления. Палитры, материалы и примеры — примените стиль к фото своей комнаты.';
  const canonical = `${baseUrl}/styles`;

  // Только первые 6 карточек — eager (цель: первый экран ≤500 КБ), остальные lazy.
  // Счётчик глобальный, а не по семейству, чтобы не грузить ниже первого экрана.
  let eagerBudget = 6;
  const groups = groupByFamily(cards).map(g => {
    const members = g.members.map(c => {
      const load = eagerBudget > 0 ? (eagerBudget -= 1, 'eager') : 'lazy';
      return `<a class="card" href="/styles/${esc(c.key)}">
  <img src="${esc(c.cover_url)}" alt="${esc(c.name)} в интерьере" width="640" height="640" loading="${load}" decoding="async">
  <span class="cap"><b>${esc(c.name)}</b><i>${esc(c.lead)}</i></span>
</a>`;
    }).join('\n');
    return `<section class="family"><h2>${esc(g.family)}</h2><div class="grid">${members}</div></section>`;
  }).join('\n');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Стили интерьера — ремонтвижн',
    numberOfItems: count,
    itemListElement: (cards || []).map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      url: `${baseUrl}/styles/${c.key}`,
    })),
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ремонтвижн">
<meta property="og:locale" content="ru_RU">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Raleway:wght@300;400&display=swap" rel="stylesheet">
<style>
${SHELL_CSS}
.family{margin-top:8px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:12px}
.card{position:relative;display:flex;flex-direction:column;border:1px solid var(--line);background:var(--bg);text-decoration:none;overflow:hidden}
.card img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#faf8f4}
.card .cap{display:flex;flex-direction:column;gap:4px;padding:12px 14px}
.card b{font:500 15px/1.3 var(--fb);color:var(--ink)}
.card i{font-style:normal;font:400 12px/1.5 var(--fb);color:var(--muted)}
.card:hover b{color:var(--rust)}
@media(max-width:560px){main,header,footer{padding-left:14px;padding-right:14px}.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><nav><a href="/articles">Статьи</a><a href="/gallery">Галерея</a><a href="/#upload">Создать свой дизайн</a></nav></header>
<main>
<h1>Стили интерьера</h1>
<p class="lead">${esc(description)}</p>
${groups}
<div class="cta"><p>Нашли стиль — примените его к своей комнате.</p><a href="/?utm_source=styles_hub&utm_medium=cta&utm_campaign=hub#upload">Загрузить фото и получить дизайн</a></div>
</main>
<footer>© ремонтвижн · <a href="/styles">стили</a> · <a href="/articles">статьи</a> · <a href="/gallery">галерея</a> · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
${METRIKA_COUNTER}
</body>
</html>`;
}

export function stylePage(card, { baseUrl = DEFAULT_BASE_URL, allCards = [], articles = [], rooms = [] } = {}) {
  const key = card.key;
  const canonical = `${baseUrl}/styles/${key}`;
  const ogImage = `${baseUrl}${card.cover_url}`;
  const content = styleContentByKey(key) || {};
  const intro = content.intro || card.lead;
  const robots = content.intro ? 'index, follow, max-image-preview:large' : 'noindex, follow';

  // Ссылки на соседние стили берём из контента (4–6), иначе — по семейству.
  const linked = (content.links || [])
    .map(k => (allCards || []).find(c => c.key === k))
    .filter(Boolean)
    .slice(0, 6);
  const related = linked.length >= 4 ? linked : relatedStyleCards(allCards, card, 6);
  const confusions = confusionStyleCards(allCards, card, 3);

  const palette = (content.palette && content.palette.length) ? content.palette : (card.palette || []);
  const paletteHtml = palette.map(c =>
    `<span class="swatch" style="background:${esc(c.hex || '#ccc')}" title="${esc(c.name || '')}"></span>`).join('');
  const paletteBlock = paletteHtml
    ? `<h2>Палитра и материалы</h2><div class="swatches">${paletteHtml}</div>${content.paletteText
        ? `<p>${esc(content.paletteText)}</p>`
        : (card.materials ? `<p>${esc(card.materials)}</p>` : '')}`
    : '';

  const quickBlock = (content.quick || []).length
    ? `<h2>Узнать за 10 секунд</h2><ul class="quick">${content.quick.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '';
  const lightBlock = content.light ? `<h2>Свет и архитектура</h2><p>${esc(content.light)}</p>` : '';
  const roomsBlock = content.rooms ? `<h2>Где работает</h2><p>${esc(content.rooms)}</p>` : '';

  const relatedLinks = related.map(c =>
    `<a href="/styles/${esc(c.key)}" onclick="ym(114132104,'reachGoal','style_related_click',{from:'${esc(key)}',to:'${esc(c.key)}'});">${esc(c.name)}</a>`).join('');
  const relatedBlock = related.length
    ? `<h3>Похожие стили</h3><nav class="tags">${relatedLinks}</nav>`
    : '';
  const confusionBlock = confusions.length
    ? `<h3>Не путать с</h3><nav class="tags">${confusions.map(c =>
        `<a href="/styles/${esc(c.key)}" onclick="ym(114132104,'reachGoal','style_related_click',{from:'${esc(key)}',to:'${esc(c.key)}'});">${esc(c.name)}</a>`).join('')}</nav>`
    : '';
  const pairsBlock = (content.pairs || related.length)
    ? `<h2>С чем сочетается и с чем путают</h2>${content.pairs ? `<p>${esc(content.pairs)}</p>` : ''}${relatedBlock}${confusionBlock}`
    : '';

  const faqBlock = (content.faq || []).length
    ? `<h2>Вопросы и ответы</h2><div class="faq">${content.faq.map((f, i) =>
        `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`
    : '';

  const articleBlock = (Array.isArray(articles) && articles.length)
    ? `<h2>Статьи об этом стиле</h2><div class="links">${articles.map(a =>
        `<a href="/articles/${encodeURIComponent(a.slug)}" onclick="ym(114132104,'reachGoal','style_article_click',{key:'${esc(key)}',slug:'${esc(a.slug)}'});">${esc(a.title)}</a>`).join('')}</div>`
    : '';

  const roomLinks = (Array.isArray(rooms) && rooms.length)
    ? `<h2>Примеры по комнатам</h2><nav class="tags">${rooms.slice(0, 2).map(r =>
        `<a href="/gallery/${esc(r.slug)}" onclick="ym(114132104,'reachGoal','style_gallery_click',{key:'${esc(key)}',room:'${esc(r.slug)}'});">${esc(r.name)}</a>`).join('')}</nav>`
    : '';

  // Prefill через localStorage, без ?style= — лендинг его не читает (G4).
  // Значение — name (не key): GenerationPanel матчит initialStyle по name/display_name.
  const ctaHref = '/';
  const ctaButton = (where) => `<a href="${ctaHref}" onclick="localStorage.setItem('rv_prefill_style','${esc(card.name)}');ym(114132104,'reachGoal','style_generate_click',{key:'${esc(key)}',place:'${where}'});">Загрузить фото и получить дизайн</a>`;
  const midCta = content.rooms
    ? `<div class="cta cta-mid"><p>${esc(STYLE_CTA)}</p>${ctaButton('mid')}</div>`
    : '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Стили интерьера', item: `${baseUrl}/styles` },
      { '@type': 'ListItem', position: 3, name: card.h1 },
    ],
  }).replace(/</g, '\\u003c');

  const faqJsonLd = (content.faq || []).length
    ? JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: content.faq.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }).replace(/</g, '\\u003c')
    : '';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(card.title)}</title>
<meta name="description" content="${esc(card.description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ремонтвижн">
<meta property="og:locale" content="ru_RU">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(card.title)}">
<meta property="og:description" content="${esc(card.description)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:alt" content="${esc(content.imageAlt || card.h1)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(card.title)}">
<meta name="twitter:description" content="${esc(card.description)}">
<meta name="twitter:image" content="${ogImage}">
<script type="application/ld+json">${jsonLd}</script>
${faqJsonLd ? `<script type="application/ld+json">${faqJsonLd}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Raleway:wght@300;400&display=swap" rel="stylesheet">
<style>
${SHELL_CSS}
.hero{width:100%;max-width:560px;aspect-ratio:1;object-fit:cover;border:1px solid var(--line);margin:8px 0 12px;background:#faf8f4}
.caption{color:var(--muted);font:400 12px/1.5 var(--fm);margin:0 0 28px}
.swatches{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
.swatch{width:44px;height:44px;border-radius:50%;border:1px solid rgba(0,0,0,.15);display:inline-block}
.quick{margin:12px 0 0;padding-left:20px}
.quick li{margin:6px 0}
h3{font-family:var(--fh);font-weight:400;font-size:16px;letter-spacing:.04em;text-transform:uppercase;margin:20px 0 8px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 8px}
.tags a{border:1px solid var(--line2);padding:8px 14px;text-decoration:none;color:var(--ink);font:400 12px var(--fm);letter-spacing:.06em;text-transform:uppercase}
.tags a:hover{background:var(--bg)}
.links{display:flex;flex-direction:column;gap:8px}
.links a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:6px}
.links a:hover{color:var(--rust)}
.faq details{border-top:1px solid var(--line);padding:12px 0}
.faq summary{cursor:pointer;font-weight:500}
.faq p{margin:8px 0 0;color:var(--muted)}
.cta-mid{margin-top:40px}
@media(max-width:560px){main,header,footer{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><nav><a href="/styles">Стили</a><a href="/articles">Статьи</a><a href="/gallery">Галерея</a></nav></header>
<main>
<p class="kicker">${esc(card.name)}</p>
<h1>${esc(card.h1)}</h1>
<p class="lead">${esc(intro)}</p>
<img class="hero" src="${esc(card.cover_url)}" alt="${esc(content.imageAlt || card.h1)}" width="640" height="640" loading="eager" fetchpriority="high" decoding="async">
<p class="caption">AI-визуализация стиля, а не фото конкретного объекта.</p>
${quickBlock}
${paletteBlock}
${lightBlock}
${roomsBlock}
${midCta}
${pairsBlock}
${faqBlock}
${articleBlock}
${roomLinks}
<div class="cta"><p>Примерить стиль на своё фото</p>${ctaButton('end')}</div>
</main>
<footer>© ремонтвижн · <a href="/styles">стили</a> · <a href="/articles">статьи</a> · <a href="/gallery">галерея</a> · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
${METRIKA_COUNTER}
<script>ym(114132104,'reachGoal','style_view',{key:'${esc(key)}',tier:${card.tier ?? 0},source:(new URLSearchParams(location.search).get('from')||'direct')});</script>
</body>
</html>`;
}

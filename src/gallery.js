// Галерея публичных генераций: SSR-страницы /gallery и /gallery/:room.
// Решение по индексации (согласовано с владельцем 21.11.2026): первая страница
// и фильтры по комнатам — index; глубокие листания (?page=N) — noindex,
// чтобы не плодить тонкие дубли.

export const GALLERY_PAGE_SIZE = 24;

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

// opts: { room, roomSlug, page, total, rooms: [{ name, slug, count }] }.
// items: [{ id, style, roomType }].
export function galleryPage(items, opts) {
  const { room = null, roomSlug = '', page = 1, total = 0, rooms = [] } = opts || {};
  const base = roomSlug ? `/gallery/${roomSlug}` : '/gallery';
  const canonical = `https://www.remontvision.ru${base}`;
  const pages = Math.max(1, Math.ceil(total / GALLERY_PAGE_SIZE));
  const robots = page > 1 ? 'noindex, follow' : 'index, follow';

  const title = room
    ? `${room}: ${total} дизайнов интерьера по фото — ремонтвижн`
    : page > 1
      ? `Галерея дизайнов интерьера — страница ${page} — ремонтвижн`
      : 'Галерея дизайнов интерьера по фото — ремонтвижн';
  const description = room
    ? `Готовые AI-дизайны ${room.toLowerCase()} в разных стилях: реальные визуализации пользователей. Загрузите своё фото и получите дизайн своей комнаты.`
    : 'Галерея интерьеров, созданных нейросетью по фото: кухни, гостиные, спальни и другие комнаты в разных стилях. Примерьте на свою комнату.';

  const cards = items.map(r => {
    const cap = esc([r.roomType, r.style].filter(Boolean).join(' · ') || 'Дизайн интерьера');
    const img = `<img src="/gallery/img/${encodeURIComponent(r.id)}" alt="${cap}" width="400" height="300" loading="lazy">`;
    const href = r.shareToken ? `/s/${encodeURIComponent(r.shareToken)}` : `/gallery/img/${encodeURIComponent(r.id)}`;
    return `<a class="item" href="${href}">${img}<span class="cap">${cap}</span></a>`;
  }).join('');

  const empty = '<p class="empty">Публичных дизайнов пока нет — загляните позже.</p>';
  const list = items.length ? `<div class="grid">${cards}</div>` : empty;

  const pager = pages > 1
    ? `<nav class="pager">${Array.from({ length: pages }, (_, i) => {
        const p = i + 1;
        return p === page
          ? `<span>${p}</span>`
          : `<a href="${base}${p > 1 ? `?page=${p}` : ''}">${p}</a>`;
      }).join('')}</nav>`
    : '';

  const roomLinks = rooms.length
    ? `<nav class="rooms">${rooms.map(r =>
        `<a${r.slug === roomSlug ? ' class="on"' : ''} href="/gallery/${r.slug}">${esc(r.name)} <b>${r.count}</b></a>`).join('')}</nav>`
    : '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title.replace(/ — ремонтвижн$/, ''),
    url: canonical,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Raleway:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--bg:#f9f7f0;--page:#ece8de;--ink:#130f0a;--muted:#5a554c;--orange:#f3680f;--rust:#a23300;--line:#c2bdb3;--line2:#8a847a;--fh:"Raleway","Segoe UI",Arial,sans-serif;--fb:"Golos Text",system-ui,Arial,sans-serif;--fm:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--page);color:var(--ink);font:400 16px/1.65 var(--fb);-webkit-text-size-adjust:100%}
header{max-width:1100px;margin:0 auto;padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line2)}
header a{color:var(--ink);text-decoration:none;font:400 12px var(--fm);letter-spacing:.08em;text-transform:uppercase}
header a:hover{color:var(--rust)}
header nav{display:flex;gap:20px}
main{max-width:1100px;margin:0 auto;padding:32px 20px 72px}
h1{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(28px,5vw,48px);line-height:1.05;margin:0 0 16px}
.intro{color:var(--muted);max-width:72ch}
.rooms{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 8px}
.rooms a{border:1px solid var(--line2);padding:8px 14px;text-decoration:none;color:var(--ink);font:400 12px var(--fm);letter-spacing:.06em;text-transform:uppercase}
.rooms a b{color:var(--muted);font-weight:400;margin-left:6px}
.rooms a:hover{background:var(--bg)}
.rooms a.on{background:var(--ink);color:var(--page)}
.rooms a.on b{color:var(--page)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:20px}
.item{position:relative;display:block;border:1px solid var(--line);background:var(--bg);text-decoration:none;overflow:hidden}
.item img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.item .cap{position:absolute;left:0;right:0;bottom:0;padding:6px 10px;background:rgba(19,15,10,.72);color:var(--page);font:400 11px var(--fm);letter-spacing:.06em;text-transform:uppercase}
.item:hover{border-color:var(--rust)}
.empty{color:var(--muted);margin-top:24px}
.pager{display:flex;gap:8px;margin-top:28px;font:400 13px var(--fm)}
.pager a,.pager span{border:1px solid var(--line2);min-width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:var(--ink)}
.pager span{background:var(--ink);color:var(--page)}
.cta{margin-top:48px;padding:24px;border:1px solid var(--line2);background:var(--bg);text-align:center}
.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:12px;padding:0 24px;background:var(--orange);color:var(--ink);text-decoration:none;border:1px solid var(--ink);font:500 15px var(--fb);box-shadow:4px 4px 0 var(--ink)}
.cta a:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink);color:var(--ink)}
footer{max-width:1100px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid var(--line2);color:var(--muted);font:400 12px/1.6 var(--fm)}
footer a{color:var(--muted)}
@media(max-width:560px){main,header,footer{padding-left:14px;padding-right:14px}.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><nav><a href="/articles">Статьи</a><a href="/#upload">Создать свой дизайн</a></nav></header>
<main>
<h1>${room ? esc(room) : 'Галерея дизайнов интерьера'}</h1>
<p class="intro">${esc(description)}</p>
${roomLinks}
${list}
${pager}
<div class="cta"><p>Хотите так же для своей комнаты?</p><a href="/?utm_source=gallery&utm_medium=cta&utm_campaign=${roomSlug || 'all'}#upload">Загрузить фото и получить дизайн</a></div>
</main>
<footer>© ремонтвижн · <a href="/articles">статьи</a> · <a href="/gallery">галерея</a> · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
${METRIKA_COUNTER}
</body>
</html>`;
}

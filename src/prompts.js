// Лендинг промт-кластера: сборник реальных промтов, которыми сделаны
// опубликованные дизайны. Индексируемая страница под запросы вида
// «промт для дизайна интерьера нейросетью»; каждый промт отдаём вместе
// со ссылкой на статью-результат (перелинковка, польза, E-E-A-T).

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

export function promptsPage(items) {
  const list = (Array.isArray(items) ? items : []).slice(0, 48);
  const promptBlocks = list.map(a => {
    const caption = [a.room_type, a.style].filter(Boolean).join(' · ');
    return `<details class="prompt"><summary>${esc(caption)} — промт дизайна</summary><pre>${esc(a.prompt)}</pre><p class="prompt-link"><a href="/articles/${encodeURIComponent(a.slug)}">Смотреть готовый дизайн и товары →</a></p></details>`;
  }).join('');
  const empty = '<p class="empty">Промты появятся вместе с новыми разборами.</p>';
  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Что такое промт для дизайна интерьера?',
        acceptedAnswer: { '@type': 'Answer', text: 'Промт — это текстовое описание, по которому нейросеть создаёт визуализацию интерьера: стиль, материалы, свет, атмосферу. Хороший промт конкретен: он называет стиль, фактуры и настроение, а не просто «сделай красиво».' },
      },
      {
        '@type': 'Question',
        name: 'Как использовать эти промты?',
        acceptedAnswer: { '@type': 'Answer', text: 'Скопируйте промт и передайте его нейросети вместе с фото своей комнаты — или загрузите фото в ремонтвижн и получите свой вариант дизайна по этому направлению.' },
      },
      {
        '@type': 'Question',
        name: 'Промт гарантирует такой же результат?',
        acceptedAnswer: { '@type': 'Answer', text: 'Нет: результат зависит от исходного фото, модели и настроек. Промт задаёт направление, а нейросеть адаптирует его под вашу комнату.' },
      },
      {
        '@type': 'Question',
        name: 'Можно ли адаптировать промт под себя?',
        acceptedAnswer: { '@type': 'Answer', text: 'Да. Меняйте материалы, цвета и мебель под свой вкус: «светлый дуб» вместо «тёмного ореха», «холодный свет» вместо «тёплого». Чем конкретнее описание, тем точнее результат.' },
      },
    ],
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Промты для дизайна интерьера нейросетью — реальные примеры — ремонтвижн</title>
<meta name="description" content="Готовые промты для нейросети, которые создают дизайн интерьера: реальные примеры со стилями, материалами и светом. Копируйте и применяйте к фото своей комнаты.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://www.remontvision.ru/promty/dizayn-interera">
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.remontvision.ru/promty/dizayn-interera">
<meta property="og:title" content="Промты для дизайна интерьера нейросетью — ремонтвижн">
<meta property="og:description" content="Реальные промты, которыми сделаны наши дизайны интерьера. Копируйте и применяйте к своей комнате.">
<script type="application/ld+json">${faqJsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Raleway:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--bg:#f9f7f0;--page:#ece8de;--ink:#130f0a;--muted:#5a554c;--orange:#f3680f;--rust:#a23300;--line:#c2bdb3;--line2:#8a847a;--fh:"Raleway","Segoe UI",Arial,sans-serif;--fb:"Golos Text",system-ui,Arial,sans-serif;--fm:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--page);color:var(--ink);font:400 16px/1.65 var(--fb);-webkit-text-size-adjust:100%}
header{max-width:900px;margin:0 auto;padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line2)}
header a{color:var(--ink);text-decoration:none;font:400 12px var(--fm);letter-spacing:.08em;text-transform:uppercase}
header a:hover{color:var(--rust)}
header nav{display:flex;gap:20px}
main{max-width:900px;margin:0 auto;padding:32px 20px 72px}
h1{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(28px,5vw,48px);line-height:1.05;margin:0 0 16px}
h2{font-family:var(--fh);font-weight:300;text-transform:uppercase;font-size:clamp(20px,3vw,28px);margin:40px 0 12px;border-top:1px solid var(--line2);padding-top:24px}
p,li{color:var(--muted)}
.intro{font-size:19px;max-width:72ch}
.prompt{border:1px solid var(--line);background:var(--bg);margin:12px 0}
.prompt summary{cursor:pointer;padding:12px 14px;font:500 14px var(--fb);color:var(--ink)}
.prompt pre{white-space:pre-wrap;word-break:break-word;margin:0;padding:0 14px 12px;font:400 12px/1.6 var(--fm);color:var(--muted)}
.prompt-link{padding:0 14px 12px;margin:0}
.prompt-link a{color:var(--rust)}
.empty{color:var(--muted)}
.cta{margin-top:48px;padding:24px;border:1px solid var(--line2);background:var(--bg);text-align:center}
.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:12px;padding:0 24px;background:var(--orange);color:var(--ink);text-decoration:none;border:1px solid var(--ink);font:500 15px var(--fb);box-shadow:4px 4px 0 var(--ink)}
.cta a:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink);color:var(--ink)}
footer{max-width:900px;margin:0 auto;padding:24px 20px 48px;border-top:1px solid var(--line2);color:var(--muted);font:400 12px/1.6 var(--fm)}
footer a{color:var(--muted)}
@media(max-width:560px){main,header,footer{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><a href="/">ремонтвижн</a><nav><a href="/articles">Статьи</a><a href="/gallery">Галерея</a><a href="/#upload">Создать дизайн</a></nav></header>
<main>
<h1>Промты для дизайна интерьера нейросетью</h1>
<p class="intro">Промт — это описание, по которому нейросеть рисует интерьер. Ниже — реальные промты, которыми сделаны наши дизайны: стиль, материалы, свет. Копируйте и применяйте к фото своей комнаты — или получите свой дизайн в один клик.</p>
<div class="cta"><p>Не хотите возиться с промтами?</p><a href="/?utm_source=prompts&utm_medium=cta&utm_campaign=prompts-landing#upload">Загрузить фото и получить дизайн</a></div>
<h2>Готовые промты из наших дизайнов</h2>
<p>Каждый промт — от реального проекта: готовый результат, палитра и товары с ценами. Раскройте, скопируйте, примените.</p>
${promptBlocks || empty}
<h2>Как написать свой промт</h2>
<ul>
<li><strong>Назовите стиль</strong> — «скандинавский», «лофт», «джапанди»: это главный вектор для нейросети.</li>
<li><strong>Опишите материалы</strong> — «светлый дуб», «белая штукатурка», «матовый кафель»: фактуры делают картинку достоверной.</li>
<li><strong>Укажите свет</strong> — «тёплый вечерний свет», «много дневного света»: свет задаёт настроение сильнее мебели.</li>
<li><strong>Добавьте ограничения</strong> — «без лишнего декора», «уютно, но строго»: так проще попасть в свой вкус.</li>
</ul>
<h2>Частые вопросы</h2>
<details class="prompt"><summary>Что такое промт для дизайна интерьера?</summary><p>Текстовое описание, по которому нейросеть создаёт визуализацию: стиль, материалы, свет, атмосферу. Хороший промт конкретен — называет стиль и фактуры, а не просто «сделай красиво».</p></details>
<details class="prompt"><summary>Как использовать эти промты?</summary><p>Скопируйте промт и передайте нейросети вместе с фото своей комнаты — или загрузите фото в ремонтвижн и получите свой вариант дизайна по этому направлению.</p></details>
<details class="prompt"><summary>Промт гарантирует такой же результат?</summary><p>Нет: результат зависит от исходного фото, модели и настроек. Промт задаёт направление, а нейросеть адаптирует его под вашу комнату.</p></details>
<details class="prompt"><summary>Можно ли адаптировать промт под себя?</summary><p>Да. Меняйте материалы, цвета и мебель под свой вкус: «светлый дуб» вместо «тёмного ореха». Чем конкретнее описание, тем точнее результат.</p></details>
<p class="empty" style="margin-top:24px">Больше разборов интерьеров — в <a href="/articles" style="color:var(--rust)">статьях</a> и <a href="/gallery" style="color:var(--rust)">галерее</a>.</p>
</main>
<footer>© ремонтвижн · <a href="/articles">статьи</a> · <a href="/gallery">галерея</a> · <a href="/offer">оферта</a> · <a href="/privacy">конфиденциальность</a></footer>
${METRIKA_COUNTER}
</body>
</html>`;
}

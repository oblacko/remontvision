// HTML страницы шаринга с OG-мета для превью в мессенджерах.
// Боты соцсетей читают только мета-теги, поэтому вставляем их в index.html
// до отдачи: SPA-клиент продолжает работать как обычно.
//
// Важно: index.html (React/Vite) уже содержит «robots: index, follow» и
// canonical на «/». Перед инъекцией вычищаем конфликтующие теги, иначе на
// /s/:token и /room/:id в сыром HTML оставались бы «index,follow» и canonical «/»
// (аудит REM-40).
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

// Только директивы индексации/каноникализации, которые конфликтуют с noindex
// на приватных SPA-маршрутах: «index,follow», canonical и og:url на «/».
export function stripIndexingMeta(html) {
  return String(html || '')
    .replace(/<meta[^>]*name=["']robots["'][^>]*>/gi, '')
    .replace(/<link[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta[^>]*property=["']og:url["'][^>]*>/gi, '');
}

// Полный сброс SEO-мета, которые переинъектируются под конкретную страницу
// (title/description/robots/canonical/og:*/twitter:*), чтобы не оставалось дублей.
function stripSeoMeta(html) {
  return stripIndexingMeta(html)
    .replace(/<title>[^<]*<\/title>/gi, '')
    .replace(/<meta[^>]*name=["']description["'][^>]*>/gi, '')
    .replace(/<meta[^>]*property=["']og:[^"']*["'][^>]*>/gi, '')
    .replace(/<meta[^>]*name=["']twitter:[^"']*["'][^>]*>/gi, '');
}

// Приватная SPA-оболочка (/room, /admin, /cabinet): noindex без canonical на «/».
// title/description самой оболочки сохраняем — страница не индексируется, но
// вкладка браузера должна иметь заголовок.
export function noindexHtml(html) {
  const out = stripIndexingMeta(html);
  if (!out) return out;
  const tag = '<meta name="robots" content="noindex, follow">';
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `  ${tag}\n  </head>`);
  return `${tag}\n${out}`;
}

export function sharePageHtml({ indexHtml, title, description, imageUrl, canonicalUrl }) {
  if (!indexHtml) return null;
  const meta = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="robots" content="noindex, follow">`,
    `<link rel="canonical" href="${esc(canonicalUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="RemontVision">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(imageUrl)}">`,
    `<meta property="og:image:alt" content="${esc(title)}">`,
    `<meta property="og:url" content="${esc(canonicalUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
  ].join('\n    ');
  const cleaned = stripSeoMeta(indexHtml);
  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, `    ${meta}\n  </head>`);
  }
  return `${meta}\n${cleaned}`;
}

// HTML страницы шаринга с OG-мета для превью в мессенджерах.
// Боты соцсетей читают только мета-теги, поэтому вставляем их в index.html
// до отдачи: SPA-клиент продолжает работать как обычно.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

export function sharePageHtml({ indexHtml, title, description, imageUrl, canonicalUrl }) {
  if (!indexHtml) return null;
  const meta = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="robots" content="noindex">`,
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
  if (/<\/head>/i.test(indexHtml)) {
    return indexHtml.replace(/<\/head>/i, `    ${meta}\n  </head>`);
  }
  return `${meta}\n${indexHtml}`;
}

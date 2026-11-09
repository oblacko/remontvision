// Динамический sitemap.xml: статические страницы + опубликованные lookbook-статьи.
// Статьи публикуются в админке, поэтому sitemap собирается на лету маршрутом
// GET /sitemap.xml, а не статическим файлом (иначе файл устаревал бы после каждой
// публикации и в него вручную добавляли бы /articles/<slug>).
//
// buildSitemapXml — чистая функция без I/O, чтобы её можно было юнит-тестировать.

export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

// Статические страницы сайта. lastmod подставляется «сегодня» (fallback),
// changefreq/priority повторяют прежний public/sitemap.xml.
export const STATIC_ENTRIES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/prices', changefreq: 'monthly', priority: '0.8' },
  { loc: '/delivery', changefreq: 'yearly', priority: '0.4' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.4' },
  { loc: '/offer', changefreq: 'yearly', priority: '0.4' },
];

function toIsoDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// lastmod в формате YYYY-MM-DD, при отсутствии/некорректной дате — сегодня.
function lastmodOrToday(value) {
  return toIsoDate(value) || todayIso();
}

export function buildSitemapXml({
  staticEntries = STATIC_ENTRIES,
  articles = [],
  baseUrl = 'https://www.remontvision.ru',
} = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const urls = [];

  for (const entry of staticEntries) {
    const isString = typeof entry === 'string';
    const loc = isString ? entry : entry.loc;
    urls.push({
      loc: String(loc || '').startsWith('http') ? loc : `${base}${loc}`,
      lastmod: isString ? todayIso() : lastmodOrToday(entry.lastmod),
      changefreq: isString ? null : (entry.changefreq || null),
      priority: isString ? null : (entry.priority != null ? String(entry.priority) : null),
    });
  }

  for (const article of articles) {
    if (article?.status !== 'published') continue;
    urls.push({
      loc: `${base}/articles/${encodeURIComponent(String(article.slug || ''))}`,
      lastmod: lastmodOrToday(article.created_at || article.published_at),
      changefreq: null,
      priority: null,
    });
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}">`,
  ];
  for (const u of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(u.loc)}</loc>`);
    if (u.lastmod) lines.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
    if (u.changefreq) lines.push(`    <changefreq>${escapeXml(u.changefreq)}</changefreq>`);
    if (u.priority != null) lines.push(`    <priority>${escapeXml(u.priority)}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return lines.join('\n');
}

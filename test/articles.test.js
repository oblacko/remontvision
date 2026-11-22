import test from 'node:test';
import assert from 'node:assert/strict';

// articles.js тянет db.js, который падает без RV_DATABASE_URL.
// Соединение не открывается: нужны только чистые функции и шаблоны.
process.env.RV_DATABASE_URL = process.env.RV_DATABASE_URL || 'postgres://test:test@127.0.0.1:5432/test';

const {
  countArticleWords,
  findPublishedDuplicate,
  validateArticleForPublish,
  MIN_ARTICLE_WORDS,
  autoMetaTitle,
  autoMetaDescription,
  normalizeSeoTitle,
  normalizeSeoDescription,
  hubPage,
  articlePage,
} = await import('../src/articles.js');

const LONG_INTRO = 'слово '.repeat(MIN_ARTICLE_WORDS + 20).trim();

function makeArticle(overrides = {}) {
  return {
    id: 1,
    slug: 'skandinavskiy-spalnya-test',
    title: 'Скандинавская спальня: свет и воздух',
    style: 'Скандинавский',
    room_type: 'Спальня',
    cover_path: 'covers/skandinavskiy-spalnya-test.png',
    palette: [{ hex: '#f5f2ec', name: 'тёплый белый' }],
    body: {
      intro: LONG_INTRO,
      howto: ['Начните с верхнего света', 'Добавьте тёплые фактуры'],
      palette_notes: 'Палитра держится на светлых тонах и древесине.',
      product_notes: [{ offer_id: '1', note: 'Кровать задаёт мягкий силуэт.' }],
      conclusion: 'Начните со света, остальное подтянется.',
    },
    products: [
      { offer_id: '1', name: 'Кровать', price: 45000, picture_url: 'https://img.hoff.ru/x.jpg', affiliate_url: 'https://hoff.ru/x', price_date: '2026-11-21T12:00:00Z' },
      { offer_id: '2', name: 'Светильник', price: 3200, picture_url: 'https://img.hoff.ru/y.jpg', affiliate_url: 'https://hoff.ru/y' },
      { offer_id: '3', name: 'Ваза', price: 1500, picture_url: 'https://img.hoff.ru/z.jpg', affiliate_url: 'https://hoff.ru/z' },
    ],
    status: 'published',
    meta: {
      meta_title: 'Скандинавская спальня — идеи и товары',
      meta_description: 'Как собрать светлую скандинавскую спальню: палитра, материалы и товары с ценами.',
      target_query: 'дизайн спальни',
    },
    created_at: '2026-11-01T10:00:00Z',
    published_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-12T10:00:00Z',
    ...overrides,
  };
}

test('articles: countArticleWords sums text fields', () => {
  assert.equal(countArticleWords({ intro: 'один два три', howto: ['четыре пять'], product_notes: [{ note: 'шесть' }] }), 6);
  assert.equal(countArticleWords({}), 0);
});

test('articles: findPublishedDuplicate matches style × room among published only', () => {
  const list = [
    { id: 1, status: 'published', style: 'Скандинавский', room_type: 'Спальня', slug: 'a' },
    { id: 2, status: 'draft', style: 'Скандинавский', room_type: 'Кухня', slug: 'b' },
  ];
  assert.equal(findPublishedDuplicate({ style: 'Скандинавский', roomType: 'Спальня' }, list)?.slug, 'a');
  assert.equal(findPublishedDuplicate({ style: 'Скандинавский', roomType: 'Кухня' }, list), null);
  assert.equal(findPublishedDuplicate({ style: 'Лофт', roomType: 'Спальня' }, list), null);
});

test('articles: validateArticleForPublish passes a complete article', () => {
  assert.deepEqual(validateArticleForPublish(makeArticle(), []), []);
});

test('articles: validateArticleForPublish reports thin text, missing products and meta', () => {
  const reasons = validateArticleForPublish(makeArticle({ body: { intro: 'коротко' }, products: [], meta: {} }), []);
  assert.equal(reasons.length, 4);
  assert.match(reasons[0], /Мало текста/);
  assert.match(reasons[1], /Товаров со ссылкой/);
  assert.match(reasons[2], /meta_title/);
  assert.match(reasons[3], /meta_description/);
});

test('articles: validateArticleForPublish reports a published duplicate cluster', () => {
  const reasons = validateArticleForPublish(makeArticle({ id: 5 }), [makeArticle()]);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /Дубль кластера/);
});

test('articles: hubPage is noindex while empty and lists published cards', () => {
  const empty = hubPage([]);
  assert.match(empty, /<meta name="robots" content="noindex, follow">/);
  assert.match(empty, /скоро появятся/i);
  assert.match(empty, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/articles">/);
  const filled = hubPage([
    { slug: 's', title: 'Тестовая', status: 'published', style: 'Лофт', room_type: 'Гостиная', created_at: '2026-11-09T10:00:00Z' },
    { slug: 'draft', title: 'Черновик', status: 'draft' },
  ]);
  assert.match(filled, /<meta name="robots" content="index, follow">/);
  assert.match(filled, /href="\/articles\/s"/);
  assert.ok(!filled.includes('articles/draft'));
});

test('articles: articlePage carries canonical, og:url, breadcrumbs, dateModified, UTM and price date', () => {
  const html = articlePage(makeArticle(), {
    related: [{ slug: 'drugaya', title: 'Другая статья', cover_path: 'covers/drugaya.png', status: 'published' }],
  });
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.remontvision\.ru\/articles\/skandinavskiy-spalnya-test">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.remontvision\.ru\/articles\/skandinavskiy-spalnya-test">/);
  assert.match(html, /BreadcrumbList/);
  assert.match(html, /"dateModified":"2026-11-12/);
  assert.match(html, /utm_campaign=skandinavskiy-spalnya-test/);
  assert.match(html, /article_cta_click/);
  assert.match(html, /Цены и наличие указаны на 21 ноября 2026/);
  assert.match(html, /href="\/articles\/drugaya"/);
  assert.match(html, /width="1200" height="800"/);
  assert.match(html, /width="600" height="600"/);
});

test('articles: hubPage links rooms to gallery filters and styles to articles', () => {
  const html = hubPage(
    [{ slug: 'skan-spalnya', title: 'Скандинавская спальня', status: 'published', style: 'Скандинавский', room_type: 'Спальня' }],
    { rooms: [{ name: 'Кухня', slug: 'kuhnya', count: 78 }] },
  );
  assert.match(html, /href="\/gallery\/kuhnya"/);
  assert.match(html, /Кухня <b>78<\/b>/);
  assert.match(html, /href="\/articles\/skan-spalnya"/);
  assert.match(html, /Скандинавский <b>1<\/b>/);
});

test('articles: articlePage shows the render prompt block when present', () => {
  const html = articlePage(makeArticle({ body: { ...makeArticle().body, prompt: 'Photorealistic bedroom, natural light' } }));
  assert.match(html, /Промт дизайна/);
  assert.match(html, /<pre>Photorealistic bedroom, natural light<\/pre>/);
  const noPrompt = articlePage(makeArticle());
  assert.ok(!noPrompt.includes('Промт дизайна'));
});

test('articles: autoMetaTitle keeps brand suffix under 60 chars and trims by word', () => {
  assert.equal(autoMetaTitle('Скандинавская спальня'), 'Скандинавская спальня — ремонтвижн');
  // 56 символов: с суффиксом >60 — отдаём чистый заголовок БЕЗ срезки последнего слова
  const mid = autoMetaTitle('Скандинавская кухня: свет, дуб и спокойная практичность');
  assert.equal(mid, 'Скандинавская кухня: свет, дуб и спокойная практичность');
  const long = autoMetaTitle('Очень длинный заголовок статьи про интерьер, который не влезает в лимит символов поиска');
  assert.ok(long.length <= 60);
  assert.ok(!long.endsWith(' '));
});

test('articles: autoMetaTitle never ends on a conjunction or preposition', () => {
  // Полный заголовок с союзом в конце — союз срезается.
  assert.equal(autoMetaTitle('Дизайн гостиной в стиле лофт и'), 'Дизайн гостиной в стиле лофт — ремонтвижн');
  // Длинный заголовок: обрезка не должна давать «… светлый дуб и мягкий» (аудит REM-40).
  const truncated = autoMetaTitle('Скандинавская комната: тёплый белый, светлый дуб и мягкий свет');
  assert.ok(truncated.length <= 60);
  assert.doesNotMatch(truncated, /\s(и|с|на|без|в|для|по|из|от|до|мягкий)$/);
  assert.doesNotMatch(truncated, /-$/); // не обрывается на полуслове
});

test('articles: autoMetaDescription truncates at word/sentence boundary within 140–160', () => {
  const words = ['интерьер', 'свет', 'дуб', 'лён', 'шерсть', 'керамика', 'фактура', 'пространство', 'зонирование', 'палитра', 'материал', 'текстиль', 'деталь', 'акцент', 'композиция', 'атмосфера', 'уют', 'практичность', 'гармония', 'баланс'];
  const long = `Начинайте с базы и света: белые стены, светлый дуб и лён. ${words.join(' ')} — и всё сложится в цельную, спокойную комнату.`;
  assert.ok(long.length > 160);
  const desc = autoMetaDescription(long);
  assert.ok(desc.length >= 140 && desc.length <= 160, `длина ${desc.length}`);
  // Не рвём слово: символ исходника сразу за обрезкой — пробел или конец предложения.
  const next = long.slice(desc.length, desc.length + 1);
  assert.ok(next === '' || next === ' ', `обрыв внутри слова: «${desc}» → next=«${next}»`);
});

test('articles: autoMetaDescription keeps short text intact and handles empty input', () => {
  assert.equal(autoMetaDescription(''), '');
  assert.equal(autoMetaDescription('Короткое описание'), 'Короткое описание');
});

test('articles: normalizeSeoTitle trims dangling words and caps at 60 without brand suffix', () => {
  assert.equal(normalizeSeoTitle(''), '');
  assert.equal(normalizeSeoTitle('Дизайн гостиной в стиле лофт и'), 'Дизайн гостиной в стиле лофт');
  assert.ok(!normalizeSeoTitle('Светлая кухня в скандинавском стиле').includes('ремонтвижн'));
  const long = normalizeSeoTitle('Очень длинный редакторский заголовок статьи про интерьер, который не помещается в выдачу поиска');
  assert.ok(long.length <= 60);
  assert.doesNotMatch(long, /\s(и|с|на|без|в|для|по|из|от|до)$/);
  assert.doesNotMatch(long, /-$/);
});

test('articles: normalizeSeoDescription adds terminal period and never breaks a word', () => {
  assert.equal(normalizeSeoDescription(''), '');
  assert.equal(normalizeSeoDescription('Короткое описание интерьера'), 'Короткое описание интерьера.');
  const done = 'Готовое описание, уже с точкой.';
  assert.equal(normalizeSeoDescription(done), done);
  const words = ['интерьер', 'свет', 'дуб', 'лён', 'шерсть', 'керамика', 'фактура', 'пространство', 'зонирование', 'палитра', 'материал', 'текстиль', 'деталь', 'акцент', 'композиция', 'атмосфера', 'уют', 'практичность', 'гармония', 'баланс'];
  const long = `Начинайте с базы и света: белые стены, светлый дуб и лён. ${words.join(' ')}`;
  const out = normalizeSeoDescription(long);
  assert.ok(out.length <= 160, `длина ${out.length}`);
  assert.ok(/[.!?…]$/.test(out), `без терминальной точки: «${out}»`);
});

test('articles: articlePage cover alt is descriptive (not H1) and sets og:image:alt', () => {
  const html = articlePage(makeArticle());
  const cover = html.match(/<img class="cover"[^>]*>/);
  assert.ok(cover, 'ожидалась обложка');
  assert.match(cover[0], /alt="Как собрать светлую скандинавскую спальню[^"]*"/);
  assert.ok(!cover[0].includes('alt="Скандинавская спальня: свет и воздух'), 'alt не должен повторять H1');
  assert.match(html, /<meta property="og:image:alt" content="Как собрать светлую скандинавскую спальню[^"]*">/);
});

test('articles: articlePage renders no <img> without alt and declares favicon', () => {
  const html = articlePage(makeArticle(), {
    related: [{ slug: 'drugaya', title: 'Другая статья', cover_path: 'covers/drugaya.png', status: 'published' }],
  });
  const imgs = html.match(/<img[^>]*>/g) || [];
  assert.ok(imgs.length > 0, 'ожидались изображения');
  for (const img of imgs) {
    assert.match(img, /alt="[^"]+"/, `изображение без alt: ${img}`);
  }
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="32x32">/);
});

test('articles: render-based cover uses public /article-cover route', () => {
  const html = articlePage(makeArticle({ cover_path: 'renders/ab-cd.png' }));
  assert.match(html, /src="\/article-cover\/ab-cd\.png"/);
  const classic = articlePage(makeArticle({ cover_path: 'covers/xx.png' }));
  assert.match(classic, /src="\/covers\/xx\.png"/);
});

test('articles: articlePage uses editor meta_title and drops long brand suffix', () => {
  const html = articlePage(makeArticle());
  assert.match(html, /<title>Скандинавская спальня — идеи и товары<\/title>/);
  const longTitle = 'Очень длинный заголовок статьи, который точно не помещается в шестьдесят символов вместе с названием бренда';
  const long = articlePage(makeArticle({ title: longTitle, meta: {} }));
  assert.match(long, new RegExp(`<title>${longTitle.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*</title>`));
  assert.ok(!long.includes('— ремонтвижн</title>'));
});

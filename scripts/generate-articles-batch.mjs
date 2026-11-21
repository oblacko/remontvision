#!/usr/bin/env node
// Пакетная генерация статей-рендеров под ключевые запросы Wordstat.
// Логика: берём фразы из CSV (кластеры rooms/styles/tool), мэппим на пару
// «стиль × комната», для незанятых кластеров находим лучший публичный рендер
// и генерируем статью (generateArticleFromRender). Публикация — через гейты.
//
// Запуск (на сервере, с env приложения):
//   node scripts/generate-articles-batch.mjs --csv /path/keywords.csv --limit 8 --publish
// Флаги: --room «Кухня» --style «Скандинавский» — фиксировать кластер;
//        --min-count 500 — отсев хвоста по месячной частоте; --dry — без записей.
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const hasFlag = name => args.includes(`--${name}`);
const csvPath = arg('csv');
const limit = Math.max(1, Number(arg('limit', '8')));
const minCount = Number(arg('min-count', '500'));
const fixedRoom = arg('room');
const fixedStyle = arg('style');
const doPublish = hasFlag('publish');
const dry = hasFlag('dry');

if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('укажите --csv <путь к wordstat csv>');
  process.exit(1);
}

// Подхватываем .env из корня репозитория (node --env-file не используем,
// чтобы скрипт работал и внутри контейнера, куда .env монтируется иначе).
try {
  const envFile = new URL('../.env', import.meta.url);
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env необязателен: env могут быть заданы процессом (контейнер) */ }

process.env.RV_DATABASE_URL = process.env.RV_DATABASE_URL || '';
const { q } = await import('../src/db.js');
const {
  generateArticleFromRender,
  findPublishedDuplicate,
  validateArticleForPublish,
  countArticleWords,
} = await import('../src/articles.js');

// Мэппинг фраз на комнаты: первое вхождение маркера определяет комнату.
const ROOM_MARKERS = [
  ['кухн', 'Кухня'],
  ['спальн', 'Спальня'],
  ['гостин', 'Гостиная (зал)'],
  ['ванн', 'Санузел'],
  ['санузел', 'Санузел'],
  ['туалет', 'Санузел'],
  ['прихож', 'Прихожая'],
  ['детск', 'Детская'],
  ['кабинет', 'Кабинет'],
  ['столов', 'Столовая'],
];
// Стиль определяем по активным стилям из БД (имя как подстрока фразы).
const STYLE_MARKERS = [
  ['скандинав', 'Скандинавский'],
  ['минимализм', 'Современный минимализм'],
  ['лофт', 'Лофт'],
  ['джапанди', 'Джапанди'],
  ['неоклассик', 'Неоклассика'],
  ['бохо', 'Бохо'],
  ['ар деко', 'Ар-деко'],
  ['современн', 'Современный минимализм'],
  ['прованс', 'Прованс'],
  ['эко', 'Эко'],
];

function roomFromPhrase(phrase) {
  const p = phrase.toLowerCase();
  for (const [marker, room] of ROOM_MARKERS) if (p.includes(marker)) return room;
  return null;
}

function styleFromPhrase(phrase, styleNames) {
  const p = phrase.toLowerCase();
  for (const [marker, style] of STYLE_MARKERS) if (p.includes(marker)) return style;
  for (const name of styleNames) {
    if (name && p.includes(String(name).toLowerCase())) return name;
  }
  return null;
}

// Читаем CSV: phrase,monthly_count,cluster,seed
const rows = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1)
  .map(line => line.trim()).filter(Boolean)
  .map(line => {
    const [phrase, count, cluster, seed] = line.split(',');
    return { phrase, count: Number(count) || 0, cluster, seed };
  })
  .filter(r => r.phrase && r.count >= minCount && ['rooms', 'styles', 'tool'].includes(r.cluster))
  .sort((a, b) => b.count - a.count);

const styles = await q.styleList?.() || [];
const styleNames = styles.map(s => s.name).filter(Boolean);

// Группируем фразы по seed — в одну статью берём головную + близкие хвосты.
const bySeed = new Map();
for (const r of rows) {
  const key = r.seed || r.phrase;
  if (!bySeed.has(key)) bySeed.set(key, []);
  bySeed.get(key).push(r.phrase);
}

const planned = [];
for (const [seed, phrases] of bySeed) {
  const head = phrases[0];
  const room = fixedRoom || roomFromPhrase(head);
  const style = fixedStyle || styleFromPhrase(head, styleNames) || 'Скандинавский';
  if (!room) continue;
  const key = `${style} × ${room}`;
  if (planned.some(p => p.key === key)) continue;
  planned.push({ key, style, room, keywords: phrases.slice(0, 5), seed, head });
  if (planned.length >= limit) break;
}

if (!planned.length) {
  console.log('нет подходящих кластеров под имеющиеся фразы');
  process.exit(0);
}

console.log(`план: ${planned.length} кластеров`);
const published = await q.listArticles();
let done = 0;
for (const item of planned) {
  const dup = findPublishedDuplicate({ style: item.style, roomType: item.room }, published);
  if (dup) {
    console.log(`SKIP ${item.key}: уже опубликована /${dup.slug}`);
    continue;
  }
  const render = (await q.publicRenders(item.room, 50, 0))
    .find(r => (item.style ? r.style === item.style : true)) || (await q.publicRenders(item.room, 1, 0))[0];
  if (!render) {
    console.log(`SKIP ${item.key}: нет публичных рендеров комнаты`);
    continue;
  }
  if (dry) {
    console.log(`DRY ${item.key} ← render ${render.id}, ключи: ${item.keywords.join('; ')}`);
    done += 1;
    continue;
  }
  try {
    const article = await generateArticleFromRender({
      render: await q.getRender(render.id),
      style: item.style,
      roomType: item.room,
      keywords: item.keywords,
    });
    published.push(article);
    const words = countArticleWords(article.body || {});
    let suffix = `draft /${article.slug}, ${words} слов`;
    if (doPublish) {
      const reasons = validateArticleForPublish(article, published);
      if (reasons.length) {
        suffix = `НЕ ОПУБЛИКОВАНА, причины: ${reasons.join('; ')}`;
      } else {
        await q.publishArticle(article.id);
        suffix = `ОПУБЛИКОВАНА /articles/${article.slug}, ${words} слов`;
      }
    }
    console.log(`OK ${item.key} ${suffix}`);
    done += 1;
  } catch (e) {
    console.log(`FAIL ${item.key}: ${String(e.message || e).slice(0, 200)}`);
  }
}
console.log(`готово: ${done}/${planned.length}`);
process.exit(0);

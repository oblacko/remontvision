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
const perCluster = Math.max(1, Math.floor(Number(arg('per-cluster', '1'))));
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

// Явные значения из --env-file перекрывают всё (важно: без интерполяции shell —
// пароли с $/#/пробелами не ломаются, в отличие от source).
const envFileArg = arg('env-file');
if (envFileArg && fs.existsSync(envFileArg)) {
  for (const line of fs.readFileSync(envFileArg, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

process.env.RV_DATABASE_URL = process.env.RV_DATABASE_URL || '';

// Прокси для OpenRouter: в отдельном процессе (не app) конфиг никто не применяет —
// подгружаем сами из app_settings (proxy.url) или HTTPS_PROXY, иначе direct-egress
// VPS получает 403 от OpenRouter.
const { loadProxyConfig, getProxyState } = await import('../src/proxy.js');
await loadProxyConfig();
console.log('proxy:', JSON.stringify(getProxyState({ masked: true })));

const { q } = await import('../src/db.js');
const {
  generateArticleFromRender,
  validateArticleForPublish,
  countArticleWords,
  autoMetaTitle,
  autoMetaDescription,
  expandArticleBody,
  MIN_ARTICLE_WORDS,
} = await import('../src/articles.js');

// Дожать черновики (флаг --publish-drafts): расширяем текст и публикуем через гейты.
if (hasFlag('publish-drafts')) {
  const drafts = (await q.listArticles()).filter(a => a.status === 'draft');
  console.log(`черновиков: ${drafts.length}`);
  let pub = 0;
  for (const d of drafts) {
    try {
      let body = d.body || {};
      let words = countArticleWords(body);
      if (words < MIN_ARTICLE_WORDS) {
        const ex = await expandArticleBody(body);
        body = ex.body;
        await q.updateArticleBody(d.id, body);
        words = countArticleWords(body);
      }
      const fresh = { ...d, body };
      const reasons = validateArticleForPublish(fresh, await q.listArticles(), { maxPerCluster: perCluster });
      if (reasons.length) {
        console.log(`DRAFT-KEEP /${d.slug}: ${words} слов; ${reasons.join('; ')}`);
        continue;
      }
      await q.publishArticle(d.id);
      console.log(`DRAFT-OK /${d.slug} ОПУБЛИКОВАНА, ${words} слов`);
      pub += 1;
    } catch (e) {
      console.log(`DRAFT-FAIL /${d.slug}: ${String(e.message || e).slice(0, 160)}`);
    }
  }
  console.log(`дожато черновиков: ${pub}/${drafts.length}`);
  process.exit(0);
}

// Починка meta_title/meta_description у опубликованных (флаг --fix-meta):
// пересчитываем детерминированно (без вызовов модели) из title и body.intro.
if (hasFlag('fix-meta')) {
  const rows = (await q.listArticles()).filter(a => a.status === 'published');
  let fixedTitle = 0;
  let fixedDesc = 0;
  for (const a of rows) {
    const mt = autoMetaTitle(a.title);
    const patch = {};
    if (String(a.meta?.meta_title || '') !== mt) {
      patch.meta_title = mt;
      fixedTitle += 1;
    }
    const full = await q.articleById(a.id);
    const md = autoMetaDescription(full?.body?.intro);
    if (md && String(a.meta?.meta_description || '') !== md) {
      patch.meta_description = md;
      fixedDesc += 1;
    }
    if (Object.keys(patch).length) {
      await q.updateArticleMeta(a.id, patch);
      console.log(`FIX /${a.slug} → title «${patch.meta_title || a.meta?.meta_title}», desc «${patch.meta_description || a.meta?.meta_description}»`);
    }
  }
  console.log(`meta_title обновлён у ${fixedTitle}, meta_description у ${fixedDesc} из ${rows.length} опубликованных`);
  process.exit(0);
}

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
// Ключи подбираем под каждый кластер (не наоборот — объём диктует
// имеющийся контент, а не список фраз).
const rows = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1)
  .map(line => line.trim()).filter(Boolean)
  .map(line => {
    const [phrase, count, cluster, seed] = line.split(',');
    return { phrase, count: Number(count) || 0, cluster, seed };
  })
  .filter(r => r.phrase && r.count >= minCount && ['rooms', 'styles', 'tool'].includes(r.cluster))
  .sort((a, b) => b.count - a.count);

const planned = [];
if (!fixedRoom && !fixedStyle) {
  // Основной режим: один проход по всем кластерам «стиль × комната» с публичными рендерами.
  const clusters = await q.publicClusters();
  for (const c of clusters) {
    const roomPhrases = rows.filter(r => roomFromPhrase(r.phrase) === c.room);
    const styled = roomPhrases.filter(r => styleFromPhrase(r.phrase, [c.style]) === c.style);
    const pool = styled.length ? styled : roomPhrases;
    planned.push({
      key: `${c.style} × ${c.room}`,
      style: c.style,
      room: c.room,
      keywords: pool.slice(0, 5).map(r => r.phrase),
      renders: c.count,
    });
    if (planned.length >= limit) break;
  }
} else {
  // Ручной режим: конкретная пара --room/--style.
  const room = fixedRoom || roomFromPhrase(rows[0]?.phrase || '');
  const style = fixedStyle || styleFromPhrase(rows[0]?.phrase || '', []) || 'Скандинавский';
  if (room) {
    planned.push({ key: `${style} × ${room}`, style, room, keywords: rows.slice(0, 5).map(r => r.phrase), renders: null });
  }
}

if (!planned.length) {
  console.log('нет подходящих кластеров под имеющиеся фразы');
  process.exit(0);
}

console.log(`план: ${planned.length} кластеров, до ${perCluster} статей на кластер`);
for (const p of planned) console.log(` - ${p.key} (рендеров: ${p.renders ?? '—'}, ключей: ${p.keywords.length})`);
const published = await q.listArticles();
const isMate = (a, item) => a.status === 'published'
  && String(a.style || '') === String(item.style)
  && String(a.room_type || '') === String(item.room);
let done = 0;
for (const item of planned) {
  const free = perCluster - published.filter(a => isMate(a, item)).length;
  if (free <= 0) {
    console.log(`SKIP ${item.key}: уже ${perCluster} (лимит)`);
    continue;
  }
  // Рендеры кластера: сначала точного стиля, добор любым; уже использованные
  // в статьях обложки пропускаем — у каждой статьи своя картинка.
  const used = new Set(published.map(a => a.meta?.source_render_id).filter(Boolean));
  let renders = (await q.publicRenders(item.room, perCluster + 5, 0, item.style))
    .filter(r => !used.has(r.id));
  if (renders.length < free) {
    const rest = (await q.publicRenders(item.room, perCluster + 5, 0))
      .filter(r => !used.has(r.id) && !renders.some(x => x.id === r.id));
    renders = renders.concat(rest);
  }
  if (!renders.length) {
    console.log(`SKIP ${item.key}: нет публичных рендеров комнаты`);
    continue;
  }
  if (dry) {
    for (const r of renders.slice(0, free)) console.log(`DRY ${item.key} ← render ${r.id}, ключи: ${item.keywords.join('; ')}`);
    done += Math.min(free, renders.length);
    continue;
  }
  for (const r of renders.slice(0, free)) {
    try {
      const article = await generateArticleFromRender({
        render: await q.getRender(r.id),
        style: item.style,
        roomType: item.room,
        keywords: item.keywords,
      });
      published.push(article);
      const words = countArticleWords(article.body || {});
      let suffix = `draft /${article.slug}, ${words} слов`;
      if (doPublish) {
        const reasons = validateArticleForPublish(article, published, { maxPerCluster: perCluster });
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
      console.log(`FAIL ${item.key} (${r.id}): ${String(e.message || e).slice(0, 200)}`);
    }
  }
}
console.log(`готово: ${done}`);
process.exit(0);

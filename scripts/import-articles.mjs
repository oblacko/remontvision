#!/usr/bin/env node
// Импорт готовых текстов статей (REM-47, волна A): создаёт черновики из JSON,
// ничего не публикует. Публикация — отдельная задача (REM-49) и идёт через гейты.
//
// Запуск (на сервере, с env приложения):
//   node scripts/import-articles.mjs scripts/articles/wave-a.json
// Флаги:
//   --dry — без записей: только валидация и отчёт о словах/гейтах.
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const dry = args.includes('--dry');

if (!file || !fs.existsSync(file)) {
  console.error('укажите путь к JSON со статьями, например: node scripts/import-articles.mjs scripts/articles/wave-a.json');
  process.exit(1);
}

// Подхватываем .env из корня репозитория (как в generate-articles-batch.mjs),
// чтобы скрипт работал и внутри контейнера, куда .env монтируется иначе.
try {
  const envFile = new URL('../.env', import.meta.url);
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env необязателен: env могут быть заданы процессом (контейнер) */ }

process.env.RV_DATABASE_URL = process.env.RV_DATABASE_URL || '';

const { q } = await import('../src/db.js');
const { normalizeImportedArticle, countArticleWords, validateArticleForPublish } = await import('../src/articles.js');
const { loadRoomTypes, roomTypeByName } = await import('../src/roomtypes.js');

await loadRoomTypes();

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const rawList = Array.isArray(payload) ? payload : (Array.isArray(payload.articles) ? payload.articles : [payload]);
if (!rawList.length) {
  console.error('в JSON нет статей (ожидался массив или объект с полем articles)');
  process.exit(1);
}

// Slug уникален в рамках всех статей (черновики + опубликованные).
const existing = await q.listArticles();
const slugs = new Set(existing.map(a => a.slug));

let created = 0;
let skipped = 0;
const problems = [];

for (const raw of rawList) {
  const { article, error } = normalizeImportedArticle(raw);
  if (error) { problems.push(error); continue; }
  if (slugs.has(article.slug)) { console.log(`SKIP /${article.slug}: slug уже занят`); skipped += 1; continue; }
  if (!(await q.styleByName(article.style))) { problems.push(`/${article.slug}: стиль «${article.style}» не найден в БД`); continue; }
  if (!roomTypeByName(article.room_type)) { problems.push(`/${article.slug}: комната «${article.room_type}» не найдена`); continue; }

  const words = countArticleWords(article.body);
  const reasons = validateArticleForPublish(article, existing);
  const gate = reasons.length ? `гейты: ${reasons.join('; ')}` : 'гейты пройдены';
  if (dry) {
    console.log(`DRY /${article.slug}: ${words} слов, ${article.meta.content_type}, ${gate}`);
    created += 1;
    continue;
  }
  const row = await q.createArticle(article);
  console.log(`OK /${row.slug}: id=${row.id}, ${words} слов, статус=${row.status}`);
  created += 1;
}

if (problems.length) {
  console.error('Проблемы импорта:');
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log(`готово: создано ${created}, пропущено ${skipped}${dry ? ' (dry-run, записей нет)' : ''}`);

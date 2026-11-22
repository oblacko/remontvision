import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api } from '../support/helpers.js';
import { q } from '../../src/db.js';
import { normalizeImportedArticle, validateArticleForPublish, countArticleWords } from '../../src/articles.js';

after(closeTestApp);

const ADMIN = { 'x-admin-key': 'test-admin-key' };

// Реальные тексты волны A (REM-47): 6 статей, импорт создаёт черновики,
// публикация — отдельная задача REM-49. Здесь проверяем полный путь:
// импорт → гейт (информационная, без товаров) → публикация → рендер секций/FAQ.
function waveA() {
  const url = new URL('../../scripts/articles/wave-a.json', import.meta.url);
  return JSON.parse(fs.readFileSync(url, 'utf8')).articles;
}

test('wave A: 6 articles import as drafts and pass the informational gate', async () => {
  const app = await createTestApp();
  const rows = [];
  for (const raw of waveA()) {
    const { article, error } = normalizeImportedArticle(raw);
    assert.equal(error, undefined, `${raw.slug}: ${error}`);
    assert.equal(article.meta.content_type, 'informational', raw.slug);
    const words = countArticleWords(article.body);
    assert.ok(words >= 600 && words <= 670, `${raw.slug}: ${words} слов`);
    assert.deepEqual(validateArticleForPublish(article, []), [], raw.slug);
    const row = await q.createArticle(article);
    assert.equal(row.status, 'draft', raw.slug);
    rows.push({ ...row, body: article.body });
  }
  assert.equal(rows.length, 6);

  // Ни одна не должна публиковаться автоматически.
  const list = await q.listArticles();
  assert.equal(list.filter(a => a.status === 'published').length, 0);
});

test('wave A: published informational article renders sections, faq and style tag', async () => {
  const app = await createTestApp();
  const raw = waveA().find(a => a.slug === 'provans-spalnya');
  const { article } = normalizeImportedArticle(raw);
  const row = await q.createArticle(article);

  // Ручная публикация через гейты: информационная статья проходит без товаров.
  const pub = await api(app.url, `/api/admin/articles/${row.id}/publish`, { method: 'POST', headers: ADMIN });
  assert.equal(pub.status, 200, JSON.stringify(pub.json));

  const res = await api(app.url, '/articles/provans-spalnya');
  assert.equal(res.status, 200);
  assert.match(res.text, /<h2>Кому подходит<\/h2>/);
  assert.match(res.text, /<h2>Частые вопросы<\/h2>/);
  assert.match(res.text, /"@type":"FAQPage"/);
  assert.match(res.text, /"@type":"Question"/);
  assert.match(res.text, /\/styles\/provence/); // тег стиля REM-45
});

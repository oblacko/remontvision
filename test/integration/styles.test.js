import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api } from '../support/helpers.js';
import { q } from '../../src/db.js';

after(closeTestApp);

// SSR-страницы стилей и sitemap (REM-45, P0-техника).
// APP_URL в тестах — http://127.0.0.1:3000 (test/support/db.js), тот же источник,
// из которого сервер строит canonical и sitemap loc.
const base = process.env.APP_URL || 'https://www.remontvision.ru';

test('styles hub renders SSR with canonical and ItemList', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/styles');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.text, /<title>Стили интерьера: все направления с палитрами — ремонтвижн<\/title>/);
  assert.match(res.text, new RegExp(`<link rel="canonical" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/styles">`));
  assert.match(res.text, /"@type":"ItemList"/);
});

test('styles detail renders unique meta and self-canonical, no home canonical', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/styles/scandinavian');
  assert.equal(res.status, 200);
  assert.match(res.text, /<title>Скандинавский стиль в интерьере: фото, свет и материалы<\/title>/);
  assert.match(res.text, new RegExp(`<link rel="canonical" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/styles/scandinavian">`));
  assert.ok(!res.text.includes(`<link rel="canonical" href="${base}/">`));
  assert.match(res.text, /"@type":"BreadcrumbList"/);
  // Контент волны 1 подключён к SSR-карточке (REM-46).
  assert.match(res.text, /Узнать за 10 секунд/);
  assert.match(res.text, /Свет и архитектура/);
  assert.match(res.text, /Вопросы и ответы/);
  assert.match(res.text, /"@type":"FAQPage"/);
  assert.equal((res.text.match(/style_generate_click/g) || []).length, 2);
});

test('unknown style key returns 404', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/styles/no-such-style');
  assert.equal(res.status, 404);
});

test('trailing slashes redirect 301 to non-slash versions', async () => {
  const app = await createTestApp();
  const hub = await fetch(`${app.url}/styles/`, { redirect: 'manual' });
  assert.equal(hub.status, 301);
  assert.equal(hub.headers.get('location'), '/styles');

  const card = await fetch(`${app.url}/styles/scandinavian/`, { redirect: 'manual' });
  assert.equal(card.status, 301);
  assert.equal(card.headers.get('location'), '/styles/scandinavian');
});

test('sitemap style URLs match active styles and canonical', async () => {
  const app = await createTestApp();
  const styles = await q.styles(true);
  assert.ok(styles.length >= 1, 'ожидаются активные стили из миграций');

  const sitemap = await api(app.url, '/sitemap.xml');
  assert.equal(sitemap.status, 200);

  // loc без хоста: /styles/{key}, чтобы не зависеть от APP_URL в тестах.
  const styleLocs = sitemap.text.match(/<loc>[^<]*\/styles\/[^<]+<\/loc>/g) || [];
  assert.equal(styleLocs.length, styles.length, 'число style-URL в sitemap = числу активных стилей');

  for (const style of styles) {
    assert.ok(sitemap.text.includes(`/styles/${style.key}</loc>`), `нет loc для ${style.key}`);
  }

  // loc в sitemap совпадает с canonical карточки.
  for (const style of styles) {
    const res = await api(app.url, `/styles/${style.key}`);
    assert.equal(res.status, 200);
    assert.match(res.text,
      new RegExp(`<link rel="canonical" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/styles/${style.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  }
});

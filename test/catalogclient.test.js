import assert from 'node:assert/strict';
import test from 'node:test';
import { searchCatalog } from '../src/catalogclient.js';

test('searchCatalog posts image, filters and token', async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ results: [{ offer_id: '1' }] }) };
  };
  const res = await searchCatalog(
    { image: Buffer.from('img'), filters: { categories: ['bed'] }, topK: 5, minScore: 0.4 },
    { baseUrl: 'http://catalog:8000/', token: 't', fetchImpl },
  );
  assert.equal(captured.url, 'http://catalog:8000/search');
  assert.equal(captured.opts.method, 'POST');
  assert.equal(captured.opts.headers['x-catalog-token'], 't');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.image_b64, Buffer.from('img').toString('base64'));
  assert.deepEqual(body.filters, { categories: ['bed'] });
  assert.equal(body.top_k, 5);
  assert.equal(body.min_score, 0.4);
  assert.deepEqual(res.results, [{ offer_id: '1' }]);
});

test('searchCatalog sends text-only request', async () => {
  let body;
  const fetchImpl = async (_url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ results: [] }) };
  };
  await searchCatalog({ text: 'кровать беж' }, {
    baseUrl: 'http://c', token: 't', fetchImpl,
  });
  assert.equal(body.text, 'кровать беж');
  assert.equal(body.image_b64, undefined);
});

test('searchCatalog throws on non-ok response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  await assert.rejects(
    () => searchCatalog({ text: 'x' }, { baseUrl: 'http://c', token: 't', fetchImpl }),
    /500/,
  );
});

test('searchCatalog requires image or text', async () => {
  await assert.rejects(
    () => searchCatalog({}, { baseUrl: 'http://c', token: 't', fetchImpl: async () => ({}) }),
    /изображение или текст/,
  );
});

test('searchCatalog requires configured base url', async () => {
  await assert.rejects(
    () => searchCatalog({ text: 'x' }, { baseUrl: '', token: 't', fetchImpl: async () => ({}) }),
    /не настроен/,
  );
});

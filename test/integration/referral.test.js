import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser } from '../support/helpers.js';
import { getOrCreateCode } from '../../src/referral.js';

after(closeTestApp);

async function referralCookie(app, code) {
  const res = await fetch(`${app.url}/r/${code}`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/rv_ref=[^;]*/);
  return match ? match[0] : '';
}

test('referral context видит валидную cookie rv_ref', async () => {
  const app = await createTestApp();
  const owner = await createUser();
  const code = await getOrCreateCode(owner.id);
  const cookie = await referralCookie(app, code);
  assert.ok(cookie, 'переход по /r/:code должен ставить rv_ref');

  const res = await api(app.url, '/api/referral/context', { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.invited, true);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('referral context не срабатывает без cookie и с неизвестным кодом', async () => {
  const app = await createTestApp();
  const none = await api(app.url, '/api/referral/context');
  assert.equal(none.status, 200);
  assert.equal(none.json.invited, false);

  const bogus = await api(app.url, '/api/referral/context', { cookie: 'rv_ref=ZZZZZZZZ' });
  assert.equal(bogus.status, 200);
  assert.equal(bogus.json.invited, false);
});

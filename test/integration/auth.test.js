import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, sha256Hex } from '../support/helpers.js';
import { q } from '../../src/db.js';

after(closeTestApp);

const CONSENTS = { offer: true, privacy: true, cross_border: true };

test('request-code rejects an invalid email', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/api/auth/request-code', { method: 'POST', body: { email: 'not-an-email' } });
  assert.equal(res.status, 400);
});

test('request-code enforces the resend interval', async () => {
  const app = await createTestApp();
  const email = 'resend@test.local';
  assert.equal((await api(app.url, '/api/auth/request-code', { method: 'POST', body: { email } })).status, 200);
  const second = await api(app.url, '/api/auth/request-code', { method: 'POST', body: { email } });
  assert.equal(second.status, 429);
});

test('verify requires all three consents', async () => {
  const app = await createTestApp();
  const res = await api(app.url, '/api/auth/verify', {
    method: 'POST',
    body: { email: 'consents@test.local', code: '123456', consents: { offer: true } },
  });
  assert.equal(res.status, 400);
});

test('verify rejects a wrong code', async () => {
  const app = await createTestApp();
  const email = 'wrong@test.local';
  await q.createOtp(email, sha256Hex('123456'), 10);
  const res = await api(app.url, '/api/auth/verify', {
    method: 'POST',
    body: { email, code: '654321', consents: CONSENTS },
  });
  assert.equal(res.status, 400);
});

test('verify creates a user with signup bonus and a session cookie', async () => {
  const app = await createTestApp();
  const email = 'new-user@test.local';
  await q.createOtp(email, sha256Hex('123456'), 10);

  const res = await api(app.url, '/api/auth/verify', {
    method: 'POST',
    body: { email, code: '123456', consents: CONSENTS },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.is_new, true);
  const setCookie = res.headers.getSetCookie?.() || [res.headers.get('set-cookie')];
  assert.match(String(setCookie[0]), /rv_sid=/);
  const cookie = String(setCookie[0]).split(';')[0];

  const me = await api(app.url, '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.email, email);
  assert.equal(me.json.balance, 2);
});

test('logout invalidates the session', async () => {
  const app = await createTestApp();
  const email = 'logout@test.local';
  await q.createOtp(email, sha256Hex('123456'), 10);
  const res = await api(app.url, '/api/auth/verify', {
    method: 'POST',
    body: { email, code: '123456', consents: CONSENTS },
  });
  const cookie = String((res.headers.getSetCookie?.() || [res.headers.get('set-cookie')])[0]).split(';')[0];
  assert.equal((await api(app.url, '/api/me', { cookie })).json.email, email);

  assert.equal((await api(app.url, '/api/auth/logout', { method: 'POST', cookie })).status, 200);
  assert.equal((await api(app.url, '/api/me', { cookie })).json, null);
});

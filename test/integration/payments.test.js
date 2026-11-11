import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, tinyPng } from '../support/helpers.js';
import { q, pool } from '../../src/db.js';
import { adjustCredits, syncPayment, grantCredits } from '../../src/payments.js';
import { putBuffer } from '../../src/storage.js';

after(closeTestApp);

test('adjustCredits validates the amount and changes the balance', async () => {
  await createTestApp();
  const user = await createUser();

  await assert.rejects(adjustCredits(user.id, 0), e => e.status === 400);
  await assert.rejects(adjustCredits(user.id, 1.5), e => e.status === 400);

  await adjustCredits(user.id, 2, 'test');
  assert.equal(await q.creditBalance(user.id), 2);
});

test('syncPayment reports an unknown local payment without side effects', async () => {
  await createTestApp();
  const result = await syncPayment('provider-id-that-does-not-exist');
  assert.deepEqual(result, { granted: false, status: 'unknown_local' });
});

test('provider payment id is unique', async () => {
  await createTestApp();
  const user = await createUser();
  const insert = () => pool.query(
    `INSERT INTO payments (user_id, provider, provider_payment_id, amount_kopecks, status)
     VALUES ($1, 'robokassa', 'dup-provider-id', 39900, 'created')`,
    [user.id],
  );

  await insert();
  await assert.rejects(insert(), e => e.code === '23505');
});

test('grantCredits accumulates the balance', async () => {
  await createTestApp();
  const user = await createUser();
  await grantCredits(user.id, 10, 'purchase');
  await grantCredits(user.id, 5, 'purchase');
  assert.equal(await q.creditBalance(user.id), 15);
});

test('files are visible to the room owner only', async () => {
  const app = await createTestApp();
  const owner = await createUser();
  const stranger = await createUser();
  const { loginAs, seedRoom } = await import('../support/helpers.js');
  const ownerCookie = await loginAs(owner);
  const strangerCookie = await loginAs(stranger);
  await putBuffer('uploads/owner-photo.png', await tinyPng(), 'image/png');
  await seedRoom({ userId: owner.id, photoPath: 'uploads/owner-photo.png' });

  assert.equal((await fetch(`${app.url}/files/owner-photo.png`, { headers: { cookie: ownerCookie } })).status, 200);
  assert.equal((await fetch(`${app.url}/files/owner-photo.png`, { headers: { cookie: strangerCookie } })).status, 404);
  assert.equal((await fetch(`${app.url}/files/owner-photo.png`)).status, 401);
});

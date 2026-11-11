import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser, loginAs, uploadRoom, seedRoom, insertRender } from '../support/helpers.js';

after(closeTestApp);

test('POST /api/rooms requires authentication', async () => {
  const app = await createTestApp();
  const form = new FormData();
  form.append('style', 'Современный минимализм');
  const res = await fetch(`${app.url}/api/rooms`, { method: 'POST', body: form });
  assert.equal(res.status, 401);
});

test('POST /api/rooms rejects a request without a photo', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const form = new FormData();
  form.append('style', 'Современный минимализм');
  const res = await fetch(`${app.url}/api/rooms`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Нет фото');
});

test('POST /api/rooms rejects a request without a style', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const res = await uploadRoom(app.url, { cookie, style: null });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'Выберите стиль');
});

test('POST /api/rooms creates a queued room owned by the user', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);

  const created = await uploadRoom(app.url, { cookie });
  assert.equal(created.status, 201);
  assert.equal(created.json.status, 'queued');

  const own = await api(app.url, `/api/rooms/${created.json.id}`, { cookie });
  assert.equal(own.status, 200);
  assert.equal(own.json.status, 'queued');
  assert.equal(own.json.style, 'Современный минимализм');

  const stranger = await createUser();
  const strangerCookie = await loginAs(stranger);
  const foreign = await api(app.url, `/api/rooms/${created.json.id}`, { cookie: strangerCookie });
  assert.equal(foreign.status, 404);
});

test('iterate is rejected while the room is not done', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const created = await uploadRoom(app.url, { cookie });

  const res = await api(app.url, `/api/rooms/${created.json.id}/iterate`, {
    method: 'POST',
    cookie,
    body: { text: 'Повесь люстру' },
  });
  assert.equal(res.status, 409);
});

test('retry is rejected while the room is not in error', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const created = await uploadRoom(app.url, { cookie });

  const res = await api(app.url, `/api/rooms/${created.json.id}/retry`, { method: 'POST', cookie });
  assert.equal(res.status, 409);
});

test('versions exposes edits_used so the UI can price a move before confirming', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const baseId = await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/base.png' });
  await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/edit.png', parentId: baseId });

  const res = await api(app.url, `/api/rooms/${room.id}/versions`, { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.length, 2);
  for (const version of res.json) {
    assert.equal(version.edits_used, 1, 'обе версии одного корня знают, что правка уже одна');
  }
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser, seedRoom, insertRender, tinyPng } from '../support/helpers.js';
import { putBuffer } from '../../src/storage.js';

after(closeTestApp);

async function seedSharedRender({ token = 'share-token' } = {}) {
  const user = await createUser();
  const room = await seedRoom({ userId: user.id });
  const imagePath = 'renders/shared.png';
  await putBuffer(imagePath, await tinyPng(), 'image/png');
  const renderId = await insertRender({ roomId: room.id, status: 'done', imagePath, shareToken: token });
  return { user, room, renderId, token };
}

test('shared page renders OG tags for a done render', async () => {
  const app = await createTestApp();
  const { token } = await seedSharedRender();

  const page = await api(app.url, `/s/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /og:/);

  const image = await api(app.url, `/s/${token}/image`);
  assert.equal(image.status, 200);
});

test('share API exposes the render and toggles likes', async () => {
  const app = await createTestApp();
  const { token } = await seedSharedRender({ token: 'share-2' });

  const shared = await api(app.url, `/api/share/${token}`);
  assert.equal(shared.status, 200);
  assert.equal(shared.json.style, 'Современный минимализм');
  assert.equal(shared.json.likes, 0);
  assert.deepEqual(shared.json.comments, []);

  const like = await api(app.url, `/api/share/${token}/like`, { method: 'POST' });
  assert.deepEqual(like.json, { liked: true, likes: 1 });
  const unlike = await api(app.url, `/api/share/${token}/like`, { method: 'POST' });
  assert.deepEqual(unlike.json, { liked: false, likes: 0 });
});

test('share comments validate and persist', async () => {
  const app = await createTestApp();
  const { token } = await seedSharedRender({ token: 'share-3' });

  assert.equal((await api(app.url, `/api/share/${token}/comments`, { method: 'POST', body: { text: '  ' } })).status, 400);
  const created = await api(app.url, `/api/share/${token}/comments`, { method: 'POST', body: { name: 'Анна', text: 'Отличный дизайн' } });
  assert.equal(created.status, 201);

  const shared = await api(app.url, `/api/share/${token}`);
  assert.equal(shared.json.comments.length, 1);
  assert.equal(shared.json.comments[0].text, 'Отличный дизайн');
});

test('unknown share token returns 404', async () => {
  const app = await createTestApp();
  assert.equal((await api(app.url, '/s/nope')).status, 404);
  assert.equal((await api(app.url, '/api/share/nope')).status, 404);
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { api, createUser, loginAs, seedRoom, insertRender } from '../support/helpers.js';
import { q } from '../../src/db.js';

after(closeTestApp);

test('roadmap PDF отдаётся по кнопке и содержит PDF', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const room = await seedRoom({ userId: user.id, status: 'done' });
  await q.addRoadmapItem({
    roomId: room.id,
    sectionKey: 'walls',
    sectionTitle: 'Стены',
    sectionIcon: 'paint',
    sectionSort: 10,
    sort: 1,
    text: 'Краска — можно самому',
  });

  const res = await fetch(`${app.url}/api/rooms/${room.id}/roadmap.pdf`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/pdf/);
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});

test('roadmap PDF без плана возвращает 409', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const res = await api(app.url, `/api/rooms/${room.id}/roadmap.pdf`, { cookie });
  assert.equal(res.status, 409);
});

test('passport PDF требует разбор, затем отдаёт файл', async () => {
  const app = await createTestApp();
  const user = await createUser();
  const cookie = await loginAs(user);
  const room = await seedRoom({ userId: user.id, status: 'done' });
  const renderId = await insertRender({ roomId: room.id, status: 'done', imagePath: 'renders/parent.png' });

  const before = await api(app.url, `/api/renders/${renderId}/passport.pdf`, { cookie });
  assert.equal(before.status, 409);

  await q.setRenderAnalysis(renderId, {
    breakdown: { version: 4, cards: [{ name: 'Стол', traits: 'дерево', clarify: 'ширину', why: 'центр' }] },
  });
  const res = await fetch(`${app.url}/api/renders/${renderId}/passport.pdf`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});

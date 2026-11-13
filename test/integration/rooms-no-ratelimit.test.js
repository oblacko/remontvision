import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { rateLimit } from '../../src/ratelimit.js';

after(closeTestApp);

// Достаём middleware POST-роута: проверяем, что rateLimit снят только с создания комнат.
function routeHandles(app, path, method) {
  const handles = [];
  for (const layer of app._router?.stack || []) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    for (const sub of layer.route.stack) handles.push(sub.handle);
  }
  return handles;
}

test('POST /api/rooms is not rate-limited, auth/iterate stay limited', async () => {
  const { app } = await createTestApp();

  const rooms = routeHandles(app, '/api/rooms', 'post');
  assert.ok(rooms.length > 0, 'POST /api/rooms route exists');
  assert.ok(!rooms.includes(rateLimit), '/api/rooms должен быть без rateLimit');

  const auth = routeHandles(app, '/api/auth/request-code', 'post');
  assert.ok(auth.includes(rateLimit), '/api/auth/request-code остаётся под rateLimit');

  const iterate = routeHandles(app, '/api/rooms/:id/iterate', 'post');
  assert.ok(iterate.includes(rateLimit), '/api/rooms/:id/iterate остаётся под rateLimit');
});

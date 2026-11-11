// Фабрика тестового приложения: миграции + загрузка конфигов, без listen на 3000 и без воркеров.
import { ensureTestDatabase, resetDb } from './db.js';

let cached = null;

export async function createTestApp() {
  await ensureTestDatabase();
  if (!cached) {
    const serverMod = await import('../../src/server.js');
    await serverMod.initialize();
    const server = serverMod.app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const db = await import('../../src/db.js');
    cached = {
      app: serverMod.app,
      server,
      db,
      url: `http://127.0.0.1:${server.address().port}`,
    };
  }
  await resetDb(cached.db.pool);
  return {
    ...cached,
    close: () => new Promise((resolve, reject) => cached.server.close(err => (err ? reject(err) : resolve()))),
  };
}

export async function closeTestApp() {
  if (!cached) return;
  await new Promise(resolve => cached.server.close(() => resolve()));
  cached = null;
}

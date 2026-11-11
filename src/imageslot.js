// Глобальный слот image-вызовов между процессами через Postgres advisory lock.
// Если БД не сконфигурирована (unit-тесты без RV_DATABASE_URL), бросаем NO_DB —
// вызывающая сторона откатывается на локальную сериализацию.
const IMAGE_SLOT_KEY = 0x52564D31; // 'RVM1'
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function slotError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export { IMAGE_SLOT_KEY };

export async function withGlobalImageSlot(fn, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!process.env.RV_DATABASE_URL) throw slotError('NO_DB', 'no database for image slot');
  const { pool } = await import('./db.js');
  let client = null;
  try {
    client = await pool.connect();
  } catch (e) {
    throw slotError('SLOT_UNAVAILABLE', `image slot connect: ${e.message}`);
  }
  let acquired = false;
  try {
    // Ограниченное ожидание: pg_advisory_lock без таймаута держал бы воркер вечно.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [IMAGE_SLOT_KEY]);
      if (rows[0]?.ok) { acquired = true; break; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!acquired) throw slotError('SLOT_UNAVAILABLE', 'image slot timeout');
    return await fn();
  } finally {
    if (client) {
      // Ошибку fn не глотаем: finally только освобождает слот.
      let broken = false;
      if (acquired) {
        try { await client.query('SELECT pg_advisory_unlock($1)', [IMAGE_SLOT_KEY]); }
        catch { broken = true; }
      }
      // Если unlock не прошёл, соединение нельзя возвращать в пул с удерживаемым локом.
      client.release(broken);
    }
  }
}

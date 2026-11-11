// Глобальный слот image-вызовов между процессами через Postgres advisory lock.
// Если БД не сконфигурирована (unit-тесты без RV_DATABASE_URL), бросаем NO_DB —
// вызывающая сторона откатывается на локальную сериализацию.
const IMAGE_SLOT_KEY = 0x52564D31; // 'RVM1'

export async function withGlobalImageSlot(fn) {
  if (!process.env.RV_DATABASE_URL) {
    const e = new Error('no database for image slot');
    e.code = 'NO_DB';
    throw e;
  }
  const { pool } = await import('./db.js');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [IMAGE_SLOT_KEY]);
    return await fn();
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [IMAGE_SLOT_KEY]); } catch { /* соединение могло умереть */ }
    client.release();
  }
}

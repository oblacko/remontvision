// Инфраструктура интеграционных тестов: отдельная БД `<db>_test` на том же Postgres.
// Импортируется первым — выставляет env до динамического импорта src/db.js и src/server.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const REQUIRED = 'RV_DATABASE_URL';
if (!process.env[REQUIRED]) {
  throw new Error('RV_DATABASE_URL обязателен для интеграционных тестов (npm run test:integration)');
}

const base = new URL(process.env[REQUIRED]);
const testName = `${base.pathname.replace(/^\//, '')}_test`;
const testUrl = (() => {
  const u = new URL(base);
  u.pathname = `/${testName}`;
  return u.toString();
})();
const adminUrl = (() => {
  const u = new URL(base);
  u.pathname = '/postgres';
  return u.toString();
})();

// Мутабельные таблицы: чистим между тестами, чтобы состояние не протекало.
// Справочники и настройки (styles, credit_packs, legal_docs, app_settings, ...) сохраняются.
export const MUTABLE_TABLES = [
  'users',
  'sessions',
  'otp_codes',
  'auth_identities',
  'oauth_states',
  'referral_codes',
  'referral_rewards',
  'rooms',
  'renders',
  'render_items',
  'render_likes',
  'render_comments',
  'credit_txn',
  'payments',
  'refunds',
  'receipts',
  'legal_acceptances',
  'product_clicks',
  'procurement_runs',
  'procurement_items',
  'procurement_candidates',
  'procurement_search_rounds',
  'procurement_clicks',
  'search_jobs',
  'search_steps',
  'search_objects',
  'search_results',
  'search_clicks',
  'search_cache',
  'roadmap_items',
  'design_registry',
  'articles',
  'generation_cache',
];

process.env.RV_DATABASE_URL = testUrl;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';
process.env.APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '0'; // middleware-лимит выключен; OTP-лимиты проверяем отдельно
// Тестовые значения не наследуем из .env: resend-интервал и админ-ключ должны быть предсказуемы.
process.env.OTP_RESEND_SECONDS = '60';
process.env.ADMIN_KEY = 'test-admin-key';
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-test-'));
}
// MOCK_MODE = отсутствие ключа: никаких сетевых/платных вызовов OpenRouter.
delete process.env.OPENROUTER_API_KEY;

export const testDatabaseUrl = testUrl;

export async function ensureTestDatabase() {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
    if (!rows.length) await client.query(`CREATE DATABASE "${testName}"`);
  } finally {
    await client.end();
  }
}

export async function resetDb(pool) {
  await pool.query(`TRUNCATE TABLE ${MUTABLE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

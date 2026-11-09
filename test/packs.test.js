import test from 'node:test';
import assert from 'node:assert/strict';

// payments.js тянет db.js, который падает без RV_DATABASE_URL.
// Соединение не открывается: нужен только импорт констант.
process.env.RV_DATABASE_URL = process.env.RV_DATABASE_URL || 'postgres://test:test@127.0.0.1:5432/test';

const { PACKS } = await import('../src/payments.js');

test('packs: 10/20/60 кредитов', () => {
  const byId = Object.fromEntries(PACKS.map(p => [p.id, p]));
  assert.equal(byId.room.credits, 10);
  assert.equal(byId.room.price_kopecks, 39900);
  assert.equal(byId.flat.credits, 20);
  assert.equal(byId.house.credits, 60);
});

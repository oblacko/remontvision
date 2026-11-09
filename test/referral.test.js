import test from 'node:test';
import assert from 'node:assert/strict';

// referral.js тянет db.js (и payments.js), которые падают без RV_DATABASE_URL.
// Соединение не открывается: тестируем только чистые функции без БД.
process.env.RV_DATABASE_URL = process.env.RV_DATABASE_URL || 'postgres://test:test@127.0.0.1:5432/test';

const { generateCode, normalizeCode, rewardDecision } = await import('../src/referral.js');

const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

test('generateCode: 8 chars from unambiguous alphabet', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generateCode(), CODE_RE);
  }
});

test('generateCode: no ambiguous 0/O/1/I', () => {
  for (let i = 0; i < 200; i++) {
    assert.doesNotMatch(generateCode(), /[0O1I]/);
  }
});

test('generateCode: random enough to avoid repeats', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateCode());
  assert.equal(seen.size, 500);
});

test('normalizeCode: upper-case and trim', () => {
  assert.equal(normalizeCode('  abc123 '), 'ABC123');
  assert.equal(normalizeCode('xYz'), 'XYZ');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(undefined), '');
});

test('rewardDecision: self-referral is rejected', () => {
  assert.deepEqual(rewardDecision({ ownerId: 'u1', inviteeId: 'u1', alreadyRewarded: false }), { reward: false, reason: 'self' });
});

test('rewardDecision: already rewarded is rejected', () => {
  assert.deepEqual(rewardDecision({ ownerId: 'u1', inviteeId: 'u2', alreadyRewarded: true }), { reward: false, reason: 'already' });
});

test('rewardDecision: new pair is allowed', () => {
  assert.deepEqual(rewardDecision({ ownerId: 'u1', inviteeId: 'u2', alreadyRewarded: false }), { reward: true, reason: 'ok' });
});

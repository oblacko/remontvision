import test from 'node:test';
import assert from 'node:assert/strict';

// DB-free: notify.js → mailer.js → openrouter.js/proxy.js, без db.js.
const { renderDoneEmail, sendRenderDoneEmail, renderShareUrl } = await import('../src/notify.js');

test('renderDoneEmail includes room, style and share URL', () => {
  const { subject, text } = renderDoneEmail({
    roomType: 'Спальня',
    style: 'Лофт',
    shareUrl: 'https://www.remontvision.ru/s/abc123',
  });
  assert.equal(subject, 'Ваш дизайн готов — ремонтвижн');
  assert.match(text, /Спальня/);
  assert.match(text, /Лофт/);
  assert.match(text, /https:\/\/www\.remontvision\.ru\/s\/abc123/);
  assert.match(text, /Ссылка открывает готовую визуализацию/);
});

test('renderDoneEmail omits absent room and style', () => {
  const { text } = renderDoneEmail({ shareUrl: 'https://www.remontvision.ru/s/abc123' });
  assert.doesNotMatch(text, /Комната:/);
  assert.doesNotMatch(text, /Стиль:/);
});

test('renderDoneEmail without share URL points to cabinet', () => {
  const { text } = renderDoneEmail({ roomType: 'Гостиная' });
  assert.doesNotMatch(text, /Откройте результат по ссылке/);
  assert.match(text, /личном кабинете/);
});

test('renderShareUrl builds a share link', () => {
  assert.equal(renderShareUrl('token123'), 'https://www.remontvision.ru/s/token123');
});

test('sendRenderDoneEmail returns false and logs email_skipped without transport', async () => {
  const raw = [];
  const original = console.log;
  console.log = (...args) => { for (const a of args) raw.push(String(a)); };
  try {
    const result = await sendRenderDoneEmail('user@example.com', { roomType: 'Гостиная' });
    assert.equal(result, false);
  } finally {
    console.log = original;
  }
  const logs = raw
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
  const skipped = logs.find(l => l.event === 'email_skipped');
  assert.ok(skipped, 'email_skipped must be logged without transport');
  assert.equal(skipped.reason, 'no_transport');
});

import test from 'node:test';
import assert from 'node:assert/strict';

// DB-free. RESEND_API_KEY задаётся до импорта, чтобы выбрать Resend-ветку транспорта.
process.env.RESEND_API_KEY = 'test-key';
delete process.env.SMTP_URL;

const { sendEmail } = await import('../src/mailer.js');

test('resend failure throws only the HTTP status and never the response body', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ message: 'user@example.com is not allowed' }),
  });
  try {
    await assert.rejects(
      () => sendEmail({ to: 'user@example.com', subject: 'Код входа — ремонтвижн', text: 'code' }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'resend 422');
        assert.ok(!err.message.includes('user@example.com'), 'response body (recipient) must not be leaked');
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('resend success returns true and posts to the Resend endpoint', async () => {
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url: String(url), body: JSON.parse(opts.body) };
    return { ok: true, status: 200 };
  };
  try {
    const sent = await sendEmail({ to: 'user@example.com', subject: 'Тема', text: 'Текст' });
    assert.equal(sent, true);
    assert.equal(captured.url, 'https://api.resend.com/emails');
    assert.equal(captured.body.to[0], 'user@example.com');
    assert.equal(captured.body.subject, 'Тема');
    assert.equal(captured.body.text, 'Текст');
  } finally {
    globalThis.fetch = original;
  }
});

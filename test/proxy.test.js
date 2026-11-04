import test from 'node:test';
import assert from 'node:assert/strict';

const { applyProxy, directFetch, proxyFetch } = await import('../src/proxy.js');

test('activating a proxy does not replace global fetch', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const stub = async () => {
    calls++;
    return new Response('ok');
  };
  globalThis.fetch = stub;
  try {
    await applyProxy('socks5://127.0.0.1:9');
    assert.equal(globalThis.fetch, stub, 'global fetch must stay untouched');
    await directFetch('https://example.com');
    assert.equal(calls, 1, 'directFetch goes through the current global fetch');
  } finally {
    globalThis.fetch = original;
    await applyProxy('');
  }
});

test('proxyFetch uses global fetch when no proxy is configured', async () => {
  const original = globalThis.fetch;
  let url = '';
  globalThis.fetch = async input => {
    url = String(input);
    return new Response('ok');
  };
  try {
    await applyProxy('');
    await proxyFetch('https://example.com/direct');
    assert.equal(url, 'https://example.com/direct');
  } finally {
    globalThis.fetch = original;
  }
});

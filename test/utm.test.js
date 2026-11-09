import test from 'node:test';
import assert from 'node:assert/strict';

// `.ts`-импорт требует Node >= 23.6 (unflagged type stripping); на Node 20
// (Docker) импорт падает с ERR_UNKNOWN_FILE_EXTENSION, и тесты честно
// пропускаются, а не валят весь `npm test`.
let utm = null;
try {
  utm = await import('../web/src/lib/utm.ts');
} catch {
  utm = null;
}

const { captureUtmOnce, readUtm } = utm || {};

const maybe = (name, fn) => {
  test(name, (t) => {
    if (!utm) return t.skip('client-side .ts tests require Node >= 24');
    return fn();
  });
};

const DAY = 24 * 60 * 60 * 1000;

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    map,
  };
}

maybe('utm: captures recognized utm params and yclid', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?utm_source=google&utm_medium=cpc&utm_campaign=spring&yclid=12345', storage, now: 1000 });
  assert.deepEqual(readUtm({ storage, now: 1000 }), {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'spring',
    yclid: '12345',
  });
});

maybe('utm: first touch is not overwritten by a later visit', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?utm_source=first&utm_campaign=one', storage, now: 1000 });
  captureUtmOnce({ search: '?utm_source=second&utm_campaign=two', storage, now: 2000 });
  assert.deepEqual(readUtm({ storage, now: 2000 }), {
    utm_source: 'first',
    utm_campaign: 'one',
  });
});

maybe('utm: expired record is replaced by a later visit', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?utm_source=first', storage, now: 1000 });
  captureUtmOnce({ search: '?utm_source=second', storage, now: 1000 + 31 * DAY });
  assert.deepEqual(readUtm({ storage, now: 1000 + 31 * DAY }), { utm_source: 'second' });
});

maybe('utm: readUtm returns null for missing/corrupt/expired', () => {
  assert.equal(readUtm({ storage: makeStorage(), now: 1000 }), null);

  const corrupt = makeStorage({ rv_utm: '{not json' });
  assert.equal(readUtm({ storage: corrupt, now: 1000 }), null);

  const badShape = makeStorage({ rv_utm: JSON.stringify({ ts: 1000 }) });
  assert.equal(readUtm({ storage: badShape, now: 1000 }), null);

  const expired = makeStorage({ rv_utm: JSON.stringify({ utm: { utm_source: 'x' }, ts: 1000 }) });
  assert.equal(readUtm({ storage: expired, now: 1000 + 31 * DAY }), null);
});

maybe('utm: readUtm rejects records with non-string utm values', () => {
  const numberValue = makeStorage({ rv_utm: JSON.stringify({ utm: { utm_source: 123 }, ts: 1000 }) });
  assert.equal(readUtm({ storage: numberValue, now: 1000 }), null);

  const nullValue = makeStorage({ rv_utm: JSON.stringify({ utm: { utm_campaign: null }, ts: 1000 }) });
  assert.equal(readUtm({ storage: nullValue, now: 1000 }), null);

  const nestedValue = makeStorage({ rv_utm: JSON.stringify({ utm: { utm_source: { a: 1 } }, ts: 1000 }) });
  assert.equal(readUtm({ storage: nestedValue, now: 1000 }), null);
});

maybe('utm: empty search stores nothing', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '', storage, now: 1000 });
  captureUtmOnce({ search: '?foo=bar', storage, now: 1000 });
  assert.equal(storage.map.size, 0);
  assert.equal(readUtm({ storage, now: 1000 }), null);
});

maybe('utm: yclid alone is captured', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?yclid=987', storage, now: 1000 });
  assert.deepEqual(readUtm({ storage, now: 1000 }), { yclid: '987' });
});

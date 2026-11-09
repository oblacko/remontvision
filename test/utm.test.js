import test from 'node:test';
import assert from 'node:assert/strict';
import { captureUtmOnce, readUtm } from '../web/src/lib/utm.ts';

const DAY = 24 * 60 * 60 * 1000;

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    map,
  };
}

test('utm: captures recognized utm params and yclid', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?utm_source=google&utm_medium=cpc&utm_campaign=spring&yclid=12345', storage, now: 1000 });
  assert.deepEqual(readUtm({ storage, now: 1000 }), {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'spring',
    yclid: '12345',
  });
});

test('utm: first touch is not overwritten by a later visit', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?utm_source=first&utm_campaign=one', storage, now: 1000 });
  captureUtmOnce({ search: '?utm_source=second&utm_campaign=two', storage, now: 2000 });
  assert.deepEqual(readUtm({ storage, now: 2000 }), {
    utm_source: 'first',
    utm_campaign: 'one',
  });
});

test('utm: expired record is replaced by a later visit', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?utm_source=first', storage, now: 1000 });
  captureUtmOnce({ search: '?utm_source=second', storage, now: 1000 + 31 * DAY });
  assert.deepEqual(readUtm({ storage, now: 1000 + 31 * DAY }), { utm_source: 'second' });
});

test('utm: readUtm returns null for missing/corrupt/expired', () => {
  assert.equal(readUtm({ storage: makeStorage(), now: 1000 }), null);

  const corrupt = makeStorage({ rv_utm: '{not json' });
  assert.equal(readUtm({ storage: corrupt, now: 1000 }), null);

  const badShape = makeStorage({ rv_utm: JSON.stringify({ ts: 1000 }) });
  assert.equal(readUtm({ storage: badShape, now: 1000 }), null);

  const expired = makeStorage({ rv_utm: JSON.stringify({ utm: { utm_source: 'x' }, ts: 1000 }) });
  assert.equal(readUtm({ storage: expired, now: 1000 + 31 * DAY }), null);
});

test('utm: empty search stores nothing', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '', storage, now: 1000 });
  captureUtmOnce({ search: '?foo=bar', storage, now: 1000 });
  assert.equal(storage.map.size, 0);
  assert.equal(readUtm({ storage, now: 1000 }), null);
});

test('utm: yclid alone is captured', () => {
  const storage = makeStorage();
  captureUtmOnce({ search: '?yclid=987', storage, now: 1000 });
  assert.deepEqual(readUtm({ storage, now: 1000 }), { yclid: '987' });
});

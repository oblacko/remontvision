import test from 'node:test';
import assert from 'node:assert/strict';

// Предикат shouldConvertHeic чистый и не тянет heic2any (тот импортируется
// лениво внутри convertHeicToJpeg, который в тестах не вызывается).
// `.ts`-импорт требует Node >= 23.6 (unflagged type stripping); на Node 20
// (Docker) импорт падает с ERR_UNKNOWN_FILE_EXTENSION, и тесты честно
// пропускаются, а не валят весь `npm test`.
let shouldConvertHeic = null;
try {
  ({ shouldConvertHeic } = await import('../web/src/lib/heic.ts'));
} catch {
  shouldConvertHeic = null;
}

const maybe = (name, fn) => {
  test(name, (t) => {
    if (!shouldConvertHeic) return t.skip('client-side .ts tests require Node >= 24');
    return fn();
  });
};

maybe('shouldConvertHeic is true for heic/heif mimetypes', () => {
  assert.equal(shouldConvertHeic({ type: 'image/heic' }), true);
  assert.equal(shouldConvertHeic({ type: 'image/heif' }), true);
});

maybe('shouldConvertHeic is true by filename extension', () => {
  assert.equal(shouldConvertHeic({ name: 'photo.HEIC' }), true);
  assert.equal(shouldConvertHeic({ name: 'photo.heif' }), true);
  assert.equal(shouldConvertHeic({ name: 'a.b.c.HeIc' }), true);
});

maybe('shouldConvertHeic is false for jpeg/png/webp', () => {
  assert.equal(shouldConvertHeic({ type: 'image/jpeg', name: 'a.jpg' }), false);
  assert.equal(shouldConvertHeic({ type: 'image/png', name: 'a.png' }), false);
  assert.equal(shouldConvertHeic({ type: 'image/webp', name: 'a.webp' }), false);
});

maybe('shouldConvertHeic is false for null/undefined', () => {
  assert.equal(shouldConvertHeic(null), false);
  assert.equal(shouldConvertHeic(undefined), false);
});

maybe('shouldConvertHeic is case-insensitive for both type and name', () => {
  assert.equal(shouldConvertHeic({ type: 'IMAGE/HEIC' }), true);
  assert.equal(shouldConvertHeic({ name: 'photo.HEIC' }), true);
  assert.equal(shouldConvertHeic({ name: 'photo.heiF' }), true);
});

maybe('shouldConvertHeic is false for unrelated names and empty object', () => {
  assert.equal(shouldConvertHeic({ name: 'photo.jpg' }), false);
  assert.equal(shouldConvertHeic({}), false);
  assert.equal(shouldConvertHeic({ name: 'heic.jpg' }), false);
});

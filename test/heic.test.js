import test from 'node:test';
import assert from 'node:assert/strict';

// Предикат shouldConvertHeic чистый и не тянет heic2any (тот импортируется
// лениво внутри convertHeicToJpeg, который в тестах не вызывается).
const { shouldConvertHeic } = await import('../web/src/lib/heic.ts');

test('shouldConvertHeic is true for heic/heif mimetypes', () => {
  assert.equal(shouldConvertHeic({ type: 'image/heic' }), true);
  assert.equal(shouldConvertHeic({ type: 'image/heif' }), true);
});

test('shouldConvertHeic is true by filename extension', () => {
  assert.equal(shouldConvertHeic({ name: 'photo.HEIC' }), true);
  assert.equal(shouldConvertHeic({ name: 'photo.heif' }), true);
  assert.equal(shouldConvertHeic({ name: 'a.b.c.HeIc' }), true);
});

test('shouldConvertHeic is false for jpeg/png/webp', () => {
  assert.equal(shouldConvertHeic({ type: 'image/jpeg', name: 'a.jpg' }), false);
  assert.equal(shouldConvertHeic({ type: 'image/png', name: 'a.png' }), false);
  assert.equal(shouldConvertHeic({ type: 'image/webp', name: 'a.webp' }), false);
});

test('shouldConvertHeic is false for null/undefined', () => {
  assert.equal(shouldConvertHeic(null), false);
  assert.equal(shouldConvertHeic(undefined), false);
});

test('shouldConvertHeic is case-insensitive for both type and name', () => {
  assert.equal(shouldConvertHeic({ type: 'IMAGE/HEIC' }), true);
  assert.equal(shouldConvertHeic({ name: 'photo.HEIC' }), true);
  assert.equal(shouldConvertHeic({ name: 'photo.heiF' }), true);
});

test('shouldConvertHeic is false for unrelated names and empty object', () => {
  assert.equal(shouldConvertHeic({ name: 'photo.jpg' }), false);
  assert.equal(shouldConvertHeic({}), false);
  assert.equal(shouldConvertHeic({ name: 'heic.jpg' }), false);
});

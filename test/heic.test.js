import test from 'node:test';
import assert from 'node:assert/strict';

// Предикат shouldConvertHeic чистый и не тянет heic2any (тот импортируется
// лениво внутри convertHeicToJpeg, который в тестах вызывается только с
// подставленным модулем через DI). `.ts`-импорт требует Node >= 23.6 (unflagged
// type stripping); на Node 20 (Docker) импорт падает с ERR_UNKNOWN_FILE_EXTENSION,
// и тесты честно пропускаются, а не валят весь `npm test`.
let heic = null;
try {
  heic = await import('../web/src/lib/heic.ts');
} catch {
  heic = null;
}

const { shouldConvertHeic, convertHeicToJpeg } = heic || {};

const maybe = (name, fn) => {
  test(name, (t) => {
    if (!heic) return t.skip('client-side .ts tests require Node >= 24');
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

maybe('convertHeicToJpeg returns a JPEG File via an injected module', async () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const fakeModule = {
    default: async () => new Blob([jpegBytes], { type: 'image/jpeg' }),
  };
  const file = new File(['source'], 'photo.HEIC', { type: 'image/heic' });
  const out = await convertHeicToJpeg(file, { importHeic2any: async () => fakeModule });
  assert.ok(out instanceof File);
  assert.equal(out.name, 'photo.jpg');
  assert.equal(out.type, 'image/jpeg');
});

maybe('convertHeicToJpeg throws the Russian error on conversion failure', async () => {
  const fakeModule = {
    default: async () => { throw new Error('decode failed'); },
  };
  const file = new File(['source'], 'photo.heif', { type: 'image/heif' });
  await assert.rejects(
    () => convertHeicToJpeg(file, { importHeic2any: async () => fakeModule }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Не удалось прочитать HEIC/);
      return true;
    },
  );
});

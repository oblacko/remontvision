import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

// Без БД: модуль не импортирует db.js, поэтому его можно поднять напрямую.
const { UPLOAD_MIME, UPLOAD_REJECT_MESSAGE, isHeic, convertHeicIfNeeded } = await import('../src/imageupload.js');

test('UPLOAD_REJECT_MESSAGE is the single reject string for unsupported types', () => {
  assert.equal(UPLOAD_REJECT_MESSAGE, 'Только JPG/PNG/WebP/HEIC');
});

test('UPLOAD_MIME maps heic/heif to .jpg and keeps jpeg/png/webp', () => {
  assert.equal(UPLOAD_MIME['image/heic'], '.jpg');
  assert.equal(UPLOAD_MIME['image/heif'], '.jpg');
  assert.equal(UPLOAD_MIME['image/jpeg'], '.jpg');
  assert.equal(UPLOAD_MIME['image/png'], '.png');
  assert.equal(UPLOAD_MIME['image/webp'], '.webp');
});

test('isHeic detects only heic/heif mimetypes', () => {
  assert.equal(isHeic('image/heic'), true);
  assert.equal(isHeic('image/heif'), true);
  assert.equal(isHeic('image/jpeg'), false);
  assert.equal(isHeic('image/png'), false);
  assert.equal(isHeic('image/webp'), false);
  assert.equal(isHeic(undefined), false);
});

test('convertHeicIfNeeded returns the same buffer for jpeg/png/webp without calling converter', async () => {
  const buffer = Buffer.from('not-a-real-image');
  const spy = async () => { throw new Error('converter must not be called'); };
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const out = await convertHeicIfNeeded(buffer, mime, { convert: spy });
    assert.equal(out, buffer, `${mime} buffer must be unchanged`);
  }
});

test('convertHeicIfNeeded calls injected converter for heic/heif and returns its result', async () => {
  const result = Buffer.from('jpeg-output');
  const calls = [];
  const spy = async (buf) => { calls.push(buf); return result; };
  for (const mime of ['image/heic', 'image/heif']) {
    const out = await convertHeicIfNeeded(Buffer.from('input'), mime, { convert: spy });
    assert.equal(out, result);
  }
  assert.equal(calls.length, 2);
});

test('convertHeicIfNeeded yields the Russian 400 error when the converter rejects', async () => {
  const failing = async () => { throw new Error('decode failed'); };
  await assert.rejects(
    () => convertHeicIfNeeded(Buffer.from('input'), 'image/heic', { convert: failing }),
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Не удалось прочитать HEIC/);
      assert.match(err.message, /Наиболее совместимые/);
      return true;
    },
  );
});

// Опционально: реальный декод HEIC, только если sharp собрали с поддержкой
// HEVC (libheif). Локально это может быть недоступно — тогда тест честно
// пропускается, а ручная проверка с реальным HEIC с iPhone описана в отчёте.
test('real HEIC decode produces a valid JPEG when libheif supports HEVC', async (t) => {
  let heic;
  try {
    // Генерация HEIC требует поддержки HEVC в libheif; без неё sharp бросит.
    heic = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .heif({ compression: 'hevc' })
      .toBuffer();
  } catch {
    t.skip('sharp cannot encode HEIC (no HEVC support) — manual QA required');
    return;
  }
  const out = await convertHeicIfNeeded(heic, 'image/heic');
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
});

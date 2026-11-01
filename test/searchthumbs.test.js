import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const { composeCard, drawBboxOverlay } = await import('../src/searchthumbs.js');

async function syntheticImage() {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: '#cccccc' },
  })
    .jpeg()
    .toBuffer();
}

test('composeCard returns 1024x1024', async () => {
  const input = await syntheticImage();
  const out = await composeCard(input);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1024);
});

test('drawBboxOverlay returns a buffer', async () => {
  const input = await syntheticImage();
  const out = await drawBboxOverlay(input, [
    { bbox: [0.1, 0.1, 0.5, 0.4], label: 'Диван' },
  ]);
  assert.ok(Buffer.isBuffer(out));
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
});

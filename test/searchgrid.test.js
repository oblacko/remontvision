import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const { sliceGrid, buildGridPrompt } = await import('../src/searchgrid.js');

async function syntheticGrid() {
  return sharp({
    create: { width: 1000, height: 500, channels: 3, background: '#cccccc' },
  })
    .jpeg()
    .toBuffer();
}

test('sliceGrid returns rows*cols cells', async () => {
  const buf = await syntheticGrid();
  const cells = await sliceGrid(buf);
  assert.equal(cells.length, 10);
});

test('sliceGrid cell dimensions match formula', async () => {
  const buf = await syntheticGrid();
  const [first] = await sliceGrid(buf);
  const meta = await sharp(first.buffer).metadata();
  assert.equal(meta.width, 182);
  assert.equal(meta.height, 232);
});

test('buildGridPrompt embeds objects list', () => {
  const out = buildGridPrompt(
    [{ label: 'Кровать', description: 'дуб', color: 'беж' }],
    'Grid:\n{objects}',
  );
  assert.ok(out.includes('1. Кровать'));
  assert.ok(out.includes('дуб'));
  assert.ok(out.includes('беж'));
});

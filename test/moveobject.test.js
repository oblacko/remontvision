import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { normalizeMove, composeMove } from '../src/moveobject.js'

test('normalizeMove clamps bbox and deltas', () => {
  const move = normalizeMove({ bbox: [0.1, 0.2, 0.3, 0.4], dx: 2, dy: -2, label: 'Шкаф' })
  assert.deepEqual(move.bbox, [0.1, 0.2, 0.3, 0.4])
  assert.equal(move.dx, 1)
  assert.equal(move.dy, -1)
  assert.equal(normalizeMove({ bbox: [0, 0, 0, 1], dx: 0, dy: 0 }), null)
  assert.equal(normalizeMove(null), null)
})

test('composeMove pastes the object at the destination and clears the source', async () => {
  const blue = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#0000ff' } }).png().toBuffer()
  const parent = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } })
    .composite([{ input: blue, left: 10, top: 10 }])
    .png()
    .toBuffer()
  const cleaned = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer()

  const out = await composeMove(parent, cleaned, { bbox: [0.1, 0.1, 0.2, 0.2], dx: 0.4, dy: 0.4 })
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const dest = px(60, 60)
  assert.ok(dest.b > dest.r, `destination should be blue, got ${JSON.stringify(dest)}`)
  const old = px(20, 20)
  assert.ok(old.r > old.b, `old place should be red, got ${JSON.stringify(old)}`)
})

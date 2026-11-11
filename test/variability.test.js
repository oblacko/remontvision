import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomVariability, pickStyleAccent, resolveStylePalette, variabilityPrompt } from '../src/variability.js';

const SCANDI = resolveStylePalette({ styleName: 'Скандинавский' });
const SCANDI_COLORS = new Set([SCANDI.accent, SCANDI.support, SCANDI.dark]);

test('accent is always a hex from the style palette', () => {
  for (let i = 0; i < 20; i += 1) {
    const out = buildRoomVariability({ seed: `seed-${i}`, styleName: 'Скандинавский' });
    assert.match(out.accentHex, /^#[0-9A-F]{6}$/i);
    assert.ok(SCANDI_COLORS.has(out.accentHex), `${out.accentHex} must come from the style palette`);
  }
});

test('seed rotates the accent across the palette', () => {
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    seen.add(buildRoomVariability({ seed: `room-${i}`, styleName: 'Скандинавский' }).accentHex);
  }
  assert.ok(seen.size >= 2, 'different seeds should not always pick the same accent');
});

test('unknown style has no palette accent', () => {
  const out = buildRoomVariability({ seed: 'x', styleName: 'Неизвестный стиль' });
  assert.equal(out.accentHex, null);
  assert.equal(pickStyleAccent(null, 'x'), null);
});

test('previous renders produce an avoid list capped at five', () => {
  const used = Array.from({ length: 9 }, (_, i) => ({
    focalZone: `zone-${i}`,
    mainMove: `move-${i}`,
    palette: [`palette-${i}`],
  }));
  const out = buildRoomVariability({ seed: 's', styleName: 'Скандинавский', used });
  assert.ok(out.avoid.length > 0 && out.avoid.length <= 5);
  assert.ok(out.avoid.join(' ').includes('zone-8'), 'latest choices are kept');
  assert.doesNotMatch(out.avoid.join(' '), /zone-0\b/, 'old choices fall out of the window');
});

test('variability prompt names the emphasis and the avoided choices', () => {
  const out = buildRoomVariability({
    seed: 'render-42',
    styleName: 'Скандинавский',
    used: [{ focalZone: 'window', mainMove: 'accent wall', palette: ['terracotta'] }],
  });
  const text = variabilityPrompt(out);
  assert.match(text, /VARIABILITY — ROOM-LEVEL NOVELTY/);
  assert.match(text, /Composition emphasis:/);
  assert.match(text, /Do not repeat:/);
  assert.match(text, /window/);
  assert.match(text, /accent wall/);
});

test('kept-furniture novelty does not ask to rearrange the room', () => {
  const out = buildRoomVariability({
    seed: 'render-keep',
    styleName: 'Скандинавский',
    keepFurniture: true,
    used: [{ focalZone: 'window', mainMove: 'accent wall', palette: ['terracotta'] }],
  });
  const text = variabilityPrompt(out);
  assert.doesNotMatch(out.avoid.join(' '), /furniture arrangement/);
  assert.match(text, /Keep the existing furniture positions and layout/);
  assert.doesNotMatch(text, /visibly different composition/);
});

test('empty room novelty may ask for a different composition', () => {
  const out = buildRoomVariability({
    seed: 'render-empty',
    styleName: 'Скандинавский',
    keepFurniture: false,
    used: [{ focalZone: 'window', mainMove: 'accent wall', palette: ['terracotta'] }],
  });
  const text = variabilityPrompt(out);
  assert.match(out.avoid.join(' '), /furniture arrangement/);
  assert.match(text, /visibly different composition/);
});

test('first render of a room has no avoid list', () => {
  const out = buildRoomVariability({ seed: 'first', styleName: 'Скандинавский', used: [] });
  assert.deepEqual(out.avoid, []);
  assert.match(variabilityPrompt(out), /first render/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildScalePlan, bedWidthForRoom, layoutCorrection } = await import('../src/scaleplan.js');

test('bed width follows the narrow-room table', () => {
  assert.equal(bedWidthForRoom(2.1), 140);
  assert.equal(bedWidthForRoom(2.5), 160);
  assert.equal(bedWidthForRoom(3.0), 160);
  assert.equal(bedWidthForRoom(4.0), 200);
});

test('layout validator catches a 160 bed with 50 cm sides in a 260 cm room', () => {
  const correction = layoutCorrection([
    { type: 'bed', widthCm: 160, depthCm: 200, position: 'back wall, centered' },
  ], { width: 2.6, length: 4.5 }, { bedType: 'double' });
  assert.match(correction, /50 cm/);
  assert.match(correction, /140 cm/);
});

test('layout validator accepts a 140 bed with 60 cm sides', () => {
  const correction = layoutCorrection([
    { type: 'bed', widthCm: 140, depthCm: 200, position: 'back wall, centered' },
  ], { width: 2.6, length: 4.5 }, { bedType: 'small_double' });
  assert.equal(correction, '');
});

test('layout validator rejects a wardrobe that does not fit beyond the bed', () => {
  const correction = layoutCorrection([
    { type: 'bed', widthCm: 140, depthCm: 200, position: 'back wall, centered' },
    { type: 'wardrobe', widthCm: 200, depthCm: 60, position: 'left wall, near entrance' },
  ], { width: 2.6, length: 4.2 }, { bedType: 'small_double' });
  assert.match(correction, /Wardrobe 200 cm/);
  assert.match(correction, /420 cm long/);
});

test('children room gets a small bed and never a king', () => {
  const plan = buildScalePlan({ roomType: 'Детская', width: 3.0, length: 4.0, height: 2.6, bedLength: 2 });
  assert.match(plan, /120 cm wide bed/);
  assert.match(plan, /single or small double bed/);
  assert.match(plan, /never a king-size bed/);
});

test('narrow bedroom gets one walkway and wall-mounted bedside storage', () => {
  const plan = buildScalePlan({ roomType: 'Спальня', width: 2.1, length: 3.4, height: 2.6, bedLength: 2 });
  assert.match(plan, /140 cm wide bed/);
  assert.match(plan, /one 30–40 cm walkway/);
  assert.match(plan, /wall-mounted bedside shelves/);
  assert.match(plan, /No freestanding|instead of freestanding/);
  assert.match(plan, /exactly 2 m/);
});

test('low ceiling removes pendants and tall cabinetry', () => {
  const plan = buildScalePlan({ roomType: 'Гостиная (зал)', width: 4, length: 5, height: 2.45 });
  assert.match(plan, /Low ceiling/);
  assert.match(plan, /no pendant/);
  assert.match(plan, /floor-to-ceiling/);
});

test('kitchen plan scales by area', () => {
  const small = buildScalePlan({ roomType: 'Кухня', width: 2.4, length: 2.3, height: 2.7 });
  assert.match(small, /single linear run/);
  const large = buildScalePlan({ roomType: 'Кухня', width: 3.2, length: 4.0, height: 2.7 });
  assert.match(large, /U-shape or a 200 × 90 cm island/);
});

test('long narrow room keeps the central path clear', () => {
  const plan = buildScalePlan({ roomType: 'Прихожая', width: 1.4, length: 4.0, height: 2.5 });
  assert.match(plan, /Long narrow room/);
  assert.match(plan, /furniture deeper than 35 cm is forbidden/);
  assert.match(plan, /60 cm path/);
});

test('non-bedroom plans do not mention a bed even if bed length is passed', () => {
  const plan = buildScalePlan({ roomType: 'Гостиная (зал)', width: 4, length: 5, height: 2.7, bedLength: 2 });
  assert.doesNotMatch(plan, /bed|кроват/i);
});

test('no plan without all room dimensions', () => {
  assert.equal(buildScalePlan({ roomType: 'Спальня', width: 3, length: 6 }), '');
});

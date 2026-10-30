import test from 'node:test';
import assert from 'node:assert/strict';

const { buildScalePlan, bedWidthForRoom } = await import('../src/scaleplan.js');

test('bed width follows the narrow-room table', () => {
  assert.equal(bedWidthForRoom(2.1), 140);
  assert.equal(bedWidthForRoom(2.5), 160);
  assert.equal(bedWidthForRoom(3.0), 180);
  assert.equal(bedWidthForRoom(4.0), 200);
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

test('no plan without all room dimensions', () => {
  assert.equal(buildScalePlan({ roomType: 'Спальня', width: 3, length: 6 }), '');
});

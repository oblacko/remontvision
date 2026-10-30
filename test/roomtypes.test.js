import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ROOM_TYPE_NAMES,
  ROOM_TYPES,
  activeRoomTypeNames,
  getRoomTypeDefaults,
  roomTypeByName,
  setRoomTypesForTests,
  validateRoomTypes,
} = await import('../src/roomtypes.js');

test('default room types include prompts, categories, slots and styling', () => {
  const list = getRoomTypeDefaults();
  assert.equal(list.length, 12);
  for (const room of list) {
    assert.ok(room.name);
    assert.ok(room.prompt);
    assert.ok(room.categories.length);
    assert.ok(room.slots.length);
    assert.ok(room.styling);
    assert.equal(room.active, true);
    assert.equal(typeof room.sort, 'number');
  }
  assert.equal(ROOM_TYPES.length, list.length);
  assert.ok(ROOM_TYPE_NAMES.includes('Спальня'));
  assert.equal(roomTypeByName('  спальня ')?.name, 'Спальня');
});

test('room type validation rejects duplicates and unknown categories', () => {
  const list = getRoomTypeDefaults();
  assert.throws(() => validateRoomTypes([...list, list[0]]), /повторяется/);
  assert.throws(() => validateRoomTypes(list.filter(room => room.name !== 'Другое')), /системный тип/);
  assert.throws(() => validateRoomTypes(list.map(room => ({ ...room, active: false }))), /активный тип/);

  const badCategory = structuredClone(list);
  badCategory[0].categories.push('unknown_category');
  assert.throws(() => validateRoomTypes(badCategory), /неизвестная категория/);

  const badSlot = structuredClone(list);
  badSlot.find(room => room.name === 'Спальня').slots[0].categories = ['sofa'];
  assert.throws(() => validateRoomTypes(badSlot), /не входит в categories/);
});

test('inactive room type stays available for old rooms but is hidden from the public list', () => {
  const list = getRoomTypeDefaults();
  const bedroom = list.find(room => room.name === 'Спальня');
  bedroom.active = false;
  setRoomTypesForTests(validateRoomTypes(list));
  assert.ok(!activeRoomTypeNames().includes('Спальня'));
  assert.equal(roomTypeByName('Спальня')?.active, false);
  setRoomTypesForTests(getRoomTypeDefaults());
  assert.ok(activeRoomTypeNames().includes('Спальня'));
});

test('custom room type is accepted with slot categories from its own categories', () => {
  const list = getRoomTypeDefaults();
  list.push({
    name: 'Коридор',
    prompt: 'corridor',
    categories: ['floor', 'paint', 'light', 'outlets'],
    slots: [
      { key: 'floor', categories: ['floor'] },
      { key: 'wall', categories: ['paint'] },
      { key: 'light', categories: ['light'] },
    ],
    keep: 'walls and doors',
    change: 'floor and lighting',
    guidance: 'durable finishes',
    forbid: 'no bed',
    electrical: [{ title: 'Свет', text: 'Датчик движения.' }],
    styling: 'Keep it practical and uncluttered.',
    active: true,
    sort: 100,
  });
  const next = validateRoomTypes(list);
  assert.equal(next.find(room => room.name === 'Коридор')?.slots.length, 3);
  setRoomTypesForTests(getRoomTypeDefaults());
});

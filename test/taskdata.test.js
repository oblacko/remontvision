import test from 'node:test';
import assert from 'node:assert/strict';

const { breakdownTask } = await import('../src/taskdata.js');

test('breakdownTask maps running render meta into a task', () => {
  const task = breakdownTask({
    id: 'render-1',
    room_id: 'room-1',
    style: 'Современный минимализм',
    room_type: 'Кухня',
    image_path: 'renders/render-1.png',
    photo_path: 'uploads/photo.jpg',
    created_at: '2026-11-07T09:00:00.000Z',
    meta: { breakdown: { status: 'running', started_at: '2026-11-07T10:00:00.000Z' } },
  });

  assert.equal(task.kind, 'breakdown');
  assert.equal(task.id, 'breakdown:render-1');
  assert.equal(task.render_id, 'render-1');
  assert.equal(task.room_id, 'room-1');
  assert.equal(task.style, 'Разбор интерьера');
  assert.equal(task.room_type, 'Кухня');
  assert.equal(task.status, 'running');
  assert.equal(task.created_at, '2026-11-07T10:00:00.000Z');
  assert.equal(task.image_url, '/renders/render-1.png');
  assert.equal(task.photo_url, '/files/photo.jpg');
});

test('breakdownTask keeps done state and skips renders without breakdown meta', () => {
  const done = breakdownTask({
    id: 'render-2',
    room_id: 'room-2',
    style: 'Скандинавский',
    image_path: 'renders/render-2.png',
    created_at: '2026-11-07T09:00:00.000Z',
    meta: { breakdown: { status: 'done', finished_at: '2026-11-07T10:05:00.000Z', cost_usd: 0.01 } },
  });

  assert.equal(done.status, 'done');
  assert.equal(done.created_at, '2026-11-07T10:05:00.000Z');
  assert.equal(breakdownTask({ id: 'render-3', meta: {} }), null);
  assert.equal(breakdownTask(null), null);
});

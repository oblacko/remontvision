import test from 'node:test';
import assert from 'node:assert/strict';

const { breakdownTask, roadmapTask } = await import('../src/taskdata.js');

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

test('breakdownTask hides legacy breakdowns but shows versioned completed ones', () => {
  const legacy = breakdownTask({
    id: 'render-4',
    room_id: 'room-4',
    style: 'Современный',
    created_at: '2026-11-07T09:00:00.000Z',
    meta: { breakdown: { cost_usd: 0.005, at: '2026-11-07T10:20:00.000Z' } },
  });
  const versioned = breakdownTask({
    id: 'render-5',
    room_id: 'room-5',
    style: 'Современный',
    created_at: '2026-11-07T09:00:00.000Z',
    meta: { breakdown: { version: 2, at: '2026-11-07T10:30:00.000Z' } },
  });

  assert.equal(legacy, null);
  assert.equal(versioned.status, 'done');
  assert.equal(versioned.created_at, '2026-11-07T10:30:00.000Z');
});

test('roadmapTask maps running and completed roadmap meta', () => {
  const running = roadmapTask({
    id: 'render-6',
    room_id: 'room-6',
    room_type: 'Кухня',
    image_path: 'renders/r6.png',
    created_at: '2026-11-07T09:00:00.000Z',
    meta: { roadmap: { status: 'running', started_at: '2026-11-07T10:40:00.000Z' } },
  });
  const done = roadmapTask({
    id: 'render-7',
    room_id: 'room-7',
    created_at: '2026-11-07T09:00:00.000Z',
    meta: { roadmap: { version: 1, status: 'done', finished_at: '2026-11-07T10:45:00.000Z' } },
  });

  assert.equal(running.kind, 'roadmap');
  assert.equal(running.id, 'roadmap:render-6');
  assert.equal(running.style, 'Роадмап ремонта');
  assert.equal(running.status, 'running');
  assert.equal(done.status, 'done');
  assert.equal(roadmapTask({ id: 'render-8', meta: {} }), null);
});

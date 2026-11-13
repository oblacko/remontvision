import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, closeTestApp } from '../support/app.js';
import { createUser, seedRoom, insertRender } from '../support/helpers.js';
import { q, pool } from '../../src/db.js';
import { sweepOrphanRooms } from '../../src/jobs.js';

after(closeTestApp);

test('room GC deletes old render-less rooms and keeps rooms with renders or active cleanup', async () => {
  await createTestApp();
  const user = await createUser();

  // старая комната без рендеров — кандидат на удаление
  const orphan = await seedRoom({ userId: user.id, photoPath: 'uploads/orphan.png' });
  await pool.query(`UPDATE rooms SET created_at = now() - interval '30 days' WHERE id = $1`, [orphan.id]);

  // старая комната с готовым рендером — не трогаем
  const withRender = await seedRoom({ userId: user.id });
  await pool.query(`UPDATE rooms SET created_at = now() - interval '30 days' WHERE id = $1`, [withRender.id]);
  await insertRender({ roomId: withRender.id, status: 'done', imagePath: 'renders/x.png' });

  // старая комната в активной очистке — не трогаем
  const processing = await seedRoom({ userId: user.id, keepFurniture: false });
  await pool.query(`UPDATE rooms SET created_at = now() - interval '30 days', cleanup_status = 'processing' WHERE id = $1`, [processing.id]);

  // свежая комната без рендеров — слишком молодая
  const fresh = await seedRoom({ userId: user.id });

  const before = (await pool.query(`SELECT COUNT(*)::int AS n FROM rooms`)).rows[0].n;

  await sweepOrphanRooms();

  assert.equal(await q.getRoom(orphan.id), null, 'осиротевшая комната удалена');
  assert.ok(await q.getRoom(withRender.id), 'комната с рендером осталась');
  assert.ok(await q.getRoom(processing.id), 'комната в очистке осталась');
  assert.ok(await q.getRoom(fresh.id), 'свежая комната осталась');

  const after = (await pool.query(`SELECT COUNT(*)::int AS n FROM rooms`)).rows[0].n;
  assert.equal(after, before - 1, 'удалена ровно одна комната');
});

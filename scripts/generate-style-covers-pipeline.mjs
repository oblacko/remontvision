// Генерация обложек стилей через полный пайплайн (jobs.js/processRender).
// Запуск: node --env-file=.env scripts/generate-style-covers-pipeline.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q, pool } from '../src/db.js';
import { putBuffer, getBuffer } from '../src/storage.js';
import { enqueueRenderWithCredit } from '../src/payments.js';
import { processRender } from '../src/jobs.js';
import { DESIGN_STYLES } from '../src/designdata.js';
import { detectImageExt } from '../src/imagesize.js';

const PHOTO = 'assets/zal.jpg';
const ROOM_TYPE = 'Гостиная (зал)';
// 5 проблемных стилей, которые исправляем первыми.
const STYLE_IDS = ['tropical_modern', 'english', 'art_deco', 'dark_academia', 'chalet'];

async function createTestUser() {
  const email = `test-${crypto.randomUUID().slice(0, 8)}@local.dev`;
  const { rows } = await pool.query(
    `INSERT INTO users (email, created_at) VALUES ($1, now()) RETURNING id`,
    [email]
  );
  return rows[0].id;
}

async function uploadPhoto() {
  const buf = fs.readFileSync(path.join(process.cwd(), PHOTO));
  const ext = detectImageExt(buf);
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const key = `uploads/test-${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  await putBuffer(key, buf, mime);
  return key;
}

async function createRoom(userId, photoPath) {
  const id = crypto.randomUUID();
  await q.createRoom(
    id,
    'Современный',
    500000,
    photoPath,
    userId,
    ROOM_TYPE,
    null,
    null,
    null,
    'comfort',
    false, // keepFurniture — пустая комната, layoutPlan выбирает мебель
    false  // useCatalog
  );
  return id;
}

async function claimRenderDirectly(renderId) {
  const claimedBy = crypto.randomUUID();
  await pool.query(
    `UPDATE renders
     SET status = 'processing', started_at = now(), claimed_at = now(),
         lease_expires_at = now() + interval '30 minutes', claimed_by = $2
     WHERE id = $1 AND status = 'queued'`,
    [renderId, claimedBy]
  );
  return claimedBy;
}

async function waitForRender(renderId) {
  let row = await q.getRender(renderId);
  let attempts = 0;
  while (row.status !== 'done' && row.status !== 'error' && attempts < 300) {
    await new Promise(r => setTimeout(r, 2000));
    row = await q.getRender(renderId);
    attempts++;
    if (attempts % 15 === 0) console.log(`    ... ${attempts * 2}s, status=${row.status}`);
  }
  return row;
}

async function saveCover(renderRow, styleId) {
  if (!renderRow.image_path) {
    console.log(`    no image_path, status=${renderRow.status}, error=${renderRow.error || 'none'}`);
    return false;
  }
  const buf = await getBuffer(renderRow.image_path);
  const outName = `style-${styleId}-pipeline.png`;
  const outPath = path.join(process.cwd(), 'web', 'dist', 'images', outName);
  fs.writeFileSync(outPath, buf);
  console.log(`    saved ${outName}`);
  return true;
}

async function runPipeline(roomId, userId) {
  for (const styleId of STYLE_IDS) {
    const style = DESIGN_STYLES.find(s => s.id === styleId);
    if (!style) {
      console.log(`SKIP unknown style ${styleId}`);
      continue;
    }
    console.log(`\n=== ${styleId} · ${style.name} ===`);
    const renderId = crypto.randomUUID();

    try {
      await enqueueRenderWithCredit({
        id: renderId,
        roomId,
        chargedUserId: null,
        style: style.name,
        modelCredits: 1,
      });
    } catch (e) {
      console.log(`    enqueue failed: ${e.message}`);
      continue;
    }

    const claimedBy = await claimRenderDirectly(renderId);
    const renderRow = await q.getRender(renderId);
    if (renderRow.status !== 'processing' || renderRow.claimed_by !== claimedBy) {
      console.log(`    claim failed: status=${renderRow.status}`);
      continue;
    }

    // Запускаем полный пайплайн: cleanup → art director → layout → render → QA.
    await processRender(renderId, claimedBy);

    const final = await waitForRender(renderId);
    if (final.status === 'done') {
      await saveCover(final, styleId);
    } else {
      console.log(`    failed: status=${final.status}, error=${final.error || 'none'}`);
    }
  }
}

async function main() {
  const userId = await createTestUser();
  const photoPath = await uploadPhoto();
  const roomId = await createRoom(userId, photoPath);
  console.log('room', roomId, 'user', userId, 'photo', photoPath);
  await runPipeline(roomId, userId);
  console.log('\nDONE');
  await pool.end();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

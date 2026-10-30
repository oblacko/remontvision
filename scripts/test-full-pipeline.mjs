// Полный локальный прогон processRender на реальном фото санузла.
// Проверяет, что layoutPlan/framingNote не теряются в области видимости.
// Запуск: node --env-file=.env scripts/test-full-pipeline.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { processRender } from '../src/jobs.js';

const pool = new pg.Pool({ connectionString: process.env.RV_DATABASE_URL });
const roomId = crypto.randomUUID();
const renderId = crypto.randomUUID();
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const roomType = process.env.TEST_ROOM_TYPE || 'Санузел';
const style = process.env.TEST_STYLE || 'Тёплый минимализм';
const width = Number(process.env.TEST_W || 1.7);
const length = Number(process.env.TEST_L || 2.2);
const height = Number(process.env.TEST_H || 2.4);
const bedLength = process.env.TEST_BED ? Number(process.env.TEST_BED) : null;
const photoKey = `uploads/test-${Date.now()}.jpg`;
const src = path.join(process.cwd(), process.env.TEST_SRC || 'tmp/live/bath-photo.jpg');
fs.copyFileSync(src, path.join(dataDir, photoKey));

await pool.query(
  `insert into rooms (id, style, budget, status, photo_path, created_at, updated_at, room_type, price_tier, keep_furniture, use_catalog, room_width_m, room_length_m, room_height_m, bed_length_m)
   values ($1, $2, 150, 'queued', $3, now(), now(), $4, 'comfort', false, false, $5, $6, $7, $8)`,
  [roomId, style, photoKey, roomType, width, length, height, bedLength],
);
await pool.query(
  `insert into renders (id, room_id, status, created_at) values ($1, $2, 'processing', now())`,
  [renderId, roomId],
);

console.log('room', roomId, 'render', renderId, 'photo', photoKey);
const t0 = Date.now();
await processRender(renderId);
const { rows } = await pool.query('select id,status,error,error_stage,cost_usd,model,meta,image_path from renders where id=$1', [renderId]);
const r = rows[0];
console.log(JSON.stringify({
  id: r.id,
  status: r.status,
  error: r.error,
  error_stage: r.error_stage,
  cost_usd: r.cost_usd,
  model: r.model,
  image_path: r.image_path,
  layout_plan: r.meta?.art_direction?.layoutPlan || null,
  framing_note: r.meta?.art_direction?.framingNote || null,
  objects: r.meta?.art_direction?.layoutItems || [],
  dimension_qa: r.meta?.dimension_qa || null,
  cost_breakdown: r.meta?.cost_breakdown || null,
  ms: Date.now() - t0,
}, null, 2));
await pool.end();
process.exit(0);

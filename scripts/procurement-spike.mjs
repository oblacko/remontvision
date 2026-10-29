import crypto from 'node:crypto';
import { q } from '../src/db.js';
import { getProcurementConfig, procurementConfigHash } from '../src/procurementconfig.js';
import { processProcurementRun, procurementDto } from '../src/procurement.js';
import { log } from '../src/openrouter.js';

const renderArg = process.argv.find(arg => arg.startsWith('--render='))?.split('=')[1] || null;
const config = getProcurementConfig();
if (!config.configured) {
  console.error('YANDEX_SEARCH_API_KEY/YANDEX_FOLDER_ID не заданы');
  process.exit(1);
}
const render = renderArg ? await q.getRender(renderArg) : await q.latestDoneRender();
if (!render) {
  console.error('Нет готового рендера. Укажите --render=<id>');
  process.exit(1);
}
const room = await q.getRoom(render.room_id);
if (!room) {
  console.error('Комната не найдена');
  process.exit(1);
}
const run = await q.createProcurementRun({
  id: crypto.randomUUID(),
  render_id: render.id,
  user_id: room.user_id,
  room_type: room.room_type,
  mode: 'list',
  region: config.region,
  config,
  config_hash: `${procurementConfigHash(config)}-${Date.now()}`.slice(0, 64),
  status: 'processing',
  credit_charged: false,
});
console.log(`spike run=${run.id} render=${render.id} room=${room.room_type}`);
const started = Date.now();
await processProcurementRun(run.id);
const dto = await procurementDto(run.id, room.user_id);
const candidates = dto.items.flatMap(item => item.candidates.map(candidate => ({ layer: item.layer, item: item.label, ...candidate })));
console.log(JSON.stringify({
  run: dto.id,
  status: dto.status,
  error: dto.error,
  ms: Date.now() - started,
  items: dto.items.length,
  with_candidates: dto.items.filter(item => item.candidates.length).length,
  candidates: candidates.length,
  verified: candidates.filter(c => c.status === 'verified').length,
  alternatives: candidates.filter(c => c.status === 'alternative').length,
  cost_usd: dto.cost_usd,
}, null, 2));
for (const item of dto.items) {
  console.log(`\n[${item.layer}] ${item.label} — ${item.status}${item.note ? ` (${item.note})` : ''}`);
  for (const candidate of item.candidates) {
    console.log(`  ${candidate.match_score}% ${candidate.price ?? '?'} ${candidate.currency} ${candidate.store} ${candidate.title}`);
    console.log(`  ${candidate.url}`);
  }
}
log({ event: 'procurement_spike_done', run_id: run.id, candidates: candidates.length });
process.exit(0);

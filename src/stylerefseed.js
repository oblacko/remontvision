// Идемпотентный сид сгенерированных референсов стилей: style-refs/seed.json → style_references.
// Картинки лежат в public/style-refs, при первом сиде копируются в storage (style-images/...).
import fs from 'node:fs';
import path from 'node:path';
import { q } from './db.js';
import { putBuffer } from './storage.js';
import { log } from './openrouter.js';

export async function seedStyleReferences() {
  const file = path.join(process.cwd(), 'style-refs', 'seed.json');
  if (!fs.existsSync(file)) return;
  let items;
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { log({ event: 'style_seed_error', error: String(e.message || e).slice(0, 300) }); return; }
  const styles = await q.styles(false);
  const byKey = new Map(styles.map(s => [s.key, s]));
  let inserted = 0, existing = 0, skipped = 0;
  for (const item of items) {
    if (!item.seed_key || !item.style_key || !item.file || !item.room_type) { skipped++; continue; }
    const style = byKey.get(item.style_key);
    if (!style) { skipped++; continue; }
    if (await q.styleReferenceBySeedKey(item.seed_key)) { existing++; continue; }
    const local = path.join(process.cwd(), 'public', 'style-refs', item.file);
    if (!fs.existsSync(local)) { skipped++; log({ event: 'style_seed_missing_file', file: item.file }); continue; }
    try {
      const buf = fs.readFileSync(local);
      const imagePath = `style-images/${item.file}`;
      await putBuffer(imagePath, buf, 'image/webp');
      const row = await q.upsertSeedStyleReference({
        ...item,
        style_id: style.id,
        image_path: imagePath,
      });
      if (row) inserted++; else existing++;
    } catch (e) {
      log({ event: 'style_seed_item_error', seed_key: item.seed_key, error: String(e.message || e).slice(0, 300) });
    }
  }
  log({ event: 'style_seed', total: items.length, inserted, existing, skipped });
}

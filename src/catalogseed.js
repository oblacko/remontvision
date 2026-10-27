// Идемпотентный сид каталога: catalog/seed.json → products.
// Картинки лежат в public/catalog и отдаются как /catalog/<file>.webp.
import fs from 'node:fs';
import path from 'node:path';
import { q } from './db.js';
import { log } from './openrouter.js';

export async function seedCatalog() {
  const file = path.join(process.cwd(), 'catalog', 'seed.json');
  if (!fs.existsSync(file)) return;
  let items;
  try {
    items = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log({ event: 'catalog_seed_error', error: String(e.message || e).slice(0, 300) });
    return;
  }
  let inserted = 0;
  let skipped = 0;
  for (const item of items) {
    if (!item.seed_key || !item.category || !item.name || !item.price) continue;
    const imageUrl = item.image ? `/catalog/${item.image}` : null;
    try {
      const row = await q.upsertSeedProduct({ ...item, image_url: imageUrl });
      if (row) inserted++;
      else skipped++;
    } catch (e) {
      log({ event: 'catalog_seed_item_error', seed_key: item.seed_key, error: String(e.message || e).slice(0, 300) });
    }
  }
  log({ event: 'catalog_seed', total: items.length, inserted, existing: skipped });
}

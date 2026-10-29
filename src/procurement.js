import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { q, withTransaction } from './db.js';
import { log } from './openrouter.js';
import { parseProcurementImage, scoreProductMatch } from './openrouter.js';
import { searchWebSync, filterProductResults } from './yandexsearch.js';
import { inspectProductUrl } from './productimport.js';
import { getBuffer, putBuffer } from './storage.js';
import { fetchRemoteImage } from './remoteimage.js';
import { getProcurementConfig, procurementConfigHash } from './procurementconfig.js';
import {
  getProcurementTemplate,
  categoryMeta,
  categoryLabel,
  categoryQuery,
  templateCategoryKeys,
} from './procurementtemplates.js';

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const LAYER_ORDER = { hero: 0, finish: 1, builtin: 2, textile: 3, completeness: 4 };
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const tokens = s => [...new Set(norm(s).split(/[^a-zа-я0-9]+/i).filter(w => w.length >= 3))];
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const ALIASES = {
  'bed': 'bed', 'кровать': 'bed',
  'nightstand': 'nightstand', 'bedside table': 'nightstand', 'тумба': 'nightstand',
  'wardrobe': 'wardrobe', 'closet': 'wardrobe', 'шкаф': 'wardrobe',
  'sofa': 'sofa', 'couch': 'sofa', 'диван': 'sofa',
  'armchair': 'armchair', 'кресло': 'armchair',
  'coffee table': 'coffee_table', 'coffee_table': 'coffee_table', 'журнальный стол': 'coffee_table',
  'dining table': 'dining_table', 'dining_table': 'dining_table', 'обеденный стол': 'dining_table',
  'dining chair': 'dining_chair', 'dining_chair': 'dining_chair', 'стул': 'dining_chair',
  'sideboard': 'sideboard', 'console': 'sideboard', 'комод': 'sideboard',
  'desk': 'desk', 'рабочий стол': 'desk',
  'office chair': 'office_chair', 'office_chair': 'office_chair',
  'storage': 'storage', 'shelves': 'storage', 'shelving': 'storage', 'стеллаж': 'storage',
  'bench': 'bench', 'банкетка': 'bench',
  'rug': 'rug', 'carpet': 'rug', 'ковер': 'rug',
  'light': 'light', 'pendant light': 'light', 'chandelier': 'light', 'sconce': 'light', 'lamp': 'light', 'светильник': 'light',
  'decor': 'decor', 'plant': 'decor', 'декор': 'decor',
  'floor': 'floor', 'пол': 'floor', 'walls': 'walls', 'wall': 'walls', 'стены': 'walls',
  'ceiling': 'ceiling', 'потолок': 'ceiling', 'skirting': 'skirting', 'плинтус': 'skirting',
  'tile': 'tile', 'плитка': 'tile', 'paint': 'paint', 'краска': 'paint',
  'wallpaper': 'wallpaper', 'обои': 'wallpaper', 'countertop': 'countertop', 'столешница': 'countertop',
  'cabinet': 'cabinet', 'kitchen cabinets': 'cabinet', 'faucet': 'faucet', 'смеситель': 'faucet',
  'sink': 'sink', 'раковина': 'sink', 'toilet': 'toilet', 'унитаз': 'toilet',
  'shower': 'shower', 'душ': 'shower', 'bathtub': 'bathtub', 'ванна': 'bathtub',
  'appliance': 'appliance', 'техника': 'appliance', 'mirror': 'mirror', 'зеркало': 'mirror',
  'curtains': 'curtains', 'шторы': 'curtains', 'bedding': 'bedding', 'постель': 'bedding',
  'textile': 'textile', 'текстиль': 'textile',
};

const CATEGORY_ACCEPTS = {
  walls: ['paint', 'wallpaper', 'tile', 'textile'],
  floor: ['floor', 'tile'],
  ceiling: ['paint', 'wallpaper'],
  tile: ['tile'],
  paint: ['paint'],
  wallpaper: ['wallpaper'],
  countertop: ['countertop'],
  cabinet: ['cabinet'],
  faucet: ['faucet'],
  sink: ['sink', 'faucet'],
  toilet: ['toilet'],
  shower: ['shower', 'bathtub'],
  bathtub: ['bathtub', 'shower'],
  appliance: ['appliance'],
  mirror: ['mirror'],
  light: ['light'],
  decor: ['decor', 'textile'],
  curtains: ['textile', 'curtains'],
  bedding: ['textile', 'bedding'],
  textile: ['textile'],
};

function normalizeKey(value) {
  const key = norm(value);
  return ALIASES[key] || key.replace(/\s+/g, '_');
}

function categoryCompatible(itemCategory, candidateCategory) {
  if (!itemCategory || !candidateCategory) return true;
  if (itemCategory === candidateCategory) return true;
  return (CATEGORY_ACCEPTS[itemCategory] || []).includes(candidateCategory);
}

function surfaceFor(key, surfaces = []) {
  const map = { floor: 'floor', walls: 'walls', paint: 'walls', wallpaper: 'walls', ceiling: 'ceiling', tile: 'backsplash', countertop: 'countertop', curtains: 'textile' };
  const wanted = map[key];
  if (!wanted) return null;
  return surfaces.find(s => s.surface === wanted) || surfaces.find(s => s.surface === key) || null;
}

function textScore(item, candidate) {
  const terms = tokens([
    item.attributes?.label,
    item.attributes?.subtype,
    item.attributes?.color,
    item.attributes?.material,
    ...(item.attributes?.keywords || []),
  ].filter(Boolean).join(' '));
  const hay = norm(`${candidate.name} ${candidate.description} ${candidate.category || ''} ${candidate.brand || ''}`);
  const matched = terms.filter(term => hay.includes(term)).length;
  let score = 45 + (terms.length ? 55 * (matched / terms.length) : 0);
  if (categoryCompatible(item.category, candidate.category)) score += 10;
  else score -= 25;
  if (candidate.used) score -= 50;
  if (!candidate.price) score -= 10;
  return clamp(score);
}

async function mimeForImage(key) {
  const ext = path.extname(key).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || 'image/png';
}

async function cropReference(renderBuffer, bbox, itemId) {
  try {
    const meta = await sharp(renderBuffer, { failOn: 'none' }).metadata();
    const width = meta.width || 1;
    const height = meta.height || 1;
    let [x, y, w, h] = Array.isArray(bbox) ? bbox : [0, 0, 1, 1];
    x = Math.max(0, Math.min(1, Number(x) || 0));
    y = Math.max(0, Math.min(1, Number(y) || 0));
    w = Math.max(0.05, Math.min(1 - x, Number(w) || 1));
    h = Math.max(0.05, Math.min(1 - y, Number(h) || 1));
    const left = Math.round(x * width);
    const top = Math.round(y * height);
    const extractWidth = Math.max(1, Math.min(width - left, Math.round(w * width)));
    const extractHeight = Math.max(1, Math.min(height - top, Math.round(h * height)));
    const buffer = await sharp(renderBuffer, { failOn: 'none' })
      .extract({ left, top, width: extractWidth, height: extractHeight })
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();
    const key = `procurement/crops/${itemId}.jpg`;
    await putBuffer(key, buffer, 'image/jpeg');
    return { key, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` };
  } catch (e) {
    log({ event: 'procurement_crop_error', item_id: itemId, error: String(e.message || e).slice(0, 300) });
    return null;
  }
}

async function downloadCandidateImage(url) {
  const image = await fetchRemoteImage(url);
  const buffer = await sharp(image.buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  const key = `procurement/${crypto.randomUUID()}.jpg`;
  await putBuffer(key, buffer, 'image/jpeg');
  return { key, buffer };
}

function buildItemContext(key, seen, surfaces, style) {
  const surface = surfaceFor(key, surfaces);
  return {
    label: categoryLabel(key),
    subtype: seen?.subtype || '',
    color: seen?.color || surface?.color || '',
    material: seen?.material || surface?.material || '',
    description: seen?.description || surface?.description || '',
    style: style || '',
    keywords: seen?.keywords || [],
  };
}

function buildQuery(key, context) {
  const base = categoryQuery(key, context);
  return context.style && context.style.length > 2 ? `${base} ${context.style}` : base;
}

function broadQuery(key, context) {
  const meta = categoryMeta(key);
  return `${meta?.label || key} купить`;
}

async function createItemsForRun(run, template, vision) {
  const seenMap = new Map();
  for (const item of vision.items || []) {
    const key = normalizeKey(item.key || item.category || item.label);
    if (!key) continue;
    if (!seenMap.has(key)) seenMap.set(key, item);
  }
  const keys = templateCategoryKeys(template);
  const order = (layer) => LAYER_ORDER[layer] ?? 9;
  const items = [];
  let sort = 0;
  for (const { key, layer } of keys) {
    const meta = categoryMeta(key);
    if (!meta) continue;
    const seen = seenMap.get(key) || null;
    const context = buildItemContext(key, seen, vision.surfaces || [], vision.style);
    const isRule = layer === 'completeness' || meta.mode === 'rule';
    const needsInput = layer === 'builtin' && !seen;
    if (layer === 'hero' && !seen) continue;
    if (isRule) {
      const item = await q.createProcurementItem({
        run_id: run.id,
        layer,
        category: key,
        label: meta.label,
        search_mode: 'rule',
        status: 'rule_based',
        sort: sort++,
        attributes: { ...context, note: meta.note || '' },
        quantity: null,
        unit: null,
        measurement_status: 'needs_input',
      });
      items.push(item);
      continue;
    }
    if (needsInput) {
      const item = await q.createProcurementItem({
        run_id: run.id,
        layer,
        category: key,
        label: meta.label,
        search_mode: 'ask',
        status: 'needs_input',
        sort: sort++,
        attributes: { ...context, note: 'Уточните тип и размеры' },
        measurement_status: 'needs_input',
      });
      items.push(item);
      continue;
    }
    const item = await q.createProcurementItem({
      run_id: run.id,
      layer,
      category: key,
      label: meta.label,
      query: buildQuery(key, context),
      search_mode: meta.mode,
      status: 'pending',
      sort: sort++,
      attributes: { ...context, keywords: context.keywords },
      bbox: seen?.bbox || null,
      visibility: seen?.visibility || (surfaceFor(key, vision.surfaces || []) ? 'hidden' : 'not_seen'),
      confidence: seen?.confidence ?? null,
    });
    items.push(item);
  }
  items.sort((a, b) => (order(a.layer) - order(b.layer)) || (a.sort - b.sort));
  return items;
}

async function searchItem(run, item, config, reference) {
  const attrs = item.attributes || {};
  const queries = [item.query || buildQuery(item.category, attrs)];
  if (attrs.color || attrs.material) queries.push(broadQuery(item.category, attrs));
  const savedByUrl = new Map();
  for (let round = 0; round < queries.length && round < 2; round++) {
    const query = queries[round];
    await q.setProcurementStage(run.id, `search:${query}`.slice(0, 120));
    let search;
    try {
      search = await searchWebSync({ query, region: config.region, limit: config.search_limit });
    } catch (e) {
      log({ event: 'procurement_search_error', run_id: run.id, item_id: item.id, query, error: String(e.message || e).slice(0, 300) });
      continue;
    }
    const filtered = filterProductResults(search.results, { domains: config.domains, limit: config.max_candidates_per_item });
    const roundRow = await q.createProcurementRound({
      item_id: item.id,
      round_no: round + 1,
      kind: round === 0 ? 'exact' : 'broad',
      query,
      results_count: filtered.length,
      latency_ms: search.latency_ms,
      cost_usd: null,
    });
    const candidates = [];
    for (const result of filtered) {
      try {
        const inspected = await inspectProductUrl(result.url);
        if (!inspected.name || !inspected.price || !inspected.allowed_domain) continue;
        if (inspected.used) continue;
        const score = textScore(item, inspected);
        if (score < Math.max(45, config.alt_score - 10)) continue;
        candidates.push({ inspected, result, text_score: score });
      } catch (e) {
        log({ event: 'procurement_import_error', run_id: run.id, item_id: item.id, url: result.url, error: String(e.message || e).slice(0, 200) });
      }
    }
    candidates.sort((a, b) => b.text_score - a.text_score);
    const visualLimit = item.search_mode === 'visual' ? config.max_visual_candidates : 0;
    const scored = [];
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      let finalScore = candidate.text_score;
      let breakdown = { text: candidate.text_score };
      let reasons = [];
      let imageKey = null;
      let imageBuffer = null;
      if (candidate.inspected.image_url) {
        try {
          const downloaded = await downloadCandidateImage(candidate.inspected.image_url);
          imageKey = downloaded.key;
          imageBuffer = downloaded.buffer;
        } catch (e) {
          log({ event: 'procurement_image_error', run_id: run.id, item_id: item.id, url: candidate.inspected.image_url, error: String(e.message || e).slice(0, 200) });
        }
      }
      if (visualLimit && index < visualLimit && reference?.dataUrl && imageBuffer) {
        try {
          const candidateDataUrl = `data:image/jpeg;base64,${(await sharp(imageBuffer).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()).toString('base64')}`;
          const visual = await scoreProductMatch({
            referenceImageUrl: reference.dataUrl,
            candidateImageUrl: candidateDataUrl,
            itemDescription: [attrs.label, attrs.subtype, attrs.color, attrs.material, attrs.description].filter(Boolean).join(', '),
            candidateName: candidate.inspected.name,
          });
          finalScore = Math.round(visual.score * 0.8 + candidate.text_score * 0.2);
          breakdown = { ...breakdown, visual: visual.score, ...visual.breakdown };
          reasons = visual.reasons;
        } catch (e) {
          log({ event: 'procurement_score_error', run_id: run.id, item_id: item.id, error: String(e.message || e).slice(0, 300) });
        }
      }
      if (finalScore < config.alt_score) continue;
      scored.push({ ...candidate, final_score: finalScore, breakdown, reasons, imageKey });
    }
    scored.sort((a, b) => b.final_score - a.final_score);
    for (const candidate of scored) {
      const saved = await q.upsertProcurementCandidate({
        item_id: item.id,
        round_id: roundRow.id,
        store: candidate.inspected.domain,
        canonical_url: candidate.inspected.url,
        title: candidate.inspected.name,
        image_url: candidate.inspected.image_url,
        image_path: candidate.imageKey,
        price: candidate.inspected.price,
        currency: candidate.inspected.currency || 'RUB',
        availability: candidate.inspected.availability,
        sku: candidate.inspected.sku,
        dimensions: candidate.inspected.dimensions,
        checked_at: new Date(),
        match_score: Math.round(candidate.final_score),
        score_breakdown: candidate.breakdown,
        match_reasons: candidate.reasons,
        raw: { domain: candidate.inspected.domain, text_score: candidate.text_score, issues: candidate.inspected.issues },
      });
      savedByUrl.set(saved.canonical_url, saved);
    }
    const best = scored[0]?.final_score ?? null;
    await q.finishProcurementRound(roundRow.id, {
      results_count: filtered.length,
      best_score: best,
      decision: best >= config.min_score ? 'accepted' : best >= config.alt_score ? 'alternative' : 'unresolved',
      latency_ms: search.latency_ms,
    });
    if (best >= config.min_score || round === queries.length - 1) break;
  }
  const saved = [...savedByUrl.values()];
  await q.setProcurementItemStatus(item.id, saved.length ? 'done' : 'unresolved', { candidateCount: saved.length });
  return saved;
}

export async function refundProcurementRun(run, reason) {
  if (!run?.credit_charged || run.credit_refunded) return false;
  const refunded = await withTransaction(async client => {
    const locked = await client.query(
      `SELECT * FROM procurement_runs WHERE id = $1 FOR UPDATE`, [run.id]);
    const current = locked.rows[0];
    if (!current || !current.credit_charged || current.credit_refunded) return false;
    await client.query(
      `UPDATE procurement_runs SET credit_refunded = true WHERE id = $1`, [run.id]);
    await client.query(
      `INSERT INTO credit_txn (user_id, delta, reason, procurement_run_id, note)
       VALUES ($1, 1, 'procurement_refund', $2, $3)`,
      [current.user_id, run.id, String(reason || 'Возврат за подбор товаров').slice(0, 300)]);
    return true;
  });
  if (refunded) log({ event: 'procurement_credit_refunded', run_id: run.id, reason });
  return refunded;
}

async function failRun(run, message, cost = 0) {
  const failed = await q.failProcurementRun(run.id, message, { costUsd: cost });
  await refundProcurementRun(failed || run, message);
  return failed;
}

export async function startProcurement({ userId, renderId }) {
  const config = getProcurementConfig();
  if (!config.enabled) {
    const e = new Error(config.configured ? 'Подбор товаров выключен' : 'Подбор товаров не настроен');
    e.status = 503;
    throw e;
  }
  const render = await q.renderOwnedByUser(renderId, userId);
  if (!render) { const e = new Error('Дизайн не найден'); e.status = 404; throw e; }
  if (render.status !== 'done' || !render.image_path) { const e = new Error('Дизайн ещё не готов'); e.status = 409; throw e; }
  const room = await q.getRoom(render.room_id);
  const configHash = procurementConfigHash(config);
  const existing = await q.activeProcurementRun(render.id, configHash);
  if (existing) return { run: existing, existing: true };

  const run = await withTransaction(async client => {
    await client.query(`SELECT id FROM renders WHERE id = $1 FOR UPDATE`, [render.id]);
    const again = await client.query(
      `SELECT * FROM procurement_runs WHERE render_id = $1 AND config_hash = $2 AND status IN ('queued','processing','done')
       ORDER BY created_at DESC LIMIT 1`, [render.id, configHash]);
    if (again.rows[0]) return again.rows[0];
    await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const balance = await client.query(
      `SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_txn WHERE user_id = $1`, [userId]);
    if (Number(balance.rows[0]?.balance || 0) < config.credit_cost) {
      const e = new Error('Недостаточно кредитов');
      e.status = 402;
      throw e;
    }
    const id = crypto.randomUUID();
    const inserted = await client.query(
      `INSERT INTO procurement_runs (id, render_id, user_id, room_type, mode, region, config, config_hash, status, credit_charged)
       VALUES ($1,$2,$3,$4,'list',$5,$6,$7,'queued',true) RETURNING *`,
      [id, render.id, userId, room?.room_type || null, config.region, JSON.stringify(config), configHash]);
    await client.query(
      `INSERT INTO credit_txn (user_id, delta, reason, procurement_run_id, note)
       VALUES ($1, -1, 'procurement', $2, $3)`,
      [userId, id, `Подбор товаров по рендеру ${render.id}`]);
    return inserted.rows[0];
  });
  log({ event: 'procurement_started', run_id: run.id, render_id: render.id, user_id: userId, existing: false });
  return { run, existing: false };
}

export async function processProcurementRun(runId) {
  const config = getProcurementConfig();
  let run = await q.startProcurementRun(runId);
  if (!run) run = await q.procurementRunById(runId);
  if (!run || run.status !== 'processing') return;
  let cost = Number(run.cost_usd || 0);
  try {
    const render = await q.getRender(run.render_id);
    if (!render?.image_path) throw new Error('Нет изображения рендера');
    const room = await q.getRoom(render.room_id);
    const renderBuffer = await getBuffer(render.image_path);
    const mime = await mimeForImage(render.image_path);
    const vision = await parseProcurementImage(renderBuffer.toString('base64'), mime, { roomType: room?.room_type || run.room_type });
    cost += Number(vision.cost || 0);
    await q.setProcurementAnalysis(run.id, { ...vision, cost: vision.cost ?? null });
    await q.setProcurementStage(run.id, 'items');
    const template = getProcurementTemplate(room?.room_type || run.room_type);
    const items = await createItemsForRun(run, template, vision);
    log({ event: 'procurement_vision_done', run_id: run.id, items: items.length, surfaces: vision.surfaces?.length || 0, cost_usd: vision.cost ?? null });

    let candidateCount = 0;
    for (const item of items) {
      if (item.search_mode === 'rule' || item.search_mode === 'ask') continue;
      if (cost >= config.max_run_cost_usd) {
        await q.setProcurementItemStatus(item.id, 'skipped', { error: 'Превышен лимит стоимости' });
        continue;
      }
      let reference = null;
      if (item.bbox) {
        reference = await cropReference(renderBuffer, item.bbox, item.id);
        if (reference?.key) await q.setProcurementItemCrop(item.id, reference.key);
      }
      try {
        const saved = await searchItem(run, item, config, reference);
        candidateCount += saved.length;
      } catch (e) {
        await q.setProcurementItemStatus(item.id, 'error', { error: String(e.message || e).slice(0, 500) });
        log({ event: 'procurement_item_error', run_id: run.id, item_id: item.id, error: String(e.message || e).slice(0, 300) });
      }
    }

    const candidates = await q.procurementCandidatesForRun(run.id);
    if (candidates.length === 0) {
      await failRun(run, 'Не удалось найти проверенные товары', cost);
      log({ event: 'procurement_error', run_id: run.id, reason: 'no_candidates', cost_usd: cost });
      return;
    }
    await q.finishProcurementRun(run.id, { costUsd: cost });
    log({ event: 'procurement_done', run_id: run.id, items: items.length, candidates: candidates.length, cost_usd: cost });
  } catch (e) {
    await failRun(run, String(e.message || e).slice(0, 500), cost);
    log({ event: 'procurement_error', run_id: run.id, error: String(e.message || e).slice(0, 500), cost_usd: cost });
  }
}

export async function procurementDto(runId, userId) {
  const run = await q.procurementRunForUser(runId, userId);
  if (!run) return null;
  const items = await q.procurementItemsForRun(run.id);
  const candidates = await q.procurementCandidatesForRun(run.id);
  const config = getProcurementConfig();
  const byItem = new Map();
  for (const candidate of candidates) {
    if (!byItem.has(candidate.item_id)) byItem.set(candidate.item_id, []);
    byItem.get(candidate.item_id).push(candidate);
  }
  const publicUrl = candidate => candidate.image_path
    ? `/procurement/${path.basename(candidate.image_path)}`
    : candidate.image_url;
  return {
    id: run.id,
    render_id: run.render_id,
    status: run.status,
    stage: run.stage,
    error: run.error,
    credit_charged: run.credit_charged,
    credit_refunded: run.credit_refunded,
    cost_usd: run.cost_usd,
    created_at: run.created_at,
    finished_at: run.finished_at,
    items: items.map(item => ({
      id: item.id,
      layer: item.layer,
      category: item.category,
      label: item.label,
      search_mode: item.search_mode,
      status: item.status,
      note: item.attributes?.note || null,
      query: item.query,
      candidates: (byItem.get(item.id) || []).map(candidate => ({
        id: candidate.id,
        title: candidate.title,
        price: candidate.price === null ? null : Number(candidate.price),
        currency: candidate.currency,
        store: candidate.store,
        image_url: publicUrl(candidate),
        url: `/buy/${candidate.id}`,
        match_score: candidate.match_score === null ? null : Number(candidate.match_score),
        status: Number(candidate.match_score) >= config.min_score ? 'verified' : 'alternative',
        checked_at: candidate.checked_at,
      })),
    })),
  };
}

export async function logProcurementClick({ candidateId, userId = null, ipHash = null }) {
  const candidate = await q.procurementCandidateWithRun(candidateId);
  if (!candidate) return null;
  try {
    await q.logProcurementClick({
      runId: candidate.run_id,
      itemId: candidate.item_id,
      candidateId: candidate.id,
      userId,
      ipHash,
    });
  } catch (e) {
    log({ event: 'procurement_click_error', candidate_id: candidateId, error: String(e.message || e).slice(0, 200) });
  }
  return candidate;
}

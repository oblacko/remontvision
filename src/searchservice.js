import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { q } from './db.js';
import { parseSearchImage } from './searchvision.js';
import { getSearchConfig } from './searchconfig.js';
import { getActivePrompt } from './searchprompts.js';
import { generateGridImage, sliceGrid, drawGridOverlay, checkGridCell } from './searchgrid.js';
import { supportsResolution } from './modelcaps.js';
import { composeCard, drawBboxOverlay } from './searchthumbs.js';
import { searchWeb, searchImagesByImage, isAllowedDomain } from './yandexsearch.js';
import { extractPrice, filtersHash, mergeResults } from './searchutil.js';
import { getBuffer, putBuffer } from './storage.js';

const PERIOD = {
  all: 'PERIOD_ALL_TIME',
  day: 'PERIOD_DAY',
  '2weeks': 'PERIOD_2_WEEKS',
  month: 'PERIOD_MONTH',
};

const SORT = {
  relevance: 'SORT_MODE_BY_RELEVANCE',
  time: 'SORT_MODE_BY_TIME',
};

function mimeForKey(key) {
  const ext = path.extname(String(key || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function extForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function readJobImage(job) {
  if (job.photo_path) {
    return { buffer: await getBuffer(job.photo_path), mime: mimeForKey(job.photo_path) };
  }
  if (job.render_id) {
    const render = await q.getRender(job.render_id);
    if (!render?.image_path) throw new Error('У рендера нет изображения');
    return { buffer: await getBuffer(render.image_path), mime: mimeForKey(render.image_path) };
  }
  throw new Error('Нет исходного изображения');
}

async function cropByBbox(buffer, bbox) {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  const W = meta.width || 1;
  const H = meta.height || 1;
  const box = Array.isArray(bbox) ? bbox : [0, 0, 1, 1];
  const x = Math.max(0, Math.min(1, Number(box[0]) || 0));
  const y = Math.max(0, Math.min(1, Number(box[1]) || 0));
  const w = Math.max(0, Math.min(1, Number(box[2]) || 0));
  const h = Math.max(0, Math.min(1, Number(box[3]) || 0));
  const left = Math.max(0, Math.min(W - 1, Math.round(x * W)));
  const top = Math.max(0, Math.min(H - 1, Math.round(y * H)));
  const width = Math.max(1, Math.min(W - left, Math.round(w * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(h * H)));
  return sharp(buffer, { failOn: 'none' })
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function putArtifact(key, buffer, mime) {
  await putBuffer(key, buffer, mime);
  return key;
}

export async function createSearchJob({ userId = null, source, renderId = null, photoPath = null }) {
  const id = crypto.randomUUID();
  const cfg = getSearchConfig();
  const prompts = {
    vision: getActivePrompt('vision'),
    grid: getActivePrompt('grid'),
    cell: getActivePrompt('cell'),
  };
  await q.createSearchJob({
    id,
    user_id: userId,
    source,
    render_id: renderId,
    photo_path: photoPath,
    mode: 'A',
    status: 'queued',
    photo_quality: {},
    prompts,
    config: cfg,
  });
  return id;
}

export async function processVisionStep(jobId) {
  const job = await q.getSearchJob(jobId);
  if (!job) throw new Error('Поиск не найден');

  const { buffer, mime } = await readJobImage(job);
  const cfg = job.config || getSearchConfig();
  const activeVision = getActivePrompt('vision');
  const prompt = activeVision?.prompt || job.prompts?.vision?.prompt;
  const vision = await parseSearchImage(buffer.toString('base64'), mime, {
    model: cfg.vision_model,
    prompt,
    maxObjects: cfg.max_objects,
  });

  const sourceKey = `search-lab/${jobId}-source.${extForMime(mime)}`;
  await putArtifact(sourceKey, buffer, mime);
  await q.updateSearchJob(jobId, { photo_path: sourceKey });

  await q.deleteSearchObjectsForJob(jobId);
  for (const obj of vision.objects) {
    await q.createSearchObject({
      job_id: jobId,
      idx: obj.index,
      category: obj.category,
      label: obj.label,
      description: obj.description,
      color: obj.color,
      material: obj.material,
      style: obj.style,
      hex: obj.hex,
      size: obj.size,
      search_query: obj.search_query,
      bbox: obj.bbox,
      confidence: obj.confidence,
      visibility: obj.visibility,
      status: 'ready',
    });
  }

  const boxes = vision.objects
    .filter(o => Array.isArray(o.bbox))
    .map(o => ({ bbox: o.bbox, label: o.label }));
  const overlay = await drawBboxOverlay(buffer, boxes);
  const overlayKey = `search-lab/${jobId}-overlay.png`;
  await putArtifact(overlayKey, overlay, 'image/png');

  const cost = Number(vision.cost) || 0;
  await q.updateSearchJob(jobId, {
    status: 'done',
    stage: 'vision',
    photo_quality: vision.photo_quality,
    vision_raw: vision.raw,
    prompts: { ...(job.prompts || {}), vision: activeVision },
    cost_usd: (Number(job.cost_usd) || 0) + cost,
    finished_at: new Date().toISOString(),
  });
  await q.logSearchStep({
    job_id: jobId,
    object_id: null,
    step: 'vision',
    status: 'done',
    input: { mime },
    output: { overlay_path: overlayKey, objects_count: vision.objects.length },
    prompt,
    cost_usd: cost,
  });

  // Сразу режем bbox на миниатюры, чтобы не заставлять пользователя жать ещё одну кнопку.
  if (vision.objects.some(o => Array.isArray(o.bbox))) {
    return processCropsStep(jobId);
  }
  return searchJobDto(jobId);
}

export async function processCropsStep(jobId) {
  const job = await q.getSearchJob(jobId);
  if (!job) throw new Error('Поиск не найден');
  await q.updateSearchJob(jobId, { status: 'processing', stage: 'crops' });
  const objects = await q.searchObjectsForJob(jobId);
  const { buffer } = await readJobImage(job);

  const crops = [];
  for (const object of objects) {
    if (!Array.isArray(object.bbox)) {
      await q.updateSearchObject(object.id, { status: 'skipped' });
      continue;
    }
    const crop = await cropByBbox(buffer, object.bbox);
    const cropKey = `search-lab/${jobId}-crop-${object.idx}.jpg`;
    await putArtifact(cropKey, crop, 'image/jpeg');

    const card = await composeCard(crop);
    const thumbKey = `search-lab/${jobId}-thumb-${object.idx}.png`;
    await putArtifact(thumbKey, card, 'image/png');

    await q.updateSearchObject(object.id, {
      thumbnail_path: thumbKey,
      thumbnail_mode: 'A',
      status: 'ready',
    });
    crops.push({ index: object.idx, crop_path: cropKey, thumb_path: thumbKey });
  }

  await q.updateSearchJob(jobId, {
    status: 'done',
    stage: 'crops',
    mode: 'A',
    finished_at: new Date().toISOString(),
  });
  await q.logSearchStep({ job_id: jobId, step: 'crops', status: 'done', output: { crops } });

  return searchJobDto(jobId);
}

export async function processGridStep(jobId) {
  const job = await q.getSearchJob(jobId);
  if (!job) throw new Error('Поиск не найден');
  const objects = await q.searchObjectsForJob(jobId);
  const cfg = job.config || getSearchConfig();
  const activeGrid = getActivePrompt('grid');
  const activeCell = getActivePrompt('cell');
  const prompt = activeGrid?.prompt || job.prompts?.grid?.prompt;

  const grid = await generateGridImage(
    objects.map(o => ({
      label: o.label,
      description: o.description,
      color: o.color,
      material: o.material,
      size: o.size,
    })),
    {
      prompt,
      model: cfg.grid_model,
      resolution: supportsResolution(cfg.grid_model) && cfg.grid_resolution ? cfg.grid_resolution : null,
      aspect: cfg.grid_aspect,
    }
  );
  const gridBuffer = Buffer.from(grid.b64, 'base64');
  const gridKey = `search-lab/${jobId}-grid.png`;
  await putArtifact(gridKey, gridBuffer, 'image/png');

  const overlay = await drawGridOverlay(gridBuffer);
  const overlayKey = `search-lab/${jobId}-grid-overlay.png`;
  await putArtifact(overlayKey, overlay, 'image/png');

  const cells = await sliceGrid(gridBuffer);
  let cost = Number(grid.cost) || 0;
  const cap = cfg.max_run_cost_usd == null
    ? Infinity
    : Math.max(0, Number(cfg.max_run_cost_usd) - Number(job.cost_usd || 0));
  const cellOutput = [];
  const processed = new Set();
  for (const cell of cells) {
    const obj = objects.find(o => Number(o.idx) === cell.index) || null;
    if (cost >= cap) {
      if (obj) {
        await q.updateSearchObject(obj.id, { status: 'skipped' });
        processed.add(obj.id);
      }
      continue;
    }

    const cellKey = `search-lab/${jobId}-cell-${cell.index}.jpg`;
    await putArtifact(cellKey, cell.buffer, 'image/jpeg');

    const check = await checkGridCell(cell.buffer, obj?.label || '', {
      prompt: activeCell?.prompt || job.prompts?.cell?.prompt,
      model: cfg.vision_model,
    });
    cost += Number(check.cost) || 0;

    const card = await composeCard(cell.buffer);
    const thumbKey = `search-lab/${jobId}-thumb-${cell.index}.png`;
    await putArtifact(thumbKey, card, 'image/png');

    if (obj) {
      await q.updateSearchObject(obj.id, {
        thumbnail_path: thumbKey,
        thumbnail_mode: 'B',
        cell_check: check,
        status: check.ok ? 'ready' : 'rejected',
      });
      processed.add(obj.id);
    }

    cellOutput.push({ index: cell.index, cell_path: cellKey, thumb_path: thumbKey, check });
  }

  for (const object of objects) {
    if (!processed.has(object.id)) {
      await q.updateSearchObject(object.id, { status: 'skipped' });
    }
  }

  await q.updateSearchJob(jobId, {
    status: 'done',
    stage: 'grid',
    mode: 'B',
    prompts: { ...(job.prompts || {}), grid: activeGrid, cell: activeCell },
    cost_usd: (Number(job.cost_usd) || 0) + cost,
    finished_at: new Date().toISOString(),
  });
  await q.logSearchStep({
    job_id: jobId,
    step: 'grid',
    status: 'done',
    output: { grid_path: gridKey, grid_overlay_path: overlayKey, cells: cellOutput },
    prompt,
    cost_usd: cost,
  });

  return searchJobDto(jobId);
}

export async function processObjectSearch(jobId, objectId, filters = {}) {
  const object = await q.getSearchObject(objectId);
  if (!object || object.job_id !== jobId) throw new Error('Объект не найден');

  const job = await q.getSearchJob(jobId);
  if (!job) throw new Error('Поиск не найден');
  const cfg = job.config || getSearchConfig();

  const query = String(filters.query || object.search_query || object.label || '').trim();
  const domains = Array.isArray(filters.domains) && filters.domains.length
    ? filters.domains.map(String)
    : cfg.domains;
  const region = String(filters.region || cfg.region || '213');
  const period = filters.period || 'all';
  const sort = filters.sort || 'relevance';
  const source = filters.source || 'both';
  const priceFrom = filters.price_from == null ? null : Number(filters.price_from);
  const priceTo = filters.price_to == null ? null : Number(filters.price_to);

  const hash = filtersHash({
    query,
    domains,
    price_from: priceFrom,
    price_to: priceTo,
    region,
    period,
    sort,
    source,
  });

  if (!filters.force) {
    const cached = await q.getSearchCache(objectId, hash);
    if (cached) return { ...cached.payload, cached: true };
  }

  let textRows = [];
  if (source !== 'visual') {
    const text = await searchWeb({
      query,
      region,
      limit: cfg.search_limit,
      period: PERIOD[period] || PERIOD.all,
      sortMode: SORT[sort] || SORT.relevance,
    });
    textRows = text.results.map(row => ({
      ...row,
      price: extractPrice(`${row.title || ''} ${row.snippet || ''}`),
    }));
  }

  let visualRows = [];
  if (cfg.visual_enabled && source !== 'text' && object.thumbnail_path) {
    const thumb = await getBuffer(object.thumbnail_path);
    const vis = await searchImagesByImage({ imageB64: thumb.toString('base64') });
    visualRows = vis.images.map(img => ({
      url: img.pageUrl || img.url,
      title: img.pageTitle || '',
      snippet: img.passage || '',
      source: 'visual',
      image_url: img.url,
      raw: img,
    }));
  }

  const merged = mergeResults(textRows, visualRows, { limit: cfg.search_limit });
  const filtered = merged
    .filter(r => isAllowedDomain(r.url, domains))
    .filter(r => {
      const p = r.price;
      if (p == null) return true;
      if (priceFrom != null && p < priceFrom) return false;
      if (priceTo != null && p > priceTo) return false;
      return true;
    });

  await q.clearSearchResults(objectId);
  await q.clearSearchCache(objectId);
  const results = [];
  for (const row of filtered) {
    const saved = await q.upsertSearchResult({
      object_id: objectId,
      source: row.source,
      provider: 'yandex',
      store: hostOf(row.url),
      canonical_url: row.url,
      title: row.title,
      image_url: row.image_url || null,
      price: row.price ?? null,
      currency: 'RUB',
      raw: row.raw,
    });
    if (saved) results.push(mapResult(saved));
  }
  const payload = {
    object_id: objectId,
    query,
    filters: {
      domains,
      price_from: priceFrom,
      price_to: priceTo,
      region,
      period,
      sort,
      source,
    },
    results,
    cached: false,
  };

  if (results.length > 0) {
    await q.setSearchCache(objectId, hash, payload, cfg.cache_ttl_hours);
  }

  await q.logSearchStep({
    job_id: jobId,
    object_id: objectId,
    step: 'search',
    status: 'done',
    input: { filters },
    output: { count: results.length },
    cost_usd: null,
  });

  return payload;
}

export function mapResult(row) {
  return {
    id: row.id,
    source: row.source,
    store: row.store,
    url: row.canonical_url,
    title: row.title,
    image_url: row.image_url,
    price: row.price == null ? null : Number(row.price),
    currency: row.currency,
    match_score: row.match_score == null ? null : Number(row.match_score),
    checked_at: row.checked_at,
  };
}

export async function searchResultsDto(objectId) {
  const rows = await q.searchResultsForObject(objectId);
  return rows.map(row => ({
    id: row.id,
    source: row.source,
    store: row.store,
    url: row.canonical_url,
    title: row.title,
    image_url: row.image_url,
    price: row.price == null ? null : Number(row.price),
    currency: row.currency,
    match_score: row.match_score == null ? null : Number(row.match_score),
    checked_at: row.checked_at,
  }));
}

export async function searchJobDto(jobId) {
  const job = await q.getSearchJob(jobId);
  if (!job) return null;
  const objects = await q.searchObjectsForJob(jobId);
  const steps = await q.searchStepsForJob(jobId);

  let sourceUrl = null;
  if (job.photo_path) {
    sourceUrl = `/search-lab/${path.basename(job.photo_path)}`;
  } else if (job.source === 'render' && job.render_id) {
    const render = await q.getRender(job.render_id);
    sourceUrl = `/renders/${path.basename(render?.image_path || '')}`;
  }

  return {
    id: job.id,
    source: job.source,
    source_url: sourceUrl,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    error: job.error,
    cost_usd: Number(job.cost_usd) || 0,
    created_at: job.created_at,
    finished_at: job.finished_at,
    photo_quality: job.photo_quality,
    vision_raw: job.vision_raw,
    prompts: job.prompts,
    objects: objects.map(o => ({
      id: o.id,
      index: o.idx,
      category: o.category,
      label: o.label,
      description: o.description,
      color: o.color,
      material: o.material,
      style: o.style,
      hex: o.hex,
      size: o.size,
      search_query: o.search_query,
      bbox: o.bbox,
      confidence: o.confidence,
      visibility: o.visibility,
      thumbnail_url: o.thumbnail_path ? `/search-lab/${path.basename(o.thumbnail_path)}` : null,
      thumbnail_mode: o.thumbnail_mode,
      cell_check: o.cell_check,
      status: o.status,
    })),
    steps: steps.map(s => ({
      id: s.id,
      step: s.step,
      status: s.status,
      cost_usd: s.cost_usd,
      error: s.error,
      created_at: s.created_at,
      input: s.input,
      output: s.output,
    })),
  };
}

export async function logSearchClick({ resultId, userId = null, ipHash = null }) {
  await q.logSearchClick({ resultId, userId, ipHash });
  return true;
}

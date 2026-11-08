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
import { extractPrice, filtersHash, mergeResults, sortPricedFirst } from './searchutil.js';
import { enrichSearchResults, withBuyKeyword } from './searchparse.js';
import { searchCatalog } from './catalogclient.js';
import { log } from './openrouter.js';
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
  // Vision часто режет предмет вплотную — расширяем bbox на 10% с каждой стороны.
  const pad = 0.1;
  const px = Math.max(0, x - w * pad);
  const py = Math.max(0, y - h * pad);
  const pw = Math.min(1 - px, w * (1 + pad * 2));
  const ph = Math.min(1 - py, h * (1 + pad * 2));
  const left = Math.max(0, Math.min(W - 1, Math.round(px * W)));
  const top = Math.max(0, Math.min(H - 1, Math.round(py * H)));
  const width = Math.max(1, Math.min(W - left, Math.round(pw * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(ph * H)));
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
    output: {
      overlay_path: overlayKey,
      objects_count: vision.objects.length,
      requests: [
        { provider: 'openrouter', kind: 'vision', model: cfg.vision_model, count: 1, unit_cost_usd: cost, cost_usd: cost },
      ],
      requests_count: 1,
      cost_usd: cost,
    },
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
  await q.logSearchStep({
    job_id: jobId,
    step: 'crops',
    status: 'done',
    output: { crops, requests: [], requests_count: 0, cost_usd: 0 },
    cost_usd: 0,
  });

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
  const gridCost = Number(grid.cost) || 0;
  let cost = gridCost;
  let cellChecks = 0;
  let cellCost = 0;
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
    cellChecks += 1;
    cellCost += Number(check.cost) || 0;
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
    output: {
      grid_path: gridKey,
      grid_overlay_path: overlayKey,
      cells: cellOutput,
      requests: [
        { provider: 'openrouter', kind: 'grid_image', model: cfg.grid_model, count: 1, unit_cost_usd: gridCost, cost_usd: gridCost },
        {
          provider: 'openrouter',
          kind: 'cell_check',
          model: cfg.vision_model,
          count: cellChecks,
          unit_cost_usd: cellChecks > 0 ? cellCost / cellChecks : 0,
          cost_usd: cellCost,
        },
      ],
      requests_count: 1 + cellChecks,
      cost_usd: cost,
    },
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
  // Пустой список доменов = искать везде; allowlist применяется только если домены заданы явно.
  const domains = Array.isArray(filters.domains)
    ? filters.domains.map(d => String(d).toLowerCase().trim()).filter(Boolean)
    : [];
  const region = String(filters.region || cfg.region || '213');
  const period = filters.period || 'all';
  const sort = filters.sort || 'relevance';
  const source = filters.source || 'both';
  const runText = source === 'text' || source === 'both';
  const runVisual = source === 'visual' || source === 'both';
  const runCatalog = source === 'catalog' || source === 'both';
  const priceFrom = filters.price_from == null ? null : Number(filters.price_from);
  const priceTo = filters.price_to == null ? null : Number(filters.price_to);
  const yandexNight = (new Date().getUTCHours() + 3) % 24 < 8;
  const webUnitCost = Math.max(0, Number(yandexNight ? cfg.yandex_web_night_cost_usd : cfg.yandex_web_cost_usd) || 0);
  const imageUnitCost = Math.max(0, Number(cfg.yandex_image_cost_usd) || 0);
  const requests = [];

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
    if (cached) return { ...cached.payload, cached: true, cost_usd: 0, requests: [], requests_count: 0 };
  }

  let textRows = [];
  if (runText) {
    // Без «купить» Яндекс часто отдаёт галереи картинок вместо карточек товара.
    const textQuery = withBuyKeyword(query, cfg.buy_keyword);
    const text = await searchWeb({
      query: textQuery,
      region,
      limit: cfg.search_limit,
      period: PERIOD[period] || PERIOD.all,
      sortMode: SORT[sort] || SORT.relevance,
    });
    requests.push({
      provider: 'yandex',
      kind: 'web_search',
      rate: yandexNight ? 'night' : 'day',
      count: 1,
      unit_cost_usd: webUnitCost,
      cost_usd: webUnitCost,
      request_id: text.request_id || null,
    });
    textRows = text.results.map(row => ({
      ...row,
      price: extractPrice(`${row.title || ''} ${row.snippet || ''}`),
    }));
  }

  let visualRows = [];
  if (cfg.visual_enabled && runVisual && object.thumbnail_path) {
    const thumb = await getBuffer(object.thumbnail_path);
    const vis = await searchImagesByImage({ imageB64: thumb.toString('base64') });
    requests.push({
      provider: 'yandex',
      kind: 'image_search_by_image',
      count: 1,
      unit_cost_usd: imageUnitCost,
      cost_usd: imageUnitCost,
      cbir_id: vis.cbir_id || null,
    });
    visualRows = vis.images.map(img => ({
      url: img.pageUrl || img.url,
      title: img.pageTitle || '',
      snippet: img.passage || '',
      source: 'visual',
      image_url: img.url,
      raw: img,
    }));
  }

  let catalogRows = [];
  if (cfg.catalog_enabled && runCatalog && object.thumbnail_path) {
    try {
      const thumb = await getBuffer(object.thumbnail_path);
      const found = await searchCatalog({
        image: thumb,
        text: query || undefined,
        filters: { categories: object.category ? [object.category] : undefined },
        product: {
          label: object.label,
          description: object.description,
          color: object.color,
          material: object.material,
          size: object.size,
          category: object.category,
          product_type: object.product_type,
          search_query: object.search_query,
          hex: object.hex,
        },
        topK: cfg.catalog_top_k,
        minScore: cfg.catalog_min_score,
      }, { baseUrl: cfg.catalog_service_url || undefined });
      catalogRows = found.results.map(r => ({
        url: r.canonical_url || r.affiliate_url,
        canonical_url: r.canonical_url || r.affiliate_url,
        title: r.name || '',
        snippet: '',
        source: 'catalog',
        provider: 'feed',
        image_url: r.picture_url || null,
        price: r.price ?? null,
        currency: r.currency || 'RUB',
        availability: r.availability || null,
        affiliate_url: r.affiliate_url || null,
        erid: r.erid || null,
        store: r.merchant || null,
        match_score: r.score ?? null,
        raw: r,
      }));
      requests.push({
        provider: 'catalog',
        kind: 'vector_search',
        count: 1,
        unit_cost_usd: 0,
        cost_usd: 0,
      });
    } catch (e) {
      // Каталог — дополнительный источник: при сбое продолжаем с Яндексом.
      log({ event: 'catalog_search_error', job_id: jobId, object_id: objectId, error: String(e.message || e).slice(0, 200) });
    }
  }

  const searchCost = requests.reduce((sum, item) => sum + (Number(item.cost_usd) || 0), 0);

  const merged = mergeResults(textRows, visualRows, { limit: cfg.search_limit, catalogResults: catalogRows });
  const byDomain = merged.filter(r => domains.length === 0 || isAllowedDomain(r.url, domains));
  // У офферов каталога цена/наличие уже из фида — не открываем их карточки повторно.
  const catalogChecked = byDomain.filter(r => r.source === 'catalog');
  const enrichTargets = byDomain.filter(r => r.source !== 'catalog');
  const enriched = cfg.price_check_enabled && cfg.price_check_limit > 0
    ? await enrichSearchResults(enrichTargets, {
      limit: cfg.price_check_limit,
      concurrency: cfg.price_check_concurrency,
    })
    : enrichTargets;
  const checked = [...catalogChecked, ...enriched];
  const filtered = sortPricedFirst(checked.filter(r => {
    const p = r.price;
    if (p == null) return true;
    if (priceFrom != null && p < priceFrom) return false;
    if (priceTo != null && p > priceTo) return false;
    return true;
  }));

  await q.clearSearchResults(objectId);
  await q.clearSearchCache(objectId);
  const results = [];
  for (const row of filtered) {
    const saved = await q.upsertSearchResult({
      object_id: objectId,
      source: row.source,
      provider: row.provider || 'yandex',
      store: row.store || hostOf(row.url),
      canonical_url: row.url,
      title: row.title,
      image_url: row.image_url || null,
      price: row.price ?? null,
      currency: row.currency || 'RUB',
      availability: row.availability || null,
      price_source: row.price_source || null,
      match_score: row.match_score ?? null,
      affiliate_url: row.affiliate_url || null,
      erid: row.erid || null,
      checked_at: row.checked_at || null,
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
    requests,
    requests_count: requests.length,
    request_rates_usd: { web: webUnitCost, image: imageUnitCost, night: yandexNight },
    cost_usd: searchCost,
  };

  if (results.length > 0) {
    await q.setSearchCache(objectId, hash, payload, cfg.cache_ttl_hours);
  }

  await q.updateSearchJob(jobId, { cost_usd: (Number(job.cost_usd) || 0) + searchCost });
  await q.logSearchStep({
    job_id: jobId,
    object_id: objectId,
    step: 'search',
    status: 'done',
    input: { filters, request_rates_usd: { web: webUnitCost, image: imageUnitCost, night: yandexNight } },
    output: { count: results.length, requests, requests_count: requests.length, cost_usd: searchCost },
    cost_usd: searchCost,
  });

  return payload;
}

export function mapResult(row) {
  return {
    id: row.id,
    source: row.source,
    provider: row.provider,
    store: row.store,
    url: row.canonical_url,
    affiliate_url: row.affiliate_url || null,
    erid: row.erid || null,
    title: row.title,
    image_url: row.image_url,
    price: row.price == null ? null : Number(row.price),
    currency: row.currency,
    availability: row.availability || null,
    price_source: row.price_source || null,
    match_score: row.match_score == null ? null : Number(row.match_score),
    checked_at: row.checked_at,
  };
}

export async function searchResultsDto(objectId) {
  const rows = await q.searchResultsForObject(objectId);
  return rows.map(mapResult);
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

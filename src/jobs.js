// Воркер: забирает рендеры со статусом queued и доводит до done.
// Новое ядро: первый рендер рисуем ИЗ товаров каталога — отбор по бюджету/стилю,
// фото товаров уходят в генерацию как input_references, смета = отобранные товары.
// Vision-парсинг оставлен только как фолбэк, когда каталог пуст.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { MOCK_MODE, buildPrompt, generateRender, parseRender, matchCatalog, snapAspect, log } from './openrouter.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { curateProducts, referenceImages, hasImage } from './curate.js';
import { putBuffer, getBuffer } from './storage.js';
import { spendCreditForRender, restoreCreditForRender } from './payments.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const MOCK_AFTER = path.join(process.cwd(), 'assets', 'kitchen_after.png');

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
// исходник (фото комнаты или родительский рендер) → data URL из storage
async function photoB64(stored) {
  const buf = await getBuffer(stored);
  const ext = detectImageExt(buf);
  return `data:${MIME_BY_EXT[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

async function processRender(renderId) {
  const t0 = Date.now();
  const render = await q.getRender(renderId);
  if (!render || render.status !== 'processing') return; // уже забран другим слотом
  const room = await q.getRoom(render.room_id);
  const iteration = Boolean(render.request_text);
  let stage = 'start';

  try {
    stage = 'analyzing';
    await q.setRoomStatus('analyzing', room.id);
    log({ event: 'render_start', room_id: room.id, render_id: renderId, iteration });

    // отбор товаров и промпт собираем здесь, где есть доступ к каталогу
    let curated = [];
    let prompt;
    if (iteration) {
      prompt = buildPrompt({ style: room.style, budget: room.budget, requestText: render.request_text, iteration: true });
    } else {
      curated = await curateProducts({ style: room.style, budget: room.budget });
      prompt = buildPrompt({ style: room.style, budget: room.budget, products: curated });
    }
    await q.setRenderPrompt(renderId, prompt);

    let imageB64, cost = null, model = null;
    const refs = iteration ? [] : await referenceImages(curated.filter(hasImage));

    if (MOCK_MODE) {
      // демо без ключа: имитируем задержки и отдаём демо-картинку
      await sleep(1500);
      await q.setRoomStatus('rendering', room.id);
      await sleep(2500);
      imageB64 = fs.readFileSync(MOCK_AFTER).toString('base64');
    } else {
      stage = 'rendering';
      await q.setRoomStatus('rendering', room.id);
      const parent = render.parent_render_id ? await q.getRender(render.parent_render_id) : null;
      const srcStored = parent ? parent.image_path : room.photo_path;
      const srcBuf = await getBuffer(srcStored);
      const { width, height } = imageSize(srcBuf);
      const aspectRatio = snapAspect(width, height); // реальные пропорции, не хардкод 3:2
      const srcB64 = `data:${MIME_BY_EXT[detectImageExt(srcBuf)] || 'image/jpeg'};base64,${srcBuf.toString('base64')}`;
      const out = await generateRender({
        prompt,
        sourceImageB64: srcB64,
        referenceImagesB64: refs,
        aspectRatio,
      });
      imageB64 = out.b64; cost = out.cost; model = out.model || null;
      log({ event: 'render_image_ok', room_id: room.id, render_id: renderId, model, aspect: aspectRatio, refs: refs.length, curated: curated.length, cost_usd: cost, ms: Date.now() - t0 });
    }

    const bytes = Buffer.from(imageB64, 'base64');
    const ext = detectImageExt(bytes); // модель может вернуть JPEG — не называем его .png
    const renderKey = `renders/${render.id}.${ext}`;
    await putBuffer(renderKey, bytes, MIME_BY_EXT[ext] || 'image/png');

    // смета: отобранные товары; итерации наследуют смету родителя; фолбэк — vision-матчинг
    stage = 'matching';
    await q.setRoomStatus('matching', room.id);
    let visionCost = null;
    if (iteration) {
      const parent = await q.getRender(render.parent_render_id);
      if (parent) await q.copyItems(parent.id, render.id);
    } else if (curated.length) {
      for (const p of curated) await q.saveItem(render.id, p.id, null);
    } else if (!MOCK_MODE) {
      const parsed = await parseRender(imageB64);
      visionCost = parsed.cost;
      const matched = matchCatalog(parsed.items, await q.allProducts());
      for (const m of matched) await q.saveItem(render.id, m.product.id, m.score);
      log({ event: 'render_matched', room_id: room.id, render_id: renderId, parsed_items: parsed.items.length, matched: matched.length, fallback: true });
    } else {
      await sleep(1200);
      const demo = (await q.allProducts()).filter(p => [1, 3, 5, 7].includes(Number(p.id)));
      for (const p of demo) await q.saveItem(render.id, p.id, 0.9);
    }

    // полная себестоимость: генерация (включая фолбэк-попытки) + vision-разбор
    const parts = [cost, visionCost].filter(c => typeof c === 'number');
    const totalCost = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    await q.setRenderDone(renderKey, totalCost, model, render.id);

    await q.setRoomStatus('done', room.id);
    log({ event: 'render_done', room_id: room.id, render_id: renderId, cost_usd: totalCost, cost_image_usd: cost ?? null, cost_vision_usd: visionCost ?? null, ms: Date.now() - t0 });
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    await q.setRenderError(msg, renderId, stage);
    await q.setRoomError(msg, room.id);
    try {
      const restored = await restoreCreditForRender(renderId, `render_error:${stage}`);
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, credit_restored: restored, ms: Date.now() - t0 });
    } catch (restoreError) {
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, credit_restore_error: String(restoreError.message || restoreError).slice(0, 300), ms: Date.now() - t0 });
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// поллер: раз в 2 секунды, максимум 2 параллельных задания
let running = 0;
export function startWorker() {
  // рендеры, оставшиеся в processing после краха, возвращаем в очередь
  q.requeueProcessing().then(n => { if (n) console.log(`[worker] вернул в очередь ${n} прерванных рендеров`); });

  // страховка: задача без результата дольше 24 часов → ошибка + восстановление кредита
  setInterval(async () => {
    try {
      const stale = await q.staleRenders(24 * 60);
      for (const r of stale) {
        const msg = 'Генерация не завершилась за 24 часа';
        await q.setRenderError(msg, r.id, 'timeout');
        await q.setRoomError(msg, r.room_id);
        const restored = await restoreCreditForRender(r.id, 'timeout');
        log({ event: 'render_timeout', room_id: r.room_id, render_id: r.id, credit_restored: restored });
      }
    } catch (e) {
      log({ event: 'stale_sweep_error', error: String(e.message || e).slice(0, 300) });
    }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    if (running >= 2) return;
    try {
      const row = await q.claimNextRender();
      if (!row) return;
      running++;
      try { await processRender(row.id); } finally { running--; }
    } catch (e) {
      log({ event: 'worker_error', error: String(e.message || e).slice(0, 300) });
    }
  }, 2000);
  console.log(`[worker] запущен, режим: ${MOCK_MODE ? 'MOCK (без OPENROUTER_API_KEY)' : 'LIVE'}`);
}

export async function enqueueRender({ roomId, parentRenderId = null, requestText = null, chargedUserId = null, requestIp = null }) {
  const id = crypto.randomUUID();
  await q.createRender(id, roomId, parentRenderId, requestText, null);
  if (requestIp) await q.setRenderRequestIp(id, requestIp);

  if (chargedUserId) {
    const paid = await spendCreditForRender(chargedUserId, id, requestText ? 'iterate' : 'render');
    if (!paid) {
      await q.setRenderError('Нужен кредит', id, 'credit');
      const e = new Error('Нужен кредит');
      e.status = 402;
      throw e;
    }
  }

  try {
    await q.setRoomStatus('queued', roomId);
  } catch (e) {
    if (chargedUserId) await restoreCreditForRender(id, 'enqueue_failed');
    throw e;
  }

  log({ event: 'enqueue', room_id: roomId, render_id: id, parent_render_id: parentRenderId, charged_user_id: chargedUserId || null });
  return id;
}

// Воркер: забирает рендеры со статусом queued и доводит до done.
// Новое ядро: первый рендер рисуем ИЗ товаров каталога — отбор по бюджету/стилю,
// фото товаров уходят в генерацию как input_references, смета = отобранные товары.
// Vision-парсинг оставлен только как фолбэк, когда каталог пуст.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { MOCK_MODE, buildPrompt, generateRender, parseRender, matchCatalog, snapAspect, supportsInputRefs, log } from './openrouter.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { fitAspect } from './media.js';
import { curateProducts, referenceImages, hasImage } from './curate.js';
import { putBuffer, getBuffer } from './storage.js';
import { restoreCreditForRender, enqueueRenderWithCredit } from './payments.js';

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
    const hasStyleRef = Boolean(room.style_ref_path);
    if (iteration) {
      prompt = buildPrompt({ style: room.style, budget: room.budget, requestText: render.request_text, iteration: true });
    } else {
      curated = await curateProducts({ style: room.style, budget: room.budget });
      prompt = buildPrompt({
        style: room.style,
        budget: room.budget,
        products: curated,
        palette: room.palette || 'none',
        accent: room.accent || 'none',
        hasStyleRef,
      });
    }
    await q.setRenderPrompt(renderId, prompt);

    let imageB64, cost = null, model = null, targetRatio = null;
    let styleRefB64 = null;
    if (!iteration && hasStyleRef && supportsInputRefs()) {
      const refBuf = await getBuffer(room.style_ref_path);
      styleRefB64 = `data:${MIME_BY_EXT[detectImageExt(refBuf)] || 'image/jpeg'};base64,${refBuf.toString('base64')}`;
    }
    const productRefs = iteration || !supportsInputRefs() ? [] : await referenceImages(curated.filter(hasImage));
    const refs = styleRefB64 ? [styleRefB64, ...productRefs.slice(0, 3)] : productRefs.slice(0, 4);

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
      targetRatio = width / height;
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

    const rawBytes = Buffer.from(imageB64, 'base64');
    const bytes = targetRatio ? await fitAspect(rawBytes, targetRatio) : rawBytes;
    const ext = detectImageExt(bytes); // модель может вернуть JPEG — не называем его .png
    const renderKey = `renders/${render.id}.${ext}`;
    await putBuffer(renderKey, bytes, MIME_BY_EXT[ext] || 'image/png');
    const rawSize = imageSize(rawBytes);
    const outSize = imageSize(bytes);
    log({
      event: 'render_aspect',
      room_id: room.id,
      render_id: renderId,
      target_ratio: targetRatio ? Number(targetRatio.toFixed(3)) : null,
      raw_ratio: Number((rawSize.width / rawSize.height).toFixed(3)),
      out_ratio: Number((outSize.width / outSize.height).toFixed(3)),
      out_px: [outSize.width, outSize.height],
    });

    // Подборка строится по готовой визуализации. Пустой/упавший vision не должен
    // стирать curated-подборку первого рендера или смету родителя у итерации.
    stage = 'matching';
    await q.setRoomStatus('matching', room.id);
    let visionCost = null;
    let visionOk = false;
    let matched = [];
    if (!MOCK_MODE) {
      try {
        const parsed = await parseRender(bytes.toString('base64'), MIME_BY_EXT[ext] || 'image/jpeg');
        visionCost = parsed.cost;
        matched = matchCatalog(parsed.items, await q.allProducts());
        visionOk = true;
        log({ event: 'render_matched', room_id: room.id, render_id: renderId, parsed_items: parsed.items.length, matched: matched.length });
      } catch (e) {
        log({ event: 'render_match_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
      }
    }
    await q.clearItems(render.id);
    if (visionOk && matched.length) {
      for (const m of matched) await q.saveItem(render.id, m.product.id, m.score);
    } else {
      const fallback = visionOk ? 'no_matches' : 'vision_error';
      log({ event: 'render_match_fallback', room_id: room.id, render_id: renderId, reason: fallback, iteration });
      if (iteration) {
        const parent = await q.getRender(render.parent_render_id);
        if (parent) await q.copyItems(parent.id, render.id);
      } else if (curated.length) {
        for (const p of curated) await q.saveItem(render.id, p.id, null);
      } else {
        await sleep(1200);
        const demo = (await q.allProducts()).filter(p => [1, 3, 5, 7].includes(Number(p.id)));
        for (const p of demo) await q.saveItem(render.id, p.id, 0.9);
      }
    }

    // полная себестоимость: генерация (включая фолбэк-попытки) + vision-разбор
    const parts = [cost, visionCost].filter(c => typeof c === 'number');
    const totalCost = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    await q.setRenderDone(renderKey, totalCost, model, render.id);

    await q.setRoomStatus('done', room.id);
    log({ event: 'render_done', room_id: room.id, render_id: renderId, cost_usd: totalCost, cost_image_usd: cost ?? null, cost_vision_usd: visionCost ?? null, ms: Date.now() - t0 });
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    const errorCost = typeof e.cost === 'number' ? e.cost : null;
    await q.setRenderError(msg, renderId, stage, errorCost);
    await q.setRoomError(msg, room.id);
    try {
      const restored = await restoreCreditForRender(renderId, `render_error:${stage}`);
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, cost_usd: errorCost, credit_restored: restored, ms: Date.now() - t0 });
    } catch (restoreError) {
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, cost_usd: errorCost, credit_restore_error: String(restoreError.message || restoreError).slice(0, 300), ms: Date.now() - t0 });
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
        const failed = await q.failStaleRender(r.id, msg, 'timeout');
        if (!failed) continue; // задачу успели завершить — не трогаем и не возвращаем кредит
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
  // В mock-режиме кредиты не списываются: картинка не зависит от исходника.
  const chargeUser = MOCK_MODE ? null : chargedUserId;
  await enqueueRenderWithCredit({
    id,
    roomId,
    parentRenderId,
    requestText,
    chargedUserId: chargeUser,
    requestIp,
  });
  return id;
}

// Воркер: забирает рендеры со статусом queued и доводит до done.
// Два режима:
//   base — глубокое преображение по стилю + палитра товаров под класс материалов;
//   edit — короткая правка одного объекта с референсом, без полного стилевого промта.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { MOCK_MODE, buildPrompt, buildEditPrompt, generateRender, parseRender, matchCatalog, snapAspect, supportsInputRefs, log } from './openrouter.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { fitAspect } from './media.js';
import { curateProducts, referenceImagesDetailed, hasImage } from './curate.js';
import { roomTypeByName } from './roomtypes.js';
import { buildAnalysis } from './analysis.js';
import { normalizeTier } from './pricing.js';
import { getModelConfig } from './modelconfig.js';
import { modelFamily, MODEL_CAPS } from './modelcaps.js';
import { putBuffer, getBuffer } from './storage.js';
import { restoreCreditForRender, enqueueRenderWithCredit } from './payments.js';

const MOCK_AFTER = path.join(process.cwd(), 'assets', 'kitchen_after.png');

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
async function bufferToDataUrl(buf) {
  const ext = detectImageExt(buf);
  return `data:${MIME_BY_EXT[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

async function editReference(render) {
  if (render.ref_path) {
    try {
      const buf = await getBuffer(render.ref_path);
      return { b64: await bufferToDataUrl(buf), label: 'user reference', product: null };
    } catch (e) {
      log({ event: 'edit_ref_error', render_id: render.id, error: String(e.message || e).slice(0, 200) });
    }
  }
  if (render.ref_product_id) {
    try {
      const product = await q.getProduct(render.ref_product_id);
      if (product) {
        const refs = await referenceImagesDetailed([product], 1);
        if (refs[0]) return { b64: refs[0].b64, label: product.name, product };
      }
    } catch (e) {
      log({ event: 'edit_ref_product_error', render_id: render.id, product_id: render.ref_product_id, error: String(e.message || e).slice(0, 200) });
    }
  }
  return null;
}

async function styleReferenceBuffers(room, styleInfo, adminStyleRefs) {
  const refs = [];
  const add = async (stored, kind = 'upload', title = '') => {
    if (!stored || refs.length >= 2) return;
    try { refs.push({ buf: await getBuffer(stored), kind, title }); } catch { /* пропускаем битый референс */ }
  };
  if (room.style_ref_path) {
    // Пользовательский референс главнее: не подмешиваем админские/обложку.
    await add(room.style_ref_path, 'user', 'user style reference');
    return { refs, user: true };
  }
  for (const ref of adminStyleRefs) await add(ref.image_path, ref.kind || 'upload', ref.title || '');
  if (!refs.length && styleInfo) {
    if (styleInfo.preset_image_path) await add(styleInfo.preset_image_path, 'cover', 'style cover');
    else {
      const staticStylePath = path.join(process.cwd(), 'web', 'dist', 'images', `style-${styleInfo.key}.webp`);
      if (fs.existsSync(staticStylePath)) refs.push({ buf: fs.readFileSync(staticStylePath), kind: 'cover', title: 'style cover' });
    }
  }
  return { refs, user: false };
}

async function processRender(renderId) {
  const t0 = Date.now();
  const render = await q.getRender(renderId);
  if (!render || render.status !== 'processing') return;
  const room = await q.getRoom(render.room_id);
  const iteration = Boolean(render.request_text);
  const roomType = room.room_type || 'Другое';
  const roomTypeInfo = roomTypeByName(roomType);
  const priceTier = normalizeTier(room.price_tier || 'comfort');
  let stage = 'start';

  try {
    stage = 'analyzing';
    await q.setRoomStatus('analyzing', room.id);
    log({ event: 'render_start', room_id: room.id, render_id: renderId, iteration, target: render.edit_target || null, price_tier: priceTier });

    let prompt;
    let curated = [];
    let styleInfo = null;
    let imageMap = [];
    let meta = {
      mode: iteration ? 'edit' : 'base',
      room_type: roomType,
      price_tier: priceTier,
      style: room.style,
      target: render.edit_target || null,
      product_ids: [],
      refs: [],
      model_config: getModelConfig(),
    };
    let parentItems = [];
    let editProduct = null;
    let sourceStored = room.photo_path;
    let referenceImagesB64 = [];

    if (iteration) {
      const parent = render.parent_render_id ? await q.getRender(render.parent_render_id) : null;
      if (parent?.image_path) sourceStored = parent.image_path;
      if (parent) parentItems = await q.itemsForRender(parent.id);
      const ref = await editReference(render);
      editProduct = ref?.product || null;
      if (ref) referenceImagesB64.push(ref.b64);
      imageMap = [
        { role: 'current interior render', label: 'edit only the target object' },
        ...(ref ? [{ role: 'reference image', label: ref.label }] : []),
      ];
      prompt = buildEditPrompt({
        roomType,
        target: render.edit_target,
        instruction: render.request_text,
        hasRef: Boolean(ref),
        refLabel: ref?.label || '',
      });
      meta.refs = imageMap.map((m, i) => ({ index: i + 1, ...m }));
      meta.parent_render_id = render.parent_render_id || null;
    } else {
      styleInfo = await q.styleByName(room.style);
      const adminStyleRefs = styleInfo ? await q.styleReferences(styleInfo.id, roomType) : [];
      const stylePreferred = styleInfo ? await q.styleProducts(styleInfo.id, roomType) : [];
      const allowed = new Set(roomTypeInfo?.categories || []);
      const preferred = stylePreferred.filter(p => p.active !== false && (
        p.style_room_type === roomType ||
        (!p.style_room_type && (!allowed.size || allowed.has(p.category)))
      ));

      curated = await curateProducts({
        style: room.style,
        budget: room.budget,
        priceTier,
        roomType,
        preferredIds: preferred.map(p => p.id),
        allowedCategories: roomTypeInfo?.categories || null,
        seed: room.id,
      });

      const styleRefs = await styleReferenceBuffers(room, styleInfo, adminStyleRefs);
      // Один стилевой референс: оставляем 3 слота под товары/мебель.
      const chosenStyleRefs = styleRefs.refs.slice(0, 1);
      const styleRefUrls = [];
      for (const ref of chosenStyleRefs) styleRefUrls.push(await bufferToDataUrl(ref.buf));

      const productLimit = Math.max(0, 4 - styleRefUrls.length);
      const productRefs = supportsInputRefs() ? await referenceImagesDetailed(curated.filter(hasImage), productLimit) : [];
      const refIds = new Set(productRefs.map(r => Number(r.product.id)));

      const styleRole = kind => kind === 'material_board'
        ? 'material board — exact finishes, colors and fixtures; do not copy layout'
        : kind === 'user'
          ? 'user style reference — primary target; follow its mood and materials'
          : kind === 'cover'
            ? 'style cover reference — mood and materials only'
            : 'style reference — mood, furniture character, materials and lighting; do not copy layout';
      imageMap = [
        { role: 'source room', label: 'preserve architecture, camera and room proportions' },
        ...chosenStyleRefs.map((ref) => ({ role: styleRole(ref.kind), label: ref.title || '' })),
        ...productRefs.map(r => ({ role: 'product reference', label: `${r.product.name} — ${r.product.category}` })),
      ];

      const productsForPrompt = curated.map(p => ({ ...p, has_ref: refIds.has(Number(p.id)) }));
      prompt = buildPrompt({
        style: room.style,
        priceTier,
        budget: room.budget,
        products: productsForPrompt,
        palette: room.palette || 'none',
        accent: room.accent || 'none',
        hasStyleRef: styleRefUrls.length > 0,
        userStyleRef: styleRefs.user,
        styleDescription: styleInfo?.prompt_description || '',
        roomType,
        imageMap,
      });

      referenceImagesB64 = [...styleRefUrls, ...productRefs.map(r => r.b64)];
      meta.product_ids = curated.map(p => Number(p.id));
      meta.style_id = styleInfo?.id || null;
      meta.budget = room.budget;
      meta.refs = imageMap.map((m, i) => ({ index: i + 1, ...m }));
    }

    await q.setRenderPrompt(renderId, prompt);
    await q.setRenderMeta(renderId, meta);

    let imageB64, cost = null, model = null, targetRatio = null;
    if (MOCK_MODE) {
      await sleep(1500);
      await q.setRoomStatus('rendering', room.id);
      await sleep(2500);
      imageB64 = fs.readFileSync(MOCK_AFTER).toString('base64');
    } else {
      stage = 'rendering';
      await q.setRoomStatus('rendering', room.id);
      const srcBuf = await getBuffer(sourceStored);
      const { width, height } = imageSize(srcBuf);
      targetRatio = width / height;
      const family = modelFamily(getModelConfig().render);
      const allowedAspects = MODEL_CAPS[family]?.aspects || null;
      const aspectRatio = snapAspect(width, height, allowedAspects);
      const srcB64 = await bufferToDataUrl(srcBuf);
      const out = await generateRender({
        prompt,
        sourceImageB64: srcB64,
        referenceImagesB64,
        aspectRatio,
      });
      imageB64 = out.b64; cost = out.cost; model = out.model || null;
      log({ event: 'render_image_ok', room_id: room.id, render_id: renderId, model, aspect: aspectRatio, room_type: roomType, price_tier: priceTier, target: render.edit_target || null, refs: referenceImagesB64.length, curated: curated.length, cost_usd: cost, ms: Date.now() - t0 });
    }

    const rawBytes = Buffer.from(imageB64, 'base64');
    const bytes = targetRatio ? await fitAspect(rawBytes, targetRatio) : rawBytes;
    const ext = detectImageExt(bytes);
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

    // Разбор готовой визуализации: материалы, поверхности → RAL, электрика, быстрые правки.
    stage = 'matching';
    await q.setRoomStatus('matching', room.id);
    let parsed = { items: [], surfaces: [], visible: [], electrical: [] };
    let visionCost = null;
    if (!MOCK_MODE) {
      try {
        parsed = await parseRender(bytes.toString('base64'), MIME_BY_EXT[ext] || 'image/jpeg');
        visionCost = parsed.cost;
        log({ event: 'render_analysis', room_id: room.id, render_id: renderId, items: parsed.items.length, surfaces: parsed.surfaces.length, visible: parsed.visible.length });
      } catch (e) {
        log({ event: 'render_analysis_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
      }
    }

    const allProducts = await q.allProducts();

    let matched = [];
    try { matched = matchCatalog(parsed.items, allProducts); }
    catch (e) { log({ event: 'render_match_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) }); }

    await q.clearItems(render.id);
    if (iteration) {
      const parent = render.parent_render_id ? await q.getRender(render.parent_render_id) : null;
      if (parent) await q.copyItems(parent.id, render.id);
    } else {
      for (const p of curated) await q.saveItem(render.id, p.id, null);
    }
    const finalItemsBeforeMatch = await q.itemsForRender(render.id);
    const categoryGroup = category => (category === 'paint' || category === 'wallpaper')
      ? ['paint', 'wallpaper']
      : [category];
    const groupForTarget = target => {
      if (!target) return null;
      if (target === 'wall') return ['paint', 'wallpaper'];
      if (target === 'backsplash' || target === 'tile') return ['tile'];
      return [target];
    };
    const presentGroups = new Set(finalItemsBeforeMatch.map(p => categoryGroup(p.category).join('|')));
    if (iteration) {
      if (editProduct) {
        // Быстрая подсказка/товарный референс: фиксируем именно этот товар в смете.
        await q.replaceItemByCategories(render.id, categoryGroup(editProduct.category), editProduct.id, 1);
      } else if (render.edit_target) {
        const targetGroup = groupForTarget(render.edit_target);
        const match = matched.find(m => targetGroup.includes(m.product.category));
        if (match) await q.replaceItemByCategories(render.id, targetGroup, match.product.id, match.score);
      } else {
        // Правка без target: не переписываем смету родителя, только дополняем недостающие группы.
        for (const m of matched) {
          const group = categoryGroup(m.product.category).join('|');
          if (!presentGroups.has(group)) { await q.saveItem(render.id, m.product.id, m.score); presentGroups.add(group); }
        }
      }
    } else {
      // Первый рендер: curated — источник истины (его и просили нарисовать).
      // Vision только добавляет то, чего не было в подборке, и не подменяет выбранный товар.
      for (const m of matched) {
        const group = categoryGroup(m.product.category).join('|');
        if (!presentGroups.has(group)) { await q.saveItem(render.id, m.product.id, m.score); presentGroups.add(group); }
      }
    }
    if (!iteration && !curated.length && !matched.length && MOCK_MODE) {
      for (const p of allProducts.filter(p => ['light', 'floor', 'paint', 'outlets'].includes(p.category)).slice(0, 4)) {
        await q.saveItem(render.id, p.id, 0.9);
      }
    }

    // Подсказки строим уже по финальной смете, чтобы не предлагать заменить то,
    // что только что поставили (например, новую люстру после правки).
    const finalItems = await q.itemsForRender(render.id);
    const analysis = buildAnalysis({
      roomType,
      parsed,
      products: allProducts,
      currentProducts: finalItems,
      priceTier,
      style: room.style,
    });
    await q.setRenderAnalysis(renderId, analysis);
    log({ event: 'render_matched', room_id: room.id, render_id: renderId, parsed_items: parsed.items.length, matched: matched.length, curated: curated.length, suggestions: analysis.suggestions.length });

    await q.setRenderMeta(renderId, {
      ...meta,
      model,
      cost_usd: cost ?? null,
      vision_cost_usd: visionCost ?? null,
      suggestion_targets: analysis.suggestions.map(s => s.target),
    });

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

let running = 0;
export function startWorker() {
  q.requeueProcessing().then(n => { if (n) console.log(`[worker] вернул в очередь ${n} прерванных рендеров`); });

  setInterval(async () => {
    try {
      const stale = await q.staleRenders(24 * 60);
      for (const r of stale) {
        const msg = 'Генерация не завершилась за 24 часа';
        const failed = await q.failStaleRender(r.id, msg, 'timeout');
        if (!failed) continue;
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

export async function enqueueRender({ roomId, parentRenderId = null, requestText = null, chargedUserId = null, requestIp = null, editTarget = null, refPath = null, refProductId = null }) {
  const id = crypto.randomUUID();
  const chargeUser = MOCK_MODE ? null : chargedUserId;
  await enqueueRenderWithCredit({
    id,
    roomId,
    parentRenderId,
    requestText,
    chargedUserId: chargeUser,
    requestIp,
    editTarget,
    refPath,
    refProductId,
  });
  return id;
}

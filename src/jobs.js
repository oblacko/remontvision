// Воркер: забирает рендеры со статусом queued и доводит до done.
// Два режима:
//   base — глубокое преображение по стилю + текстовые материалы под класс материалов;
//   edit — короткая правка одного объекта с референсом, без полного стилевого промта.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { MOCK_MODE, buildPrompt, buildEditPrompt, generateRender, generateCleanupRender, assessProductEdit, assessArchitecture, parseRender, matchCatalog, snapAspect, log } from './openrouter.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { fitAspect } from './media.js';
import { curateProducts, referenceImagesDetailed } from './curate.js';
import { designProducts } from './productpipeline.js';
import { roomTypeByName } from './roomtypes.js';
import { buildAnalysis } from './analysis.js';
import { normalizeTier } from './pricing.js';
import { getModelConfig } from './modelconfig.js';
import { modelCaps } from './modelcaps.js';
import { getCleanupConfig, buildCleanupPrompt } from './cleanupconfig.js';
import { getStyleConfig } from './styleconfig.js';
import { getStyleSwatchDataUrl } from './styleswatch.js';

const ARCHITECTURE_QA_ENABLED = /^(1|true|yes|on)$/i.test(process.env.ARCHITECTURE_QA_ENABLED || '');
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
  const keepFurniture = room.keep_furniture !== false;
  const useCatalog = room.use_catalog !== false;
  const cleanupCfg = getCleanupConfig();
  const precleanedShell = room.precleaned_shell_path || null;
  const useCleanup = !iteration && !keepFurniture && !precleanedShell && cleanupCfg.enabled;
  let stage = 'start';

  try {
    stage = 'analyzing';
    await q.setRoomStatus('analyzing', room.id);
    log({ event: 'render_start', room_id: room.id, render_id: renderId, iteration, target: render.edit_target || null, price_tier: priceTier, keep_furniture: keepFurniture, use_catalog: useCatalog });

    let prompt;
    let curated = [];
    let styleInfo = null;
    let imageMap = [];
    let meta = {
      mode: iteration ? 'edit' : 'base',
      pipeline: iteration && render.ref_product_id ? 'design_product_binding_v1' : 'design_first_v1',
      room_type: roomType,
      price_tier: priceTier,
      keep_furniture: keepFurniture,
      use_catalog: useCatalog,
      cleanup_enabled: useCleanup,
      precleaned_shell_path: precleanedShell,
      source_used: precleanedShell ? 'precleaned' : useCleanup ? 'cleanup' : 'original',
      style: room.style,
      target: render.edit_target || null,
      product_ids: [],
      refs: [],
      model_config: getModelConfig(),
    };
    let parentItems = [];
    let editProduct = null;
    let sourceStored = precleanedShell || room.photo_path;
    let referenceImagesB64 = [];

    if (iteration) {
      const parent = render.parent_render_id ? await q.getRender(render.parent_render_id) : null;
      if (parent?.image_path) sourceStored = parent.image_path;
      meta.source_used = 'parent';
      if (parent) parentItems = await q.itemsForRender(parent.id);
      const ref = await editReference(render);
      editProduct = ref?.product || null;
      if (render.ref_product_id && !editProduct) throw new Error('Не удалось загрузить изображение товара для привязки');
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
        refDimensions: editProduct?.dimensions?.text || '',
      });
      meta.refs = imageMap.map((m, i) => ({ index: i + 1, ...m }));
      meta.parent_render_id = render.parent_render_id || null;
    } else {
      styleInfo = await q.styleByName(room.style);
      const styleMode = getStyleConfig().mode;
      const stylePreferred = styleInfo ? await q.styleProducts(styleInfo.id, roomType) : [];
      const allowed = new Set(roomTypeInfo?.categories || []);
      const preferred = useCatalog ? stylePreferred.filter(p => p.active !== false && (
        p.style_room_type === roomType ||
        (!p.style_room_type && (!allowed.size || allowed.has(p.category)))
      )) : [];

      curated = useCatalog ? await curateProducts({
        style: room.style,
        budget: room.budget,
        priceTier,
        roomType,
        preferredIds: preferred.map(p => p.id),
        allowedCategories: roomTypeInfo?.categories || null,
        seed: room.id,
      }) : [];

      let styleUserRef = false;
      const styleRefUrls = [];
      imageMap = [{ role: (useCleanup || precleanedShell) ? 'source room or prepared empty shell' : 'source room', label: 'the only authority for architecture, camera and room proportions' }];
      if (styleMode === 'reference') {
        const adminStyleRefs = styleInfo ? await q.styleReferences(styleInfo.id, roomType) : [];
        const styleRefs = await styleReferenceBuffers(room, styleInfo, adminStyleRefs);
        styleUserRef = styleRefs.user;
        for (const ref of styleRefs.refs.slice(0, 1)) styleRefUrls.push(await bufferToDataUrl(ref.buf));
        const styleRole = kind => kind === 'material_board'
          ? 'art reference: material board — finishes, colors, light and styling only; never copy objects, layout or composition'
          : kind === 'user'
            ? 'user art reference — mood, palette, materials, light and styling only; never copy objects, layout or composition'
            : kind === 'cover'
              ? 'art reference: style cover — mood, palette, materials and light only; never copy objects, layout or composition'
              : 'art reference — atmosphere, palette, material character, light and styling only; never copy furniture, layout or composition';
        imageMap.push(...styleRefs.refs.slice(0, 1).map(ref => ({ role: styleRole(ref.kind), label: ref.title || '' })));
      } else if (styleMode === 'swatches' && styleInfo) {
        try {
          styleRefUrls.push(await getStyleSwatchDataUrl(styleInfo));
          imageMap.push({ role: 'style material board — palette, finishes and light temperature only; never copy architecture, windows, doors, layout or composition', label: `${styleInfo.name} · swatches` });
        } catch (e) {
          log({ event: 'style_swatch_error', room_id: room.id, render_id: renderId, style: room.style, error: String(e.message || e).slice(0, 300) });
        }
      }

      prompt = buildPrompt({
        style: room.style,
        priceTier,
        budget: room.budget,
        products: designProducts(curated),
        palette: room.palette || 'none',
        accent: room.accent || 'none',
        hasStyleRef: styleRefUrls.length > 0,
        userStyleRef: styleUserRef,
        styleDescription: styleInfo?.prompt_description || '',
        roomType,
        keepFurniture,
        useCatalog,
        imageMap,
      });

      referenceImagesB64 = styleRefUrls;
      meta.product_ids = curated.map(p => Number(p.id));
      meta.style_id = styleInfo?.id || null;
      meta.style_reference_mode = styleMode;
      meta.user_style_ref_ignored = Boolean(room.style_ref_path && styleMode !== 'reference');
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
      const originalBuf = await getBuffer(sourceStored);
      const originalDataUrl = await bufferToDataUrl(originalBuf);
      const { width, height } = imageSize(originalBuf);
      targetRatio = width / height;
      const renderModel = getModelConfig().render;
      const aspectRatio = snapAspect(width, height, modelCaps(renderModel).aspects);
      let designBuf = originalBuf;
      let cleanupCost = 0;

      if (useCleanup) {
        const cleanupStart = Date.now();
        try {
          const cleanupPrompt = buildCleanupPrompt(roomType);
          const cleanupAspect = cleanupCfg.aspect_ratio === 'auto'
            ? snapAspect(width, height, modelCaps(cleanupCfg.model).aspects)
            : cleanupCfg.aspect_ratio;
          const cleanupOut = await generateCleanupRender({
            prompt: cleanupPrompt,
            sourceImageB64: await bufferToDataUrl(originalBuf),
            aspectRatio: cleanupAspect,
            model: cleanupCfg.model,
            resolution: cleanupCfg.resolution,
            aspect: cleanupCfg.aspect_ratio,
          });
          let shellBytes = Buffer.from(cleanupOut.b64, 'base64');
          shellBytes = await fitAspect(shellBytes, targetRatio);
          const shellExt = detectImageExt(shellBytes);
          const shellKey = `shells/${render.id}.${shellExt}`;
          await putBuffer(shellKey, shellBytes, MIME_BY_EXT[shellExt] || 'image/png');
          await q.setRenderShellPath(render.id, shellKey);
          designBuf = shellBytes;
          meta.source_used = 'cleanup';
          cleanupCost = cleanupOut.cost || 0;
          meta.cleanup = {
            model: cleanupCfg.model,
            resolution: cleanupCfg.resolution,
            aspect_ratio: cleanupAspect,
            cost_usd: cleanupOut.cost ?? null,
            ms: Date.now() - cleanupStart,
            shell_path: shellKey,
            prompt: cleanupPrompt,
          };
          log({ event: 'cleanup_done', room_id: room.id, render_id: renderId, model: cleanupCfg.model, aspect: cleanupAspect, cost_usd: cleanupOut.cost ?? null, ms: Date.now() - cleanupStart });
        } catch (e) {
          meta.source_used = 'original';
          meta.cleanup = { model: cleanupCfg.model, error: String(e.message || e).slice(0, 500), ms: Date.now() - cleanupStart };
          log({ event: 'cleanup_error', room_id: room.id, render_id: renderId, model: cleanupCfg.model, error: String(e.message || e).slice(0, 500) });
        }
      }

      const srcB64 = await bufferToDataUrl(designBuf);
      let out = await generateRender({
        prompt,
        sourceImageB64: srcB64,
        referenceImagesB64,
        aspectRatio,
      });
      imageB64 = out.b64; cost = (cleanupCost || 0) + (out.cost || 0); model = out.model || null;
      let architectureQa = null;
      if (ARCHITECTURE_QA_ENABLED && !iteration) {
        try {
          const outBuf = Buffer.from(out.b64, 'base64');
          const outExt = detectImageExt(outBuf);
          const outMime = MIME_BY_EXT[outExt] || 'image/png';
          architectureQa = await assessArchitecture({
            sourceImageUrl: originalDataUrl,
            renderImageUrl: `data:${outMime};base64,${out.b64}`,
          });
          cost += architectureQa.cost || 0;
          log({ event: 'architecture_qa', room_id: room.id, render_id: renderId, accepted: architectureQa.accepted, checks: architectureQa.checks, issues: architectureQa.issues, cost_usd: architectureQa.cost ?? null });
          if (!architectureQa.accepted) {
            const retryPrompt = `${prompt}

ARCHITECTURE CORRECTION — HARD REQUIREMENT
The previous attempt failed architecture QA: ${architectureQa.issues.join('; ') || 'the room geometry changed'}.
Regenerate the SAME room with the exact source architecture. Do not add, remove, move or resize any window, door, wall, ceiling, niche, beam, column, skylight, built-in or room volume. Keep the same camera, proportions and functional zones. This correction overrides any conflicting styling instruction.`;
            out = await generateRender({
              prompt: retryPrompt,
              sourceImageB64: srcB64,
              referenceImagesB64,
              aspectRatio,
              model: 'openai/gpt-image-2',
            });
            imageB64 = out.b64; cost += out.cost || 0; model = out.model || model;
            const retryBuf = Buffer.from(out.b64, 'base64');
            const retryExt = detectImageExt(retryBuf);
            const retryMime = MIME_BY_EXT[retryExt] || 'image/png';
            architectureQa = await assessArchitecture({
              sourceImageUrl: originalDataUrl,
              renderImageUrl: `data:${retryMime};base64,${out.b64}`,
            });
            cost += architectureQa.cost || 0;
            log({ event: 'architecture_qa_retry', room_id: room.id, render_id: renderId, accepted: architectureQa.accepted, checks: architectureQa.checks, issues: architectureQa.issues, cost_usd: architectureQa.cost ?? null });
            if (!architectureQa.accepted) {
              throw new Error(`Не удалось сохранить архитектуру комнаты: ${architectureQa.issues.slice(0, 3).join('; ') || 'геометрия изменилась'}`);
            }
          }
        } catch (e) {
          if (String(e.message || '').startsWith('Не удалось сохранить архитектуру')) throw e;
          log({ event: 'architecture_qa_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
          throw new Error(`Не удалось проверить архитектуру комнаты: ${String(e.message || e).slice(0, 300)}`);
        }
      }
      meta.architecture_qa = architectureQa;
      log({ event: 'render_image_ok', room_id: room.id, render_id: renderId, model, aspect: aspectRatio, room_type: roomType, price_tier: priceTier, target: render.edit_target || null, refs: referenceImagesB64.length, curated: curated.length, cleanup: useCleanup, cleanup_cost_usd: cleanupCost || null, cost_usd: cost, ms: Date.now() - t0 });
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

    let productQa = null;
    if (iteration && editProduct) {
      stage = 'product_qa';
      await q.setRoomStatus('matching', room.id);
      if (MOCK_MODE) {
        productQa = { status: 'skipped', accepted: false, checks: {}, issues: [], cost: null };
      } else {
        try {
          const parentBuf = await getBuffer(sourceStored);
          productQa = await assessProductEdit({
            parentImageUrl: await bufferToDataUrl(parentBuf),
            editedImageUrl: await bufferToDataUrl(bytes),
            productImageUrl: referenceImagesB64[0],
            productName: editProduct.name,
            target: render.edit_target || editProduct.category,
          });
        } catch (e) {
          productQa = { status: 'error', accepted: false, checks: {}, issues: [], cost: e.cost ?? null };
          log({ event: 'product_qa_error', room_id: room.id, render_id: renderId, product_id: editProduct.id, error: String(e.message || e).slice(0, 300) });
        }
      }
      meta.product_qa = productQa;
      if (!productQa.accepted && !MOCK_MODE) {
        const reason = productQa.issues.join('; ').slice(0, 240);
        const notice = productQa.status === 'error'
          ? 'Не удалось проверить товарную правку. Прежняя версия сохранена, кредит возвращён.'
          : `Товарная правка не прошла проверку${reason ? `: ${reason}` : '.'} Прежняя версия сохранена, кредит возвращён.`;
        const qaParts = [cost, productQa.cost].filter(value => typeof value === 'number');
        const qaTotalCost = qaParts.length ? qaParts.reduce((sum, value) => sum + value, 0) : null;
        await q.setRenderMeta(renderId, { ...meta, model, cost_usd: cost ?? null, product_qa: productQa });
        await q.setRenderRejected(notice, renderKey, qaTotalCost, model, render.id);
        await q.setRoomNotice(notice, room.id);
        const restored = await restoreCreditForRender(renderId, 'product_qa_rejected');
        log({ event: 'product_qa_rejected', room_id: room.id, render_id: renderId, product_id: editProduct.id, status: productQa.status, checks: productQa.checks, cost_usd: qaTotalCost, credit_restored: restored, ms: Date.now() - t0 });
        return;
      }
      log({ event: 'product_qa_done', room_id: room.id, render_id: renderId, product_id: editProduct.id, status: productQa.status, checks: productQa.checks, cost_usd: productQa.cost ?? null });
    }

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

    const allProducts = useCatalog ? await q.allProducts() : [];

    let matched = [];
    if (useCatalog) {
      try { matched = matchCatalog(parsed.items, allProducts); }
      catch (e) { log({ event: 'render_match_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) }); }
    }

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
        await q.replaceItemByCategories(render.id, categoryGroup(editProduct.category), editProduct.id, 1, productQa?.accepted ? 'verified' : 'curated');
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
      // Первый рендер: curated — источник сметы, но не доказательство точного совпадения.
      // Vision только добавляет то, чего не было в подборке, и не подменяет выбранный товар.
      for (const m of matched) {
        const group = categoryGroup(m.product.category).join('|');
        if (!presentGroups.has(group)) { await q.saveItem(render.id, m.product.id, m.score); presentGroups.add(group); }
      }
    }
    if (useCatalog && !iteration && !curated.length && !matched.length && MOCK_MODE) {
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
      product_qa_cost_usd: productQa?.cost ?? null,
      vision_cost_usd: visionCost ?? null,
      suggestion_targets: analysis.suggestions.map(s => s.target),
    });

    const parts = [cost, productQa?.cost, visionCost].filter(c => typeof c === 'number');
    const totalCost = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    await q.setRenderDone(renderKey, totalCost, model, render.id);
    await q.setRoomStatus('done', room.id);
    log({ event: 'render_done', room_id: room.id, render_id: renderId, cost_usd: totalCost, cost_image_usd: cost ?? null, cost_product_qa_usd: productQa?.cost ?? null, cost_vision_usd: visionCost ?? null, ms: Date.now() - t0 });
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

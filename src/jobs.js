// Воркер: забирает рендеры со статусом queued и доводит до done.
// Два режима:
//   base — глубокое преображение по стилю + текстовые материалы под класс материалов;
//   edit — короткая правка одного объекта с референсом, без полного стилевого промта.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { MOCK_MODE, buildPrompt, buildEditPrompt, generateRender, generateCleanupRender, assessProductEdit, parseRender, snapAspect, log } from './openrouter.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { fitAspect } from './media.js';
import { referenceImagesDetailed } from './curate.js';
import { reviewDesign } from './architect.js';
import { matchDesignOffers } from './designoffers.js';
import { getRenderConfig } from './renderconfig.js';
import { pickHoffProducts, loadProductImages } from './productpicker.js';
import { buildAnalysis } from './analysis.js';
import { normalizeTier } from './pricing.js';
import { getModelConfig } from './modelconfig.js';
import { modelCaps } from './modelcaps.js';
import { getCleanupConfig, buildCleanupPrompt } from './cleanupconfig.js';
import { getStyleConfig } from './styleconfig.js';
import { getStyleSwatchDataUrl } from './styleswatch.js';
import { buildArtDirection } from './artdirector.js';
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
  const isBedRoom = /спальн|детск/i.test(roomType);
  const priceTier = normalizeTier(room.price_tier || 'comfort');
  const keepFurniture = room.keep_furniture !== false;
  const useCatalog = room.use_catalog !== false;
  const roomDimensions = (room.room_width_m || room.room_length_m || room.room_height_m || room.bed_length_m)
    ? {
        width: room.room_width_m == null ? null : Number(room.room_width_m),
        length: room.room_length_m == null ? null : Number(room.room_length_m),
        height: room.room_height_m == null ? null : Number(room.room_height_m),
        bedLength: room.bed_length_m == null ? null : Number(room.bed_length_m),
        orientation: room.dimension_orientation || '',
      }
    : null;
  const cleanupCfg = getCleanupConfig();
  const precleanedShell = room.precleaned_shell_path || null;
  const useCleanup = !iteration && !keepFurniture && !precleanedShell && cleanupCfg.enabled;
  let stage = 'start';

  // Себестоимость полной генерации: каждый внешний запрос пишется отдельно.
  const costBreakdown = {
    art_direction: null,
    cleanup: null,
    design: null,
    design_retry: null,
    architect_review: null,
    product_qa: null,
    render_analysis: null,
    failed: null,
  };
  const addCost = (key, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    costBreakdown[key] = (costBreakdown[key] || 0) + value;
  };
  const sumCostBreakdown = () => {
    const total = Object.values(costBreakdown).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
    return total > 0 ? total : null;
  };

  try {
    stage = 'analyzing';
    await q.setRoomStatus('analyzing', room.id);
    log({ event: 'render_start', room_id: room.id, render_id: renderId, iteration, target: render.edit_target || null, price_tier: priceTier, keep_furniture: keepFurniture, use_catalog: useCatalog });

    let prompt;
    let artDirectionCost = 0;
    let styleInfo = null;
    let imageMap = [];
    let meta = {
      mode: iteration ? 'edit' : 'base',
      pipeline: iteration && render.ref_product_id ? 'design_product_binding_v1' : 'design_first_v1',
      room_type: roomType,
      dimensions: roomDimensions,
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
      const manualRefs = Array.isArray(render.edit_refs) ? render.edit_refs.filter(r => r && r.path) : [];
      const editRefs = [];
      for (const ref of manualRefs) {
        try {
          const buf = await getBuffer(ref.path);
          editRefs.push({
            b64: await bufferToDataUrl(buf),
            label: String(ref.label || '').slice(0, 120),
            instruction: String(ref.instruction || '').slice(0, 300),
            product: null,
          });
        } catch (e) {
          log({ event: 'edit_ref_read_error', render_id: renderId, path: ref.path, error: String(e.message || e).slice(0, 200) });
        }
      }
      if (!manualRefs.length || render.ref_product_id) {
        const ref = await editReference(render);
        if (ref) editRefs.push({ b64: ref.b64, label: ref.label, instruction: '', product: ref.product || null });
      }
      editProduct = editRefs.find(r => r.product)?.product || null;
      if (render.ref_product_id && !editProduct) throw new Error('Не удалось загрузить изображение товара для привязки');
      referenceImagesB64 = editRefs.map(r => r.b64);
      imageMap = [
        { role: 'current interior render', label: 'edit only the target object' },
        ...editRefs.map(r => ({ role: 'reference image', label: r.instruction || r.label || '' })),
      ];
      const describeRefs = editRefs.length > 1 || editRefs.some(r => r.instruction);
      if (!render.ref_product_id && describeRefs) {
        prompt = buildEditPrompt({
          roomType,
          target: render.edit_target,
          instruction: render.request_text,
          references: editRefs.map(r => ({
            instruction: r.instruction,
            label: r.label,
            dimensions: r.product?.dimensions?.text || '',
          })),
        });
      } else {
        const primary = editRefs[0] || null;
        prompt = buildEditPrompt({
          roomType,
          target: render.edit_target,
          instruction: render.request_text,
          hasRef: Boolean(primary),
          refLabel: primary?.label || '',
          refDimensions: editProduct?.dimensions?.text || '',
        });
      }
      meta.refs = imageMap.map((m, i) => ({ index: i + 1, ...m }));
      meta.parent_render_id = render.parent_render_id || null;
    } else {
      styleInfo = await q.styleByName(room.style);
      const styleMode = getStyleConfig().mode;

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

      // Арт-директор читает реальное фото и пишет bespoke-направление под стиль.
      // Без него дизайн скатывается к шаблонному «стиль + нейтральная комната».
      let artDirection = '';
      let artDirectionPlan = [];
      let estimatedDimensions = roomDimensions;
      if (!MOCK_MODE) {
        try {
          const adStart = Date.now();
          const adBuf = await getBuffer(room.photo_path || sourceStored);
          const ad = await buildArtDirection({
            imageDataUrl: await bufferToDataUrl(adBuf),
            roomType,
            style: room.style,
            styleDescription: styleInfo?.prompt_description || '',
            dimensions: roomDimensions,
            keepFurniture,
          });
          if (ad?.roomDimensions) {
            estimatedDimensions = {
              ...ad.roomDimensions,
              bedLength: roomDimensions?.bedLength ?? (isBedRoom ? 2 : null),
              orientation: roomDimensions?.orientation || '',
            };
            meta.room_dimensions_estimate = ad.roomDimensions;
            meta.lens = ad.lens || null;
          }
          if (ad?.text) {
            artDirection = ad.text;
            artDirectionPlan = Array.isArray(ad.productPlan) ? ad.productPlan : [];
            artDirectionCost = ad.cost || 0;
            addCost('art_direction', ad.cost);
            meta.art_direction = { ...ad, ms: Date.now() - adStart };
            log({ event: 'art_direction_ok', room_id: room.id, render_id: renderId, style: room.style, room_type: roomType, palette: ad.palette?.length || 0, cost_usd: ad.cost ?? null, ms: Date.now() - adStart });
          } else {
            log({ event: 'art_direction_empty', room_id: room.id, render_id: renderId, style: room.style, room_type: roomType });
          }
        } catch (e) {
          log({ event: 'art_direction_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
        }
      }

      // «Товары в рендере»: арт-директор даёт план, catalog-service ищет реальные
      // товары Hoff, второй LLM-проход отбирает «красиво по размерам».
      const renderCfg = getRenderConfig();
      let productRefsDetailed = [];
      if (renderCfg.product_refs_enabled && artDirectionPlan.length) {
        try {
          const picked = await pickHoffProducts({
            plan: artDirectionPlan,
            roomType,
            style: room.style,
            maxProducts: renderCfg.max_products,
          });
          productRefsDetailed = await loadProductImages(picked);
          for (const ref of productRefsDetailed) {
            imageMap.push({
              role: `product reference — ${ref.category}: keep its exact shape, colour, material and proportions; light it with the room's own light and add a soft contact shadow`,
              label: ref.name || '',
            });
          }
          meta.product_refs = productRefsDetailed.map(ref => ({
            offer_id: ref.offer_id, name: ref.name, category: ref.category,
            price: ref.price, why: ref.why, picked_by: ref.picked_by,
          }));
          log({ event: 'product_refs_selected', room_id: room.id, render_id: renderId, count: productRefsDetailed.length, offers: productRefsDetailed.map(r => r.offer_id) });
        } catch (e) {
          log({ event: 'product_refs_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
        }
      }

      prompt = buildPrompt({
        style: room.style,
        priceTier,
        budget: room.budget,
        products: [],
        palette: room.palette || 'none',
        accent: room.accent || 'none',
        hasStyleRef: styleRefUrls.length > 0,
        userStyleRef: styleUserRef,
        styleDescription: styleInfo?.prompt_description || '',
        roomType,
        keepFurniture,
        // В базовом кадре товаров нет: каталог подключается после генерации.
        // Это сохраняет поведение A/B (products: [], useCatalog: false).
        useCatalog: false,
        imageMap,
        dimensions: estimatedDimensions,
        artDirection,
        productRefs: productRefsDetailed.length > 0,
      });

      referenceImagesB64 = [...styleRefUrls, ...productRefsDetailed.map(r => r.b64)];
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
      const { width, height } = imageSize(originalBuf);
      targetRatio = width / height;
      const editModel = getModelConfig().edit || null;
      const activeModel = iteration && editModel ? editModel : getModelConfig().render;
      const aspectRatio = snapAspect(width, height, modelCaps(activeModel).aspects);
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
          addCost('cleanup', cleanupOut.cost);
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
          addCost('cleanup', e.cost);
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
        ...(iteration ? { aspect: aspectRatio, model: editModel } : {}),
      });
      imageB64 = out.b64; cost = (cleanupCost || 0) + (artDirectionCost || 0) + (out.cost || 0); model = out.model || null;
      addCost('design', out.cost);
      log({ event: 'render_image_ok', room_id: room.id, render_id: renderId, model, aspect: aspectRatio, room_type: roomType, price_tier: priceTier, target: render.edit_target || null, refs: referenceImagesB64.length, cleanup: useCleanup, cleanup_cost_usd: cleanupCost || null, cost_usd: cost, ms: Date.now() - t0 });
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
      addCost('product_qa', productQa?.cost);
      if (!productQa.accepted && !MOCK_MODE) {
        const reason = productQa.issues.join('; ').slice(0, 240);
        const notice = productQa.status === 'error'
          ? 'Не удалось проверить товарную правку. Прежняя версия сохранена, кредит возвращён.'
          : `Товарная правка не прошла проверку${reason ? `: ${reason}` : '.'} Прежняя версия сохранена, кредит возвращён.`;
        const qaTotalCost = sumCostBreakdown();
        await q.setRenderMeta(renderId, { ...meta, model, cost_usd: qaTotalCost, cost_breakdown: costBreakdown, product_qa: productQa });
        await q.setRenderRejected(notice, renderKey, qaTotalCost, model, render.id);
        await q.setRoomNotice(notice, room.id);
        const restored = await restoreCreditForRender(renderId, 'product_qa_rejected');
        log({ event: 'product_qa_rejected', room_id: room.id, render_id: renderId, product_id: editProduct.id, status: productQa.status, checks: productQa.checks, cost_usd: qaTotalCost, credit_restored: restored, ms: Date.now() - t0 });
        return;
      }
      log({ event: 'product_qa_done', room_id: room.id, render_id: renderId, product_id: editProduct.id, status: productQa.status, checks: productQa.checks, cost_usd: productQa.cost ?? null });
    }

    // Один разбор архитектора вместо parseRender + matchCatalog + buildAnalysis + architecture QA.
    stage = 'matching';
    await q.setRoomStatus('matching', room.id);
    let parsed = { items: [], surfaces: [], visible: [], electrical: [] };
    let architectReview = null;
    let productMatches = [];
    let visionCost = null;
    if (!MOCK_MODE) {
      const imageDataUrl = `data:${MIME_BY_EXT[ext] || 'image/jpeg'};base64,${bytes.toString('base64')}`;
      try {
        const reviewed = await reviewDesign({
          imageDataUrl,
          roomType,
          style: room.style,
          priceTier,
          mode: 'hints',
        });
        if (reviewed) {
          parsed = reviewed.parsed;
          architectReview = reviewed.architect;
          visionCost = reviewed.cost;
          addCost('architect_review', reviewed.cost);
          log({ event: 'architect_review', room_id: room.id, render_id: renderId, items: architectReview.items.length, surfaces: architectReview.surfaces.length, hints: architectReview.hints.length, cost_usd: reviewed.cost ?? null });
        }
      } catch (e) {
        log({ event: 'architect_review_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
      }
      if (!architectReview) {
        try {
          parsed = await parseRender(bytes.toString('base64'), MIME_BY_EXT[ext] || 'image/jpeg');
          visionCost = parsed.cost;
          addCost('render_analysis', visionCost);
          log({ event: 'render_analysis_fallback', room_id: room.id, render_id: renderId, items: parsed.items.length, surfaces: parsed.surfaces.length, visible: parsed.visible.length });
        } catch (e) {
          log({ event: 'render_analysis_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
        }
      }
    }

    if (getRenderConfig().product_matching_enabled && architectReview?.items?.length) {
      try {
        productMatches = await matchDesignOffers({ items: architectReview.items, roomType, topK: 3 });
        const offers = productMatches.reduce((sum, match) => sum + match.offers.length, 0);
        log({ event: 'design_offers_matched', room_id: room.id, render_id: renderId, items: productMatches.length, offers });
      } catch (e) {
        log({ event: 'design_offers_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
      }
    }

    await q.clearItems(render.id);
    if (iteration) {
      const parent = render.parent_render_id ? await q.getRender(render.parent_render_id) : null;
      if (parent) await q.copyItems(parent.id, render.id);
      if (editProduct) {
        const categoryGroup = category => (category === 'paint' || category === 'wallpaper')
          ? ['paint', 'wallpaper']
          : [category];
        // Быстрая подсказка/товарный референс: фиксируем именно этот товар в смете.
        await q.replaceItemByCategories(render.id, categoryGroup(editProduct.category), editProduct.id, 1, productQa?.accepted ? 'verified' : 'curated');
      }
    }

    // Подсказки строим уже по финальной смете, чтобы не предлагать заменить то,
    // что только что поставили (например, новую люстру после правки).
    const finalItems = await q.itemsForRender(render.id);
    const analysis = buildAnalysis({
      roomType,
      parsed,
      products: [],
      currentProducts: finalItems,
      priceTier,
      style: room.style,
    });
    if (architectReview) analysis.architect = architectReview;
    if (productMatches.length) analysis.products = productMatches;
    await q.setRenderAnalysis(renderId, analysis);
    log({ event: 'render_analyzed', room_id: room.id, render_id: renderId, items: parsed.items.length, architect_hints: architectReview?.hints?.length || 0, product_items: productMatches.length, suggestions: analysis.suggestions.length });

    const totalCost = sumCostBreakdown();
    await q.setRenderMeta(renderId, {
      ...meta,
      model,
      cost_usd: totalCost,
      cost_breakdown: costBreakdown,
      product_qa_cost_usd: productQa?.cost ?? null,
      vision_cost_usd: visionCost ?? null,
      suggestion_targets: analysis.suggestions.map(s => s.target),
    });

    await q.setRenderDone(renderKey, totalCost, model, render.id);
    await q.setRoomStatus('done', room.id);
    log({ event: 'render_done', room_id: room.id, render_id: renderId, cost_usd: totalCost, cost_breakdown: costBreakdown, cost_image_usd: cost ?? null, cost_product_qa_usd: productQa?.cost ?? null, cost_vision_usd: visionCost ?? null, ms: Date.now() - t0 });
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    addCost('failed', e.cost);
    const errorCost = sumCostBreakdown();
    await q.setRenderError(msg, renderId, stage, errorCost);
    await q.setRoomError(msg, room.id);
    try {
      const restored = await restoreCreditForRender(renderId, `render_error:${stage}`);
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, cost_usd: errorCost, cost_breakdown: costBreakdown, credit_restored: restored, ms: Date.now() - t0 });
    } catch (restoreError) {
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, cost_usd: errorCost, cost_breakdown: costBreakdown, credit_restore_error: String(restoreError.message || restoreError).slice(0, 300), ms: Date.now() - t0 });
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

export async function enqueueRender({ roomId, parentRenderId = null, requestText = null, chargedUserId = null, requestIp = null, editTarget = null, refPath = null, refProductId = null, editRefs = null }) {
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
    editRefs,
  });
  return id;
}

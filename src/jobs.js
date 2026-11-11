// Воркер: забирает рендеры со статусом queued и доводит до done.
// Два режима:
//   base — глубокое преображение по стилю + текстовые материалы под класс материалов;
//   edit — короткая правка одного объекта с референсом, без полного стилевого промта.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { MOCK_MODE, buildPrompt, buildEditPrompt, buildMoveRemovalPrompt, generateRender, generateCleanupRender, assessProductEdit, parseRender, assessArchitecture, snapAspect, log } from './openrouter.js';
import { imageSize, detectImageExt } from './imagesize.js';
import { fitAspect } from './media.js';
import { referenceImagesDetailed } from './curate.js';
import { buildDesignDirection, DESIGN_DIRECTION_ENABLED } from './designeragent.js';
import { buildLayoutPlan } from './layoutagent.js';
import { buildAnalysis } from './analysis.js';
import { composeMove } from './moveobject.js';
import { normalizeTier } from './pricing.js';
import { getModelConfig } from './modelconfig.js';
import { modelCaps } from './modelcaps.js';
import { getCleanupConfig, buildCleanupPrompt } from './cleanupconfig.js';
import { getStyleConfig } from './styleconfig.js';
import { getStyleSwatchDataUrl } from './styleswatch.js';
import { analyzeRoomBrief, buildArtDirection, buildRepairScope } from './artdirector.js';
import { fitLayoutPlan } from './layoutfit.js';
import { putBuffer, getBuffer } from './storage.js';
import { restoreCreditForRender, enqueueRenderWithCredit } from './payments.js';
import { sendRenderDoneEmail, renderShareUrl } from './notify.js';
import { friendlyRenderError } from './rendererrors.js';
import { shouldMarkRoomError, roomStatusAfterFailure, isIterationRender, resolveRenderStyleConcept } from './variants.js';
import { workerConcurrency } from './workerknobs.js';
import { pickArtDirection } from './artdirectionpick.js';

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

export async function processRender(renderId, claimedBy = null) {
  const t0 = Date.now();
  const render = await q.getRender(renderId);
  if (!render || render.status !== 'processing') return;
  const room = await q.getRoom(render.room_id);
  // Мульти-стиль: у рендера может быть свой стиль/концепт; у старых рендеров — из комнаты.
  const { style: styleName, concept: conceptKey } = resolveRenderStyleConcept(render, room);
  const iteration = isIterationRender(render);
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

  // Lease: пока рендер жив, воркер продлевает аренду; при падении lease истечёт,
  // и задача вернётся в очередь, не отбираясь у живой реплики.
  const heartbeat = setInterval(() => { q.heartbeatRender(renderId, claimedBy).catch(() => {}); }, 30_000);
  if (heartbeat.unref) heartbeat.unref();

  // Себестоимость полной генерации: каждый внешний запрос пишется отдельно.
  const costBreakdown = {
    art_direction: null,
    layout: null,
    repair_scope: null,
    cleanup: null,
    design: null,
    design_retry: null,
    architect_review: null,
    product_qa: null,
    architecture_qa: null,
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
      render_session: `render:${renderId}`,
      room_type: roomType,
      dimensions: roomDimensions,
      price_tier: priceTier,
      keep_furniture: keepFurniture,
      use_catalog: useCatalog,
      cleanup_enabled: useCleanup,
      precleaned_shell_path: precleanedShell,
      source_used: precleanedShell ? 'precleaned' : useCleanup ? 'cleanup' : 'original',
      style: styleName,
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
      if (render.edit_source_path) {
        sourceStored = render.edit_source_path;
        meta.source_used = 'move_composite';
      } else {
        meta.source_used = 'parent';
      }
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
      styleInfo = await q.styleByName(styleName);
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
          log({ event: 'style_swatch_error', room_id: room.id, render_id: renderId, style: styleName, error: String(e.message || e).slice(0, 300) });
        }
      }

      // Проход A: строитель определяет объём ремонта по исходному фото и cleaned shell.
      // Параллельно с арт-директором: оба читают одно фото и не зависят друг от друга.
      let repairScope = null;
      const repairPromise = (async () => {
        if (MOCK_MODE) return null;
        try {
          const originalBuf = await getBuffer(room.photo_path || sourceStored);
          const cleanedBuf = precleanedShell ? await getBuffer(precleanedShell) : null;
          const repair = await buildRepairScope({
            originalImageDataUrl: await bufferToDataUrl(originalBuf),
            cleanedImageDataUrl: cleanedBuf ? await bufferToDataUrl(cleanedBuf) : null,
            roomType,
            style: styleName,
            styleDescription: styleInfo?.prompt_description || '',
            sessionId: `render:${renderId}`,
          });
          if (repair?.repairScope) {
            meta.repair_scope = repair.repairScope;
            meta.repair_prompt_version = repair.promptVersion ?? null;
            addCost('repair_scope', repair.cost);
            log({ event: 'repair_scope_ok', room_id: room.id, render_id: renderId, input: precleanedShell ? 'cleaned_shell' : 'original', floor: repair.repairScope.floor?.action || null, ceiling: repair.repairScope.ceiling?.action || null, doors: repair.repairScope.doors?.action || null, cost_usd: repair.cost ?? null });
            return repair.repairScope;
          }
          log({ event: 'repair_scope_empty', room_id: room.id, render_id: renderId });
          return null;
        } catch (e) {
          log({ event: 'repair_scope_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
          return null;
        }
      })();
      meta.art_direction_input = precleanedShell ? 'cleaned_shell' : 'original';

      // Фото-проход: оцениваем размеры и объектив как раньше. Для новой пары
      // style×concept текст направления берём у direction-агента; свободный
      // арт-директор остаётся fallback-ом для старых комнат (откат).
      let artDirection = '';
      let estimatedDimensions = roomDimensions;
      let effectiveKeepFurniture = keepFurniture;
      if (!MOCK_MODE) {
        try {
          const adStart = Date.now();
          const adBuf = await getBuffer(precleanedShell || room.photo_path || sourceStored);
          const ad = await buildArtDirection({
            imageDataUrl: await bufferToDataUrl(adBuf),
            roomType,
            style: styleName,
            styleDescription: styleInfo?.prompt_description || '',
            dimensions: roomDimensions,
            keepFurniture,
            sessionId: `render:${renderId}`,
            modelKey: render.model_key || getModelConfig().render,
          });
          if (ad && keepFurniture && ad.existingFurniture === null) {
            // Старый промт дизайнера мог не вернуть existing_furniture — уточняем брифом.
            try {
              const brief = await analyzeRoomBrief({ imageDataUrl: await bufferToDataUrl(adBuf), roomType });
              if (Array.isArray(brief?.existing_furniture)) ad.existingFurniture = brief.existing_furniture;
            } catch { /* остаётся null */ }
          }
          if (ad && keepFurniture && Array.isArray(ad.existingFurniture) && ad.existingFurniture.length === 0) {
            effectiveKeepFurniture = false;
            meta.empty_room_detected = true;
            log({ event: 'empty_room_detected', room_id: room.id, render_id: renderId });
          }
          if (ad?.roomDimensions) {
            estimatedDimensions = {
              ...ad.roomDimensions,
              bedLength: roomDimensions?.bedLength ?? (isBedRoom ? 2 : null),
              orientation: roomDimensions?.orientation || '',
            };
            meta.room_dimensions_estimate = ad.roomDimensions;
            meta.lens = ad.lens || null;
          }
          let direction = null;
          if (DESIGN_DIRECTION_ENABLED && conceptKey && styleInfo?.key) {
            try {
              const usedDirections = room.user_id
                ? (await q.designRegistryForUser(room.user_id))
                    .map(row => ({ main_move: row.main_move, focal_zone: row.focal_zone }))
                    .filter(item => item.main_move || item.focal_zone)
                : [];
              direction = await buildDesignDirection({
                styleId: styleInfo.key,
                conceptId: conceptKey,
                roomType,
                dimensions: estimatedDimensions,
                usedDirections,
                sessionId: `render:${renderId}`,
              });
            } catch (e) {
              log({ event: 'design_direction_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
            }
          }
          const picked = pickArtDirection({ direction, ad });
          if (picked.branch === 'direction') {
            artDirection = picked.text;
            artDirectionCost = (ad.cost || 0) + (direction.cost || 0);
            addCost('art_direction', ad.cost);
            addCost('art_direction', direction.cost);
            meta.design_direction = { ...direction, ms: Date.now() - adStart, call_ms: direction.ms, retried: direction.retried };
            meta.concept_key = conceptKey;
            log({ event: 'design_direction_ok', room_id: room.id, render_id: renderId, style: styleName, concept: conceptKey, focal_zone: direction.focalZone, cost_usd: direction.cost ?? null, ms: Date.now() - adStart, call_ms: direction.ms, retried: direction.retried });
            if (room.user_id) {
              await q.recordDesignDirection({
                userId: room.user_id,
                roomId: room.id,
                roomType,
                styleKey: styleInfo.key,
                conceptKey,
                focalZone: direction.focalZone,
                mainMove: direction.mainMove?.action || direction.mainMove?.target || '',
                accepted: true,
              });
            }
            try { await q.setRoomDesign(room.id, room.concept_key, direction); } catch { /* метаданные не критичны */ }
          } else if (picked.branch === 'art_director') {
            artDirection = picked.text;
            artDirectionCost = ad.cost || 0;
            addCost('art_direction', ad.cost);
            meta.art_direction = { ...ad, ms: Date.now() - adStart };
            log({ event: 'art_direction_ok', room_id: room.id, render_id: renderId, style: styleName, room_type: roomType, palette: ad.palette?.length || 0, cost_usd: ad.cost ?? null, ms: Date.now() - adStart });
            if (direction) {
              // Валидный контракт без prompt_en: второй вызов не делаем, в промт идёт ad.text.
              addCost('art_direction', direction.cost);
              log({ event: 'design_direction_incomplete', room_id: room.id, render_id: renderId, style: styleName, concept: conceptKey, call_ms: direction.ms, retried: direction.retried, cost_usd: direction.cost ?? null });
            }
          } else {
            if (direction) addCost('art_direction', direction.cost);
            log({ event: 'art_direction_empty', room_id: room.id, render_id: renderId, style: styleName, room_type: roomType });
          }
        } catch (e) {
          log({ event: 'art_direction_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
        }
      }

      // Дожидаемся ремонта перед планировщиком/промтом: оба используют repairScope.
      repairScope = await repairPromise;

      // Планировщик нужен только для пустой комнаты: он предлагает расстановку,
      // чтобы модель не сводила кабинет к «стол + стул + шкаф».
      let layoutPlan = null;
      if (!MOCK_MODE && !effectiveKeepFurniture) {
        try {
          const layoutStart = Date.now();
          const layoutBuf = await getBuffer(precleanedShell || room.photo_path || sourceStored);
          layoutPlan = await buildLayoutPlan({
            imageDataUrl: await bufferToDataUrl(layoutBuf),
            roomType,
            dimensions: estimatedDimensions,
            style: styleInfo?.key || styleName,
            concept: conceptKey || '',
            keepFurniture: effectiveKeepFurniture,
            sessionId: meta.render_session,
          });
          if (layoutPlan?.status === 'proposed' && layoutPlan.items?.length) {
            addCost('layout', layoutPlan.cost);
            const fitted = fitLayoutPlan({ plan: layoutPlan, dimensions: estimatedDimensions, roomType, artDirection });
            layoutPlan = fitted.plan;
            if (fitted.artDirection) artDirection = fitted.artDirection;
            meta.layout_fit = fitted.fit;
            if (fitted.dropped.length) log({ event: 'layout_fit_dropped', room_id: room.id, render_id: renderId, dropped: fitted.fit?.dropped, needed_cm: fitted.fit?.neededCm, width_m: fitted.fit?.widthM });
            meta.layout_plan = layoutPlan;
            meta.layout_validation = layoutPlan.validation || null;
            meta.layout_assumptions = layoutPlan.assumptions || [];
            log({ event: 'layout_plan_ok', room_id: room.id, render_id: renderId, items: layoutPlan.items.length, zones: layoutPlan.zones.length, validation: layoutPlan.validation?.result || null, cost_usd: layoutPlan.cost ?? null, ms: Date.now() - layoutStart });
          } else {
            if (layoutPlan) {
              addCost('layout', layoutPlan.cost);
              meta.layout_plan_skipped = { status: layoutPlan.status, strategy: layoutPlan.strategy, questions: layoutPlan.questions || [], missing_inputs: layoutPlan.missing_inputs || [] };
            }
            layoutPlan = null;
            log({ event: 'layout_plan_empty', room_id: room.id, render_id: renderId, status: meta.layout_plan_skipped?.status || null });
          }
        } catch (e) {
          log({ event: 'layout_plan_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
        }
      }

      prompt = buildPrompt({
        style: styleName,
        priceTier,
        budget: room.budget,
        products: [],
        palette: room.palette || 'none',
        accent: room.accent || 'none',
        hasStyleRef: styleRefUrls.length > 0,
        userStyleRef: styleUserRef,
        styleDescription: styleInfo?.prompt_description || '',
        roomType,
        keepFurniture: effectiveKeepFurniture,
        // В базовом кадре товаров нет: каталог подключается после генерации.
        // Это сохраняет поведение A/B (products: [], useCatalog: false).
        useCatalog: false,
        imageMap,
        dimensions: estimatedDimensions,
        artDirection,
        repairScope,
        productRefs: false,
        layoutPlan,
      });

      referenceImagesB64 = [...styleRefUrls];
      meta.style_id = styleInfo?.id || null;
      meta.style_reference_mode = styleMode;
      meta.user_style_ref_ignored = Boolean(room.style_ref_path && styleMode !== 'reference');
      meta.budget = room.budget;
      meta.refs = imageMap.map((m, i) => ({ index: i + 1, ...m }));
    }

    if (iteration && render.edit_move) {
      prompt = buildMoveRemovalPrompt({ roomType, instruction: render.request_text });
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
          slotUser: room.user_id || null,
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
      let out = null;
      if (iteration && render.edit_source_path && !render.edit_move) {
        // Старый клиент уже прислал готовый композит с перенесённым объектом:
        // отдаём его как результат, не позволяя модели вернуть объект назад.
        imageB64 = originalBuf.toString('base64');
        cost = (cleanupCost || 0) + (artDirectionCost || 0);
        model = 'prepared-source';
        meta.source_used = 'prepared_source';
        log({ event: 'render_prepared_source', room_id: room.id, render_id: renderId });
      } else {
      out = await generateRender({
        slotUser: room.user_id || null,
        prompt,
        sourceImageB64: srcB64,
        referenceImagesB64,
        aspectRatio,
        resolution: render.resolution || null,
        ...(iteration ? { aspect: aspectRatio, model: editModel } : {}),
      });
      imageB64 = out.b64; cost = (cleanupCost || 0) + (artDirectionCost || 0) + (out.cost || 0); model = out.model || null;
      addCost('design', out.cost);
      if (render.edit_move) {
        try {
          const composed = await composeMove(originalBuf, Buffer.from(out.b64, 'base64'), render.edit_move);
          imageB64 = composed.toString('base64');
          meta.move = { ...render.edit_move, composed: true };
          log({ event: 'move_composed', room_id: room.id, render_id: renderId, label: render.edit_move.label || null });
        } catch (e) {
          meta.move = { ...render.edit_move, composed: false };
          log({ event: 'move_compose_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
        }
      }
      }
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

    // Контроль архитектуры: рендер не должен менять окна, двери и пропорции комнаты.
    let architectureQa = null;
    const archQaEnabled = !/^(0|false|no|off)$/i.test(String(process.env.ARCHITECTURE_QA_ENABLED ?? 'false'));
    const archQaEnforce = !/^(0|false|no|off)$/i.test(String(process.env.ARCHITECTURE_QA_ENFORCE ?? 'false'));
    if (!MOCK_MODE && archQaEnabled) {
      try {
        const sourceBuf = await getBuffer(sourceStored);
        architectureQa = await assessArchitecture({
          sourceImageUrl: await bufferToDataUrl(sourceBuf),
          renderImageUrl: await bufferToDataUrl(bytes),
        });
        addCost('architecture_qa', architectureQa.cost);
        meta.architecture_qa = architectureQa;
        log({
          event: 'architecture_qa',
          room_id: room.id,
          render_id: renderId,
          accepted: architectureQa.accepted,
          checks: architectureQa.checks,
          issues: architectureQa.issues,
          cost_usd: architectureQa.cost ?? null,
        });
        if (!architectureQa.accepted) {
          const details = architectureQa.issues.slice(0, 3).join('; ') || 'изменились окна, двери или пропорции комнаты';
          const notice = `Архитектура комнаты изменилась: ${details}. ${archQaEnforce ? 'Кредит возвращён — попробуйте другое фото или ракурс.' : 'Проверьте перед реализацией.'}`;
          if (archQaEnforce) {
            const qaTotalCost = sumCostBreakdown();
            await q.setRenderMeta(renderId, { ...meta, model, cost_usd: qaTotalCost, cost_breakdown: costBreakdown, architecture_qa: architectureQa });
            const rejected = await q.setRenderRejected(notice, renderKey, qaTotalCost, model, render.id, 'architecture_qa', claimedBy);
            if (!rejected) {
              log({ event: 'render_lease_lost', room_id: room.id, render_id: renderId, stage: 'architecture_qa' });
              return;
            }
            await q.setRoomNotice(notice, room.id);
            const restored = await restoreCreditForRender(renderId, 'architecture_rejected');
            log({ event: 'architecture_rejected', room_id: room.id, render_id: renderId, checks: architectureQa.checks, issues: architectureQa.issues, cost_usd: qaTotalCost, credit_restored: restored, ms: Date.now() - t0 });
            return;
          }
          await q.setRoomNotice(notice, room.id);
        }
      } catch (e) {
        log({ event: 'architecture_qa_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
      }
    }

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
        const rejected = await q.setRenderRejected(notice, renderKey, qaTotalCost, model, render.id, 'product_qa', claimedBy);
        if (!rejected) {
          log({ event: 'render_lease_lost', room_id: room.id, render_id: renderId, stage: 'product_qa' });
          return;
        }
        await q.setRoomNotice(notice, room.id);
        const restored = await restoreCreditForRender(renderId, 'product_qa_rejected');
        log({ event: 'product_qa_rejected', room_id: room.id, render_id: renderId, product_id: editProduct.id, status: productQa.status, checks: productQa.checks, cost_usd: qaTotalCost, credit_restored: restored, ms: Date.now() - t0 });
        return;
      }
      log({ event: 'product_qa_done', room_id: room.id, render_id: renderId, product_id: editProduct.id, status: productQa.status, checks: productQa.checks, cost_usd: productQa.cost ?? null });
    }

    // Картинку показываем сразу после QA: разбор «архитектора» не должен
    // задерживать первый результат. ANALYZE_BEFORE_DONE=1 возвращает старое поведение.
    const analyzeBeforeDone = /^(1|true|yes|on)$/i.test(String(process.env.ANALYZE_BEFORE_DONE || ''));
    let completedEarly = false;
    if (!analyzeBeforeDone) {
      await q.setRenderAnalysis(renderId, {
        ...(render.analysis || {}),
        visible: [],
        architect: { status: 'pending', render_id: renderId },
      });
      const earlyCost = sumCostBreakdown();
      const earlyDone = await q.setRenderDone(renderKey, earlyCost, model, render.id, claimedBy);
      if (!earlyDone) {
        log({ event: 'render_lease_lost', room_id: room.id, render_id: renderId, stage: 'early_done' });
        return;
      }
      completedEarly = true;
      await q.setRoomStatus('done', room.id);
      await q.setRenderMeta(renderId, { ...meta, model, cost_usd: earlyCost, cost_breakdown: costBreakdown });
      await q.setRenderCostFinalized(renderId, cost);
      log({ event: 'render_done_early', room_id: room.id, render_id: renderId, cost_usd: earlyCost, ms: Date.now() - t0 });
      if (room.user_id && !render.parent_render_id) notifyOwner(room, render);
    }

    // Один разбор архитектора вместо parseRender + matchCatalog + buildAnalysis + architecture QA.
    stage = 'matching';
    await q.setRoomStatus(completedEarly ? 'done' : 'matching', room.id);
    let parsed = { items: [], surfaces: [], visible: [], electrical: [] };
    let visionCost = null;
    // Разбор интерьера запускается кнопкой (POST /api/renders/:id/breakdown).
    const architectOnDemand = !/^(0|false|no|off)$/i.test(String(process.env.ARCHITECT_ON_DEMAND ?? 'true'));
    if (!MOCK_MODE && !architectOnDemand) {
      try {
        parsed = await parseRender(bytes.toString('base64'), MIME_BY_EXT[ext] || 'image/jpeg');
        visionCost = parsed.cost;
        addCost('render_analysis', visionCost);
        log({ event: 'render_analysis_fallback', room_id: room.id, render_id: renderId, items: parsed.items.length, surfaces: parsed.surfaces.length, visible: parsed.visible.length });
      } catch (e) {
        log({ event: 'render_analysis_error', room_id: room.id, render_id: renderId, error: String(e.message || e).slice(0, 300) });
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
      style: styleName,
    });
    if (!MOCK_MODE) {
      // on-demand: разбор ещё не запускали, это не ошибка.
      analysis.architect = { status: architectOnDemand ? 'pending' : 'failed', render_id: renderId, changes: [], items: [], hints: [] };
    }
    await q.setRenderAnalysis(renderId, analysis);
    log({ event: 'render_analyzed', room_id: room.id, render_id: renderId, items: parsed.items.length, suggestions: analysis.suggestions.length });

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

    if (!completedEarly) {
      const done = await q.setRenderDone(renderKey, totalCost, model, render.id, claimedBy);
      if (!done) {
        log({ event: 'render_lease_lost', room_id: room.id, render_id: renderId, stage: 'done' });
        return;
      }
      await q.setRoomStatus('done', room.id);
      log({ event: 'render_done', room_id: room.id, render_id: renderId, cost_usd: totalCost, cost_breakdown: costBreakdown, cost_image_usd: cost ?? null, cost_product_qa_usd: productQa?.cost ?? null, cost_vision_usd: visionCost ?? null, ms: Date.now() - t0 });

      // Уведомление «Готово» по e-mail: только для базового рендера (не правок),
      // fire-and-forget, ошибки не влияют на результат рендера.
      if (room.user_id && !render.parent_render_id) notifyOwner(room, render);
    }
  } catch (e) {
    const rawMsg = String(e.message || e).slice(0, 500);
    const msg = friendlyRenderError(rawMsg);
    addCost('failed', e.cost);
    const errorCost = sumCostBreakdown();
    const marked = await q.setRenderError(msg, renderId, stage, errorCost, claimedBy);
    if (!marked) {
      log({ event: 'render_lease_lost', room_id: room.id, render_id: renderId, stage: 'error' });
      return;
    }
    const hasDoneSibling = await q.roomHasDoneRender(room.id);
    const roomNext = roomStatusAfterFailure({ roomStatus: room.status, hasDoneSibling, iteration });
    if (roomNext === 'error') await q.setRoomError(msg, room.id);
    else if (roomNext === 'done') await q.setRoomStatus('done', room.id);
    try {
      const restored = await restoreCreditForRender(renderId, `render_error:${stage}`);
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, raw_error: rawMsg, cost_usd: errorCost, cost_breakdown: costBreakdown, credit_restored: restored, ms: Date.now() - t0 });
    } catch (restoreError) {
      log({ event: 'render_error', room_id: room.id, render_id: renderId, stage, error: msg, raw_error: rawMsg, cost_usd: errorCost, cost_breakdown: costBreakdown, credit_restore_error: String(restoreError.message || restoreError).slice(0, 300), ms: Date.now() - t0 });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Уведомление «Готово»: ищем e-mail владельца комнаты и шлём письмо со ссылкой на результат.
// Fire-and-forget — не блокирует завершение рендера; ошибки только пишутся в лог.
// Для приватных рендеров (is_private) публичный share-токен не создаём — письмо без ссылки.
function notifyOwner(room, render) {
  void (async () => {
    try {
      const user = await q.getUserById(room.user_id);
      if (!user || !user.email) return;
      let shareUrl = null;
      if (!render.is_private) {
        try {
          const token = render.share_token || crypto.randomBytes(18).toString('base64url');
          if (!render.share_token) await q.setRenderShareToken(render.id, token);
          shareUrl = renderShareUrl(token);
        } catch { /* ссылка не критична — письмо уйдёт без неё */ }
      }
      await sendRenderDoneEmail(user.email, {
        roomType: room.room_type || null,
        style: render.style || room.style || null,
        shareUrl,
      }, { room_id: room.id, render_id: render.id });
    } catch (e) {
      log({ event: 'email_error', room_id: room.id, render_id: render.id, error: String(e.message || e).slice(0, 300) });
    }
  })();
}

let running = 0;
const MAX_RUNNING = workerConcurrency();
export function startWorker() {
  q.requeueProcessing().then(n => { if (n) console.log(`[worker] вернул в очередь ${n} прерванных рендеров`); });

  setInterval(async () => {
    try {
      // Просроченные lease возвращаем в очередь; живые (вторая реплика) не трогаем.
      const requeued = await q.requeueProcessing();
      if (requeued) log({ event: 'render_lease_requeued', count: requeued });
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
    if (running >= MAX_RUNNING) return;
    try {
      const row = await q.claimNextRender();
      if (!row) return;
      running++;
      try { await processRender(row.id, row.claimed_by); } finally { running--; }
    } catch (e) {
      log({ event: 'worker_error', error: String(e.message || e).slice(0, 300) });
    }
  }, 2000);
  console.log(`[worker] запущен, режим: ${MOCK_MODE ? 'MOCK (без OPENROUTER_API_KEY)' : 'LIVE'}, concurrency: ${MAX_RUNNING}`);
}

export async function enqueueRender({ roomId, parentRenderId = null, requestText = null, chargedUserId = null, requestIp = null, editTarget = null, refPath = null, refProductId = null, editRefs = null, modelKey = null, modelCredits = 1, isPrivate = false, editSourcePath = null, editMove = null, style = null, concept = null, resolution = null, batchId = null }) {
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
    modelKey,
    modelCredits,
    isPrivate,
    editSourcePath,
    editMove,
    style,
    concept,
    resolution,
    batchId,
  });
  return id;
}

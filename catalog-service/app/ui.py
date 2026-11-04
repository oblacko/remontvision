"""Страница ручного тестирования: сегментация, сетка и поиск (localhost)."""

INDEX_HTML = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Catalog Service — тест поиска</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7f9; color: #1a1a1a; }
  header { padding: 16px 20px; background: #111; color: #fff; }
  header h1 { margin: 0; font-size: 18px; }
  header small { color: #aaa; }
  main { max-width: 1100px; margin: 0 auto; padding: 20px; }
  .panel { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #555; }
  input, select { padding: 8px; border: 1px solid #cdd2d8; border-radius: 8px; font-size: 14px; }
  input[type=file] { padding: 6px; }
  button { padding: 9px 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-size: 14px; cursor: pointer; }
  button.ghost { background: #eef2ff; color: #3730a3; }
  .tab { padding: 8px 14px; border: 1px solid #cdd2d8; background: #fff; color: #333; border-radius: 8px; margin-right: 8px; cursor: pointer; font-size: 13px; }
  .tab.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  .vision-item { background:#fff; border:1px solid #e3e6ea; border-radius:10px; padding:12px; margin-bottom:14px; }
  .vision-head { display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; }
  .vision-head img { width:120px; height:120px; object-fit:cover; border-radius:8px; background:#eee; }
  .mini-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
  button:disabled { opacity: .5; cursor: default; }
  .hint { color: #777; font-size: 12px; margin-top: 8px; }
  #status { margin: 10px 0; font-size: 13px; color: #555; }
  .stage-wrap { margin-top: 14px; display: none; }
  #stage { position: relative; display: inline-block; max-width: 100%; line-height: 0; touch-action: none; }
  #qimg { max-width: 100%; max-height: 55vh; display: block; user-select: none; -webkit-user-drag: none; cursor: crosshair; }
  #selBox { position: absolute; border: 2px solid #2563eb; background: rgba(37,99,235,.15); display: none; pointer-events: none; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .card.piece { cursor: pointer; }
  .card.piece.selected { outline: 3px solid #2563eb; }
  .thumb { aspect-ratio: 1/1; background: #eee; display: flex; align-items: center; justify-content: center; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .body { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .name { font-size: 13px; font-weight: 600; line-height: 1.3; }
  .meta { font-size: 12px; color: #666; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .price { font-weight: 700; }
  .badge { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
  .erid { font-size: 10px; color: #999; }
  a.buy { margin-top: auto; color: #2563eb; font-size: 13px; text-decoration: none; }
  h2 { font-size: 15px; margin: 18px 0 8px; }
</style>
</head>
<body>
<header>
  <h1>Catalog Service — тест поиска</h1>
  <small>DINOv2 + pgvector. Сегментация / сетка → выбрать → искать.</small>
</header>
<main>
  <div class="panel">
    <div class="row">
      <label>Токен<input id="token" value="change-me" style="width:140px" /></label>
      <label>Картинка<input id="file" type="file" accept="image/*" /></label>
      <label>Категория
        <select id="category">
          <option value="">все</option>
        </select>
      </label>
      <label>Цена от<input id="pmin" type="number" style="width:90px" /></label>
      <label>Цена до<input id="pmax" type="number" style="width:90px" /></label>
      <label>Top-K<input id="topk" type="number" value="12" min="1" max="100" style="width:65px" /></label>
      <label>Ключевые слова<input id="textQuery" placeholder="тумба на ножках дуб" style="width:220px" /></label>
    </div>
    <div class="row" style="margin-top:12px">
      <button id="head">Контур (DINOv2)</button>
      <button id="seg">Маски (DINOv2)</button>
      <button id="gridai">Сетка (ИИ)</button>
      <button id="vision">Vision (список)</button>
      <button id="go">Искать</button>
      <button id="textGo" class="ghost">Искать по тексту</button>
      <button id="clearSel" class="ghost" style="display:none">Сбросить область</button>
    </div>
    <div class="hint">Загрузи фото → «Контур (DINOv2)» (клик по объекту на разметке), «Маски (DINOv2)» или «Сетка (ИИ)» → клик по миниатюре запускает поиск. Либо выдели область мышью и нажми «Искать».</div>

    <div id="stageWrap" class="stage-wrap">
      <div class="hint" id="selInfo">Область не выбрана — ищем по всей картинке.</div>
      <div id="stage">
        <img id="qimg" alt="query" />
        <div id="selBox"></div>
      </div>
    </div>
    <div id="overlayWrap" class="stage-wrap">
      <div class="hint">Разметка DINOv2: кликни по объекту — вырежу по контуру и найду.</div>
      <img id="overlay" alt="segmentation" style="max-width:100%; max-height:60vh; border-radius:8px; cursor:crosshair; display:block" />
    </div>
    <div id="status"></div>
    <div id="queryInfo" class="hint"></div>
  </div>

  <div id="piecesWrap" style="display:none">
    <h2 id="piecesTitle">Части</h2>
    <div class="hint" id="piecesInfo"></div>
    <div id="pieces" class="grid"></div>
  </div>

  <div id="tabs" style="display:none; margin:16px 0 8px">
    <button class="tab active" id="tabHybrid">Гибридный (<span id="countHybrid">0</span>)</button>
    <button class="tab" id="tabText">Ключевые слова / атрибуты (<span id="countText">0</span>)</button>
  </div>
  <h2 id="resultsTitle" style="display:none">Результаты поиска</h2>
  <div id="results" class="grid"></div>
  <div id="resultsText" class="grid" style="display:none"></div>

  <div id="visionWrap" style="display:none; margin-top:24px">
    <h2>Что увидел ИИ (Gemini 3.1 Pro)</h2>
    <div id="visionRoom" class="panel" style="font-size:13px"></div>
    <div class="row" style="margin:0 0 12px">
      <button id="visionGrid">Сделать сетку по этому списку</button>
    </div>
    <div id="visionList"></div>
  </div>
</main>
<script>
const $ = id => document.getElementById(id);
const money = v => v == null ? '—' : new Intl.NumberFormat('ru-RU').format(v) + ' ₽';

async function loadCategories() {
  try {
    const token = $('token').value.trim();
    const r = await fetch('/categories', { headers: { 'x-catalog-token': token } });
    if (!r.ok) return;
    const list = await r.json();
    $('category').innerHTML = '<option value="">все</option>' +
      list.map(c => `<option value="${c.key}">${c.label} (${c.key})</option>`).join('');
  } catch (e) { /* ignore */ }
}
loadCategories();

let selection = null;
let pieceB64 = null;
let pieceLabel = null;
let pieceProduct = null;
let dragging = false;
let startX = 0, startY = 0;

function imgRect() { return $('qimg').getBoundingClientRect(); }

function resetSelection() {
  selection = null;
  $('selBox').style.display = 'none';
  $('clearSel').style.display = 'none';
  $('selInfo').textContent = 'Область не выбрана — ищем по всей картинке.';
}

function resetPieces() {
  pieceB64 = null;
  pieceLabel = null;
  pieceProduct = null;
  $('pieces').innerHTML = '';
  $('piecesWrap').style.display = 'none';
}

function resetOverlay() {
  $('overlay').src = '';
  $('overlayWrap').style.display = 'none';
}

function drawBox(x, y, w, h) {
  const b = $('selBox');
  b.style.left = Math.min(x, x + w) + 'px';
  b.style.top = Math.min(y, y + h) + 'px';
  b.style.width = Math.abs(w) + 'px';
  b.style.height = Math.abs(h) + 'px';
  b.style.display = 'block';
}

function clamp(v, max) { return Math.max(0, Math.min(v, max)); }

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  if (!file) return;
  resetSelection();
  resetPieces();
  resetOverlay();
  const img = $('qimg');
  img.onload = () => { $('stageWrap').style.display = 'block'; };
  img.src = URL.createObjectURL(file);
});

$('clearSel').addEventListener('click', resetSelection);

$('qimg').addEventListener('pointerdown', e => {
  const r = imgRect();
  dragging = true;
  startX = clamp(e.clientX - r.left, r.width);
  startY = clamp(e.clientY - r.top, r.height);
  $('qimg').setPointerCapture(e.pointerId);
  drawBox(startX, startY, 0, 0);
  e.preventDefault();
});

$('qimg').addEventListener('pointermove', e => {
  if (!dragging) return;
  const r = imgRect();
  const cx = clamp(e.clientX - r.left, r.width);
  const cy = clamp(e.clientY - r.top, r.height);
  drawBox(startX, startY, cx - startX, cy - startY);
});

$('qimg').addEventListener('pointerup', e => {
  if (!dragging) return;
  dragging = false;
  const r = imgRect();
  const cx = clamp(e.clientX - r.left, r.width);
  const cy = clamp(e.clientY - r.top, r.height);
  const dx = Math.abs(cx - startX), dy = Math.abs(cy - startY);
  if (dx < 6 || dy < 6) { resetSelection(); return; }
  const x = Math.min(startX, cx), y = Math.min(startY, cy);
  const sx = $('qimg').naturalWidth / r.width;
  const sy = $('qimg').naturalHeight / r.height;
  selection = { x: x * sx, y: y * sy, w: dx * sx, h: dy * sy };
  pieceB64 = null; pieceLabel = null; pieceProduct = null;
  document.querySelectorAll('.card.piece.selected').forEach(el => el.classList.remove('selected'));
  $('clearSel').style.display = 'inline-block';
  $('selInfo').textContent = 'Область: ' + Math.round(selection.w) + '×' + Math.round(selection.h) + ' px';
});

window.addEventListener('resize', resetSelection);

function cropBase64() {
  const img = $('qimg');
  const c = document.createElement('canvas');
  if (selection) {
    c.width = Math.max(1, Math.round(selection.w));
    c.height = Math.max(1, Math.round(selection.h));
    c.getContext('2d').drawImage(img, selection.x, selection.y, selection.w, selection.h, 0, 0, c.width, c.height);
  } else {
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
  }
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
}

function attrsText(p) {
  if (!p) return '';
  return [p.category, p.color, p.material, p.product_type, p.size].filter(Boolean).join(' · ');
}

function renderPieces(items, title) {
  $('piecesTitle').textContent = title;
  $('piecesInfo').textContent = 'Найдено: ' + items.length + '. Клик по миниатюре → сразу поиск (категория → вектор).';
  $('pieces').innerHTML = items.map((it, i) => `
    <div class="card piece" data-i="${i}">
      <div class="thumb"><img src="data:image/jpeg;base64,${it.thumb_b64}" alt="" /></div>
      <div class="body">
        <div class="name">${it.label}</div>
        <div class="meta">${attrsText(it.product) || 'без атрибутов'}</div>
      </div>
    </div>`).join('');
  $('piecesWrap').style.display = 'block';
  $('pieces').querySelectorAll('.card.piece').forEach(el => {
    el.addEventListener('click', () => {
      const it = items[Number(el.dataset.i)];
      pieceB64 = it.thumb_b64;
      pieceLabel = it.label;
      pieceProduct = it.product || null;
      selection = null;
      $('selBox').style.display = 'none';
      $('clearSel').style.display = 'none';
      $('pieces').querySelectorAll('.card.piece.selected').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      if (it.product) {
        $('queryInfo').textContent = 'Vision: ' + attrsText(it.product) +
          ' → сначала фильтр по категории, затем вектор';
      }
      $('status').textContent = 'Выбрано: ' + it.label + ' — ищу…';
      runSearch();
    });
  });
}

async function analyze(kind) {
  const file = $('file').files[0];
  if (!file) { $('status').textContent = 'Выберите картинку'; return; }
  const token = $('token').value.trim();
  const base = await readFile(file);
  $('status').textContent = kind === 'gridai'
    ? 'Генерирую AI-сетку 2×5 (vision + FLUX, может занять до минуты)…'
    : 'Считаю DINOv2-маски…';
  ['seg', 'gridai'].forEach(id => { $(id).disabled = true; });
  try {
    let url, body, title;
    if (kind === 'gridai') {
      url = '/grid-ai';
      body = { image_b64: base };
      title = 'AI-сетка (10 товаров)';
    } else {
      url = '/segment';
      body = { image_b64: base, k: 10 };
      title = 'Маски DINOv2';
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    renderPieces(data.items || [], title);
    $('status').textContent = title + ': ' + (data.items || []).length +
      '. Нажми на миниатюру, затем «Искать».';
  } catch (e) {
    $('status').textContent = 'Ошибка: ' + e.message;
  } finally {
    ['seg', 'gridai'].forEach(id => { $(id).disabled = false; });
  }
}

$('seg').addEventListener('click', () => analyze('segment'));
$('gridai').addEventListener('click', () => analyze('gridai'));

async function analyzeHead() {
  const file = $('file').files[0];
  if (!file) { $('status').textContent = 'Выберите картинку'; return; }
  const token = $('token').value.trim();
  const base = await readFile(file);
  $('status').textContent = 'Сегментирую головой DINOv2…';
  $('head').disabled = true;
  try {
    const r = await fetch('/segment-head', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({ image_b64: base, max_items: 15 }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    $('overlay').src = 'data:image/png;base64,' + data.overlay_b64;
    $('overlayWrap').style.display = 'block';
    const items = (data.items || []).map(it => ({
      ...it,
      product: { category: it.category, label: it.class_name },
    }));
    renderPieces(items, 'Контуры DINOv2');
    $('status').textContent = 'Контуров: ' + items.length +
      '. Кликни объект на разметке или миниатюру.';
  } catch (e) {
    $('status').textContent = 'Ошибка: ' + e.message;
  } finally {
    $('head').disabled = false;
  }
}

$('head').addEventListener('click', analyzeHead);

$('overlay').addEventListener('click', async (e) => {
  const file = $('file').files[0];
  if (!file) return;
  const token = $('token').value.trim();
  const rect = $('overlay').getBoundingClientRect();
  const x = (e.clientX - rect.left) / Math.max(1, rect.width);
  const y = (e.clientY - rect.top) / Math.max(1, rect.height);
  const base = await readFile(file);
  $('status').textContent = 'Вырезаю по контуру…';
  try {
    const r = await fetch('/mask-at', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({ image_b64: base, x, y }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    pieceB64 = data.thumb_b64;
    pieceLabel = data.label;
    pieceProduct = { category: data.category, label: data.class_name };
    selection = null;
    $('selBox').style.display = 'none';
    $('clearSel').style.display = 'none';
    $('queryInfo').textContent = 'Vision (голова): ' + data.label +
      ' → фильтр по категории, затем вектор';
    $('status').textContent = 'Вырезано: ' + data.label + ' — ищу…';
    runSearch();
  } catch (e) {
    $('status').textContent = 'Ошибка: ' + e.message;
  }
});

function renderCards(container, results) {
  container.innerHTML = results.map(x => `
    <div class="card">
      <div class="thumb">${x.picture_url ? `<img src="${x.picture_url}" alt="" loading="lazy" />` : ''}</div>
      <div class="body">
        <div class="name">${x.name ?? ''}</div>
        <div class="meta">
          <span class="badge">${x.category ?? '—'}</span>
          <span>${(x.score * 100).toFixed(1)}%</span>
          <span>${x.availability === 'in_stock' ? 'в наличии' : x.availability ?? ''}</span>
          ${x.category_fallback ? '<span class="badge">категория не совпала</span>' : ''}
        </div>
        <div class="price">${money(x.price)}</div>
        <div class="meta">${x.merchant ?? ''}</div>
        ${x.erid ? `<div class="erid">реклама · erid ${x.erid}</div>` : ''}
        <a class="buy" href="${x.affiliate_url || x.canonical_url || '#'}" target="_blank" rel="noopener nofollow sponsored">Открыть →</a>
      </div>
    </div>`).join('') || '<div class="hint">Ничего не найдено</div>';
}

function showTab(tab) {
  const hybrid = tab === 'hybrid';
  $('tabHybrid').classList.toggle('active', hybrid);
  $('tabText').classList.toggle('active', !hybrid);
  $('results').style.display = hybrid ? '' : 'none';
  $('resultsText').style.display = hybrid ? 'none' : '';
}

$('tabHybrid').addEventListener('click', () => showTab('hybrid'));
$('tabText').addEventListener('click', () => showTab('text'));

function currentFilters() {
  const filters = {};
  const cat = $('category').value || (pieceProduct && pieceProduct.category) || '';
  if (cat) filters.categories = [cat];
  if ($('pmin').value) filters.price_min = Number($('pmin').value);
  if ($('pmax').value) filters.price_max = Number($('pmax').value);
  return filters;
}

function currentTextQuery() {
  return $('textQuery').value.trim() ||
    (pieceProduct && (pieceProduct.search_query || pieceProduct.label)) || '';
}

async function runSearch() {
  const file = $('file').files[0];
  const token = $('token').value.trim();
  const filters = currentFilters();
  const textQuery = currentTextQuery();
  if (!file && !textQuery) {
    $('status').textContent = 'Выберите картинку или введите ключевые слова';
    return;
  }
  $('go').disabled = $('textGo').disabled = true;
  $('status').textContent = 'Ищу…';
  $('results').innerHTML = '';
  $('resultsText').innerHTML = '';
  const t0 = performance.now();
  let hybridResults = [];
  let textResults = [];
  const tasks = [];
  if (file) {
    tasks.push(fetch('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({
        image_b64: pieceB64 || cropBase64(),
        filters,
        product: pieceProduct || undefined,
        top_k: Number($('topk').value) || 12,
        min_score: 0,
      }),
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
      hybridResults = data.results || [];
    }));
  }
  if (textQuery || pieceProduct || Object.keys(filters).length) {
    tasks.push(fetch('/search-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({
        query: textQuery,
        filters,
        product: pieceProduct || undefined,
        top_k: Number($('topk').value) || 12,
      }),
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
      textResults = data.results || [];
    }));
  }
  try {
    const settled = await Promise.allSettled(tasks);
    const errors = settled.filter(s => s.status === 'rejected').map(s => s.reason.message);
    const ms = Math.round(performance.now() - t0);
    renderCards($('results'), hybridResults);
    renderCards($('resultsText'), textResults);
    $('countHybrid').textContent = hybridResults.length;
    $('countText').textContent = textResults.length;
    $('tabs').style.display = 'block';
    const src = pieceB64
      ? ('по «' + pieceLabel + '»')
      : (file ? (selection ? 'по выделенной области' : 'по всей картинке') : 'по тексту');
    $('status').textContent = 'Гибрид: ' + hybridResults.length +
      ' · Ключевые слова: ' + textResults.length + ' за ' + ms + ' мс (' + src + ')' +
      (errors.length ? ' · ошибки: ' + errors.join('; ') : '');
    const p = pieceProduct || {};
    const parts = [];
    if (filters.categories) parts.push('категория: ' + filters.categories.join(', '));
    if (p.label) parts.push('объект: ' + p.label);
    if (p.color) parts.push('цвет: ' + p.color);
    if (p.material) parts.push('материал: ' + p.material);
    if (p.product_type) parts.push('тип: ' + p.product_type);
    if (textQuery) parts.push('слова: ' + textQuery);
    $('queryInfo').textContent = 'Что искали — ' + (parts.join(' · ') || 'без атрибутов');
    $('resultsTitle').style.display = 'block';
    $('resultsTitle').textContent = 'Результаты поиска';
    showTab(hybridResults.length || !textResults.length ? 'hybrid' : 'text');
    $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    $('status').textContent = 'Ошибка поиска: ' + e.message;
  } finally {
    $('go').disabled = $('textGo').disabled = false;
  }
}

async function runTextSearch() {
  const token = $('token').value.trim();
  const textQuery = currentTextQuery();
  if (!textQuery) { $('status').textContent = 'Введите ключевые слова'; return; }
  $('textGo').disabled = true;
  $('status').textContent = 'Ищу по ключевым словам…';
  try {
    const r = await fetch('/search-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({
        query: textQuery,
        filters: currentFilters(),
        product: pieceProduct || undefined,
        top_k: Number($('topk').value) || 12,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    const results = data.results || [];
    renderCards($('resultsText'), results);
    $('countText').textContent = results.length;
    $('tabs').style.display = 'block';
    $('resultsTitle').style.display = 'block';
    $('resultsTitle').textContent = 'Результаты поиска';
    $('status').textContent = 'Ключевые слова: ' + results.length;
    showTab('text');
    $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    $('status').textContent = 'Ошибка поиска: ' + e.message;
  } finally {
    $('textGo').disabled = false;
  }
}

let lastVisionObjects = null;
let lastImageB64 = null;

async function runVision() {
  const file = $('file').files[0];
  if (!file) { $('status').textContent = 'Выберите картинку'; return; }
  const token = $('token').value.trim();
  const base = await readFile(file);
  $('vision').disabled = true;
  $('status').textContent = 'Смотрю фото (Gemini 3.1 Pro)…';
  try {
    const r = await fetch('/vision-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({ image_b64: base, top_k: Number($('topk').value) || 5 }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    lastImageB64 = base;
    lastVisionObjects = (data.items || []).map(it => it.object);
    renderVision(data);
    $('status').textContent = 'Vision: ' + lastVisionObjects.length + ' товаров';
  } catch (e) {
    $('status').textContent = 'Ошибка vision: ' + e.message;
  } finally {
    $('vision').disabled = false;
  }
}

function renderVision(data) {
  const room = data.room || {};
  const walls = room.walls || {};
  const floor = room.floor || {};
  const ceiling = room.ceiling || {};
  const parts = [];
  if (room.type) parts.push('Тип: ' + room.type);
  if (room.style) parts.push('Стиль: ' + room.style);
  if (room.lighting) parts.push('Свет: ' + room.lighting);
  const fmt = (o) => [o.color, o.material, o.pattern, o.description].filter(Boolean).join(', ') || 'не описано';
  parts.push('Стены: ' + fmt(walls));
  parts.push('Пол: ' + fmt(floor));
  parts.push('Потолок: ' + fmt(ceiling));
  $('visionRoom').innerHTML = parts.map(p => `<div>${p}</div>`).join('');
  $('visionList').innerHTML = (data.items || []).map((it, i) => {
    const o = it.object || {};
    const attrs = [o.category, o.color, o.material, o.product_type, o.size].filter(Boolean).join(' · ');
    const results = (it.results || []).map(x => `
      <div class="card">
        <div class="thumb">${x.picture_url ? `<img src="${x.picture_url}" alt="" loading="lazy" />` : ''}</div>
        <div class="body">
          <div class="name">${x.name ?? ''}</div>
          <div class="meta"><span class="badge">${x.category ?? '—'}</span><span>${(x.score * 100).toFixed(0)}%</span></div>
          <div class="price">${money(x.price)}</div>
          <a class="buy" href="${x.affiliate_url || x.canonical_url || '#'}" target="_blank" rel="noopener nofollow sponsored">Открыть →</a>
        </div>
      </div>`).join('') || `<div class="hint">${it.note || 'Нет совпадений'}</div>`;
    return `<div class="vision-item">
      <div class="vision-head">
        ${it.thumb_b64 ? `<img src="data:image/jpeg;base64,${it.thumb_b64}" alt="" />` : ''}
        <div>
          <div class="name">${i + 1}. ${o.label || 'товар'}</div>
          <div class="meta">${attrs}</div>
          <div class="hint">${o.description || ''}</div>
        </div>
      </div>
      <div class="mini-grid">${results}</div>
    </div>`;
  }).join('') || '<div class="hint">Vision не вернул товары</div>';
  $('visionWrap').style.display = 'block';
  $('visionWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('vision').addEventListener('click', runVision);

$('visionGrid').addEventListener('click', async () => {
  if (!lastVisionObjects || !lastImageB64) {
    $('status').textContent = 'Сначала нажми Vision (список)';
    return;
  }
  const token = $('token').value.trim();
  $('visionGrid').disabled = true;
  $('status').textContent = 'Строю сетку по списку vision…';
  try {
    const r = await fetch('/grid-ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({ image_b64: lastImageB64, objects: lastVisionObjects, verify: true }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    renderPieces(data.items || [], 'Сетка по списку vision');
    $('status').textContent = 'Ячеек: ' + (data.items || []).length;
  } catch (e) {
    $('status').textContent = 'Ошибка сетки: ' + e.message;
  } finally {
    $('visionGrid').disabled = false;
  }
});

$('go').addEventListener('click', () => runSearch());
$('textGo').addEventListener('click', () => runTextSearch());
</script>
</body>
</html>
"""

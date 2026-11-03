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
          <option>bed</option><option>sofa</option><option>armchair</option>
          <option>wardrobe</option><option>dining_table</option><option>dining_chair</option>
          <option>coffee_table</option><option>sideboard</option><option>storage</option>
          <option>bench</option><option>desk</option><option>office_chair</option>
          <option>rug</option><option>light</option><option>textile</option>
        </select>
      </label>
      <label>Цена от<input id="pmin" type="number" style="width:90px" /></label>
      <label>Цена до<input id="pmax" type="number" style="width:90px" /></label>
      <label>Top-K<input id="topk" type="number" value="12" min="1" max="100" style="width:65px" /></label>
    </div>
    <div class="row" style="margin-top:12px">
      <button id="seg">Маски (DINOv2)</button>
      <button id="gridai">Сетка (ИИ)</button>
      <button id="go">Искать</button>
      <button id="clearSel" class="ghost" style="display:none">Сбросить область</button>
    </div>
    <div class="hint">Загрузи фото → «Маски (DINOv2)» или «Сетка (ИИ)» → клик по миниатюре сразу запускает поиск. Либо выдели область мышью и нажми «Искать».</div>

    <div id="stageWrap" class="stage-wrap">
      <div class="hint" id="selInfo">Область не выбрана — ищем по всей картинке.</div>
      <div id="stage">
        <img id="qimg" alt="query" />
        <div id="selBox"></div>
      </div>
    </div>
    <div id="status"></div>
  </div>

  <div id="piecesWrap" style="display:none">
    <h2 id="piecesTitle">Части</h2>
    <div class="hint" id="piecesInfo"></div>
    <div id="pieces" class="grid"></div>
  </div>

  <h2 id="resultsTitle" style="display:none">Результаты поиска</h2>
  <div id="results" class="grid"></div>
</main>
<script>
const $ = id => document.getElementById(id);
const money = v => v == null ? '—' : new Intl.NumberFormat('ru-RU').format(v) + ' ₽';

let selection = null;
let pieceB64 = null;
let pieceLabel = null;
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
  $('pieces').innerHTML = '';
  $('piecesWrap').style.display = 'none';
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
  pieceB64 = null; pieceLabel = null;
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

function renderPieces(items, title) {
  $('piecesTitle').textContent = title;
  $('piecesInfo').textContent = 'Найдено: ' + items.length + '. Клик по миниатюре → сразу поиск.';
  $('pieces').innerHTML = items.map((it, i) => `
    <div class="card piece" data-i="${i}">
      <div class="thumb"><img src="data:image/jpeg;base64,${it.thumb_b64}" alt="" /></div>
      <div class="body"><div class="name">${it.label}</div></div>
    </div>`).join('');
  $('piecesWrap').style.display = 'block';
  $('pieces').querySelectorAll('.card.piece').forEach(el => {
    el.addEventListener('click', () => {
      const it = items[Number(el.dataset.i)];
      pieceB64 = it.thumb_b64;
      pieceLabel = it.label;
      selection = null;
      $('selBox').style.display = 'none';
      $('clearSel').style.display = 'none';
      $('pieces').querySelectorAll('.card.piece.selected').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
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

async function runSearch() {
  const file = $('file').files[0];
  if (!file) { $('status').textContent = 'Выберите картинку'; return; }
  const token = $('token').value.trim();
  $('go').disabled = true;
  $('status').textContent = 'Ищу…';
  $('results').innerHTML = '';
  const t0 = performance.now();
  try {
    const image_b64 = pieceB64 || cropBase64();
    const filters = {};
    if ($('category').value) filters.categories = [$('category').value];
    if ($('pmin').value) filters.price_min = Number($('pmin').value);
    if ($('pmax').value) filters.price_max = Number($('pmax').value);
    const r = await fetch('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-catalog-token': token },
      body: JSON.stringify({ image_b64, filters, top_k: Number($('topk').value) || 12, min_score: 0 }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
    const results = data.results || [];
    const ms = Math.round(performance.now() - t0);
    const src = pieceB64 ? ('по «' + pieceLabel + '»') : (selection ? 'по выделенной области' : 'по всей картинке');
    $('status').textContent = 'Найдено: ' + results.length + ' за ' + ms + ' мс (' + src + ')';
    $('resultsTitle').style.display = 'block';
    $('resultsTitle').textContent = 'Результаты поиска: ' + results.length + ' (' + src + ')';
    $('resultsTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('results').innerHTML = results.map(x => `
      <div class="card">
        <div class="thumb">${x.picture_url ? `<img src="${x.picture_url}" alt="" loading="lazy" />` : ''}</div>
        <div class="body">
          <div class="name">${x.name ?? ''}</div>
          <div class="meta">
            <span class="badge">${x.category ?? '—'}</span>
            <span>${(x.score * 100).toFixed(1)}%</span>
            <span>${x.availability === 'in_stock' ? 'в наличии' : x.availability ?? ''}</span>
          </div>
          <div class="price">${money(x.price)}</div>
          <div class="meta">${x.merchant ?? ''}</div>
          ${x.erid ? `<div class="erid">реклама · erid ${x.erid}</div>` : ''}
          <a class="buy" href="${x.affiliate_url || x.canonical_url || '#'}" target="_blank" rel="noopener nofollow sponsored">Открыть →</a>
        </div>
      </div>`).join('');
  } catch (e) {
    $('status').textContent = 'Ошибка поиска: ' + e.message;
    $('resultsTitle').style.display = 'block';
    $('resultsTitle').textContent = 'Результаты поиска';
    $('results').innerHTML = '<div class="hint">Ошибка: ' + e.message + '</div>';
  } finally {
    $('go').disabled = false;
  }
}

$('go').addEventListener('click', () => runSearch());
</script>
</body>
</html>
"""

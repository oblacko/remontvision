// Генератор docs/kit.html из актуального собранного CSS UI-кита.
// Источник классов: web/src/index.css (v2, k-*). CSS берётся из web/dist,
// поэтому документация не расходится с приложением. Запуск: npm run kit:build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'web', 'dist', 'web-assets');

const cssFiles = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).filter(name => name.endsWith('.css'))
  : [];
if (!cssFiles.length) {
  console.error('[kit] нет собранного CSS: сначала `cd web && npm run build`');
  process.exit(1);
}
const cssFile = cssFiles
  .map(name => ({ name, mtime: fs.statSync(path.join(distDir, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0].name;
const css = fs.readFileSync(path.join(distDir, cssFile), 'utf8')
  .replaceAll('/fonts/kit/', '../web/public/fonts/kit/');

const esc = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const ICONS = {
  ur: '<path d="M7 17 17 7M8 7h9v9"/>',
  r: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  l: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  cd: '<path d="m6 9 6 6 6-6"/>',
  cu: '<path d="m6 15 6-6 6 6"/>',
  x: '<path d="M5 5l14 14M19 5 5 19"/>',
  ok: '<path d="m4 12 5 5L20 6"/>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  sh: '<path d="m8.5 11 7-4M8.5 13l7 4"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/>',
  re: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  q: '<circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/>',
  out: '<path d="M10 4H4v16h6M16 8l4 4-4 4M20 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cam: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="3.5"/>',
  img: '<path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4"/>',
  tr: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',
  sp: '<path d="M12 3a9 9 0 0 1 9 9"/>',
};

const icon = (name, size = '') => `<svg viewBox="0 0 24 24" class="kit-icon${size ? ` ${size}` : ''}" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const iconsGrid = Object.keys(ICONS).map(name => `
  <div class="docs-icon">
    ${icon(name)}
    <code>${name}</code>
  </div>`).join('');

const tokens = [
  ['--p-page', 'фон страницы'],
  ['--p-paper', 'карточки, поля'],
  ['--p-paper-deep', 'вторичный фон'],
  ['--p-ink', 'основной текст'],
  ['--p-ink-muted', 'вторичный текст'],
  ['--p-line', 'границы'],
  ['--p-line-strong', 'сильные границы'],
  ['--p-orange', 'акцент'],
  ['--p-orange-text', 'акцентный текст'],
  ['--p-orange-soft', 'подложка акцента'],
  ['--p-danger', 'ошибка'],
].map(([name, label]) => `
  <div class="docs-swatch">
    <span style="background: oklch(var(${name}))"></span>
    <code>${name}</code>
    <small>${label}</small>
  </div>`).join('');

const doc = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ремонтвижн — UI-кит v2</title>
<style>
${css}

/* --- обвязка документации (не входит в приложение) --- */
body { margin: 0; }
.docs-wrap { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; max-width: 1180px; margin: 0 auto; padding: 28px 20px 80px; }
.docs-nav { position: sticky; top: 20px; align-self: start; display: grid; gap: 2px; min-width: 0; }
.docs-main { min-width: 0; }
.docs-nav a { padding: 6px 0; color: oklch(var(--p-ink-muted)); text-decoration: none; font-size: 14px; }
.docs-nav a:hover { color: oklch(var(--p-ink)); }
.docs-head { border-bottom: 1px solid oklch(var(--p-line)); padding-bottom: 24px; margin-bottom: 8px; }
.docs-head h1 { font: 300 clamp(36px, 6vw, 56px)/1 var(--fh); text-transform: uppercase; margin: 8px 0 12px; }
.docs-sec { min-width: 0; border-top: 1px solid oklch(var(--p-line)); padding: 28px 0; }
.docs-sec > h2 { font: 400 22px/1.2 var(--fh); margin: 0 0 6px; }
.docs-sec > p { color: oklch(var(--p-ink-muted)); margin: 0 0 16px; max-width: 70ch; }
.docs-specimen { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 16px; border: 1px dashed oklch(var(--p-line-strong)); margin: 12px 0; }
.docs-specimen--block { display: block; }
.docs-specimen--dark { background: oklch(var(--p-ink)); }
.docs-specimen--orange { background: oklch(var(--p-orange)); }
.docs-specimen--paper { background: oklch(var(--p-paper)); }
.docs-code { background: oklch(var(--p-ink)); color: oklch(var(--p-paper)); padding: 12px 16px; overflow: auto; max-width: 100%; box-sizing: border-box; font: 12px/1.6 var(--fm); margin: 8px 0 0; }
.docs-code code { white-space: pre; }
.docs-stack { display: grid; gap: 4px; }
.docs-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.docs-swatch { border: 1px solid oklch(var(--p-line)); padding: 8px; display: grid; gap: 4px; }
.docs-swatch span { display: block; height: 48px; border: 1px solid oklch(var(--p-line)); }
.docs-swatch code { font-size: 11px; }
.docs-swatch small { color: oklch(var(--p-ink-muted)); font-size: 12px; }
.docs-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.docs-icon { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border: 1px solid oklch(var(--p-line)); }
.docs-icon code { font-size: 11px; }
.docs-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.docs-note { font-size: 13px; color: oklch(var(--p-ink-muted)); }
.docs-type div { margin: 8px 0; }
@media (max-width: 860px) {
  .docs-wrap { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .docs-nav { position: static; display: flex; flex-wrap: wrap; gap: 4px 14px; }
}
</style>
</head>
<body>
<div class="docs-wrap">
  <nav class="docs-nav" aria-label="Разделы кита">
    <a href="#tokens">Токены и типографика</a>
    <a href="#buttons">Кнопки</a>
    <a href="#fields">Поля</a>
    <a href="#choice">Чекбоксы, радио, switch</a>
    <a href="#tabs">Табы</a>
    <a href="#cards">Карточки и плитки</a>
    <a href="#feedback">Обратная связь</a>
    <a href="#badges">Статусы</a>
    <a href="#dropzone">Загрузка</a>
    <a href="#sheet">Шторки</a>
    <a href="#table">Таблицы и цифры</a>
    <a href="#icons">Иконки</a>
    <a href="#patterns">Паттерны</a>
  </nav>

  <main class="docs-main">
    <header class="docs-head">
      <div class="eyebrow">Ремонтвижн · UI-кит v2</div>
      <h1>UI-кит</h1>
      <p>Живой справочник компонентов пользовательских страниц. CSS взят из собранного приложения
      (<code>web/dist/web-assets/${cssFile}</code>), классы — из <code>web/src/index.css</code>.
      Страница пересобирается командой <code>npm run kit:build</code>.</p>
      <p class="docs-note">Обновлено: ${new Date().toISOString().slice(0, 10)}. Иконки — <code>KitIcon</code> (21 шт., штрих 1.5, 20 px).</p>
    </header>

    <section class="docs-sec" id="tokens">
      <h2>Токены и типографика</h2>
      <p>Цвета — OKLCH-токены. В приложении используются через <code>oklch(var(--p-…))</code> и семантические алиасы.</p>
      <div class="docs-swatches">${tokens}</div>
      <div class="docs-type" style="margin-top:20px">
        <div class="eyebrow">Eyebrow · Golos Text / mono</div>
        <div class="display-title" style="font-size:44px">Display title</div>
        <div style="font:400 18px/1.55 var(--fb)">Основной текст — Golos Text, 18/1.55. <span class="k-caption">caption</span></div>
        <div class="k-hint">Hint — 13 px, вторичный цвет.</div>
      </div>
      <pre class="docs-code"><code>${esc('<div class="eyebrow">Eyebrow</div>\n<div class="display-title">Display title</div>\n<span class="k-caption">caption</span>')}</code></pre>
    </section>

    <section class="docs-sec" id="buttons">
      <h2>Кнопки</h2>
      <p>Базовый класс <code>k-btn</code>; модификаторы — <code>--primary</code>, <code>--danger</code>, <code>--l</code>, <code>--s</code>, <code>--icon</code>, <code>--ov</code>, <code>--block</code>, <code>--on-dark</code>, <code>--on-orange</code>. Тень и сдвиг — часть кита.</p>
      <div class="docs-specimen">
        <button class="k-btn k-btn--primary">Основная</button>
        <button class="k-btn">Вторичная</button>
        <button class="k-btn k-btn--danger">Удалить</button>
        <button class="k-btn k-btn--l">Большая</button>
        <button class="k-btn k-btn--s">Малая</button>
        <button class="k-btn" disabled>Недоступна</button>
      </div>
      <div class="docs-specimen">
        <button class="k-btn k-btn--icon" aria-label="Ещё">${icon('plus')}</button>
        <button class="k-btn k-btn--icon" aria-label="Поиск">${icon('q')}</button>
        <button class="k-btn k-btn--icon" aria-label="Закрыть">${icon('x')}</button>
      </div>
      <div class="docs-specimen docs-specimen--dark">
        <button class="k-btn k-btn--on-dark">На тёмном</button>
        <button class="k-btn k-btn--primary k-btn--on-dark">Primary на тёмном</button>
        <button class="k-btn k-btn--ov" aria-label="Открыть">${icon('fs')}</button>
      </div>
      <div class="docs-specimen docs-specimen--orange">
        <button class="k-btn k-btn--on-orange">На оранжевом</button>
        <button class="k-btn k-btn--primary k-btn--on-orange">Primary</button>
      </div>
      <div class="docs-specimen docs-specimen--block">
        <button class="k-btn k-btn--block k-btn--primary">Кнопка на всю ширину</button>
      </div>
      <pre class="docs-code"><code>${esc('<button class="k-btn k-btn--primary">Основная</button>\n<button class="k-btn k-btn--icon" aria-label="Ещё">…</button>')}</code></pre>
    </section>

    <section class="docs-sec" id="fields">
      <h2>Поля</h2>
      <p><code>k-field</code> — input/textarea/select; <code>k-label</code>, <code>k-hint</code>, <code>k-er</code> — подписи и ошибки. Невалидное поле — <code>aria-invalid="true"</code>.</p>
      <div class="docs-specimen docs-specimen--block">
        <label class="k-label" for="demo-name">Название комнаты</label>
        <input id="demo-name" class="k-field" placeholder="Например, гостиная" />
        <div class="k-hint" style="margin-top:6px">Подсказка под полем</div>
        <label class="k-label" for="demo-area" style="margin-top:16px">Площадь</label>
        <input id="demo-area" class="k-field" aria-invalid="true" value="—1" />
        <div class="k-er" style="margin-top:6px">${icon('warn')} Введите положительное число</div>
        <label class="k-label" for="demo-text" style="margin-top:16px">Комментарий</label>
        <textarea id="demo-text" class="k-field" placeholder="Что изменить?"></textarea>
        <label class="k-label" for="demo-select" style="margin-top:16px">Стиль</label>
        <select id="demo-select" class="k-field"><option>Скандинавский</option><option>Джапанди</option></select>
      </div>
      <pre class="docs-code"><code>${esc('<input class="k-field" placeholder="…">\n<input class="k-field" aria-invalid="true">\n<div class="k-er">Введите положительное число</div>')}</code></pre>
    </section>

    <section class="docs-sec" id="choice">
      <h2>Чекбоксы, радио, switch, range</h2>
      <div class="docs-two">
        <div class="docs-specimen docs-specimen--block">
          <div class="docs-stack">
            <label class="k-chk"><input type="checkbox" checked /> Оставить мебель</label>
            <label class="k-chk"><input type="checkbox" /> Учитывать каталог</label>
            <label class="k-radio"><input type="radio" name="tier" checked /> Comfort</label>
            <label class="k-radio"><input type="radio" name="tier" /> Premium</label>
            <label class="k-switch"><input type="checkbox" checked /> Приватный режим</label>
            <input class="k-range" type="range" min="0" max="100" value="60" />
          </div>
        </div>
        <div>
          <p class="docs-note">Размеры: чекбокс/радио — 24 px, switch — 48×28, range — 44 px высоты. Все элементы доступны с клавиатуры.</p>
        </div>
      </div>
      <pre class="docs-code"><code>${esc('<label class="k-chk"><input type="checkbox" checked> Оставить мебель</label>\n<label class="k-switch"><input type="checkbox"> Приватный режим</label>')}</code></pre>
    </section>

    <section class="docs-sec" id="tabs">
      <h2>Табы</h2>
      <p><code>k-tabs</code>/<code>k-tab</code> — «таблетки» с горизонтальным скроллом; <code>k-ut</code> — underline-табы.</p>
      <div class="docs-specimen docs-specimen--block">
        <div class="k-tabs" role="tablist">
          <button class="k-tab" role="tab" aria-selected="true">Фото</button>
          <button class="k-tab" role="tab" aria-selected="false">Стиль</button>
          <button class="k-tab" role="tab" aria-selected="false">Материалы</button>
          <button class="k-tab" role="tab" aria-selected="false">Правки</button>
        </div>
        <div class="k-ut" role="tablist" style="margin-top:16px">
          <button role="tab" aria-selected="true">Результат</button>
          <button role="tab" aria-selected="false">Разбор</button>
          <button role="tab" aria-selected="false">Закупка</button>
        </div>
      </div>
      <pre class="docs-code"><code>${esc('<div class="k-tabs"><button class="k-tab" aria-selected="true">Фото</button>…</div>\n<div class="k-ut"><button aria-selected="true">Результат</button>…</div>')}</code></pre>
    </section>

    <section class="docs-sec" id="cards">
      <h2>Карточки и плитки</h2>
      <p><code>k-tiles</code>/<code>k-tile</code> — мультивыбор стилей и концепций (<code>aria-checked</code>); <code>k-card</code> — карточка товара/результата.</p>
      <div class="docs-two">
        <div class="k-tiles">
          <button class="k-tile" aria-checked="true"><span class="im" style="--c:#c9b79a"></span><span class="nm">Скандинавский</span><span class="bd">${icon('ok')}</span></button>
          <button class="k-tile" aria-checked="false"><span class="im" style="--c:#8f9d86"></span><span class="nm">Джапанди</span><span class="bd">${icon('ok')}</span></button>
          <button class="k-tile" aria-checked="true"><span class="im" style="--c:#b08968"></span><span class="nm">Тёплый минимализм</span><span class="bd">${icon('ok')}</span></button>
          <button class="k-tile" aria-checked="false"><span class="im" style="--c:#6f7d8c"></span><span class="nm">Лофт</span><span class="bd">${icon('ok')}</span></button>
        </div>
        <div class="k-card">
          <div class="im"><span class="tg k-caption">verified</span></div>
          <div class="bo">
            <div class="rw"><b>Диван Bouclé</b><span>89 900 ₽</span></div>
            <div class="k-hint">Comfort · 220×95 см</div>
          </div>
        </div>
      </div>
      <pre class="docs-code"><code>${esc('<button class="k-tile" aria-checked="true"><span class="im"></span><span class="nm">Скандинавский</span></button>\n<div class="k-card"><div class="im"></div><div class="bo">…</div></div>')}</code></pre>
    </section>

    <section class="docs-sec" id="feedback">
      <h2>Обратная связь</h2>
      <p><code>k-empty</code>, <code>k-ban</code>, <code>k-note</code>, <code>k-pb</code>, <code>k-steps</code>, <code>k-sk</code>.</p>
      <div class="docs-two">
        <div class="k-empty">
          ${icon('img')}
          <b>Пока нет дизайнов</b>
          <span class="k-hint">Загрузите фото — и получите первый результат.</span>
          <button class="k-btn k-btn--s k-btn--primary">Создать</button>
        </div>
        <div>
          <div class="k-note">${icon('info')} Подсказка: базовый кадр не получает товарные референсы.</div>
          <div class="k-note k-note--warn" style="margin-top:12px">${icon('warn')} Очистка выключена — дизайн пойдёт по исходному фото.</div>
          <div class="k-ban k-ban--bad" style="margin-top:12px">${icon('warn')} Не удалось загрузить файл. Попробуйте ещё раз.</div>
        </div>
      </div>
      <div class="docs-specimen docs-specimen--block">
        <div class="k-pb"><i style="width:62%"></i></div>
        <ol class="k-steps">
          <li><span class="d ok">${icon('ok', 'kit-icon')}</span> Фото загружено <em>готово</em></li>
          <li><span class="d go">${icon('sp', 'kit-spin')}</span> Генерация <em>2 из 8</em></li>
          <li><span class="d"></span> Разбор <em>ждёт</em></li>
        </ol>
      </div>
      <div class="docs-specimen docs-specimen--block">
        <div class="k-sk" style="height:20px;width:60%;margin-bottom:8px"></div>
        <div class="k-sk" style="height:20px;width:85%"></div>
      </div>
      <pre class="docs-code"><code>${esc('<div class="k-note">Подсказка</div>\n<div class="k-pb"><i style="width:62%"></i></div>\n<ol class="k-steps"><li><span class="d ok">…</span> Фото <em>готово</em></li></ol>')}</code></pre>
    </section>

    <section class="docs-sec" id="badges">
      <h2>Статусы</h2>
      <div class="docs-specimen">
        <span class="k-badge">queued</span>
        <span class="k-badge k-badge--ok">done</span>
        <span class="k-badge k-badge--hot">hot</span>
        <span class="k-badge k-badge--er">error</span>
        <span class="k-badge k-badge--dk">private</span>
      </div>
      <pre class="docs-code"><code>${esc('<span class="k-badge k-badge--ok">done</span>')}</code></pre>
    </section>

    <section class="docs-sec" id="dropzone">
      <h2>Загрузка</h2>
      <p><code>k-dz</code> — зона drag&drop с угловыми метками; состояния <code>.over</code> и <code>.bad</code>.</p>
      <div class="docs-two">
        <div class="k-dz">
          <b></b><b></b><b></b><b></b>
          ${icon('cam')}
          <b style="position:static;border:0;width:auto;height:auto">Перетащите фото</b>
          <span class="k-hint">JPG, PNG, WebP или HEIC · до 15 МБ</span>
          <button class="k-btn k-btn--s">Выбрать файл</button>
        </div>
        <div class="k-dz over">
          <b></b><b></b><b></b><b></b>
          ${icon('cam')}
          <b style="position:static;border:0;width:auto;height:auto">Отпустите файл</b>
        </div>
      </div>
      <pre class="docs-code"><code>${esc('<div class="k-dz"><b></b><b></b><b></b><b></b>…</div>\n<div class="k-dz over">…</div>')}</code></pre>
    </section>

    <section class="docs-sec" id="sheet">
      <h2>Шторки</h2>
      <p><code>dialog.k-sheet</code> — bottom-sheet на мобильном, модальное окно на десктопе; <code>k-dh</code>/<code>k-db</code> — шапка и тело. <code>k-lb</code> — полноэкранный просмотр.</p>
      <div class="docs-specimen">
        <button class="k-btn" onclick="document.getElementById('demo-sheet').showModal()">Открыть шторку</button>
        <button class="k-btn" onclick="document.getElementById('demo-lb').showModal()">Полный экран</button>
      </div>
      <dialog class="k-sheet" id="demo-sheet">
        <div class="k-dh"><h2>Поделиться</h2><button class="k-btn k-btn--icon" onclick="this.closest('dialog').close()" aria-label="Закрыть">${icon('x')}</button></div>
        <div class="k-db">
          <p>Ссылка на дизайн откроется в новой вкладке. Смета и фото комнаты не публикуются.</p>
          <button class="k-btn k-btn--block k-btn--primary">Скопировать ссылку</button>
        </div>
      </dialog>
      <dialog class="k-lb" id="demo-lb" onclick="this.close()">
        <div style="padding:24px;display:grid;place-items:center;height:100%">
          <div style="text-align:center"><div class="k-caption">Полноэкранный просмотр</div><p>Клик — закрыть.</p></div>
        </div>
      </dialog>
      <pre class="docs-code"><code>${esc('<dialog class="k-sheet"><div class="k-dh">…</div><div class="k-db">…</div></dialog>\n<dialog class="k-lb">…</dialog>')}</code></pre>
    </section>

    <section class="docs-sec" id="table">
      <h2>Таблицы, тарифы, цифры</h2>
      <div class="docs-two">
        <table class="k-table">
          <thead><tr><th>Параметр</th><th>Значение</th></tr></thead>
          <tbody>
            <tr><td>Комната</td><td>Гостиная</td></tr>
            <tr><td>Стиль</td><td>Скандинавский</td></tr>
            <tr><td>Класс</td><td>Comfort</td></tr>
          </tbody>
        </table>
        <div class="k-pl on">
          <span class="k-caption">Пакет</span>
          <span class="k-num">10</span>
          <b>кредитов · 399 ₽</b>
          <button class="k-btn k-btn--s k-btn--primary">Купить</button>
        </div>
      </div>
      <pre class="docs-code"><code>${esc('<table class="k-table">…</table>\n<div class="k-pl on"><span class="k-num">10</span>…</div>')}</code></pre>
    </section>

    <section class="docs-sec" id="icons">
      <h2>Иконки</h2>
      <p>Единственный набор приложения — <code>KitIcon</code>. 21 иконка, <code>currentColor</code>, штрих 1.5.</p>
      <div class="docs-icons">${iconsGrid}</div>
      <pre class="docs-code"><code>${esc("import { KitIcon } from '@/components/KitIcon'\n<KitIcon name=\"plus\" />\n<KitIcon name=\"sp\" spin label=\"Загрузка\" />")}</code></pre>
    </section>

    <section class="docs-sec" id="patterns">
      <h2>Паттерны</h2>
      <p>Собранные блоки из реальных страниц: форма генерации, результат, статус очереди.</p>
      <div class="docs-two">
        <div class="k-card" style="padding:16px;display:grid;gap:12px">
          <div class="k-caption">Генератор</div>
          <label class="k-label">Стиль и концепция</label>
          <div class="k-tiles">
            <button class="k-tile" aria-checked="true"><span class="im" style="--c:#c9b79a"></span><span class="nm">Скандинавский</span><span class="bd">${icon('ok')}</span></button>
            <button class="k-tile" aria-checked="false"><span class="im" style="--c:#8f9d86"></span><span class="nm">Джапанди</span><span class="bd">${icon('ok')}</span></button>
          </div>
          <button class="k-btn k-btn--block k-btn--primary">Создать 2 дизайна · 2 кр.</button>
          <div class="k-hint">Спишется 2 кредита. Первые 3 правки бесплатны.</div>
        </div>
        <div class="k-card" style="padding:16px;display:grid;gap:12px">
          <div class="k-caption">Результат</div>
          <div><span class="k-badge k-badge--ok">done</span></div>
          <div class="rw" style="display:flex;justify-content:space-between;gap:8px"><b>Дизайн готов</b><span class="k-hint">42 с</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="k-btn k-btn--s k-btn--primary">Скачать</button>
            <button class="k-btn k-btn--s">Поделиться</button>
            <button class="k-btn k-btn--s k-btn--icon" aria-label="Ещё">${icon('plus')}</button>
          </div>
          <div class="k-note">${icon('info')} Новые базовые рендеры не получают товарные референсы — это design-first.</div>
        </div>
      </div>
    </section>
  </main>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(root, 'docs', 'kit.html'), doc);
console.log(`[kit] docs/kit.html ← ${cssFile} (${Math.round(doc.length / 1024)} KB)`);

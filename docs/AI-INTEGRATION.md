# AI-интеграция

Провайдер генерации и vision изолирован в `src/openrouter.js`. Остальной код общается с ним через экспорты.

Актуальный пайплайн: [GENERATION.md](GENERATION.md). Правила промта: [PROMPT-RULES.md](PROMPT-RULES.md).

## Текущая конфигурация

- Render: FLUX 3 Image 1K (значение из `app_settings`/`.env`; код-дефолт `black-forest-labs/flux-3-image`).
- Cleanup: `black-forest-labs/flux-3-image-klein`, 1K, auto (только при `keep_furniture=false`).
- Vision: `google/gemini-3-flash-preview`; он же пишет авторский art direction по фото (`src/artdirector.js`).
- Модели хранятся в `app_settings` и меняются в админке «Модели».
- Прокси — `src/proxy.js`, применяется без рестарта.

## Контракт модуля

```js
export const MOCK_MODE;
export function log(obj);
export async function assertConfig();
export async function listImageModels();
export function buildPrompt({ style, priceTier, products, roomType, imageMap, keepFurniture, useCatalog, ... });
export function buildEditPrompt({ roomType, target, instruction, hasRef, refLabel, refDimensions });
export async function generateRender({ prompt, sourceImageB64, referenceImagesB64, aspectRatio });
export async function generateFromText({ prompt, aspectRatio }); // shells для style refs
export async function generateCleanupRender({ prompt, sourceImageB64, aspectRatio, model, resolution, aspect });
export async function visionJson({ system, user, images, model }); // JSON-ответ vision-модели
export async function buildArtDirection({ imageDataUrl, roomType, style, styleDescription, dimensions, keepFurniture }); // src/artdirector.js
export async function analyzeRoomBrief({ imageDataUrl, roomType }); // src/artdirector.js
export async function parseRender(renderB64, mime);
export function matchCatalog(items, products);
export function snapAspect(width, height, allowed);
export const MAX_REFERENCES; // 4
```

## Арт-директор

`src/artdirector.js` — отдельный vision-проход, который смотрит на реальное фото и пишет bespoke-направление под выбранный стиль: палитру, focal point, feature wall, материалы, свет, текстиль, декор и `avoid`. Блок `ART DIRECTION` вставляется в `buildPrompt()` сразу после `ARCHITECTURE LOCK`; он не может отменять блокировку архитектуры и план масштаба.

- `buildArtDirection()` вызывается в `jobs.js` для базового рендера, пока `ART_DIRECTION_ENABLED` не выключен (`0/false`).
- Стоимость vision-вызова добавляется в `renders.cost_usd`, результат — в `renders.meta.art_direction`.
- `analyzeRoomBrief()` использует `POST /api/estimate-room`: оценка размеров + тип комнаты + 2–3 рекомендованных стиля; кнопка в генераторе подставляет их в форму.

## Возможности моделей

`src/modelcaps.js`:

- Seedream: `resolution` 1K/2K, aspect.
- FLUX 3 Image/Klein: `resolution` 768/1K/1.5K/2K/4K, aspect.
- FLUX: aspect; **resolution не отправляется**; content moderation возможен.
- Gemini: resolution не отправляется; aspect из безопасного списка.
- `supportsResolution()` true для Seedream и FLUX 3 Image/Klein; у FLUX 2 Pro resolution нет.
- Для Seedream/FLUX нет chat-fallback: это image-only модели.

## Провайдерские грабли

- `/images` 400 → смотреть тело ошибки; не маскировать chat-fallback.
- FLUX.2 Pro: не поддерживает `resolution`; BFL может блокировать спальни/кровати.
- Формат выхода может быть JPEG/WebP/PNG — определять по сигнатуре (`detectImageExt`).
- Стоимость суммировать по `usage.cost`.
- Референсы дорожают: следить за `refs` и `MAX_REFERENCES`.
- Прокси: OpenRouter WAF может блокировать IP VPS; `HTTPS_PROXY`/`proxy.url`.

## Добавить провайдера

1. Создать `src/provider-<name>.js` с контрактом выше.
2. Переключить импорты в `src/server.js` и `src/jobs.js` (или фабрику по env).
3. Добавить ключи в env.
4. Проверить `assertConfig`, `/api/models`, один живой рендер, итерацию, вертикальное фото.
5. Обновить `modelcaps.js` и docs.

## Не входит в провайдера

- Эмбеддинг-матчинг товаров (pgvector/CLIP) — отдельный слой.
- Metric depth/размеры комнаты — отдельный сервис.
- Inpainting/маски — следующий этап.
- Двухстадийная генерация — orchestration в `jobs.js`, не провайдер.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [OPERATIONS.md](OPERATIONS.md)

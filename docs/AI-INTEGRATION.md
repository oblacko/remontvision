# AI-интеграция

Провайдер генерации и vision изолирован в `src/openrouter.js`. Остальной код общается с ним через экспорты.

Актуальный пайплайн: [GENERATION.md](GENERATION.md). Правила промта: [PROMPT-RULES.md](PROMPT-RULES.md).

## Текущая конфигурация

- Render: `bytedance-seed/seedream-5-0-flash`, 1K, aspect auto.
- Vision: `google/gemini-3-flash-preview` (в проде `google/gemini-3-flash-preview`).
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
export async function parseRender(renderB64, mime);
export function matchCatalog(items, products);
export function snapAspect(width, height, allowed);
export const MAX_REFERENCES; // 4
```

## Возможности моделей

`src/modelcaps.js`:

- Seedream: `resolution` 1K/2K, aspect.
- FLUX: aspect; **resolution не отправляется**; content moderation возможен.
- Gemini: resolution не отправляется; aspect из безопасного списка.
- `supportsResolution()` true только для Seedream.
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

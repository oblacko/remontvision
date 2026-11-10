// Работа с объектами рендера: подписи, инструкции перемещения и точечных правок.
// bbox — нормализованные [x, y, w, h] в долях кадра (0..1), как отдаёт vision.

export type VisibleObject = {
  label?: string
  bbox?: number[]
  area?: number
}

const LABEL_RU: Record<string, string> = {
  bed: 'кровать',
  sofa: 'диван',
  couch: 'диван',
  armchair: 'кресло',
  chair: 'стул',
  dining_chair: 'стул',
  office_chair: 'кресло',
  table: 'стол',
  coffee_table: 'журнальный стол',
  dining_table: 'обеденный стол',
  desk: 'рабочий стол',
  wardrobe: 'шкаф',
  cabinet: 'шкаф',
  sideboard: 'комод',
  shelf: 'полка',
  shelving: 'стеллаж',
  storage: 'хранение',
  bench: 'скамья',
  pouf: 'пуф',
  rug: 'ковёр',
  carpet: 'ковёр',
  lamp: 'светильник',
  light: 'светильник',
  chandelier: 'люстра',
  pendant: 'подвесной светильник',
  sconce: 'бра',
  mirror: 'зеркало',
  curtain: 'шторы',
  curtains: 'шторы',
  blinds: 'жалюзи',
  plant: 'растение',
  plants: 'растения',
  tv: 'телевизор',
  television: 'телевизор',
  painting: 'картина',
  art: 'картина',
  decor: 'декор',
  radiator: 'радиатор',
  window: 'окно',
  door: 'дверь',
  sink: 'раковина',
  faucet: 'смеситель',
  toilet: 'унитаз',
  shower: 'душ',
  bathtub: 'ванна',
  countertop: 'столешница',
  appliance: 'техника',
  textile: 'текстиль',
}

export function ruLabel(label?: string): string {
  const key = String(label || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!key) return 'объект'
  return LABEL_RU[key] || String(label).trim()
}

export function bboxCenter(bbox: number[]): { x: number; y: number } {
  const [x = 0, y = 0, w = 0, h = 0] = bbox
  return { x: Math.round((x + w / 2) * 100), y: Math.round((y + h / 2) * 100) }
}

export function bboxSize(bbox: number[]): { w: number; h: number } {
  const [, , w = 0, h = 0] = bbox
  return { w: Math.round(w * 100), h: Math.round(h * 100) }
}

export function bboxRegion(bbox: number[]): { x: number; y: number; w: number; h: number } {
  const [x = 0, y = 0, w = 0, h = 0] = bbox
  return { x: Math.round(x * 100), y: Math.round(y * 100), w: Math.round(w * 100), h: Math.round(h * 100) }
}

// Кроп выбранного объекта: уходит в правку как reference, чтобы модель меняла
// именно этот предмет, а не похожий соседний.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = src
  })
}

export async function cropObjectFile(imageUrl: string, bbox: number[]): Promise<File | null> {
  try {
    const image = await loadImage(imageUrl)
    const [x = 0, y = 0, w = 0, h = 0] = bbox
    const sx = Math.max(0, x * image.naturalWidth)
    const sy = Math.max(0, y * image.naturalHeight)
    const sw = Math.max(1, w * image.naturalWidth)
    const sh = Math.max(1, h * image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return null
    return new File([blob], 'selected-object.jpg', { type: 'image/jpeg' })
  } catch {
    return null
  }
}

export function moveDirection(dx: number, dy: number): { text: string; percent: number } {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax >= ay) return { text: dx >= 0 ? 'вправо' : 'влево', percent: Math.round(ax * 100) }
  return { text: dy >= 0 ? 'вниз' : 'вверх', percent: Math.round(ay * 100) }
}

export function buildMoveInstruction({ label, bbox, dx, dy }: { label?: string; bbox: number[]; dx: number; dy: number }): string {
  const name = ruLabel(label)
  const [x = 0, y = 0, w = 0, h = 0] = bbox
  const source = bboxRegion(bbox)
  const dest = bboxRegion([Math.min(1 - w, Math.max(0, x + dx)), Math.min(1 - h, Math.max(0, y + dy)), w, h])
  return `Переместите ${name} из области (${source.x}%, ${source.y}%, ${source.w}% × ${source.h}%) в область (${dest.x}%, ${dest.y}%, ${dest.w}% × ${dest.h}%). В reference image показано целевое положение объекта: поставьте его туда, а старое место восстановите так, чтобы не осталось следа. Похожие объекты, свет и архитектуру не трогайте.`
}

export function buildObjectAction(label: string | undefined, action: 'replace' | 'color' | 'bigger' | 'smaller', bbox?: number[]): string {
  const name = ruLabel(label)
  const region = bbox ? bboxRegion(bbox) : null
  const area = region ? ` в области (${region.x}%, ${region.y}%, ${region.w}% × ${region.h}%)` : ''
  const only = ' Меняйте только объект, показанный в reference image; похожие объекты и свет не трогайте.'
  if (action === 'replace') return `Замените ${name}${area} на похожий по стилю и размеру.${only}`
  if (action === 'color') return `Измените цвет ${name}${area}, сохранив форму и положение.${only}`
  if (action === 'bigger') return `Сделайте ${name}${area} немного крупнее, сохранив положение.${only}`
  return `Сделайте ${name}${area} немного мельче, сохранив положение.${only}`
}

export function buildObjectText(label: string | undefined, text: string, bbox?: number[]): string {
  const name = ruLabel(label)
  const region = bbox ? bboxRegion(bbox) : null
  const area = region ? ` (область ${region.x}%, ${region.y}%, ${region.w}% × ${region.h}%)` : ''
  return `${name}${area}: ${text.trim()}. Меняйте только объект, показанный в reference image; похожие объекты, свет и архитектуру не трогайте.`
}


// Превью целевого положения: объект переносится в новую область, старое место
// размывается. Референс показывает модели, куда именно двигать объект.
export async function buildMovePreview(imageUrl: string, bbox: number[], dx: number, dy: number): Promise<File | null> {
  try {
    const image = await loadImage(imageUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0)
    const [x = 0, y = 0, w = 0, h = 0] = bbox
    const sw = Math.max(1, w * image.naturalWidth)
    const sh = Math.max(1, h * image.naturalHeight)
    const sx = Math.max(0, x * image.naturalWidth)
    const sy = Math.max(0, y * image.naturalHeight)
    const tx = Math.max(0, Math.min(image.naturalWidth - sw, (x + dx) * image.naturalWidth))
    const ty = Math.max(0, Math.min(image.naturalHeight - sh, (y + dy) * image.naturalHeight))
    // Старое место: клонируем соседний фон, затем смягчаем края.
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx, sy, sw, sh)
    ctx.clip()
    const left = sx - sw
    const right = sx + sw
    const above = sy - sh
    const below = sy + sh
    if (left >= 0) ctx.drawImage(image, left, sy, sw, sh, sx, sy, sw, sh)
    else if (right + sw <= image.naturalWidth) ctx.drawImage(image, right, sy, sw, sh, sx, sy, sw, sh)
    else if (above >= 0) ctx.drawImage(image, sx, above, sw, sh, sx, sy, sw, sh)
    else if (below + sh <= image.naturalHeight) ctx.drawImage(image, sx, below, sw, sh, sx, sy, sw, sh)
    else { ctx.filter = 'blur(18px)'; ctx.drawImage(image, 0, 0) }
    ctx.restore()
    ctx.filter = 'none'
    // Объект на новом месте с небольшим инсетом, чтобы края вписалось моделью.
    const iw = sw * 0.02
    const ih = sh * 0.02
    ctx.drawImage(image, sx + iw, sy + ih, sw - iw * 2, sh - ih * 2, tx + iw, ty + ih, sw - iw * 2, sh - ih * 2)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return null
    return new File([blob], 'move-preview.jpg', { type: 'image/jpeg' })
  } catch {
    return null
  }
}


export async function cropObjectDataUrl(imageUrl: string, bbox: number[]): Promise<string | null> {
  try {
    const image = await loadImage(imageUrl)
    const [x = 0, y = 0, w = 0, h = 0] = bbox
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * image.naturalWidth))
    canvas.height = Math.max(1, Math.round(h * image.naturalHeight))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, x * image.naturalWidth, y * image.naturalHeight, w * image.naturalWidth, h * image.naturalHeight, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } catch {
    return null
  }
}

export function buildMoveCleanupInstruction(label?: string, bbox?: number[]): string {
  const region = bbox ? bboxRegion(bbox) : null
  const area = region ? ` (область ${region.x}%, ${region.y}%, ${region.w}% × ${region.h}%)` : ''
  return `Удалите ${ruLabel(label) || 'объект'}${area} и восстановите фон, свет и перспективу так, чтобы не осталось следа. Остальную комнату не меняйте.`
}

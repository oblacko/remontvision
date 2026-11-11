// Черновик генерации: параметры — в localStorage, фото — сжатым JPEG в IndexedDB.
// Переживает закрытие вкладки и возврат с оплаты; ничего не отправляется на сервер.
export const DRAFT_PARAMS_KEY = 'rv_generation_draft_v1'
const DB_NAME = 'rv_drafts'
const STORE = 'photos'
const PHOTO_KEY = 'current-room'
const MAX_DRAFT_BYTES = 1024 * 1024

export type DraftParams = {
  roomType: string | null
  stylePicks: Array<{ style: string; concepts: string[] }>
  priceTier: string
  modelKey: string | null
  resolution: string | null
  isPrivate: boolean
  created_at: string
  saved_at: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB недоступен')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Не удалось открыть IndexedDB'))
  })
}

function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = run(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Ошибка IndexedDB'))
    tx.oncomplete = () => db.close()
  }))
}

export function saveDraftParams(input: Omit<DraftParams, 'saved_at'>): DraftParams | null {
  if (typeof localStorage === 'undefined') return null
  const saved_at = new Date().toISOString()
  const value: DraftParams = { ...input, saved_at }
  try { localStorage.setItem(DRAFT_PARAMS_KEY, JSON.stringify(value)) } catch { return null }
  return value
}

export function loadDraftParams(): DraftParams | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_PARAMS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftParams>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      roomType: typeof parsed.roomType === 'string' ? parsed.roomType : null,
      stylePicks: Array.isArray(parsed.stylePicks) ? parsed.stylePicks : [],
      priceTier: parsed.priceTier || 'comfort',
      modelKey: parsed.modelKey || null,
      resolution: parsed.resolution || null,
      isPrivate: Boolean(parsed.isPrivate),
      created_at: parsed.created_at || parsed.saved_at || new Date().toISOString(),
      saved_at: parsed.saved_at || new Date().toISOString(),
    }
  } catch { return null }
}

export async function saveDraftPhoto(blob: Blob): Promise<void> {
  try { await idbRequest('readwrite', store => store.put({ blob, saved_at: Date.now() }, PHOTO_KEY)) } catch { /* черновик без фото лучше, чем падение */ }
}

export async function loadDraftPhoto(): Promise<Blob | null> {
  try {
    const row = await idbRequest<{ blob?: Blob } | undefined>('readonly', store => store.get(PHOTO_KEY))
    return row?.blob instanceof Blob ? row.blob : null
  } catch { return null }
}

export async function clearDraft(): Promise<void> {
  try { localStorage.removeItem(DRAFT_PARAMS_KEY) } catch { /* ignore */ }
  try { await idbRequest('readwrite', store => store.delete(PHOTO_KEY)) } catch { /* ignore */ }
}

export function draftTimeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return date.toLocaleString('ru-RU', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Сжимаем фото до JPEG ≤1 МБ: сначала уменьшаем качество, потом сторону кадра.
export async function compressDraftPhoto(file: File, maxBytes = MAX_DRAFT_BYTES): Promise<Blob> {
  if (file.type === 'image/jpeg' && file.size <= maxBytes) return file
  const bitmap = await createImageBitmap(file)
  let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
  let last: Blob | null = null
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D недоступен')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const quality = Math.max(0.4, 0.85 - attempt * 0.08)
    last = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (last && last.size <= maxBytes) return last
    scale *= 0.8
  }
  if (last) return last
  throw new Error('Не удалось сжать фото')
}

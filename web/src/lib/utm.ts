export type UtmStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type UtmRecord = {
  utm: Record<string, string>
  ts: number
}

const STORAGE_KEY = 'rv_utm'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'yclid'] as const

// Достаём только распознанные метки из query-строки; ключи сравниваем без учёта регистра.
function extractUtm(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawKey, value] of new URLSearchParams(search).entries()) {
    const key = rawKey.toLowerCase()
    if ((UTM_KEYS as readonly string[]).includes(key) && value !== '') out[key] = value
  }
  return out
}

function isValidRecord(value: unknown): value is UtmRecord {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as { utm?: unknown; ts?: unknown }
  if (typeof rec.utm !== 'object' || rec.utm === null) return false
  const utm = rec.utm as Record<string, unknown>
  if (!Object.values(utm).every(v => typeof v === 'string')) return false
  return typeof rec.ts === 'number' && Number.isFinite(rec.ts)
}

// Прочитать сохранённую метку. Просроченная (>30 дней), отсутствующая или битая запись → null.
export function readUtm({ storage, now }: { storage: UtmStorage; now: number }): Record<string, string> | null {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isValidRecord(parsed)) return null
  if (now - parsed.ts > TTL_MS) return null
  return parsed.utm
}

// First-touch: пишем только если валидной записи ещё нет (или она просрочена).
export function captureUtmOnce({ search, storage, now }: { search: string; storage: UtmStorage; now: number }) {
  const utm = extractUtm(search)
  if (Object.keys(utm).length === 0) return
  if (readUtm({ storage, now })) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ utm, ts: now }))
  } catch {
    // приватный режим/заблокированное хранилище — молча пропускаем
  }
}

export function getUtm(): Record<string, string> | null {
  if (typeof window === 'undefined') return null
  try {
    return readUtm({ storage: window.localStorage, now: Date.now() })
  } catch {
    return null
  }
}

export function captureUtm(): void {
  if (typeof window === 'undefined') return
  try {
    captureUtmOnce({ search: window.location.search, storage: window.localStorage, now: Date.now() })
  } catch {
    /* ignore */
  }
}

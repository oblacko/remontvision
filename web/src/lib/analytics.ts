import { getUtm } from './utm'

export const COUNTER_ID = 114132104

declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void
  }
}

// Цель Яндекс.Метрики. Если счётчик заблокирован или не загрузился — вызов тихо игнорируется.
// UTM-атрибуция подмешивается в params.utm для всех целей, кроме share (шаринг не связан с источником трафика).
export function goal(name: string, params?: Record<string, unknown>) {
  let next = params
  if (name !== 'share') {
    const utm = getUtm()
    if (utm) {
      const prev = next?.utm
      const mergedUtm = prev && typeof prev === 'object' ? { ...prev, ...utm } : utm
      next = { ...(next ?? {}), utm: mergedUtm }
    }
  }
  window.ym?.(COUNTER_ID, 'reachGoal', name, next)
}

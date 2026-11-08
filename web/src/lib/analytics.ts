export const COUNTER_ID = 114132104

declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void
  }
}

// Цель Яндекс.Метрики. Если счётчик заблокирован или не загрузился — вызов тихо игнорируется.
export function goal(name: string, params?: Record<string, unknown>) {
  window.ym?.(COUNTER_ID, 'reachGoal', name, params)
}

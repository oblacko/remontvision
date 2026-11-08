import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

const COUNTER_ID = 114132055

declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void
  }
}

// Первый хит отправляет init из index.html; здесь считаем клиентские переходы React Router.
export function Metrika() {
  const location = useLocation()
  const initial = useRef(true)

  useEffect(() => {
    if (initial.current) { initial.current = false; return }
    window.ym?.(COUNTER_ID, 'hit', window.location.href)
  }, [location.pathname, location.search])

  return null
}

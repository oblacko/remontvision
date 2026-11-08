import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { COUNTER_ID } from '@/lib/analytics'

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

import { useEffect, useRef, useState } from 'react'
import { KitIcon } from './KitIcon'

type Refund = { id: string; delta: number; note?: string | null; render_id?: string | null; created_at: string }

const STORAGE_KEY = 'rv_last_refund_id'
const POLL_MS = 10_000
const SHOW_MS = 9_000

function creditsWord(n: number) {
  const value = Math.abs(n)
  if (value % 10 === 1 && value % 100 !== 11) return 'кредит'
  if ([2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100)) return 'кредита'
  return 'кредитов'
}

function reasonText(note?: string | null) {
  if (!note) return 'Кредит возвращён на баланс'
  if (note === 'render_cancelled') return 'Задача отменена — кредит возвращён'
  if (note === 'timeout') return 'Дизайн не успел создаться — кредит возвращён'
  if (note === 'architecture_rejected') return 'Результат не прошёл проверку — кредит возвращён'
  if (note === 'product_qa_rejected') return 'Товар не подтвердился — кредит возвращён'
  if (note.startsWith('render_error')) return 'Ошибка создания дизайна — кредит возвращён'
  return 'Кредит возвращён на баланс'
}

// Тост о возврате кредита: читает свежие credit_txn (iterate_refund) и показывает
// только те, что появились после прошлого визита. Историю не переигрывает.
export function CreditRefundToast() {
  const [refund, setRefund] = useState<Refund | null>(null)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let primed = Boolean(localStorage.getItem(STORAGE_KEY))
    let lastId = localStorage.getItem(STORAGE_KEY) || '0'

    async function tick() {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch(`/api/credits/refunds?after=${encodeURIComponent(lastId)}`)
        if (!r.ok) return
        const rows = await r.json() as Refund[]
        if (!Array.isArray(rows) || !rows.length) return
        const fresh = primed
          ? rows
          : rows.filter(row => Date.now() - new Date(row.created_at).getTime() < 10 * 60 * 1000)
        lastId = rows[rows.length - 1].id
        localStorage.setItem(STORAGE_KEY, lastId)
        primed = true
        if (cancelled || !fresh.length) return
        setRefund(fresh[fresh.length - 1])
        if (hideTimer.current) window.clearTimeout(hideTimer.current)
        hideTimer.current = window.setTimeout(() => setRefund(null), SHOW_MS)
      } catch { /* сеть недоступна — попробуем на следующем тике */ }
    }

    void tick()
    const interval = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [])

  if (!refund) return null

  return (
    <div className="kit-toast" role="status" aria-live="polite">
      <KitIcon name="ok" className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{reasonText(refund.note)}</p>
        <p className="mt-0.5 text-xs text-background/70">Вернули {refund.delta} {creditsWord(refund.delta)} на баланс</p>
      </div>
      <button type="button" onClick={() => setRefund(null)} className="shrink-0 p-1 text-background/70 transition-colors hover:text-background focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-background" aria-label="Закрыть уведомление">
        <KitIcon name="x" className="size-4" />
      </button>
    </div>
  )
}

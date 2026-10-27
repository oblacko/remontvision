import { useEffect, useState } from 'react'
import { Check, Copy, LoaderCircle, Send, Share2, X } from 'lucide-react'

export function ShareDialog({ renderId, open, onClose }: { renderId: string; open: boolean; onClose: () => void }) {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !renderId) return
    let cancelled = false
    setBusy(true); setError(''); setLink(''); setCopied(false)
    ;(async () => {
      try {
        const r = await fetch(`/api/renders/${renderId}/share`, { method: 'POST' })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || String(r.status))
        if (!cancelled) setLink(d.url || '')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось создать ссылку')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, renderId])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  if (!open) return null

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Скопируйте ссылку', link)
    }
  }

  const text = encodeURIComponent('Дизайн интерьера — ремонтвижн')
  const encoded = encodeURIComponent(link)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/60 p-4" role="dialog" aria-modal="true" aria-label="Поделиться дизайном" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="eyebrow">Поделиться</p><h2 className="display-title mt-2 text-2xl">Красивый дизайн</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">По ссылке видно только визуализацию. Можно поставить лайк и оставить комментарий.</p></div>
          <button type="button" onClick={onClose} className="flex size-10 shrink-0 items-center justify-center border hover:bg-muted" aria-label="Закрыть"><X className="size-4" /></button>
        </div>
        {busy ? <div className="flex min-h-32 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-primary-text" /></div> : error ? <p className="mt-4 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : (
          <>
            <div className="mt-4 flex items-center gap-2 border bg-muted/40 p-2">
              <input readOnly value={link} className="h-10 min-w-0 flex-1 bg-transparent px-2 text-xs outline-none" onFocus={e => e.currentTarget.select()} />
              <button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-2 border border-foreground px-3 text-xs hover:bg-foreground hover:text-background">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? 'Скопировано' : 'Копировать'}</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-px border bg-border">
              <a href={`https://t.me/share/url?url=${encoded}&text=${text}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-background text-xs hover:bg-muted"><Send className="size-5" />Telegram</a>
              <a href={`https://vk.com/share.php?url=${encoded}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-background text-xs hover:bg-muted"><Share2 className="size-5" />ВКонтакте</a>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Дизайн интерьера: ${link}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-background text-xs hover:bg-muted"><Send className="size-5" />WhatsApp</a>
            </div>
            {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" onClick={() => navigator.share?.({ title: 'Дизайн интерьера', url: link }).catch(() => {})} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 border px-4 text-sm hover:bg-muted"><Share2 className="size-4" />Другие приложения</button>}
          </>
        )}
      </div>
    </div>
  )
}

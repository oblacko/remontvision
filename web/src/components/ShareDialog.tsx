import { useEffect, useState } from 'react'
import { KitIcon } from './KitIcon'
import { KitSheet } from './KitSheet'
import { goal } from '@/lib/analytics'

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
        if (!cancelled) goal('share', { render_id: renderId })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось создать ссылку')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, renderId])

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
    <KitSheet open={open} onClose={onClose} title="Красивый дизайн">
      <p className="k-hint" style={{ margin: 0 }}>По ссылке видно визуализацию и направление дизайна. Можно поставить лайк и оставить комментарий.</p>
      {busy ? <div className="flex min-h-32 items-center justify-center"><KitIcon name="sp" spin className="size-6 text-primary-text" /></div> : error ? <p className="k-ban k-ban--bad">{error}</p> : (
        <>
          <div className="flex items-center gap-2 border bg-secondary p-2">
            <input readOnly value={link} className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none" onFocus={e => e.currentTarget.select()} aria-label="Ссылка на дизайн" />
            <button type="button" onClick={copy} className="k-btn k-btn--s shrink-0">{copied ? <KitIcon name="ok" /> : null}{copied ? 'Скопировано' : 'Копировать'}</button>
          </div>
          <div className="grid grid-cols-3 gap-px border bg-border">
            <a href={`https://t.me/share/url?url=${encoded}&text=${text}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-card text-xs hover:bg-secondary"><KitIcon name="sh" />Telegram</a>
            <a href={`https://vk.com/share.php?url=${encoded}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-card text-xs hover:bg-secondary"><KitIcon name="ur" />ВКонтакте</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Дизайн интерьера: ${link}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-card text-xs hover:bg-secondary"><KitIcon name="r" />WhatsApp</a>
          </div>
          {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" onClick={() => navigator.share?.({ title: 'Дизайн интерьера', url: link }).catch(() => {})} className="k-btn k-btn--block"><KitIcon name="sh" />Другие приложения</button>}
        </>
      )}
    </KitSheet>
  )
}

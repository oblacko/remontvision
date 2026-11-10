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

  const text = encodeURIComponent('Дизайн интерьера — ремонтвижн #ремонт #дизайнинтерьера')
  const encoded = encodeURIComponent(link)

  function SocialIcon({ name }: { name: 'tg' | 'vk' | 'wa' }) {
    if (name === 'tg') {
      return (
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#229ED9" />
          <path d="M5.6 11.9l12.2-4.7c.6-.2 1.1.2.9.9l-2.1 9.8c-.2.7-.6.9-1.2.5l-3.2-2.3-1.5 1.4c-.2.2-.3.3-.6.3l.2-3 5.5-5c.3-.2-.1-.4-.4-.2l-6.8 4.3-2.9-.9c-.7-.2-.7-.9-.1-1.1Z" fill="#fff" />
        </svg>
      )
    }
    if (name === 'vk') {
      return (
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#0077FF" />
          <text x="12" y="16.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">VK</text>
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#25D366" />
        <path d="M16.6 14.2c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2 0 1.3 1 2.6 1.1 2.8.1.2 1.9 2.9 4.6 4 2.7 1.1 2.7.7 3.2.7.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2Z" fill="#fff" />
      </svg>
    )
  }

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
            <a href={`https://t.me/share/url?url=${encoded}&text=${text}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-card text-xs hover:bg-secondary"><SocialIcon name="tg" />Telegram</a>
            <a href={`https://vk.com/share.php?url=${encoded}&title=${text}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-card text-xs hover:bg-secondary"><SocialIcon name="vk" />ВКонтакте</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Дизайн интерьера: ${link} #ремонт #дизайнинтерьера`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-col items-center justify-center gap-1 bg-card text-xs hover:bg-secondary"><SocialIcon name="wa" />WhatsApp</a>
          </div>
          {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" onClick={() => navigator.share?.({ title: 'Дизайн интерьера', text: 'Дизайн интерьера #ремонт #дизайнинтерьера', url: link }).catch(() => {})} className="k-btn k-btn--block"><KitIcon name="sh" />Другие приложения</button>}
        </>
      )}
    </KitSheet>
  )
}

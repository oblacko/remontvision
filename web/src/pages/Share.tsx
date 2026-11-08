import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, Check, ChevronDown, Heart, LoaderCircle, MessageCircle, Send } from 'lucide-react'
import { GuideIcon } from '@/components/GuideIcon'
import { Logo } from '@/components/Logo'
import { groupRoadmap, type RoadmapItem } from '@/lib/roadmap'
import '../App.css'

type Comment = { id: number; name: string | null; text: string; created_at: string }
type ShareData = {
  id: string; image: string; style: string; room_type?: string | null;
  created_at: string; likes: number; liked: boolean; comments: Comment[];
  design_direction?: {
    concept?: string
    mainMove?: { target?: string; action?: string; effect?: string } | null
    focalPoint?: string
    quietAreas?: string[]
    materialsStory?: string[]
    palette?: { hex?: string | null; name?: string }[]
  } | null
  surfaces?: { surface?: string; label?: string; hex?: string; ral?: { code?: string; name?: string } | null }[]
  roadmap_items?: RoadmapItem[]
}

const dateTime = (iso?: string | null) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export default function Share() {
  const { token = '' } = useParams()
  const [data, setData] = useState<ShareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [likeBusy, setLikeBusy] = useState(false)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/share/${token}`)
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Ссылка не найдена')
        if (!cancelled) { setData(d); document.title = `Дизайн · ${d.style || 'ремонтвижн'}` }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ссылка не найдена')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const like = async () => {
    if (!data || likeBusy) return
    setLikeBusy(true)
    try {
      const r = await fetch(`/api/share/${token}/like`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      setData(prev => prev ? { ...prev, likes: d.likes, liked: d.liked } : prev)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось поставить лайк') }
    finally { setLikeBusy(false) }
  }

  const sendComment = async () => {
    if (!text.trim() || commentBusy) return
    setCommentBusy(true); setError('')
    try {
      const r = await fetch(`/api/share/${token}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, text }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      setData(prev => prev ? { ...prev, comments: [d, ...prev.comments] } : prev)
      setText('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отправить комментарий') }
    finally { setCommentBusy(false) }
  }

  const roadmapGroups = useMemo(() => groupRoadmap(data?.roadmap_items || []), [data?.roadmap_items])
  const roadmapActive = (data?.roadmap_items || []).filter(item => item.active)
  const roadmapDone = roadmapActive.filter(item => item.done).length

  if (loading) return <div className="flex min-h-svh items-center justify-center"><LoaderCircle className="size-8 animate-spin text-primary-text" /></div>
  if (!data) return <div className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center p-6 text-center"><p className="eyebrow">Ремонтвижн</p><h1 className="display-title mt-3 text-3xl">Ссылка не найдена</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><a href="/" className="action-secondary mt-6"><ArrowLeft className="size-4" />На главную</a></div>

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Logo />
        <a href="/" className="action-secondary"><ArrowLeft className="size-4" />На главную</a>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="bg-foreground"><img src={data.image} alt={`Дизайн: ${data.style}`} className="max-h-[72svh] w-full object-contain" /></div>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div><p className="eyebrow">Дизайн интерьера</p><h1 className="display-title mt-2 text-3xl sm:text-4xl">{data.style}</h1><p className="mt-1 text-xs text-muted-foreground">{data.room_type || 'Комната'} · {dateTime(data.created_at)}</p></div>
          <button type="button" onClick={like} disabled={likeBusy} className={`inline-flex min-h-12 items-center gap-2 border px-4 text-sm transition-colors ${data.liked ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground'}`} aria-pressed={data.liked}><Heart className={`size-4 ${data.liked ? 'fill-current' : ''}`} />{data.likes}</button>
        </div>

        {data.design_direction && (
          <section className="mt-10 border-t pt-6">
            <p className="eyebrow">Дизайн</p>
            {data.design_direction.concept && <p className="mt-3 text-base font-medium">{data.design_direction.concept}</p>}
            {data.design_direction.mainMove?.action && <p className="mt-2 text-sm leading-6 text-muted-foreground">{data.design_direction.mainMove.target ? `${data.design_direction.mainMove.target}: ` : ''}{data.design_direction.mainMove.action}{data.design_direction.mainMove.effect ? ` — ${data.design_direction.mainMove.effect}` : ''}</p>}
            {!!data.design_direction.palette?.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.design_direction.palette.map((color, index) => <span key={`${color.hex}-${index}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="size-4 border border-foreground/20" style={{ background: color.hex || 'transparent' }} />{color.name || color.hex}</span>)}
              </div>
            )}
            {!!data.design_direction.materialsStory?.length && <p className="mt-3 text-xs leading-5 text-muted-foreground">Материалы: {data.design_direction.materialsStory.join(', ')}</p>}
            {data.design_direction.focalPoint && <p className="mt-1 text-xs leading-5 text-muted-foreground">Фокус: {data.design_direction.focalPoint}</p>}
          </section>
        )}

        {!!data.surfaces?.length && (
          <section className="mt-8 border-t pt-6">
            <p className="eyebrow">Палитра RAL по рендеру</p>
            <div className="mt-3 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
              {data.surfaces.map((surface, index) => <div key={`${surface.surface}-${index}`} className="bg-background p-3"><span className="block h-10 w-full border border-foreground/20" style={{ background: surface.hex || 'transparent' }} /><p className="mt-2 text-xs font-medium">{surface.label || surface.surface}</p><p className="font-mono text-[11px] text-muted-foreground">{surface.ral?.code || surface.hex}</p>{surface.ral?.name ? <p className="text-[11px] text-muted-foreground">{surface.ral.name}</p> : null}</div>)}
            </div>
          </section>
        )}

        {!!roadmapGroups.length && (
          <section className="mt-8 border-t pt-6">
            <p className="eyebrow">Роадмап покупок</p>
            <div className="mt-3 border border-foreground/25 p-4">
              <div className="flex items-end justify-between gap-3">
                <p className="text-sm">Куплено <b>{roadmapDone}</b> из {roadmapActive.length}</p>
                <span className="font-mono text-xs text-primary-text">{roadmapActive.length ? Math.round((roadmapDone / roadmapActive.length) * 100) : 0}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden bg-border">
                <div className="h-full bg-primary" style={{ width: `${roadmapActive.length ? Math.round((roadmapDone / roadmapActive.length) * 100) : 0}%` }} />
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {roadmapGroups.map(group => {
                const active = group.items.filter(item => item.active)
                const done = active.filter(item => item.done).length
                return (
                  <details key={group.key} className="group border border-foreground/25">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <GuideIcon name={group.icon} />
                      <span className="min-w-0 flex-1 text-sm font-medium">{group.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{done} из {active.length}</span>
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="border-t border-foreground/25">
                      {group.items.map(item => (
                        <li key={item.id} className="border-t border-foreground/10 px-3 py-3 first:border-t-0">
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center border ${item.done ? 'border-foreground bg-primary text-primary-foreground' : 'border-foreground/40'}`}>
                              {item.done && <Check className="size-3.5" />}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-sm leading-5 ${item.done || !item.active ? 'text-muted-foreground line-through' : ''}`}>{item.text}</p>
                              {item.comment && <p className="mt-1 text-xs leading-5 text-muted-foreground">· {item.comment}</p>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </div>
          </section>
        )}

        <section className="mt-10 border-t pt-6">
          <p className="eyebrow flex items-center gap-2"><MessageCircle className="size-4" />Комментарии · {data.comments.length}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Имя (необязательно)" className="h-11 border bg-background px-3 text-sm outline-none focus:border-primary" />
            <input value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder="Что думаете о дизайне?" className="h-11 border bg-background px-3 text-sm outline-none focus:border-primary" onKeyDown={e => { if (e.key === 'Enter') void sendComment() }} />
            <button type="button" onClick={sendComment} disabled={!text.trim() || commentBusy} className="inline-flex min-h-11 items-center justify-center gap-2 border border-foreground px-4 text-sm hover:bg-foreground hover:text-background disabled:opacity-40"><Send className="size-4" />Отправить</button>
          </div>
          {error && <p className="mt-3 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 divide-y border-y">
            {data.comments.map(c => <div key={c.id} className="py-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">{c.name || 'Гость'}</p><p className="text-[11px] text-muted-foreground">{dateTime(c.created_at)}</p></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{c.text}</p></div>)}
            {!data.comments.length && <p className="py-6 text-sm text-muted-foreground">Пока нет комментариев. Будьте первым.</p>}
          </div>
        </section>
      </main>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, ChevronDown, Download, Expand, LoaderCircle, Share2, X, Zap } from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import { GenerationPanel } from '@/components/GenerationPanel'
import { useTasks } from '@/components/TaskDock'
import '../App.css'

type Surface = { surface?: string; label?: string; hex?: string; ral?: { code?: string; name?: string } | null; description?: string }
type Electrical = { title?: string; text?: string }
type BreakdownCard = {
  title?: string
  preview?: string
  action?: string
  body?: string
  details?: string[]
  name?: string
  traits?: string
  clarify?: string
  custom?: string
  effort?: string
  edit_instruction?: string
}
type BreakdownSection = { key: string; title: string; preview?: string; cards: BreakdownCard[] }
type Breakdown = {
  title: string
  lead?: string
  top_cards: BreakdownCard[]
  sections: BreakdownSection[]
  next_action?: { label: string; kind: 'change' | 'apply' } | null
  questions: string[]
}
type Render = {
  id: string
  image: string | null
  status: string
  request_text?: string | null
  created_at?: string
  analysis?: {
    surfaces?: Surface[]
    electrical?: Electrical[]
    breakdown?: Breakdown | null
  } | null
}
type RoomData = {
  id: string
  style: string
  room_type?: string | null
  status: string
  error?: string | null
  photo_url?: string | null
  render?: Render | null
}

const stageLabel = (status?: string) => status === 'analyzing' ? 'Анализ фото' : status === 'rendering' ? 'Генерация изображения' : status === 'matching' ? 'Разбор рендера' : status === 'queued' ? 'В очереди' : 'В процессе'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t py-5 first:border-t-0 first:pt-0">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  )
}

function Disclosure({ title, preview, action, children }: { title?: string; preview?: string; action?: string; children: ReactNode }) {
  if (!title) return null
  return (
    <details className="group border border-foreground/25">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-5">{title}</span>
          {preview && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{preview}</span>}
          {action && <span className="mt-1.5 inline-block text-[11px] text-primary-text">{action} →</span>}
        </span>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-foreground/25 px-3 py-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </details>
  )
}

function BuyCard({ card }: { card: BreakdownCard }) {
  return (
    <div className="border border-foreground/20 p-3">
      <p className="text-sm font-medium">{card.name}</p>
      {card.traits && <p className="mt-1 text-xs leading-5 text-muted-foreground">Признаки: {card.traits}</p>}
      {card.clarify && <p className="mt-1 text-xs leading-5 text-muted-foreground">Уточнить: {card.clarify}</p>}
      {card.custom && <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{card.custom}</p>}
    </div>
  )
}

function ChangeCard({ card, onAdd }: { card: BreakdownCard; onAdd: () => void }) {
  return (
    <div className="border border-foreground/20 p-3">
      <p className="text-sm font-medium">{card.title}</p>
      {card.preview && <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.preview}</p>}
      {card.body && <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.body}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {card.effort ? <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{card.effort}</span> : <span />}
        <button type="button" onClick={onAdd} className="text-xs underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">Добавить изменение</button>
      </div>
    </div>
  )
}

export default function Room() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh: refreshTasks } = useTasks()
  const [room, setRoom] = useState<RoomData | null>(null)
  const [tab, setTab] = useState<'editor' | 'design'>(() => searchParams.get('tab') === 'design' ? 'design' : 'editor')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [breakdownBusy, setBreakdownBusy] = useState(false)
  const [breakdownError, setBreakdownError] = useState('')
  const [pendingEdit, setPendingEdit] = useState<{ id: string; text: string } | null>(null)

  const loadRoom = useCallback(async (renderId?: string) => {
    try {
      const r = await fetch(`/api/rooms/${id}${renderId ? `?render_id=${encodeURIComponent(renderId)}` : ''}`)
      if (r.status === 401) { setError('Войдите, чтобы открыть комнату'); return null }
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Комната не найдена'); return null }
      setRoom(d)
      return d as RoomData
    } catch {
      setError('Не удалось открыть комнату')
      return null
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await loadRoom()
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [loadRoom])

  const busy = room ? room.status !== 'done' && room.status !== 'error' : false
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => { void loadRoom() }, 5000)
    return () => window.clearInterval(timer)
  }, [busy, loadRoom])

  const render = room?.render || null
  const image = render?.image || room?.photo_url || null
  const breakdown = render?.analysis?.breakdown || null
  const selectedRenderId = render?.id || ''
  const selectedRenderRef = useRef('')

  useEffect(() => {
    selectedRenderRef.current = selectedRenderId
    setBreakdownBusy(false)
    setBreakdownError('')
  }, [selectedRenderId])

  const runBreakdown = async () => {
    if (!render?.id || breakdownBusy) return
    const targetId = render.id
    setBreakdownBusy(true)
    setBreakdownError('')
    window.setTimeout(() => { void refreshTasks() }, 1500)
    try {
      const r = await fetch(`/api/renders/${targetId}/breakdown`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      if (selectedRenderRef.current !== targetId) return
      await loadRoom(targetId)
      void refreshTasks()
    } catch (e) {
      if (selectedRenderRef.current === targetId) setBreakdownError(e instanceof Error ? e.message : 'Не удалось собрать разбор')
    } finally {
      if (selectedRenderRef.current === targetId) setBreakdownBusy(false)
    }
  }

  const addChangeToEditor = (value: string) => {
    const text = value.trim()
    if (text) setPendingEdit({ id: crypto.randomUUID(), text })
    setTab('editor')
  }

  if (loading && !room) {
    return <main className="page-shell flex min-h-[60vh] items-center justify-center"><LoaderCircle className="size-8 animate-spin text-primary-text" /></main>
  }

  if (!room) {
    return (
      <main className="page-shell py-20">
        <p className="text-sm text-muted-foreground">{error || 'Комната не найдена'}</p>
        <Link to="/cabinet" className="action-secondary mt-6 inline-flex"><ArrowLeft className="size-4" />В кабинет</Link>
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="text-lg font-medium tracking-tight">ремонт<span className="text-primary-text">вижн</span></a>
            <span className="eyebrow hidden sm:inline">/ комната</span>
          </div>
          <button type="button" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/cabinet') }} className="flex size-11 shrink-0 items-center justify-center border border-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
      </header>

      <main className="page-shell py-8">
        {error && <p className="mb-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}

        {busy ? (
          <div className="mx-auto max-w-xl py-16 text-center" role="status" aria-live="polite">
            {image && <img src={image} alt="Фото комнаты" className="mx-auto max-h-[40svh] w-auto border object-contain" />}
            <LoaderCircle className="mx-auto mt-8 size-8 animate-spin text-primary-text motion-reduce:animate-none" />
            <h1 className="display-title mt-4 text-3xl">{stageLabel(room.status)}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Дизайн создаётся. Функции комнаты откроются автоматически.</p>
            <div className="relative mt-6 h-1 overflow-hidden bg-border"><div className="rv-progress absolute inset-y-0 left-0 w-1/3 bg-primary" /></div>
          </div>
        ) : room.status === 'error' ? (
          <div className="mx-auto max-w-xl py-16 text-center">
            {image && <img src={image} alt="Фото комнаты" className="mx-auto max-h-[40svh] w-auto border object-contain" />}
            <h1 className="display-title mt-6 text-3xl">Не удалось</h1>
            <p className="mt-3 text-sm text-destructive">{room.error || 'Генерация завершилась ошибкой'}</p>
            <Link to="/cabinet" className="action-secondary mt-6 inline-flex"><ArrowLeft className="size-4" />В кабинет</Link>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
              <div>
                <p className="eyebrow">{room.room_type || 'Комната'}</p>
                <h1 className="display-title mt-2 text-4xl sm:text-5xl">{room.style}</h1>
              </div>
            </div>

            {image && (
              <div className="relative mt-6 bg-foreground">
                <img src={image} alt="Дизайн комнаты" className="max-h-[62svh] w-full object-contain" />
                <div className="absolute right-3 top-3 flex gap-2">
                  <button type="button" onClick={() => setFullscreen(true)} className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground" aria-label="Во весь экран"><Expand className="size-5" /></button>
                  <a href={image} download="remontvision-design.webp" className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground" aria-label="Скачать"><Download className="size-5" /></a>
                  {render?.id && <button type="button" onClick={() => setShareOpen(true)} className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground" aria-label="Поделиться"><Share2 className="size-5" /></button>}
                </div>
              </div>
            )}

            <nav className="mt-6 flex overflow-x-auto border-b" aria-label="Разделы комнаты">
              {([['editor', 'Редактор'], ['design', 'Разбор интерьера']] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-12 shrink-0 border-b-2 px-4 text-sm ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
              ))}
            </nav>

            <div className={tab === 'editor' ? 'mt-6 min-w-0' : 'mt-6 hidden min-w-0'}>
              <GenerationPanel
                key={id}
                open
                inline
                initialRoomId={id}
                onClose={() => {}}
                onRequireLogin={() => navigate('/')}
                onRefreshUser={async () => {}}
                onEdited={() => { void loadRoom() }}
                onSelectVersion={(renderId) => { void loadRoom(renderId) }}
                pendingEdit={pendingEdit}
                onPendingEditHandled={() => setPendingEdit(null)}
                isAuthed
              />
            </div>

            <div className={tab === 'design' ? 'mt-6 min-w-0' : 'mt-6 hidden min-w-0'}>
              <DesignTab
                render={render}
                breakdown={breakdown}
                busy={breakdownBusy}
                error={breakdownError}
                onRun={() => void runBreakdown()}
                onAddChange={addChangeToEditor}
                onOpenEditor={() => setTab('editor')}
              />
            </div>
          </div>
        )}
      </main>

      {fullscreen && image && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/95 p-4" role="dialog" aria-modal="true" aria-label="Просмотр дизайна" onClick={() => setFullscreen(false)}>
          <button type="button" onClick={() => setFullscreen(false)} className="absolute right-4 top-4 flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground" aria-label="Закрыть"><X className="size-5" /></button>
          <img src={image} alt="Дизайн комнаты" className="max-h-full max-w-full object-contain" onClick={event => event.stopPropagation()} />
        </div>
      )}

      {render?.id && <ShareDialog renderId={render.id} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </div>
  )
}

function DesignTab({ render, breakdown, busy, error, onRun, onAddChange, onOpenEditor }: {
  render: Render | null
  breakdown: Breakdown | null
  busy: boolean
  error: string
  onRun: () => void
  onAddChange: (text: string) => void
  onOpenEditor: () => void
}) {
  const surfaces = render?.analysis?.surfaces || []
  const electrical = render?.analysis?.electrical || []
  const changeCards = breakdown?.sections.find(section => section.key === 'change')?.cards || []
  const nextAction = breakdown?.next_action?.kind === 'change' || breakdown?.next_action?.kind === 'apply'
    ? breakdown.next_action
    : null

  const runNextAction = () => {
    const kind = nextAction?.kind
    if (kind === 'change' || kind === 'apply') {
      const instruction = changeCards.find(card => card.edit_instruction)?.edit_instruction
        || changeCards[0]?.title
        || ''
      if (instruction) { onAddChange(instruction); return }
    }
    onOpenEditor()
  }

  return (
    <div className="mt-2 space-y-6">
      {!breakdown ? (
        <div className="border border-foreground/25 p-5 sm:p-7">
          <p className="eyebrow">Разбор интерьера</p>
          <h2 className="display-title mt-3 text-2xl sm:text-3xl">Ваш интерьер — в деталях</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Что сохранить, что проверить и как воплотить. Разбор опирается на этот рендер и сохранится в комнате.</p>
          {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
          <button type="button" onClick={onRun} disabled={busy} className="action-primary mt-5 w-full sm:w-auto">
            {busy ? <><LoaderCircle className="size-4 animate-spin" /> Разбираем…</> : <>Запустить разбор <ArrowRight className="size-4" /></>}
          </button>
        </div>
      ) : (
        <>
          <header>
            <p className="eyebrow">Разбор интерьера</p>
            <h2 className="display-title mt-2 text-3xl sm:text-4xl">{breakdown.title}</h2>
            {breakdown.lead && <p className="mt-2 text-sm text-muted-foreground">{breakdown.lead}</p>}
          </header>

          {!!breakdown.top_cards.length && (
            <div className="space-y-2">
              {breakdown.top_cards.map((card, index) => (
                <Disclosure key={`top-${index}`} title={card.title} preview={card.preview} action={card.action}>
                  {card.body && <p>{card.body}</p>}
                  {!!card.details?.length && <ul className="list-disc space-y-1 pl-5">{card.details.map((detail, detailIndex) => <li key={detailIndex}>{detail}</li>)}</ul>}
                </Disclosure>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {breakdown.sections.map(section => (
              <details key={section.key} className="group border border-foreground/25">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{section.title}</span>
                    {section.preview && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{section.preview}</span>}
                  </span>
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2 border-t border-foreground/25 p-3">
                  {section.cards.map((card, index) => {
                    if (section.key === 'buy') return <BuyCard key={`buy-${index}`} card={card} />
                    if (section.key === 'change') return <ChangeCard key={`change-${index}`} card={card} onAdd={() => onAddChange(card.edit_instruction || card.title || '')} />
                    return (
                      <Disclosure key={`${section.key}-${index}`} title={card.title} preview={card.preview} action={card.action}>
                        {card.body && <p>{card.body}</p>}
                        {!!card.details?.length && <ul className="list-disc space-y-1 pl-5">{card.details.map((detail, detailIndex) => <li key={detailIndex}>{detail}</li>)}</ul>}
                      </Disclosure>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>

          {nextAction && (
            <button type="button" onClick={runNextAction} className="action-primary w-full">
              {nextAction.label} <ArrowRight className="size-4" />
            </button>
          )}

          {!!breakdown.questions.length && (
            <Section title="Что уточнить">
              <ul className="list-disc space-y-1 pl-5 text-sm leading-6">{breakdown.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
            </Section>
          )}
        </>
      )}

      {!!surfaces.length && (
        <Section title="Палитра RAL">
          <div className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
            {surfaces.map((surface, index) => (
              <div key={`${surface.surface}-${index}`} className="bg-background p-3">
                <span className="block h-10 w-full border border-foreground/20" style={{ background: surface.hex || 'transparent' }} />
                <p className="mt-2 text-xs font-medium">{surface.label || surface.surface}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{surface.ral?.code || surface.hex}</p>
                {surface.ral?.name ? <p className="text-[11px] text-muted-foreground">{surface.ral.name}</p> : null}
                {surface.description ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{surface.description}</p> : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!!electrical.length && (
        <Section title="Розетки и свет · рекомендация">
          <ul className="divide-y border-y">
            {electrical.map((item, index) => (
              <li key={index} className="flex gap-3 py-3 text-sm"><Zap className="mt-0.5 size-4 shrink-0 text-primary-text" /><div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div></li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

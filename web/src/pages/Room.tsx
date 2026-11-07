import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, ChevronDown, Download, Expand, LoaderCircle, Share2, X, Zap } from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import { GenerationPanel } from '@/components/GenerationPanel'
import { useTasks } from '@/components/TaskDock'
import { GuideIcon } from '@/components/GuideIcon'
import { RoadmapTab } from '@/components/RoomRoadmap'
import type { RoadmapGroup, RoadmapItem } from '@/lib/roadmap'
import '../App.css'

type Surface = { surface?: string; label?: string; hex?: string; ral?: { code?: string; name?: string } | null; description?: string }
type Electrical = { title?: string; text?: string }
type Move = { target?: string; action?: string; effect?: string }
type DesignDirection = {
  concept?: string
  mainMove?: Move | null
  focalPoint?: string
  materials?: string
  palette?: { hex?: string | null; name?: string }[]
}
type BreakdownTopCard = { icon?: string; title: string; preview?: string }
type BreakdownBuyCard = { icon?: string; name: string; traits?: string; clarify?: string }
type BreakdownCalcCard = { icon?: string; element: string; note?: string }
type BreakdownCheckCard = { icon?: string; what: string; when?: string; why?: string }
type BreakdownStartCard = { icon?: string; action: string; why?: string }
type BreakdownSection =
  | { key: 'buy'; icon?: string; title: string; preview?: string; cards: BreakdownBuyCard[] }
  | { key: 'calc'; icon?: string; title: string; preview?: string; cards: BreakdownCalcCard[] }
  | { key: 'check'; icon?: string; title: string; preview?: string; cards: BreakdownCheckCard[] }
  | { key: 'start'; icon?: string; title: string; preview?: string; cards: BreakdownStartCard[] }
type Breakdown = { version?: number; title: string; lead?: string; top_cards: BreakdownTopCard[]; sections: BreakdownSection[] }
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
  design_direction?: DesignDirection | null
}
type RoomData = {
  id: string
  style: string
  room_type?: string | null
  status: string
  error?: string | null
  photo_url?: string | null
  has_purchased?: boolean
  roadmap_items?: RoadmapItem[]
  render?: Render | null
}

const stageLabel = (status?: string) => status === 'analyzing' ? 'Анализ фото' : status === 'rendering' ? 'Генерация изображения' : status === 'matching' ? 'Разбор рендера' : status === 'queued' ? 'В очереди' : 'В процессе'

function GuideSection({ icon, title, preview, children }: { icon?: string; title: string; preview?: string; children: ReactNode }) {
  return (
    <details className="group border border-foreground/25">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <GuideIcon name={icon} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {preview && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{preview}</span>}
        </span>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-foreground/25 p-3">{children}</div>
    </details>
  )
}

function GuideItem({ icon, title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3 border border-foreground/20 p-3">
      <GuideIcon name={icon} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5">{title}</p>
        {children}
      </div>
    </div>
  )
}

function SectionCards({ section }: { section: BreakdownSection }) {
  if (section.key === 'buy') {
    return <>{section.cards.map((card, index) => (
      <GuideItem key={index} icon={card.icon} title={card.name}>
        {card.traits && <p className="mt-1 text-xs leading-5 text-muted-foreground">Сохранить: {card.traits}</p>}
        {card.clarify && <p className="mt-1 text-xs leading-5 text-muted-foreground">Уточнить: {card.clarify}</p>}
      </GuideItem>
    ))}</>
  }
  if (section.key === 'calc') {
    return <>{section.cards.map((card, index) => (
      <GuideItem key={index} icon={card.icon} title={card.element}>
        {card.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">В расчёт: {card.note}</p>}
      </GuideItem>
    ))}</>
  }
  if (section.key === 'check') {
    return <>{section.cards.map((card, index) => (
      <GuideItem key={index} icon={card.icon} title={card.what}>
        {card.when && <p className="mt-1 text-xs leading-5 text-muted-foreground">До: {card.when}</p>}
        {card.why && <p className="mt-1 text-xs leading-5 text-muted-foreground">Зачем: {card.why}</p>}
      </GuideItem>
    ))}</>
  }
  return <>{section.cards.map((card, index) => (
    <GuideItem key={index} icon={card.icon} title={card.action}>
      {card.why && <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.why}</p>}
    </GuideItem>
  ))}</>
}

export default function Room() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh: refreshTasks } = useTasks()
  const [room, setRoom] = useState<RoomData | null>(null)
  const [tab, setTab] = useState<'editor' | 'design' | 'roadmap'>(() => {
    const value = searchParams.get('tab')
    return value === 'design' || value === 'roadmap' ? value : 'editor'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [breakdownBusy, setBreakdownBusy] = useState(false)
  const [breakdownError, setBreakdownError] = useState('')
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [roadmapBusy, setRoadmapBusy] = useState(false)
  const [roadmapError, setRoadmapError] = useState('')

  const loadRoom = useCallback(async (renderId?: string) => {
    try {
      const r = await fetch(`/api/rooms/${id}${renderId ? `?render_id=${encodeURIComponent(renderId)}` : ''}`)
      if (r.status === 401) { setError('Войдите, чтобы открыть комнату'); return null }
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Комната не найдена'); return null }
      setRoom(d)
      setItems(Array.isArray(d.roadmap_items) ? d.roadmap_items : [])
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
  const storedBreakdown = render?.analysis?.breakdown || null
  const breakdown = storedBreakdown?.version === 2 ? storedBreakdown : null
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

  const runRoadmap = async (refresh = false) => {
    if (!render?.id || roadmapBusy) return
    const targetId = render.id
    setRoadmapBusy(true)
    setRoadmapError('')
    window.setTimeout(() => { void refreshTasks() }, 1500)
    try {
      const r = await fetch(`/api/renders/${targetId}/roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refresh ? { refresh: true } : {}),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      if (selectedRenderRef.current !== targetId) return
      const fresh = await loadRoom(targetId)
      if (fresh?.roadmap_items) setItems(fresh.roadmap_items)
      void refreshTasks()
    } catch (e) {
      if (selectedRenderRef.current === targetId) setRoadmapError(e instanceof Error ? e.message : 'Не удалось составить роадмап')
    } finally {
      if (selectedRenderRef.current === targetId) setRoadmapBusy(false)
    }
  }

  const patchRoadmapItem = async (item: RoadmapItem, patch: Partial<Pick<RoadmapItem, 'done' | 'active' | 'comment' | 'text'>>) => {
    setItems(prev => prev.map(row => row.id === item.id ? { ...row, ...patch } : row))
    try {
      const r = await fetch(`/api/rooms/${id}/roadmap/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: item.id, ...patch }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      setItems(prev => prev.map(row => row.id === d.id ? { ...row, ...d } : row))
    } catch {
      setItems(prev => prev.map(row => row.id === item.id ? item : row))
      setRoadmapError('Не удалось сохранить изменение')
    }
  }

  const addRoadmapItem = async (group: RoadmapGroup, text: string) => {
    const sort = Math.max(-1, ...items.filter(row => row.section_key === group.key).map(row => row.sort)) + 1
    try {
      const r = await fetch(`/api/rooms/${id}/roadmap/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', section_key: group.key, section_title: group.title, section_icon: group.icon, section_sort: group.sort, sort, text }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      setItems(prev => [...prev, d])
      return true
    } catch (e) {
      setRoadmapError(e instanceof Error ? e.message : 'Не удалось добавить строку')
      return false
    }
  }

  const deleteRoadmapItem = async (item: RoadmapItem) => {
    setItems(prev => prev.filter(row => row.id !== item.id))
    try {
      const r = await fetch(`/api/rooms/${id}/roadmap/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: item.id }),
      })
      if (!r.ok) throw new Error()
    } catch {
      setItems(prev => [...prev, item])
      setRoadmapError('Не удалось удалить строку')
    }
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
              {([['editor', 'Редактор'], ['design', 'Разбор интерьера'], ['roadmap', 'Закупка']] as const).map(([key, label]) => (
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
                isAuthed
              />
            </div>

            <div className={tab === 'design' ? 'mt-6 min-w-0' : 'mt-6 hidden min-w-0'}>
              <DesignTab
                render={render}
                style={room.style}
                breakdown={breakdown}
                busy={breakdownBusy}
                error={breakdownError}
                onRun={() => void runBreakdown()}
              />
            </div>

            <div className={tab === 'roadmap' ? 'mt-6 min-w-0' : 'mt-6 hidden min-w-0'}>
              <RoadmapTab
                items={items}
                hasPurchased={Boolean(room.has_purchased)}
                busy={roadmapBusy}
                error={roadmapError}
                actions={{
                  onGenerate: () => void runRoadmap(false),
                  onRegenerate: () => void runRoadmap(true),
                  onShare: () => setShareOpen(true),
                  onToggleDone: item => void patchRoadmapItem(item, { done: !item.done }),
                  onToggleActive: item => void patchRoadmapItem(item, { active: !item.active }),
                  onComment: (item, comment) => void patchRoadmapItem(item, { comment: comment || null }),
                  onAdd: addRoadmapItem,
                  onDelete: item => void deleteRoadmapItem(item),
                }}
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

function DesignTab({ render, style, breakdown, busy, error, onRun }: {
  render: Render | null
  style: string
  breakdown: Breakdown | null
  busy: boolean
  error: string
  onRun: () => void
}) {
  const surfaces = render?.analysis?.surfaces || []
  const electrical = render?.analysis?.electrical || []
  const direction = render?.design_direction || null
  const startCard = breakdown?.sections.find(section => section.key === 'start')?.cards[0]
  const guideSections = breakdown?.sections.filter(section => section.key !== 'start') || []

  return (
    <div className="mt-2 space-y-4">
      {!breakdown ? (
        <div className="border border-foreground/25 p-5 sm:p-7">
          <p className="eyebrow">Разбор интерьера</p>
          <h2 className="display-title mt-3 text-2xl sm:text-3xl">Как воплотить этот дизайн</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Что повторить, что купить, что включить в расчёт и что согласовать до заказа. Разбор опирается на этот рендер и сохранится в комнате.</p>
          {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
          <button type="button" onClick={onRun} disabled={busy} className="action-primary mt-5 w-full sm:w-auto">
            {busy ? <><LoaderCircle className="size-4 animate-spin" /> Разбираем…</> : <>Запустить разбор <ArrowRight className="size-4" /></>}
          </button>
        </div>
      ) : (
        <>
          <div className="border border-foreground/25 p-4">
            <div className="flex items-start gap-3">
              <GuideIcon name="sparkles" className="mt-0.5" />
              <div className="min-w-0">
                <p className="eyebrow">Стиль</p>
                <p className="mt-1 text-sm font-medium">{style}</p>
                {direction?.concept && <p className="mt-1 text-xs leading-5 text-muted-foreground">{direction.concept}</p>}
                {direction?.mainMove?.action && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Акцент: {direction.mainMove.target ? `${direction.mainMove.target} — ` : ''}{direction.mainMove.action}{direction.mainMove.effect ? ` · ${direction.mainMove.effect}` : ''}
                  </p>
                )}
                {direction?.focalPoint && <p className="mt-1 text-xs leading-5 text-muted-foreground">Фокус: {direction.focalPoint}</p>}
              </div>
            </div>
          </div>

          <header>
            <h2 className="display-title text-3xl sm:text-4xl">{breakdown.title}</h2>
            {breakdown.lead && <p className="mt-2 text-sm text-muted-foreground">{breakdown.lead}</p>}
          </header>

          {!!breakdown.top_cards.length && (
            <div className="space-y-2">
              <p className="eyebrow">Главное</p>
              {breakdown.top_cards.map((card, index) => (
                <div key={index} className="flex gap-3 border border-foreground/25 p-3">
                  <GuideIcon name={card.icon} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">{card.title}</p>
                    {card.preview && <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.preview}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {guideSections.map(section => (
              <GuideSection key={section.key} icon={section.icon} title={section.title} preview={section.preview}>
                <SectionCards section={section} />
              </GuideSection>
            ))}
          </div>

          {startCard && (
            <div className="border border-foreground bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <GuideIcon name={startCard.icon || 'rocket'} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="eyebrow">С чего начать</p>
                  <p className="mt-1 text-sm font-medium">{startCard.action}</p>
                  {startCard.why && <p className="mt-1 text-xs leading-5 text-muted-foreground">{startCard.why}</p>}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!!surfaces.length && (
        <GuideSection icon="palette" title="Цвета (RAL)" preview="Палитра из архитекторского разбора">
          <div className="grid grid-cols-2 gap-px border border-foreground/20 bg-border sm:grid-cols-3">
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
        </GuideSection>
      )}

      {!!electrical.length && (
        <GuideSection icon="zap" title="Розетки и свет" preview="Рекомендации из архитекторского разбора">
          <ul className="divide-y border-y">
            {electrical.map((item, index) => (
              <li key={index} className="flex gap-3 py-3 text-sm">
                <Zap className="mt-0.5 size-4 shrink-0 text-primary-text" />
                <div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div>
              </li>
            ))}
          </ul>
        </GuideSection>
      )}
    </div>
  )
}

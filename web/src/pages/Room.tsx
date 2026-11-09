import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Download, Expand, LoaderCircle, Scan, Share2, X, Zap } from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import { ObjectLayer } from '@/components/ObjectLayer'
import { GenerationPanel } from '@/components/GenerationPanel'
import { useTasks } from '@/components/TaskDock'
import { GuideIcon } from '@/components/GuideIcon'
import { Logo } from '@/components/Logo'
import { RoadmapTab } from '@/components/RoomRoadmap'
import type { RoadmapGroup, RoadmapItem } from '@/lib/roadmap'
import '../App.css'

type Surface = { surface?: string; label?: string; hex?: string; ral?: { code?: string; name?: string } | null; description?: string }
type Electrical = { title?: string; text?: string }
type Move = { target?: string; action?: string; effect?: string }
type DesignDirection = {
  concept?: string
  mood?: string
  mainMove?: Move | null
  focalPoint?: string
  materials?: string
  materialsStory?: string[]
  quietAreas?: string[]
}
type BreakdownCard = { icon?: string; name: string; traits?: string; clarify?: string; why?: string; hex?: string | null }
type BreakdownLighting = { plan?: string; temperature?: string; why?: string }
type Breakdown = { version?: number; title: string; lead?: string; cards: BreakdownCard[]; lighting?: BreakdownLighting | null }
type Render = {
  id: string
  image: string | null
  status: string
  request_text?: string | null
  created_at?: string
  analysis?: {
    surfaces?: Surface[]
    electrical?: Electrical[]
    visible?: Array<{ label?: string; bbox?: number[]; area?: number } | string>
    breakdown?: Breakdown | null
  } | null
}
type RoomData = {
  id: string
  style: string
  room_type?: string | null
  status: string
  error?: string | null
  notice?: string | null
  photo_url?: string | null
  has_purchased?: boolean
  roadmap_items?: RoadmapItem[]
  design_direction?: DesignDirection | null
  render?: Render | null
}

const stageLabel = (status?: string) => status === 'analyzing' ? 'Анализ фото' : status === 'rendering' ? 'Создание дизайна' : status === 'matching' ? 'Разбор рендера' : status === 'queued' ? 'В очереди' : 'В процессе'

const displayColor = (value?: string | null) => /^#[0-9a-f]{6}$/i.test(value || '') ? value! : null

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
  const [objectsOn, setObjectsOn] = useState(false)
  const [selectedObject, setSelectedObject] = useState<number | null>(null)
  const [renderRatio, setRenderRatio] = useState(1.5)

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
  const visibleObjects = (render?.analysis?.visible || []).filter(
    (object): object is { label?: string; bbox: number[]; area?: number } => typeof object === 'object' && object !== null && Array.isArray(object.bbox) && object.bbox.length === 4,
  )
  const storedBreakdown = render?.analysis?.breakdown || null
  const breakdown = storedBreakdown?.version === 4 ? storedBreakdown : null
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
            <Logo animated />
            <span className="eyebrow hidden sm:inline">/ комната</span>
          </div>
          <button type="button" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/cabinet') }} className="flex size-11 shrink-0 items-center justify-center border border-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
      </header>

      <main className="page-shell py-8">
        {error && <p className="mb-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
        {room.notice && <p className="mb-4 border border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-5" role="status">{room.notice}</p>}

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
            <p className="mt-3 text-sm text-destructive">{room.error || 'Не удалось создать дизайн'}</p>
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
                {objectsOn && visibleObjects.length ? (
                  <ObjectLayer
                    image={image}
                    ratio={renderRatio}
                    objects={visibleObjects}
                    selectedIndex={selectedObject}
                    onSelect={(index) => setSelectedObject(index)}
                  />
                ) : (
                  <img src={image} alt="Дизайн комнаты" className="max-h-[62svh] w-full object-contain" onLoad={event => setRenderRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
                )}
                <div className="absolute right-3 top-3 flex gap-2">
                  {visibleObjects.length > 0 && (
                    <button type="button" aria-pressed={objectsOn} onClick={() => { setObjectsOn(value => !value); setSelectedObject(null) }} className={`flex size-12 items-center justify-center border backdrop-blur-sm transition-colors ${objectsOn ? 'border-primary bg-primary text-primary-foreground' : 'border-background/40 bg-foreground/60 text-background hover:bg-background hover:text-foreground'}`} aria-label="Выбрать объект на рендере"><Scan className="size-5" /></button>
                  )}
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
                objectTarget={selectedObject !== null ? visibleObjects[selectedObject] : null}
                onClearObject={() => setSelectedObject(null)}
              />
            </div>

            <div className={tab === 'design' ? 'mt-6 min-w-0' : 'mt-6 hidden min-w-0'}>
              <DesignTab
                render={render}
                direction={room.design_direction || null}
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

function DesignTab({ render, direction, breakdown, busy, error, onRun }: {
  render: Render | null
  direction: DesignDirection | null
  breakdown: Breakdown | null
  busy: boolean
  error: string
  onRun: () => void
}) {
  const surfaces = render?.analysis?.surfaces || []
  const electrical = render?.analysis?.electrical || []
  const materials = direction?.materialsStory?.length ? direction.materialsStory.join(', ') : direction?.materials
  const hasBrief = Boolean(direction && (direction.concept || direction.mood || direction.mainMove?.action || materials || direction.focalPoint))

  return (
    <div className="mt-2 space-y-6">
      {hasBrief && direction && (
        <section className="border border-foreground/25 p-4">
          <div className="flex items-start gap-3">
            <GuideIcon name="sparkles" className="mt-0.5" />
            <div className="min-w-0">
              <p className="eyebrow">Авторский бриф</p>
              {direction.concept && <p className="mt-1.5 text-sm font-medium leading-5">{direction.concept}</p>}
              {direction.mood && direction.mood !== direction.concept && <p className="mt-1 text-xs leading-5 text-muted-foreground">{direction.mood}</p>}
              {direction.mainMove?.action && (
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  Акцент: {direction.mainMove.target ? `${direction.mainMove.target} — ` : ''}{direction.mainMove.action}{direction.mainMove.effect ? ` · ${direction.mainMove.effect}` : ''}
                </p>
              )}
              {materials && <p className="mt-1 text-xs leading-5 text-muted-foreground">Материалы: {materials}</p>}
              {direction.focalPoint && <p className="mt-1 text-xs leading-5 text-muted-foreground">Фокус: {direction.focalPoint}</p>}
              {!!direction.quietAreas?.length && <p className="mt-1 text-xs leading-5 text-muted-foreground">Спокойные зоны: {direction.quietAreas.join(', ')}</p>}
            </div>
          </div>
        </section>
      )}

      {!breakdown ? (
        <div className="border border-foreground/25 p-5 sm:p-7">
          <p className="eyebrow">Разбор интерьера</p>
          <h2 className="display-title mt-3 text-2xl sm:text-3xl">Что подобрать</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Соберём главные позиции, которые нужно подобрать для этого интерьера: что сохранить и что уточнить до покупки.</p>
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
            {breakdown.lead && <p className="mt-2 text-sm leading-6 text-muted-foreground">{breakdown.lead}</p>}
          </header>

          <div className="space-y-2">
            {breakdown.cards.map((card, index) => {
              const swatch = displayColor(card.hex)
              return (
                <div key={index} className="flex gap-3 border border-foreground/25 p-3">
                  {swatch ? (
                    <span className="size-10 shrink-0 border border-foreground/20" style={{ background: swatch }} aria-hidden="true" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center border border-foreground/20"><GuideIcon name={card.icon} /></span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">{card.name}</p>
                    {card.traits && <p className="mt-1 text-xs leading-5 text-muted-foreground">Сохранить: {card.traits}</p>}
                    {card.clarify && <p className="mt-1 text-xs leading-5 text-muted-foreground">Уточнить: {card.clarify}</p>}
                    {card.why && (
                      <p className="mt-1.5 flex gap-1.5 text-[11px] leading-4 text-primary-text">
                        <GuideIcon name="sparkles" className="mt-0.5 size-3.5" />
                        <span>{card.why}</span>
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {breakdown.lighting && (breakdown.lighting.plan || breakdown.lighting.temperature || breakdown.lighting.why) && (
            <section className="border border-foreground/25 p-4">
              <div className="flex items-start gap-3">
                <GuideIcon name="lightbulb" className="mt-0.5" />
                <div className="min-w-0">
                  <p className="eyebrow">Световой дизайн</p>
                  {breakdown.lighting.plan && <p className="mt-1.5 text-sm font-medium leading-5">{breakdown.lighting.plan}</p>}
                  {breakdown.lighting.temperature && <p className="mt-1 text-xs leading-5 text-muted-foreground">Температура: {breakdown.lighting.temperature}</p>}
                  {breakdown.lighting.why && (
                    <p className="mt-1.5 flex gap-1.5 text-[11px] leading-4 text-primary-text">
                      <GuideIcon name="sparkles" className="mt-0.5 size-3.5" />
                      <span>{breakdown.lighting.why}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 border-t border-foreground/15 pt-3">
                <p className="eyebrow">Принципы</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
                  <li>Три слоя света: общий, рабочий и акцентный — на отдельных контурах.</li>
                  <li>Тёплый свет 2700–3000K, одна температура в комнате.</li>
                  <li>CRI ≥ 90 — иначе краски и материалы теряют цвет.</li>
                  <li>Не меньше трёх источников на разной высоте и диммеры.</li>
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      {!!surfaces.length && (
        <section className="border-t pt-5">
          <p className="eyebrow mb-3">Цвета (RAL)</p>
          <div className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
            {surfaces.map((surface, index) => (
              <div key={`${surface.surface}-${index}`} className="bg-background p-3">
                <span className="block h-16 w-full border border-foreground/20" style={{ background: displayColor(surface.hex) || 'transparent' }} />
                <p className="mt-2 text-xs font-medium">{surface.label || surface.surface}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{surface.ral?.code || surface.hex}</p>
                {surface.ral?.name ? <p className="text-[11px] text-muted-foreground">{surface.ral.name}</p> : null}
                {surface.description ? <p className="mt-1.5 text-[11px] leading-4 text-primary-text">Почему: {surface.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {!!electrical.length && (
        <section className="border-t pt-5">
          <p className="eyebrow mb-3">Розетки и свет</p>
          <ul className="divide-y border-y">
            {electrical.map((item, index) => (
              <li key={index} className="flex gap-3 py-3 text-sm">
                <Zap className="mt-0.5 size-4 shrink-0 text-primary-text" />
                <div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

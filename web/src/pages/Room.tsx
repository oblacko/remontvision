import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ShareDialog } from '@/components/ShareDialog'
import { ObjectLayer } from '@/components/ObjectLayer'
import { GenerationPanel } from '@/components/GenerationPanel'
import { buildMoveCleanupInstruction } from '@/lib/objects'
import { useTasks } from '@/components/TaskDock'
import { GuideIcon } from '@/components/GuideIcon'
import { Logo } from '@/components/Logo'
import { RoadmapTab } from '@/components/RoomRoadmap'
import { KitIcon } from '@/components/KitIcon'
import { KitLightbox } from '@/components/KitSheet'
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
  const [objectBusy, setObjectBusy] = useState(false)

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

  const sendObjectMove = async (index: number, dx: number, dy: number) => {
    const object = visibleObjects[index]
    if (!object || !render?.id || !image || objectBusy) return
    setObjectBusy(true); setError('')
    try {
      const instruction = buildMoveCleanupInstruction(object.label, object.bbox)
      const fd = new FormData()
      fd.append('text', instruction)
      fd.append('parent_id', render.id)
      fd.append('move', JSON.stringify({ bbox: object.bbox, dx, dy, label: object.label }))
      const r = await fetch(`/api/rooms/${id}/iterate`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Не удалось переместить объект')
      setObjectsOn(false)
      setSelectedObject(null)
      await loadRoom()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось переместить объект')
    } finally {
      setObjectBusy(false)
    }
  }

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
    return <main className="page-shell flex min-h-[60vh] items-center justify-center"><KitIcon name="sp" spin className="size-8 text-primary-text" /></main>
  }

  if (!room) {
    return (
      <main className="page-shell py-20">
        <p className="text-sm text-muted-foreground">{error || 'Комната не найдена'}</p>
        <Link to="/cabinet" className="k-btn mt-6 inline-flex"><KitIcon name="l" />В кабинет</Link>
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-page text-foreground">
      <header className="sticky top-0 z-40 border-b bg-page">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo animated />
            <span className="eyebrow hidden sm:inline">/ комната</span>
          </div>
          <button type="button" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/cabinet') }} className="k-btn k-btn--icon" aria-label="Закрыть">
            <KitIcon name="x" />
          </button>
        </div>
      </header>

      <main className="page-shell py-8">
        {error && <p className="mb-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
        {room.notice && <p className="mb-4 border border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-5" role="status">{room.notice}</p>}

        {busy ? (
          <div className="mx-auto max-w-xl py-16 text-center" role="status" aria-live="polite">
            {image && <img src={image} alt="Фото комнаты" className="mx-auto max-h-[40svh] w-auto border object-contain" />}
            <KitIcon name="sp" spin className="mx-auto mt-8 size-8 text-primary-text" />
            <h1 className="display-title mt-4 text-3xl">{stageLabel(room.status)}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Дизайн создаётся. Функции комнаты откроются автоматически.</p>
            <div className="k-pb mt-6"><i style={{ width: '33%' }} className="rv-progress" /></div>
          </div>
        ) : room.status === 'error' ? (
          <div className="mx-auto max-w-xl py-16 text-center">
            {image && <img src={image} alt="Фото комнаты" className="mx-auto max-h-[40svh] w-auto border object-contain" />}
            <h1 className="display-title mt-6 text-3xl">Не удалось</h1>
            <p className="mt-3 text-sm text-destructive">{room.error || 'Не удалось создать дизайн'}</p>
            <Link to="/cabinet" className="k-btn mt-6 inline-flex"><KitIcon name="l" />В кабинет</Link>
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
              <div className="relative mt-6 bg-secondary">
                {objectsOn && visibleObjects.length ? (
                  <ObjectLayer
                    image={image}
                    ratio={renderRatio}
                    objects={visibleObjects}
                    onCreateEdit={(index) => { setSelectedObject(index); setTab('editor') }}
                    onConfirmMove={(index, dx, dy) => { if (!objectBusy) void sendObjectMove(index, dx, dy) }}
                  />
                ) : (
                  <img src={image} alt="Дизайн комнаты" className="max-h-[62svh] w-full object-contain" onLoad={event => setRenderRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
                )}
                <div className="absolute right-3 top-3 flex gap-2">
                  {visibleObjects.length > 0 && (
                    <button type="button" aria-pressed={objectsOn} onClick={() => { setObjectsOn(value => !value); setSelectedObject(null) }} className={`k-btn k-btn--ov k-btn--icon${objectsOn ? ' bg-primary text-primary-foreground' : ''}`} aria-label="Выбрать объект на рендере"><KitIcon name="q" /></button>
                  )}
                  <button type="button" onClick={() => setFullscreen(true)} className="k-btn k-btn--ov k-btn--icon" aria-label="Во весь экран"><KitIcon name="fs" /></button>
                  <a href={image} download="remontvision-design.webp" className="k-btn k-btn--ov k-btn--icon" aria-label="Скачать"><KitIcon name="dl" /></a>
                  {render?.id && <button type="button" onClick={() => setShareOpen(true)} className="k-btn k-btn--ov k-btn--icon" aria-label="Поделиться"><KitIcon name="sh" /></button>}
                </div>
              </div>
            )}

            <nav className="k-ut mt-6" aria-label="Разделы комнаты">
              {([['editor', 'Редактор'], ['design', 'Разбор интерьера'], ['roadmap', 'Закупка']] as const).map(([key, label]) => (
                <button key={key} type="button" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
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

      <KitLightbox open={fullscreen && Boolean(image)} onClose={() => setFullscreen(false)} label="Просмотр дизайна">
        {image && <img src={image} alt="Дизайн комнаты" className="max-h-full max-w-full object-contain" />}
      </KitLightbox>

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
          <button type="button" onClick={onRun} disabled={busy} className="k-btn k-btn--primary mt-5 w-full sm:w-auto">
            {busy ? <><KitIcon name="sp" spin /> Разбираем…</> : <>Запустить разбор <KitIcon name="r" /></>}
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
                      <p className="mt-1.5 flex gap-1.5 text-xs leading-4 text-primary-text">
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
                    <p className="mt-1.5 flex gap-1.5 text-xs leading-4 text-primary-text">
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
                <p className="font-mono text-xs text-muted-foreground">{surface.ral?.code || surface.hex}</p>
                {surface.ral?.name ? <p className="text-xs text-muted-foreground">{surface.ral.name}</p> : null}
                {surface.description ? <p className="mt-1.5 text-xs leading-4 text-primary-text">Почему: {surface.description}</p> : null}
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
                <KitIcon name="bolt" className="mt-0.5 size-4 shrink-0 text-primary-text" />
                <div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div>              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

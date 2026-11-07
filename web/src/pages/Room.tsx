import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Download, Expand, LoaderCircle, Share2, X, Zap } from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import { GenerationPanel } from '@/components/GenerationPanel'
import '../App.css'

type Move = { target?: string; action?: string; effect?: string }
type DesignDirection = {
  concept?: string
  mainMove?: Move | null
  supportingMoves?: Move[]
  focalPoint?: string
  focalZone?: string | null
  quietAreas?: string[]
  materialsStory?: string[]
  materials?: string
  palette?: { hex?: string | null; name?: string }[]
  compatibility?: string
  avoid?: string[]
}
type LayoutPlan = {
  strategy?: string
  zones?: { name?: string; purpose?: string; position?: string }[]
  items?: { type?: string; label?: string; position?: string; size_cm?: string }[]
  circulation?: string
  focalPoint?: string
  avoid?: string[]
}
type RepairAction = { action: string; material?: string; style?: string; why?: string }
type RepairScope = {
  floor?: RepairAction | null; ceiling?: RepairAction | null; walls?: RepairAction | null
  doors?: RepairAction | null; windows?: RepairAction | null
  storage?: string[]; style_dir?: string
}
type Dimensions = { width: number; length: number; height: number; confidence?: string }
type Lens = { focal_length_mm?: number | null; type?: string | null; distortion?: string | null; correction?: string; confidence?: string }
type Surface = { surface?: string; label?: string; hex?: string; ral?: { code?: string; name?: string } | null; description?: string }
type Electrical = { title?: string; text?: string }
type Change = { layer: string; label: string; current: string; change: string; impact: number; effort?: string; target?: string }
type Render = {
  id: string
  image: string | null
  status: string
  request_text?: string | null
  created_at?: string
  analysis?: {
    surfaces?: Surface[]
    electrical?: Electrical[]
    architect?: { changes?: Change[] } | null
    final?: { next_steps?: string[] } | null
  } | null
  design_direction?: DesignDirection | null
  layout_plan?: LayoutPlan | null
  repair_scope?: RepairScope | null
  dimensions_estimate?: Dimensions | null
  lens?: Lens | null
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

const REPAIR_LABELS: Array<[keyof Pick<RepairScope, 'floor' | 'ceiling' | 'walls' | 'doors' | 'windows'>, string]> = [
  ['floor', 'Пол'], ['ceiling', 'Потолок'], ['walls', 'Стены'], ['doors', 'Двери'], ['windows', 'Окна'],
]
const repairRows = (scope?: RepairScope | null) => REPAIR_LABELS
  .map(([key, label]) => scope?.[key] ? { label, ...scope[key]! } : null)
  .filter((item): item is { label: string } & RepairAction => Boolean(item))

const stageLabel = (status?: string) => status === 'analyzing' ? 'Анализ фото' : status === 'rendering' ? 'Генерация изображения' : status === 'matching' ? 'Разбор рендера' : status === 'queued' ? 'В очереди' : 'В процессе'
const lensLabel = (type?: string | null) => type === 'wide' ? 'широкий угол' : type === 'tele' ? 'теле' : type === 'normal' ? 'нормальный' : ''
const confidenceLabel = (value?: string) => value === 'high' ? 'высокая' : value === 'medium' ? 'средняя' : value === 'low' ? 'низкая' : ''

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t py-5 first:border-t-0 first:pt-0">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  )
}

export default function Room() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState<RoomData | null>(null)
  const [tab, setTab] = useState<'editor' | 'design'>('editor')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [finalBusy, setFinalBusy] = useState(false)

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
  const nextSteps = render?.analysis?.final?.next_steps || []

  const makeFinal = async () => {
    if (!render?.id || finalBusy) return
    setFinalBusy(true)
    try {
      const r = await fetch(`/api/renders/${render.id}/final-review`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || String(r.status))
      await loadRoom()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось собрать итог')
    } finally {
      setFinalBusy(false)
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
              {([['editor', 'Редактор'], ['design', 'Разбор интерьера']] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-12 shrink-0 border-b-2 px-4 text-sm ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
              ))}
            </nav>

            <div className="mt-6 min-w-0">
              {tab === 'editor' && (
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
              )}

              {tab === 'design' && <DesignTab render={render} nextSteps={nextSteps} finalBusy={finalBusy} onMakeFinal={() => void makeFinal()} />}
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

function DesignTab({ render, nextSteps, finalBusy, onMakeFinal }: {
  render: Render | null
  nextSteps: string[]
  finalBusy: boolean
  onMakeFinal: () => void
}) {
  const dd = render?.design_direction
  const layout = render?.layout_plan
  const repair = render?.repair_scope
  const dims = render?.dimensions_estimate
  const lens = render?.lens
  const surfaces = render?.analysis?.surfaces || []
  const electrical = render?.analysis?.electrical || []
  const changes = render?.analysis?.architect?.changes || []
  const repairItems = repairRows(repair)

  return (
    <div className="mt-6">
      {dd && (
        <Section title="Направление">
          {dd.concept && <p className="text-sm font-medium">{dd.concept}</p>}
          {dd.mainMove?.action && <p className="mt-2 text-sm leading-6 text-muted-foreground">{dd.mainMove.target ? `${dd.mainMove.target}: ` : ''}{dd.mainMove.action}{dd.mainMove.effect ? ` — ${dd.mainMove.effect}` : ''}</p>}
          {!!dd.palette?.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {dd.palette.map((color, index) => (
                <span key={`${color.hex}-${index}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="size-4 border border-foreground/20" style={{ background: color.hex || 'transparent' }} />{color.name || color.hex}</span>
              ))}
            </div>
          )}
          {!!dd.materialsStory?.length && <p className="mt-3 text-xs leading-5 text-muted-foreground">Материалы: {dd.materialsStory.join(', ')}</p>}
          {dd.focalPoint && <p className="mt-1 text-xs leading-5 text-muted-foreground">Фокус: {dd.focalPoint}</p>}
          {!!dd.quietAreas?.length && <p className="mt-1 text-xs leading-5 text-muted-foreground">Спокойные зоны: {dd.quietAreas.join(', ')}</p>}
          {dd.compatibility === 'weaken' && <p className="mt-1 text-[11px] text-muted-foreground">Ослабленная форма пары</p>}
        </Section>
      )}

      {layout && (
        <Section title="Планировка">
          {layout.strategy && <p className="text-sm leading-6">{layout.strategy}</p>}
          {!!layout.zones?.length && <ul className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">{layout.zones.map((zone, index) => <li key={index}>• {zone.name}{zone.position ? ` (${zone.position})` : ''}{zone.purpose ? `: ${zone.purpose}` : ''}</li>)}</ul>}
          {!!layout.items?.length && <ol className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">{layout.items.map((item, index) => <li key={index}>{index + 1}. {item.label || item.type}{item.position ? ` — ${item.position}` : ''}{item.size_cm ? `, ${item.size_cm}` : ''}</li>)}</ol>}
          {layout.circulation && <p className="mt-3 text-xs leading-5 text-muted-foreground">Проходы: {layout.circulation}</p>}
        </Section>
      )}

      {repairItems.length > 0 && (
        <Section title="План ремонта">
          <dl className="grid gap-2 text-sm">
            {repairItems.map(row => (
              <div key={row.label} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd><span className="font-medium">{row.action}</span>{row.material ? ` · ${row.material}` : ''}{row.why ? <span className="block text-xs text-muted-foreground">{row.why}</span> : null}</dd>
              </div>
            ))}
            {!!repair?.storage?.length && <div className="grid gap-1 sm:grid-cols-[7rem_1fr]"><dt className="text-muted-foreground">Хранение</dt><dd><ul className="list-disc space-y-1 pl-4">{repair.storage.map((item, index) => <li key={index}>{item}</li>)}</ul></dd></div>}
          </dl>
        </Section>
      )}

      {(dims || lens) && (
        <Section title="Размеры и объектив">
          {dims && <p className="text-sm">{dims.width} × {dims.length} × {dims.height} м{dims.confidence ? ` · уверенность ${confidenceLabel(dims.confidence)}` : ''}</p>}
          {lens && <p className="mt-1 text-xs leading-5 text-muted-foreground">{lens.focal_length_mm ? `${lens.focal_length_mm} мм` : ''}{lens.type ? ` · ${lensLabel(lens.type)}` : ''}{lens.distortion ? ` · дисторсия ${lens.distortion}` : ''}{lens.correction ? ` · ${lens.correction}` : ''}</p>}
        </Section>
      )}

      {!!surfaces.length && (
        <Section title="Палитра RAL по рендеру">
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
        <Section title="Розетки и выключатели · рекомендация">
          <ul className="divide-y border-y">
            {electrical.map((item, index) => (
              <li key={index} className="flex gap-3 py-3 text-sm"><Zap className="mt-0.5 size-4 shrink-0 text-primary-text" /><div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div></li>
            ))}
          </ul>
        </Section>
      )}

      {!!changes.length && (
        <Section title="Что можно изменить">
          <ol className="divide-y border-y">
            {changes.map((change, index) => (
              <li key={`${change.layer}-${index}`} className="flex gap-3 py-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <div><p className="font-medium">{change.change}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{change.label} · сейчас: {change.current}</p></div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="Что дальше">
        {nextSteps.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">{nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ul>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">Итог по дизайну ещё не собран.</p>
            <button type="button" onClick={onMakeFinal} disabled={finalBusy} className="action-secondary mt-3 min-h-10 px-3 text-xs">{finalBusy ? <><LoaderCircle className="size-3.5 animate-spin" /> Собираем…</> : 'Собрать итог'}</button>
          </div>
        )}
      </Section>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Expand,
  Info,
  LoaderCircle,
  Plug,
  RotateCcw,
  Search,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'

type Step = 'photo' | 'style' | 'generating' | 'result' | 'searching' | 'estimates'
type GenItem = {
  name: string; price: number; qty: number; unit: string;
  url: string; link_label?: string; source?: string; match_score?: number;
}
type RoomResult = {
  id: string; status: string; error?: string | null; style: string; budget: number;
  render?: { id: string; image: string | null; status: string } | null;
  items: GenItem[]; total: number; prices_as_of?: string | null;
}
type Iteration = {
  id: string; request: string; image: string; styleName: string;
  items: GenItem[]; total: number; roomId: string; ratio: number;
  budget: number; pricesAsOf?: string | null;
}

type PanelStyle = CSSProperties & { '--photo-ratio': number }
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const rub = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'
const budgetInfo = (total: number, budgetThousands: number) => {
  const diff = total - budgetThousands * 1000
  return diff > 0 ? `Выше бюджета на ${rub(diff)}` : `В бюджете · остаток ${rub(-diff)}`
}
const fmtDateTime = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null

type StylePreset = { key: string; name: string; accent: string; image_url?: string }
const defaultStylePresets: StylePreset[] = [
  { key: 'modern', name: 'Современный', accent: 'sand' },
  { key: 'scandi', name: 'Скандинавский', accent: 'dust' },
  { key: 'loft', name: 'Лофт', accent: 'graphite' },
  { key: 'japandi', name: 'Джапанди', accent: 'forest' },
  { key: 'neo', name: 'Неоклассика', accent: 'sand' },
  { key: 'minimal', name: 'Минимализм', accent: 'graphite' },
  { key: 'dark', name: 'Тёмный модерн', accent: 'graphite' },
  { key: 'boho', name: 'Бохо', accent: 'terra' },
  { key: 'deco', name: 'Ар-деко', accent: 'terra' },
  { key: 'country', name: 'Кантри', accent: 'forest' },
] as const

const accents = [
  { key: 'none', name: 'Без акцента', token: null },
  { key: 'forest', name: 'Оливковый', token: '--pl-forest-2' },
  { key: 'sand', name: 'Песочный', token: '--pl-sand-2' },
  { key: 'terra', name: 'Терракота', token: '--pl-terra-2' },
  { key: 'dust', name: 'Синева', token: '--pl-dust-3' },
  { key: 'graphite', name: 'Графит', token: '--pl-graphite-2' },
] as const

const schemes = [
  { key: 'none', name: 'Без фильтра' },
  { key: 'mono', name: 'Монохром' },
  { key: 'analogous', name: 'Аналоговая' },
  { key: 'complementary', name: 'Комплементарная' },
  { key: 'split', name: 'Сплит' },
] as const

const refinePresets = [
  'Изменить цвет пола на тёмный дуб',
  'Сделать интерьер светлее',
  'Заменить текстиль на лён',
  'Добавить больше растений',
] as const

const ralColors = [
  ['RAL 7047', 'Телегрей 4', '--pl-dust-3'],
  ['RAL 1019', 'Серо-бежевый', '--pl-sand-3'],
  ['RAL 8022', 'Чёрно-коричневый', '--pl-graphite-2'],
  ['RAL 1036', 'Жемчужно-бежевый', '--pl-sand-2'],
  ['RAL 6003', 'Оливково-зелёный', '--pl-forest-2'],
  ['RAL 3012', 'Бежево-красный', '--pl-terra-2'],
] as const

const electricalPlan = [
  ['Розетки у дивана', '2 шт + USB, высота 300 мм от пола'],
  ['ТВ-зона', '4 розетки за панелью, скрытый кабель-канал'],
  ['Рабочее место у окна', '2 розетки + выключатель, высота 900 мм'],
  ['Проходной выключатель', 'у входа и у изножия кровати'],
] as const

const socketMarks = [
  { x: 20, y: 74, kind: 'socket', label: 'Розетка ×2' },
  { x: 46, y: 52, kind: 'socket', label: 'ТВ-розетки' },
  { x: 72, y: 68, kind: 'switch', label: 'Выключатель' },
  { x: 86, y: 34, kind: 'socket', label: 'Рабочее место' },
] as const

const stepLabels = ['Фото', 'Стиль', 'Результат', 'Смета'] as const
const roomTypes = ['Гостиная (зал)', 'Спальня', 'Детская', 'Кухня', 'Санузел', 'Кладовка', 'Прихожая', 'Столовая', 'Кабинет', 'Балкон / лоджия', 'Гардеробная', 'Другое'] as const

function stepIndex(step: Step): number {
  if (step === 'photo') return 0
  if (step === 'style') return 1
  if (step === 'generating' || step === 'result') return 2
  return 3
}

function AccentDot({ token }: { token: string | null }) {
  return (
    <span
      className="relative block size-6 shrink-0 overflow-hidden rounded-full border border-foreground/50"
      style={token ? { background: `oklch(var(${token}))` } : undefined}
      aria-hidden="true"
    >
      {!token && <span className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground/60" />}
    </span>
  )
}

function ElectricalOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {socketMarks.map((mark) => (
        <span key={mark.label} className="socket-mark" style={{ left: `${mark.x}%`, top: `${mark.y}%` }}>
          <span className={`socket-dot ${mark.kind === 'switch' ? 'socket-dot-switch' : ''}`}>
            {mark.kind === 'switch' ? <Zap className="size-3" /> : <Plug className="size-3" />}
          </span>
          <span className="socket-label">{mark.label}</span>
        </span>
      ))}
    </div>
  )
}

export function GenerationPanel({
  open,
  onClose,
  onRequireLogin,
  onRefreshUser,
}: {
  open: boolean
  onClose: () => void
  onRequireLogin: () => void
  onRefreshUser: () => void | Promise<void>
}) {
  const [step, setStep] = useState<Step>('photo')
  const [roomType, setRoomType] = useState<string | null>(null)
  const [stylePresets, setStylePresets] = useState<StylePreset[]>(defaultStylePresets)
  const [photo, setPhoto] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [photoRatio, setPhotoRatio] = useState(4 / 3)
  const [photoError, setPhotoError] = useState('')
  const [style, setStyle] = useState<string | null>(null)
  const [accent, setAccent] = useState('none')
  const [scheme, setScheme] = useState('none')
  const [budget, setBudget] = useState(150)
  const [customOpen, setCustomOpen] = useState(false)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const [refPhoto, setRefPhoto] = useState<string | null>(null)
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refName, setRefName] = useState('')
  const [usedRef, setUsedRef] = useState<File | null>(null)
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [genError, setGenError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const refInput = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  const current = iterations.find((item) => item.id === currentId) ?? iterations[iterations.length - 1] ?? null

  const rememberUrl = (url: string) => { urls.current.push(url) }
  const releaseUrl = (url: string | null) => {
    if (!url) return
    URL.revokeObjectURL(url)
    urls.current = urls.current.filter((item) => item !== url)
  }
  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)) }, [])

  useEffect(() => {
    fetch('/api/styles')
      .then(r => r.ok ? r.json() : null)
      .then(list => {
        if (Array.isArray(list) && list.length) {
          setStylePresets(list.map(s => ({ key: s.key, name: s.name, accent: s.accent || 'sand', image_url: s.image_url })))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) { setCreditOpen(false); return }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => closeRef.current?.focus(), 380)
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', close)
    }
  }, [open, onClose])

  useEffect(() => {
    if (step !== 'generating') return
    const interval = window.setInterval(() => setProgress(value => value < 94 ? Math.min(94, value + 2) : value), 700)
    return () => window.clearInterval(interval)
  }, [step])

  const acceptPhoto = (nextFile?: File) => {
    if (!nextFile) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
      setPhotoError('Подойдёт файл JPG, PNG или WebP')
      return
    }
    if (nextFile.size > 15 * 1024 * 1024) {
      setPhotoError('Файл больше 15 МБ. Выберите фото меньшего размера')
      return
    }
    releaseUrl(photo)
    const url = URL.createObjectURL(nextFile)
    rememberUrl(url)
    setPhoto(url)
    setFile(nextFile)
    setPhotoRatio(4 / 3)
    setPhotoName(nextFile.name)
    setPhotoError(''); setGenError('')
    setRoomType(null)
    setRoomId(''); setIterations([]); setCurrentId(null); setOpenHistory(null); setUsedRef(null)
  }

  const acceptRef = (nextFile?: File) => {
    if (!nextFile || !nextFile.type.startsWith('image/')) return
    releaseUrl(refPhoto)
    const url = URL.createObjectURL(nextFile)
    rememberUrl(url)
    setRefPhoto(url)
    setRefFile(nextFile)
    setRefName(nextFile.name)
    setStyle(null)
    setUsedRef(null)
  }

  async function pollRoom(id: string): Promise<RoomResult | null> {
    const started = Date.now()
    while (true) {
      if (Date.now() - started > 180000) {
        setGenError('Генерация идёт слишком долго. Попробуйте ещё раз.')
        setStep(iterations.length ? 'result' : 'style')
        return null
      }
      await sleep(2000)
      const r = await fetch('/api/rooms/' + id)
      if (r.status === 401) { onRequireLogin(); return null }
      const d = await r.json().catch(() => ({})) as RoomResult & { error?: string }
      if (!r.ok) {
        setGenError(d.error || 'Не удалось получить результат')
        setStep(iterations.length ? 'result' : 'style')
        return null
      }
      if (d.status === 'done') return d
      if (d.status === 'error') {
        setGenError(d.error || 'Генерация не удалась')
        setStep(iterations.length ? 'result' : 'style')
        return null
      }
    }
  }

  async function startGeneration(request: string, styleName: string) {
    if (!file) { setPhotoError('Сначала загрузите фото комнаты'); setStep('photo'); return }
    if (!roomType) { setPhotoError('Выберите тип комнаты'); setStep('photo'); return }
    if (busy) return
    setBusy(true); setGenError(''); setRefineText(''); setProgress(3); setStep('generating')
    try {
      const isBase = !roomId || Boolean(refFile && refFile !== usedRef)
      let id = roomId
      if (isBase) {
        const fd = new FormData()
        fd.append('photo', file)
        fd.append('style', styleName)
        fd.append('room_type', roomType)
        fd.append('budget', String(budget))
        fd.append('palette', scheme)
        fd.append('accent', accent)
        if (refFile) fd.append('style_ref', refFile)
        const r = await fetch('/api/rooms', { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { onRequireLogin(); return }
        if (r.status === 402) { setGenError(''); setStep('style'); setCreditOpen(true); return }
        if (!r.ok) throw new Error(d.error || String(r.status))
        id = d.id
        setRoomId(id)
        setUsedRef(refFile)
      } else {
        const r = await fetch(`/api/rooms/${id}/iterate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: request }),
        })
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { onRequireLogin(); return }
        if (r.status === 402) { setGenError(''); setStep(iterations.length ? 'result' : 'style'); setCreditOpen(true); return }
        if (!r.ok) throw new Error(d.error || String(r.status))
      }

      const room = await pollRoom(id)
      if (!room) return
      const render = room.render
      if (!render?.image) throw new Error('Модель не вернула изображение')
      const next: Iteration = {
        id: render.id,
        request,
        image: render.image,
        styleName,
        items: room.items,
        total: room.total,
        budget: room.budget,
        roomId: id,
        ratio: photoRatio,
        pricesAsOf: room.prices_as_of,
      }
      setIterations(prev => [...prev, next])
      setCurrentId(next.id)
      setOpenHistory(next.id)
      setProgress(100)
      setStep('result')
      await onRefreshUser()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Не удалось выполнить генерацию')
      setStep(iterations.length ? 'result' : 'style')
    } finally { setBusy(false) }
  }

  const resetAll = () => {
    releaseUrl(photo)
    releaseUrl(refPhoto)
    setStep('photo')
    setPhoto(null); setFile(null); setPhotoName(''); setPhotoError(''); setRoomType(null)
    setStyle(null); setAccent('none'); setScheme('none'); setBudget(150)
    setCustomOpen(false); setSchemeOpen(false)
    setRefPhoto(null); setRefFile(null); setRefName(''); setUsedRef(null)
    setIterations([]); setCurrentId(null); setOpenHistory(null)
    setRefineText(''); setGenError(''); setProgress(0); setRoomId(''); setBusy(false); setCreditOpen(false)
    if (photoInput.current) photoInput.current.value = ''
    if (refInput.current) refInput.current.value = ''
  }

  const activeStep = stepIndex(step)

  return (
    <div className="gen-overlay" data-open={open} role="dialog" aria-modal="true" aria-label="Генератор дизайна интерьера">
      <div className="flex min-h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <p className="display-title text-lg">Генератор дизайна</p>
          <ol className="hidden items-center gap-4 md:flex" aria-label="Шаги генерации">
            {stepLabels.map((label, index) => (
              <li key={label} className={`gen-step ${index === activeStep ? 'gen-step-active' : ''} ${index < activeStep ? 'gen-step-done' : ''}`} aria-current={index === activeStep ? 'step' : undefined}>
                <span className="font-mono text-[0.65rem]">0{index + 1}</span> {label}
              </li>
            ))}
          </ol>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="flex size-12 items-center justify-center border border-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Закрыть генератор">
          <X className="size-5" />
        </button>
      </div>

      <div className="gen-body">
        {step === 'photo' && (
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="eyebrow">Шаг 01 / Комната</p>
              <h3 className="display-title mt-6 text-4xl sm:text-5xl">Загрузите фото своей комнаты</h3>
              <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">Чёткий кадр при дневном свете — стены, пол и мебель в кадре. Подойдёт вертикальное, квадратное или горизонтальное фото, пропорции сохранятся.</p>
              <ul className="mt-8 space-y-3 border-t pt-6 text-sm">
                <li className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-primary-text" />JPG, PNG или WebP до 15 МБ</li>
                <li className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-primary-text" />Любое соотношение сторон</li>
                <li className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-primary-text" />Фото используется только для генерации</li>
              </ul>
            </div>
            <div onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); acceptPhoto(event.dataTransfer.files?.[0]) }}>
              <input ref={photoInput} id="gen-photo" type="file" accept="image/jpeg,image/png,image/webp" className="peer sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => acceptPhoto(event.target.files?.[0])} />
              {photo ? (
                <div className="gen-photo-preview relative mx-auto border border-foreground bg-foreground" style={{ '--photo-ratio': photoRatio } as PanelStyle}>
                  <img src={photo} alt="Загруженное фото комнаты" className="h-full w-full object-contain" onLoad={(event) => setPhotoRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-foreground/85 px-4 py-2 text-background">
                    <span className="truncate text-xs">{photoName}</span>
                    <button type="button" onClick={() => { releaseUrl(photo); setPhoto(null); setPhotoName(''); if (photoInput.current) photoInput.current.value = '' }} className="flex size-11 shrink-0 items-center justify-center hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Удалить фото"><X className="size-4" /></button>
                  </div>
                </div>
              ) : (
                <label htmlFor="gen-photo" className="flex min-h-80 cursor-pointer flex-col items-center justify-center border border-dashed border-foreground/40 bg-background px-4 text-center transition-colors hover:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                  <Upload className="mb-4 size-8 text-primary-text" />
                  <span className="text-base font-medium">Загрузить фото комнаты</span>
                  <span className="mt-2 text-sm leading-6 text-muted-foreground">или перетащите сюда<br />JPG, PNG, WebP · до 15 МБ</span>
                </label>
              )}
              {photo && (
                <div className="mt-5">
                  <p className="eyebrow">Тип комнаты</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Чтобы в дизайне не появились предметы из другого помещения.</p>
                  <div className="mt-3 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
                    {roomTypes.map(type => <button key={type} type="button" aria-pressed={roomType === type} onClick={() => setRoomType(type)} className={`min-h-10 bg-background px-2 text-xs leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${roomType === type ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>{type}</button>)}
                  </div>
                </div>
              )}
              <div className="mt-4" onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); acceptPhoto(event.dataTransfer.files?.[0]) }}>
                {photoError && <p className="mb-3 text-sm text-destructive" role="alert">{photoError}</p>}
                {photo && !roomType && <p className="mb-3 text-xs text-muted-foreground">Выберите тип комнаты, чтобы продолжить.</p>}
                <button type="button" disabled={!photo || !roomType} onClick={() => setStep('style')} className="action-primary w-full disabled:opacity-40">
                  Продолжить <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'style' && (
          <div>
            <p className="eyebrow">Шаг 02 / Стиль</p>
            <h3 className="display-title mt-6 text-4xl">Выберите направление</h3>
            {roomType && <p className="mt-2 text-sm text-muted-foreground">Комната: {roomType}</p>}
            <div className="mt-8 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3 lg:grid-cols-5">
              {stylePresets.map((item) => (
                <button key={item.key} type="button" aria-pressed={style === item.name} onClick={() => { setStyle(item.name); setAccent(item.accent) }} className={`group relative bg-background text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${style === item.name ? 'shadow-[inset_0_0_0_2px_oklch(var(--foreground))]' : 'hover:bg-muted'}`}>
                  <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                    <img src={item.image_url || `/images/style-${item.key}.webp`} alt={`Интерьер в стиле ${item.name}`} loading="lazy" onError={(event) => { event.currentTarget.src = '/images/style-modern.webp' }} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                    {style === item.name && (
                      <span className="absolute right-2 top-2 flex size-6 items-center justify-center bg-primary text-primary-foreground">
                        <Check className="size-4" />
                      </span>
                    )}
                  </span>
                  <span className={`flex min-h-12 items-center gap-2 px-3 text-sm font-medium ${style === item.name ? 'text-primary-text' : ''}`}>
                    {item.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-8 border">
              <button type="button" aria-expanded={customOpen} onClick={() => setCustomOpen((value) => !value)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex items-center gap-3"><Upload className="size-4 text-primary-text" />Загрузить свой стиль{refPhoto ? <span className="text-xs text-muted-foreground">· {refName}</span> : null}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${customOpen ? 'rotate-180' : ''}`} />
              </button>
              {customOpen && (
                <div className="border-t border-foreground/25 p-4">
                  <input ref={refInput} id="gen-ref" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => acceptRef(event.target.files?.[0])} />
                  {refPhoto ? (
                    <div className="flex items-center justify-between gap-4 border bg-muted px-4 py-3">
                      <span className="truncate text-sm">{refName}</span>
                      <button type="button" onClick={() => { releaseUrl(refPhoto); setRefPhoto(null); setRefFile(null); setRefName(''); setUsedRef(null); if (refInput.current) refInput.current.value = '' }} className="flex size-11 items-center justify-center hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Удалить референс"><X className="size-4" /></button>
                    </div>
                  ) : (
                    <label htmlFor="gen-ref" className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-foreground/40 px-4 text-center text-sm transition-colors hover:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      <Upload className="size-5 text-primary-text" />
                      <span>Загрузить фото примера стиля</span>
                      <span className="text-xs text-muted-foreground">JPG, PNG, WebP — нейросеть перенесёт настроение референса</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="border border-t-0">
              <button type="button" aria-expanded={schemeOpen} onClick={() => setSchemeOpen((value) => !value)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex items-center gap-3"><Info className="size-4 text-primary-text" />Цветовая схема и акцент{scheme !== 'none' || accent !== 'none' ? <span className="text-xs text-muted-foreground">· настроено</span> : null}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${schemeOpen ? 'rotate-180' : ''}`} />
              </button>
              {schemeOpen && (
                <div className="border-t border-foreground/25 p-4">
                  <div className="flex flex-wrap gap-2">
                    {schemes.map((item) => (
                      <button key={item.key} type="button" aria-pressed={scheme === item.key} onClick={() => setScheme(item.key)} className={`min-h-10 border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${scheme === item.key ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground'}`}>
                        {item.name}
                      </button>
                    ))}
                  </div>
                  <p className="eyebrow mt-6">Акцентный цвет</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {accents.map((item) => (
                      <button key={item.key} type="button" aria-pressed={accent === item.key} onClick={() => setAccent(item.key)} className={`flex min-h-11 items-center gap-2.5 border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${accent === item.key ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground'}`}>
                        <AccentDot token={item.token} /> {item.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />Схема и акцент передаются в генерацию: модель учтёт их при подборе цвета.</p>
                </div>
              )}
            </div>

            <div className="mt-8 border p-4">
              <div className="flex items-end justify-between gap-4">
                <div><p className="eyebrow">Бюджет на материалы</p><p className="mt-1 text-xs text-muted-foreground">Учтём при подборе товаров</p></div>
                <output className="text-lg font-light">{budget} тыс. ₽</output>
              </div>
              <Slider min={50} max={1000} step={25} value={[budget]} onValueChange={(value) => setBudget(value[0])} aria-label="Бюджет на материалы в тысячах рублей" className="mt-5 rounded-none" />
              <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>50 тыс.</span><span>1 млн ₽</span></div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Бюджет влияет на подбор товаров и уровень материалов. Итоговая смета может отличаться — она ориентировочная.</p>
            </div>

            {genError && <p className="mt-4 text-sm text-destructive" role="alert">{genError}</p>}

            <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('photo')} className="action-secondary"><ArrowLeft className="size-4" />Назад</button>
              <button
                type="button"
                disabled={busy || (!style && !refFile)}
                onClick={() => {
                  const schemeName = schemes.find(item => item.key === scheme)?.name
                  const accentName = accents.find(item => item.key === accent)?.name
                  const request = [
                    style ? `Стиль: ${style}` : 'Стиль по референсу',
                    scheme !== 'none' ? `схема: ${schemeName}` : '',
                    accent !== 'none' ? `акцент: ${accentName}` : '',
                  ].filter(Boolean).join('; ')
                  void startGeneration(request, style ?? 'Референс пользователя')
                }}
                className="action-primary min-h-14 px-8 text-base disabled:opacity-40"
              >
                {busy ? 'Запускаем…' : 'Сгенерировать'} <ArrowUpRight className="size-5" />
              </button>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
            <LoaderCircle className="size-10 animate-spin text-primary-text motion-reduce:animate-none" />
            <h3 className="display-title mt-8 text-4xl">Создаём ваш дизайн</h3>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Рисуем визуализацию, подбираем отделку и собираем палитру комнаты.</p>
            <div className="mt-8 h-1 w-full overflow-hidden bg-border" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-3 font-mono text-sm">{progress}%</p>
          </div>
        )}

        {step === 'searching' && (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
            <Search className="size-10 animate-pulse text-primary-text motion-reduce:animate-none" />
            <h3 className="display-title mt-8 text-4xl">Собираем смету</h3>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Ищем товары по фактурам и цветам из вашего дизайна, переводим оттенки в RAL и готовим разметку электрики.</p>
          </div>
        )}

        {step === 'result' && current && (
          <div>
            <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                  <div>
                    <p className="eyebrow">Шаг 03 / Результат</p>
                    <h3 className="mt-2 text-xl font-light uppercase">{current.styleName}</h3>
                  </div>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Версия {iterations.length}</span>
                </div>
                <div className="relative mt-6 bg-foreground">
                  <div className="max-h-[62svh] overflow-hidden">
                    <img src={current.image} alt="Сгенерированный дизайн интерьера" className="h-full max-h-[62svh] w-full object-contain" />
                  </div>
                  <div className="absolute right-3 top-3 flex gap-2">
                    <button type="button" onClick={() => setLightbox(true)} className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Открыть результат на весь экран">
                      <Expand className="size-5" />
                    </button>
                    <a href={current.image} download="remontvision-design.webp" className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Скачать результат">
                      <Download className="size-5" />
                    </a>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-y py-3 text-sm">
                  <span className="text-muted-foreground">Бюджет {current.budget} 000 ₽ · подборка {rub(current.total)}</span>
                  <span className={current.total > current.budget * 1000 ? 'text-destructive' : 'text-primary-text'}>{budgetInfo(current.total, current.budget)}</span>
                </div>

              </div>

              <aside className="border-t pt-8 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
                <p className="eyebrow">История правок</p>
                <div className="mt-4 space-y-2">
                  {iterations.map((item, index) => {
                    const expanded = openHistory === item.id
                    return (
                      <div key={item.id} className="border border-foreground/25">
                        <button type="button" aria-expanded={expanded} onClick={() => { if (!expanded) setRefineText(''); setOpenHistory(expanded ? null : item.id); setCurrentId(item.id) }} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                          <span className="flex min-w-0 items-center gap-3"><span className="font-mono text-xs text-primary-text">0{index + 1}</span><span className="truncate">{item.request}</span></span>
                          <ChevronDown className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="border-t border-foreground/25 px-4 py-4">
                            <div className="flex gap-3">
                              <img src={item.image} alt="" className="h-20 w-16 shrink-0 border border-foreground/25 object-cover" />
                              <p className="text-xs leading-5 text-muted-foreground">Эта версия показана на экране. Запустите правку от неё — новая версия добавится в историю.</p>
                            </div>
                            <p className="eyebrow mt-5">Быстрые правки</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {refinePresets.map((preset) => (
                                <button key={preset} type="button" onClick={() => startGeneration(preset, item.styleName)} className="min-h-10 border border-foreground/30 px-3 text-xs transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <div className="mt-3 flex flex-col gap-2">
                              <input value={refineText} onChange={(event) => setRefineText(event.target.value)} placeholder="Или опишите правку словами…" className="h-11 min-w-0 border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20" />
                              <button type="button" disabled={!refineText.trim()} onClick={() => startGeneration(refineText.trim(), item.styleName)} className="inline-flex min-h-11 items-center justify-center gap-2 border border-foreground px-4 text-sm transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                                Перегенерировать <RotateCcw className="size-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="mt-6 flex gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />Подборка товаров и стоимость ориентировочные. Проверяйте размеры, цены и наличие перед покупкой.</p>
              </aside>
            </div>

            {genError && <p className="mt-4 text-sm text-destructive" role="alert">{genError}</p>}

            <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('style')} className="action-secondary"><ArrowLeft className="size-4" />Изменить стиль</button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={resetAll} className="action-secondary">Новая комната</button>
                <a href={`/cabinet?room=${encodeURIComponent(current.roomId)}`} className="action-secondary"><ArrowUpRight className="size-4" />Открыть в кабинете</a>
                <button type="button" onClick={() => setStep('estimates')} className="action-primary min-h-14 px-8 text-base">Готово — собрать смету <ArrowUpRight className="size-5" /></button>
              </div>
            </div>
          </div>
        )}

        {step === 'estimates' && current && (
          <div>
            <p className="eyebrow">Шаг 04 / Смета и электрика</p>
            <div className="mt-6 grid gap-10 xl:grid-cols-2">
              <div>
                <div className="relative mx-auto w-full bg-foreground" style={{ aspectRatio: String(current.ratio), width: `min(100%, calc(58svh * ${current.ratio}))` }}>
                  <img src={current.image} alt="Дизайн интерьера с рекомендуемой разметкой розеток и выключателей" className="absolute inset-0 h-full w-full object-cover" />
                  <ElectricalOverlay />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><Plug className="size-4 text-primary-text" />Условная разметка — рекомендация, не проект</p>
                  <button type="button" onClick={() => setLightbox(true)} className="inline-flex min-h-11 items-center gap-2 text-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Во весь экран <Expand className="size-4" /></button>
                </div>
              </div>

              <div className="space-y-8">
                <section aria-labelledby="gen-products">
                  <h4 id="gen-products" className="eyebrow mb-4">Товары по дизайну</h4>
                  <div className="divide-y border-y">
                    {current.items.length ? current.items.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="estimate-row grid gap-x-4 gap-y-1 py-3.5 text-sm">
                        <span>{item.name}</span>
                        <span className="row-span-2 self-center font-medium">{rub(item.price * item.qty)}</span>
                        <span className="text-xs text-muted-foreground">
                          {rub(item.price)} × {item.qty} {item.unit}
                          {item.source ? ` · ${item.source}` : ''}
                          {item.url ? <> · <a className="underline underline-offset-2" href={item.url} target="_blank" rel="noopener nofollow">{item.link_label || 'в магазин'}</a></> : null}
                        </span>
                      </div>
                    )) : <p className="py-4 text-sm text-muted-foreground">Подборка не сформирована — попробуйте изменить запрос.</p>}
                  </div>
                  <p className="mt-3 flex items-center justify-between text-sm"><span className="text-muted-foreground">Итого, оценка</span><strong className="text-xl font-light text-primary-text">{rub(current.total)}</strong></p>
                  <p className={current.total > current.budget * 1000 ? 'mt-1 text-right text-xs text-destructive' : 'mt-1 text-right text-xs text-primary-text'}>{budgetInfo(current.total, current.budget)}</p>
                  {fmtDateTime(current.pricesAsOf) && <p className="mt-1 text-right text-[11px] text-muted-foreground">Цены актуальны на {fmtDateTime(current.pricesAsOf)}</p>}
                </section>

                <section aria-labelledby="gen-ral">
                  <h4 id="gen-ral" className="eyebrow mb-4">Цвета в RAL · ориентировочно</h4>
                  <div className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
                    {ralColors.map(([code, name, token]) => (
                      <div key={code} className="bg-background p-3">
                        <span className="block h-10 w-full border border-foreground/20" style={{ background: `oklch(var(${token}))` }} />
                        <p className="mt-2 font-mono text-xs">{code}</p>
                        <p className="text-xs text-muted-foreground">{name}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="gen-electrical">
                  <h4 id="gen-electrical" className="eyebrow mb-4">Розетки и выключатели · рекомендация</h4>
                  <ul className="divide-y border-y">
                    {electricalPlan.map(([title, text]) => (
                      <li key={title} className="flex gap-3 py-3 text-sm"><Zap className="mt-0.5 size-4 shrink-0 text-primary-text" /><div><p>{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('result')} className="action-secondary"><ArrowLeft className="size-4" />Вернуться к результату</button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a href={`/cabinet?room=${encodeURIComponent(current.roomId)}`} className="action-secondary"><ArrowUpRight className="size-4" />Открыть в кабинете</a>
                <button type="button" onClick={resetAll} className="action-secondary"><RotateCcw className="size-4" />Новая комната</button>
                <button type="button" onClick={onClose} className="action-primary min-h-14 px-8 text-base">Завершить <Check className="size-5" /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {lightbox && current && (
        <div className="gen-lightbox" role="dialog" aria-modal="true" aria-label="Результат во весь экран">
          <button type="button" onClick={() => setLightbox(false)} className="absolute right-4 top-4 z-10 flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Закрыть полный экран">
            <X className="size-5" />
          </button>
          <div className="relative mx-auto my-auto overflow-hidden bg-foreground" style={{ aspectRatio: String(current.ratio), width: `min(100vw, calc(100svh * ${current.ratio}))` }}>
            <img src={current.image} alt="Сгенерированный дизайн интерьера в полном размере" className="absolute inset-0 h-full w-full object-cover" />
            {step === 'estimates' && <ElectricalOverlay />}
          </div>
        </div>
      )}

      {creditOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/80 p-4" role="dialog" aria-modal="true" aria-label="Кредиты закончились">
          <div className="w-full max-w-md border border-foreground bg-background p-6 shadow-[8px_8px_0_oklch(var(--foreground))]">
            <p className="eyebrow">Баланс</p>
            <h3 className="display-title mt-3 text-3xl">Кредиты закончились</h3>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Каждая генерация или правка стоит 1 кредит. Пополните баланс в кабинете и вернитесь к дизайну — загруженное фото и настройки сохранятся.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href="/cabinet#credits" target="_blank" rel="noopener" onClick={() => setCreditOpen(false)} className="action-primary">Пополнить <ArrowUpRight className="size-4" /></a>
              <button type="button" onClick={() => setCreditOpen(false)} className="action-secondary">Позже</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

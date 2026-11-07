import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Expand,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Share2,
  Search,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router'
import { ShareDialog } from '@/components/ShareDialog'
import { useTasks } from '@/components/TaskDock'

type Step = 'photo' | 'style' | 'generating' | 'result' | 'searching' | 'estimates'
type GenItem = {
  id: number; name: string; price: number; qty: number; unit: string; category?: string;
  url: string; link_label?: string; direct_url?: boolean; source?: string; match_score?: number; price_tier?: string;
  image_url?: string | null; target?: string; can_bind?: boolean; presentation_status?: 'curated' | 'matched' | 'verified';
}
type Surface = {
  surface: string; label: string; description?: string; hex: string;
  ral?: { code: string; name: string; hex: string } | null;
}
type ElectricalItem = { title: string; text: string }
type Suggestion = { target: string; label: string; product_id: number; image_url?: string | null }
type ArchitectHint = { target?: string; action: string; why?: string; priority?: 'high' | 'medium' | 'low' }
type ArchitectLayer = {
  key: string; label: string; current?: string; impact: number
  effort?: 'low' | 'medium' | 'high'; risk?: 'low' | 'medium' | 'high'
  preserve?: string; actions?: { target?: string; action: string; why?: string }[]
}
type ArchitectChange = {
  layer: string; label: string; current: string; change: string
  impact: number; effort?: 'low' | 'medium' | 'high'; target?: string
}
function changesFromArchitect(architect?: Architect | null): ArchitectChange[] {
  if (!architect) return []
  if (architect.changes?.length) return architect.changes
  return (architect.layers || []).flatMap(layer => (layer.actions || []).map(action => ({
    layer: layer.key,
    label: layer.label,
    current: action.why || layer.current || '',
    change: action.action,
    impact: layer.impact || 0,
    effort: layer.effort,
    target: action.target || layer.key,
  }))).sort((a, b) => b.impact - a.impact)
}
type Architect = {
  room?: {
    type?: string; style?: string; lighting?: string
    walls?: { color?: string; material?: string } | null
    floor?: { color?: string; material?: string } | null
    ceiling?: { color?: string; material?: string } | null
  }
  palette?: { name: string; hex: string; where?: string }[]
  items?: { key?: string; label: string; category: string; bbox?: number[] | null }[]
  strengths?: string[]
  issues?: string[]
  hints?: ArchitectHint[]
  layers?: ArchitectLayer[]
  changes?: ArchitectChange[]
  electrical?: ElectricalItem[]
  summary?: { concept?: string; palette?: string; materials?: string; electrical?: string; next_steps?: string[] } | null
}
type ProductOffer = {
  id: string; name: string; price: number | null; currency: string
  merchant?: string | null; url: string | null; image_url?: string | null
  erid?: string | null; score?: number | null
}
type ProductMatch = {
  item: { key?: string; label: string; category: string; bbox?: number[] | null }
  offers: ProductOffer[]
  note?: string
}
type Analysis = {
  surfaces?: Surface[]; electrical?: ElectricalItem[]; suggestions?: Suggestion[]
  visible?: Array<{ label?: string; bbox?: number[]; area?: number } | string>
  architect?: Architect | null
  products?: ProductMatch[]
  final?: { concept?: string; palette?: string; materials?: string; electrical?: string; next_steps?: string[] } | null
}
type ArtDirection = {
  palette?: { hex?: string | null; name?: string }[]
  focalPoint?: string
  featureWall?: string
  lighting?: string
  mood?: string
}
type DimensionsEstimate = { width: number; length: number; height: number; confidence?: 'low' | 'medium' | 'high' }
type LensInfo = { focal_length_mm?: number | null; type?: 'wide' | 'normal' | 'tele' | null; distortion?: 'strong' | 'mild' | 'none' | null; correction?: string; confidence?: 'low' | 'medium' | 'high' }
type RepairAction = { action: string; material?: string; style?: string; why?: string }
type RepairScope = {
  floor?: RepairAction | null; ceiling?: RepairAction | null; walls?: RepairAction | null
  doors?: RepairAction | null; windows?: RepairAction | null
  storage?: string[]; style_dir?: string
}
const REPAIR_LABELS: Array<[keyof Pick<RepairScope, 'floor' | 'ceiling' | 'walls' | 'doors' | 'windows'>, string]> = [
  ['floor', 'Пол'], ['ceiling', 'Потолок'], ['walls', 'Стены'], ['doors', 'Двери'], ['windows', 'Окна'],
]
const repairRows = (scope?: RepairScope | null) => REPAIR_LABELS
  .map(([key, label]) => scope?.[key] ? { label, ...scope[key]! } : null)
  .filter((item): item is { label: string } & RepairAction => Boolean(item))
type EditRefDraft = {
  id: string
  file: File | null
  url: string
  preview: string | null
  name: string
  text: string
  drag: boolean
}

const emptyEditRef = (): EditRefDraft => ({
  id: crypto.randomUUID(), file: null, url: '', preview: null, name: '', text: '', drag: false,
})
const MAX_EDIT_BLOCKS = 3
const editName = (text?: string | null) => text ? text.replace(/(^|\n)\d+\)\s*/g, '$1').trim() || 'Базовая версия' : 'Базовая версия'

type RoomResult = {
  id: string; status: string; error?: string | null; notice?: string | null; style: string; budget: number; price_tier?: string;
  room_width_m?: number | null; room_length_m?: number | null; room_height_m?: number | null; bed_length_m?: number | null;
  dimension_orientation?: string | null;
  keep_furniture?: boolean; use_catalog?: boolean; products_enabled?: boolean; concept_key?: string | null;
  render?: { id: string; image: string | null; status: string; analysis?: Analysis | null; art_direction?: ArtDirection | null; dimensions_estimate?: DimensionsEstimate | null; lens?: LensInfo | null; repair_scope?: RepairScope | null; design_direction?: DesignDirection | null } | null;
  items: GenItem[]; total: number; prices_as_of?: string | null;
}
type Iteration = {
  id: string; request: string; image: string; styleName: string;
  items: GenItem[]; total: number; roomId: string; ratio: number;
  budget: number; priceTier: string; pricesAsOf?: string | null; analysis?: Analysis | null;
  keepFurniture?: boolean; useCatalog?: boolean; productsEnabled?: boolean; artDirection?: ArtDirection | null;
  dimensionsEstimate?: DimensionsEstimate | null; lens?: LensInfo | null; repairScope?: RepairScope | null;
  designDirection?: DesignDirection | null;
}
type DesignDirection = {
  conceptId?: string | null; concept?: string; mainMove?: { target?: string; action?: string; effect?: string } | null;
  focalPoint?: string; focalZone?: string | null; quietAreas?: string[]; materialsStory?: string[];
  palette?: { hex: string; name?: string }[]; compatibility?: 'ok' | 'weaken';
}
type DesignConcept = { id: string; name: string; main_move: string; quiet_areas: string; description: string }
type DesignCompatibility = Record<string, Record<string, 'ok' | 'weaken' | 'conflict'>>

type PanelStyle = CSSProperties & { '--photo-ratio': number }
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const rub = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'

type StylePreset = { key: string; name: string; accent: string; image_url?: string }
const defaultStylePresets: StylePreset[] = [
  { key: 'minimalism', name: 'Современный минимализм', accent: 'sand', image_url: '/images/style-minimal.webp' },
  { key: 'scandinavian', name: 'Скандинавский', accent: 'dust', image_url: '/images/style-scandi.webp' },
  { key: 'japandi', name: 'Джапанди', accent: 'forest', image_url: '/images/style-japandi.webp' },
  { key: 'loft', name: 'Лофт', accent: 'graphite', image_url: '/images/style-loft.webp' },
  { key: 'neoclassic', name: 'Неоклассика', accent: 'sand', image_url: '/images/style-neo.webp' },
  { key: 'eco', name: 'Эко / органический модерн', accent: 'forest', image_url: '/images/style-country.webp' },
  { key: 'dark_contemporary', name: 'Тёмный контемпорари', accent: 'graphite', image_url: '/images/style-dark.webp' },
  { key: 'art_deco', name: 'Ар-деко', accent: 'terra', image_url: '/images/style-deco.webp' },
  { key: 'mediterranean', name: 'Средиземноморский', accent: 'terra', image_url: '/images/style-boho.webp' },
  { key: 'memphis_accent', name: 'Мемфис-акцент', accent: 'terra', image_url: '/images/style-modern.webp' },
]

const presentationLabel = (status?: GenItem['presentation_status']) => status === 'verified'
  ? 'Проверен на рендере'
  : status === 'matched' ? 'Похожий по рендеру' : 'Подобран к дизайну'

const stepLabels = ['Фото', 'Стиль', 'Результат', 'Итог'] as const

const BASE_GEN_STAGES = [
  { key: 'queued', label: 'В очереди', hint: 'Ждём свободный обработчик' },
  { key: 'analyzing', label: 'Анализ фото', hint: 'Разбираем комнату, свет и материалы' },
  { key: 'rendering', label: 'Генерация кадра', hint: 'Модель рисует изображение — обычно 1–4 минуты' },
  { key: 'matching', label: 'Разбор и товары', hint: 'Архитектор смотрит кадр, даёт подсказки и ищет товары в каталоге' },
  { key: 'done', label: 'Готово', hint: 'Открываем визуализацию' },
] as const

const EDIT_GEN_STAGES = [
  { key: 'queued', label: 'В очереди', hint: 'Ждём свободный обработчик' },
  { key: 'rendering', label: 'Применяем правку', hint: 'Модель перерисовывает кадр по референсам' },
  { key: 'matching', label: 'Разбор правки', hint: 'Проверяем результат и обновляем подсказки и товары' },
  { key: 'done', label: 'Готово', hint: 'Открываем новую версию' },
] as const
const defaultRoomTypes = ['Гостиная (зал)', 'Спальня', 'Детская', 'Кухня', 'Санузел', 'Кладовка', 'Прихожая', 'Столовая', 'Кабинет', 'Балкон / лоджия', 'Гардеробная', 'Другое']
const SUMMARY_TABS = [
  ['repair', 'Ремонт'],
  ['changes', 'Что изменить'],
  ['products', 'Товары'],
  ['ral', 'Палитра'],
  ['electrical', 'Розетки'],
  ['final', 'Итог'],
] as const

function stepIndex(step: Step): number {
  if (step === 'photo') return 0
  if (step === 'style') return 1
  if (step === 'generating' || step === 'result') return 2
  return 3
}

export function GenerationPanel({
  open,
  initialRoomId = '',
  initialRenderId = '',
  inline = false,
  onClose,
  onRequireLogin,
  onRefreshUser,
  onEdited,
  onSelectVersion,
  isAuthed = false,
}: {
  open: boolean
  initialRoomId?: string
  initialRenderId?: string
  inline?: boolean
  onClose: () => void
  onRequireLogin: () => void
  onRefreshUser: () => void | Promise<void>
  onEdited?: () => void
  onSelectVersion?: (renderId: string) => void
  isAuthed?: boolean
}) {
  const { refresh: refreshTasks } = useTasks()
  const [step, setStep] = useState<Step>(initialRoomId ? 'result' : 'photo')
  const [roomType, setRoomType] = useState<string | null>(null)
  const [roomTypes, setRoomTypes] = useState<string[]>(defaultRoomTypes)
  const [stylePresets, setStylePresets] = useState<StylePreset[]>(defaultStylePresets)
  const [photo, setPhoto] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [photoRatio, setPhotoRatio] = useState(4 / 3)
  const [photoError, setPhotoError] = useState('')
  const [cleaned, setCleaned] = useState<{ file: File; url: string; model?: string } | null>(null)
  const [cleanupRequested, setCleanupRequested] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupError, setCleanupError] = useState('')
  const isBedRoom = roomType === 'Спальня' || roomType === 'Детская'
  const [style, setStyle] = useState<string | null>(null)
  const [priceTier, setPriceTier] = useState('comfort')
  const [useCatalog] = useState(true)
  const [concepts, setConcepts] = useState<DesignConcept[]>([])
  const [compatibility, setCompatibility] = useState<DesignCompatibility>({})
  const [conceptKey, setConceptKey] = useState<string | null>(null)
  const [selectedOffers, setSelectedOffers] = useState<Record<string, ProductOffer>>({})
  const [openSummaryTab, setOpenSummaryTab] = useState<string | null>(null)
  const [editRefs, setEditRefs] = useState<EditRefDraft[]>([])
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [genStage, setGenStage] = useState('queued')
  const [genMode, setGenMode] = useState<'base' | 'edit'>('base')
  const [elapsed, setElapsed] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [genError, setGenError] = useState('')
  const [busy, setBusy] = useState(false)
  const [productBinding, setProductBinding] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [finalBusy, setFinalBusy] = useState(false)
  const [finalError, setFinalError] = useState('')
  const [productSearchBusy, setProductSearchBusy] = useState(false)
  const [productSearchError, setProductSearchError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  const loadedRoomRef = useRef('')

  const current = iterations.find((item) => item.id === currentId) ?? iterations[iterations.length - 1] ?? null
  const heroItems = current?.items.filter(item => item.can_bind).slice(0, 3) ?? []
  const showResultMain = !inline || heroItems.length > 0
  const productMatches = current?.analysis?.products || []
  const currentChanges = changesFromArchitect(current?.analysis?.architect)
  const selectedOffersList = Object.values(selectedOffers)
  const toggleOffer = (offer: ProductOffer) => setSelectedOffers(prev => {
    const next = { ...prev }
    if (next[offer.id]) delete next[offer.id]
    else next[offer.id] = offer
    return next
  })

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
    fetch('/api/design')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d?.concepts) && d.concepts.length) setConcepts(d.concepts)
        if (d?.compatibility && typeof d.compatibility === 'object') setCompatibility(d.compatibility)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (step !== 'style' || !conceptKey) return
    const el = document.querySelector(`[data-concept-id="${conceptKey}"]`)
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [conceptKey, step])

  useEffect(() => {
    fetch('/api/room-types')
      .then(r => r.ok ? r.json() : null)
      .then(list => {
        if (Array.isArray(list)) {
          const names = list.filter((name): name is string => typeof name === 'string' && Boolean(name))
          if (names.length) setRoomTypes(names)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) { loadedRoomRef.current = ''; setCreditOpen(false); return }
    if (inline) return
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
    const loadKey = `${initialRoomId}:${initialRenderId}`
    if (!open || !initialRoomId || loadedRoomRef.current === loadKey) return
    loadedRoomRef.current = loadKey
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/rooms/${initialRoomId}${initialRenderId ? `?render_id=${encodeURIComponent(initialRenderId)}` : ''}`)
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || String(r.status))
        if (cancelled) return
        setRoomId(initialRoomId)
        setStyle(d.style || null)
        setRoomType(d.room_type || null)
        if (d.room_type) setRoomTypes(prev => prev.includes(d.room_type) ? prev : [...prev, d.room_type])
        setPriceTier(d.price_tier || 'comfort')
        setConceptKey(d.concept_key || null)
        setPhoto(d.photo_url || null)
        setPhotoName('Фото комнаты')
        setPhotoError(''); setGenError(d.notice || '')
        if (d.photo_url) {
          try {
            const pr = await fetch(d.photo_url)
            if (pr.ok) {
              const blob = await pr.blob()
              setFile(new File([blob], 'room.jpg', { type: blob.type || 'image/jpeg' }))
            }
          } catch { /* правки работают и без локального файла */ }
        }
        const render = d.render
        if (render?.image) {
          const makeIteration = (v: {
            id: string; image: string; request_text?: string | null;
            analysis?: Iteration['analysis']; art_direction?: ArtDirection | null;
            dimensions_estimate?: DimensionsEstimate | null; lens?: LensInfo | null;
            repair_scope?: RepairScope | null; design_direction?: DesignDirection | null;
          }): Iteration => ({
            id: v.id,
            request: editName(v.request_text),
            image: v.image,
            styleName: d.style || '',
            items: d.items || [],
            total: d.total || 0,
            budget: d.budget || 150,
            priceTier: d.price_tier || 'comfort',
            keepFurniture: d.keep_furniture !== false,
            useCatalog: d.use_catalog !== false,
            roomId: initialRoomId,
            ratio: 4 / 3,
            pricesAsOf: d.prices_as_of,
            analysis: v.analysis || null,
            artDirection: v.art_direction || null,
            dimensionsEstimate: v.dimensions_estimate || null,
            lens: v.lens || null,
            repairScope: v.repair_scope || null,
            designDirection: v.design_direction || null,
          })
          let versionRows: Array<Parameters<typeof makeIteration>[0]> = []
          try {
            const vr = await fetch(`/api/rooms/${initialRoomId}/versions`)
            if (vr.ok) {
              const list = await vr.json().catch(() => [])
              versionRows = Array.isArray(list) ? list : []
            }
          } catch { /* fallback на один рендер */ }
          const list = versionRows.length
            ? versionRows.map(makeIteration)
            : [makeIteration({
                id: render.id,
                image: render.image,
                request_text: render.request_text,
                analysis: render.analysis,
                art_direction: render.art_direction,
                dimensions_estimate: render.dimensions_estimate,
                lens: render.lens,
                repair_scope: render.repair_scope,
                design_direction: render.design_direction,
              })]
          setIterations(list)
          const current = list.find(item => item.id === render.id) || list[list.length - 1]
          setCurrentId(current.id)
          setOpenHistory(current.id)
          setStep('result')
        } else {
          setStep('photo')
        }
      } catch (e) {
        if (!cancelled) setGenError(e instanceof Error ? e.message : 'Не удалось открыть комнату')
      }
    })()
    return () => { cancelled = true }
  }, [open, initialRoomId, initialRenderId])

  useEffect(() => {
    if (step !== 'generating') return
    const started = Date.now()
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
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
    setCleaned(null); setCleanupRequested(false); setCleanupError('')
    setRoomType(null)
    setRoomId(''); setIterations([]); setCurrentId(null); setOpenHistory(null)
    // Габариты и объектив оценивает архитектор по фото — пользователь их не вводит.
  }

  const cleanupRoom = async (): Promise<File | null> => {
    if (!file || cleanupBusy) return null
    setCleanupBusy(true); setCleanupError('')
    try {
      const fd = new FormData()
      fd.append('photo', file)
      fd.append('room_type', roomType || 'Другое')
      const r = await fetch('/api/cleanup', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { onRequireLogin(); return null }
      if (!r.ok || !d.image) throw new Error(d.error || 'Не удалось очистить комнату')
      const blob = await (await fetch(d.image)).blob()
      const shellFile = new File([blob], 'cleaned-room.jpg', { type: blob.type || 'image/jpeg' })
      setCleaned({ file: shellFile, url: d.image, model: d.model })
      setCleanupRequested(true)
      return shellFile
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : 'Не удалось очистить комнату')
      return null
    } finally {
      setCleanupBusy(false)
    }
  }

  const clearEditRefs = () => {
    setEditRefs(prev => {
      prev.forEach(ref => { if (ref.preview) releaseUrl(ref.preview) })
      return []
    })
  }

  const addEditBlock = () => setEditRefs(prev => prev.length >= MAX_EDIT_BLOCKS ? prev : [...prev, emptyEditRef()])
  const addEditBlockWithText = (text: string) => setEditRefs(prev => prev.length >= MAX_EDIT_BLOCKS ? prev : [...prev, { ...emptyEditRef(), text }])

  const removeEditRef = (id: string) => setEditRefs(prev => {
    const target = prev.find(ref => ref.id === id)
    if (target?.preview) releaseUrl(target.preview)
    return prev.filter(ref => ref.id !== id)
  })

  const updateEditRef = (id: string, patch: Partial<EditRefDraft>) => setEditRefs(prev => prev.map(ref => ref.id === id ? { ...ref, ...patch } : ref))

  const setEditRefFile = (id: string, nextFile?: File) => {
    if (!nextFile || !nextFile.type.startsWith('image/')) return
    if (nextFile.size > 15 * 1024 * 1024) { setGenError('Референс больше 15 МБ'); return }
    const preview = URL.createObjectURL(nextFile)
    rememberUrl(preview)
    setEditRefs(prev => prev.map(ref => {
      if (ref.id !== id) return ref
      if (ref.preview) releaseUrl(ref.preview)
      return { ...ref, file: nextFile, url: '', preview, name: nextFile.name }
    }))
  }

  const setEditRefUrl = (id: string, value: string) => {
    const clean = value.trim()
    if (!/^https?:\/\//i.test(clean)) return
    setEditRefs(prev => prev.map(ref => {
      if (ref.id !== id) return ref
      if (ref.preview) releaseUrl(ref.preview)
      return { ...ref, file: null, url: clean, preview: null, name: 'Референс по ссылке' }
    }))
  }

  const clearEditRefSource = (id: string) => setEditRefs(prev => prev.map(ref => {
    if (ref.id !== id) return ref
    if (ref.preview) releaseUrl(ref.preview)
    return { ...ref, file: null, url: '', preview: null, name: '' }
  }))

  const pasteEditRef = async (id: string) => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const type = item.types.find(value => value.startsWith('image/'))
          if (type) {
            const blob = await item.getType(type)
            const ext = type.split('/')[1] || 'png'
            setEditRefFile(id, new File([blob], `clipboard.${ext}`, { type }))
            return
          }
        }
      }
      const text = (await navigator.clipboard?.readText())?.trim() || ''
      if (/^https?:\/\//i.test(text)) { setEditRefUrl(id, text); return }
      setGenError('В буфере нет картинки или ссылки')
    } catch {
      setGenError('Браузер не дал доступ к буферу. Вставьте ссылку в поле или перетащите файл.')
    }
  }

  async function pollRoom(id: string): Promise<RoomResult | null> {
    const started = Date.now()
    while (true) {
      if (Date.now() - started > 20 * 60 * 1000) {
        setGenError('Генерация идёт дольше 20 минут. Проверьте кабинет — результат может появиться позже.')
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
      if (d.status) setGenStage(d.status)
      if (d.status === 'done') return d
      if (d.status === 'error') {
        setGenError(d.error || 'Генерация не удалась')
        setStep(iterations.length ? 'result' : 'style')
        return null
      }
    }
  }

  async function startGeneration(request: string, styleName: string, edit?: { target?: string; productId?: number; refFile?: File; refUrl?: string; parentId?: string; refs?: Array<{ file?: File; url?: string; description?: string }> }) {
    if (!file && !roomId) { setPhotoError('Сначала загрузите фото комнаты'); setStep('photo'); return }
    if (!roomType) { setPhotoError('Выберите тип комнаты'); setStep('photo'); return }
    if (busy) return
    if (!isAuthed) { onRequireLogin(); return }
    setBusy(true); setProductBinding(Boolean(edit?.productId)); setGenError('')
    clearEditRefs()
    setGenMode(edit?.parentId ? 'edit' : 'base'); setGenStage('queued'); setElapsed(0); setStep('generating')
    try {
      const isBase = !roomId
      let id = roomId
      if (isBase) {
        if (!file) throw new Error('Для новой генерации нужно фото комнаты')
        let cleanupFile = cleaned?.file || null
        if (cleanupRequested && !cleanupFile) {
          setGenStage('cleanup')
          cleanupFile = await cleanupRoom()
        }
        if (cleanupRequested && !cleanupFile) setGenError('Очистка не удалась — генерируем по оригиналу. Можно выключить очистку и попробовать снова.')
        const usingCleaned = Boolean(cleanupFile)
        const fd = new FormData()
        fd.append('photo', file)
        fd.append('style', styleName)
        fd.append('concept', conceptKey || '')
        fd.append('room_type', roomType)
        if (cleanupFile) fd.append('cleanup_photo', cleanupFile)
        if (isBedRoom) fd.append('bed_length_m', '2')
        fd.append('price_tier', priceTier)
        fd.append('keep_furniture', usingCleaned ? '0' : '1')
        fd.append('use_catalog', useCatalog ? '1' : '0')
        const r = await fetch('/api/rooms', { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { setStep('style'); onRequireLogin(); return }
        if (r.status === 402) { setGenError(''); setStep('style'); setCreditOpen(true); return }
        if (!r.ok) throw new Error(d.error || String(r.status))
        id = d.id
        setRoomId(id)
        void refreshTasks()
        if (d.concept_key) setConceptKey(d.concept_key)
      } else {
        const fd = new FormData()
        fd.append('text', request)
        if (edit?.target) fd.append('target', edit.target)
        if (edit?.productId) fd.append('product_id', String(edit.productId))
        if (edit?.parentId)         fd.append('parent_id', edit.parentId)
        const refs = edit?.refs || []
        if (refs.length) {
          fd.append('ref_meta', JSON.stringify(refs.map(ref => ({
            description: ref.description || '',
            ...(ref.url ? { url: ref.url } : {}),
          }))))
          refs.forEach(ref => { if (ref.file) fd.append('refs', ref.file) })
        }
        if (edit?.refFile) fd.append('ref', edit.refFile)
        if (!edit?.refFile && edit?.refUrl) fd.append('ref_url', edit.refUrl)
        const r = await fetch(`/api/rooms/${id}/iterate`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { setStep(iterations.length ? 'result' : 'style'); onRequireLogin(); return }
        if (r.status === 402) { setGenError(''); setStep(iterations.length ? 'result' : 'style'); setCreditOpen(true); return }
        if (!r.ok) throw new Error(d.error || String(r.status))
      }

      const room = await pollRoom(id)
      if (!room) return
      if (room.notice) {
        setGenError(room.notice)
        setStep('result')
        await onRefreshUser()
        return
      }
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
        priceTier: room.price_tier || priceTier,
        keepFurniture: room.keep_furniture !== false,
        useCatalog: room.use_catalog !== false,
        productsEnabled: room.products_enabled !== false,
        roomId: id,
        ratio: photoRatio,
        pricesAsOf: room.prices_as_of,
        analysis: render.analysis || null,
        artDirection: render.art_direction || null,
        dimensionsEstimate: render.dimensions_estimate || null,
        lens: render.lens || null,
        repairScope: render.repair_scope || null,
        designDirection: render.design_direction || null,
      }
      setIterations(prev => [...prev, next])
      setCurrentId(next.id)
      setOpenHistory(next.id)
      setGenStage('done')
      setStep('result')
      clearEditRefs()
      void refreshTasks()
      onEdited?.()
      await onRefreshUser()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Не удалось выполнить генерацию')
      setStep(iterations.length ? 'result' : 'style')
      void refreshTasks()
    } finally { setBusy(false); setProductBinding(false) }
  }

  const runFinalReview = async () => {
    if (!current || finalBusy) return
    setFinalBusy(true); setFinalError('')
    try {
      const r = await fetch(`/api/renders/${encodeURIComponent(current.id)}/final-review`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { onRequireLogin(); return }
      if (!r.ok) throw new Error(d.error || 'Не удалось собрать итог')
      setIterations(prev => prev.map(item => item.id === current.id ? { ...item, analysis: d.analysis || item.analysis } : item))
      setOpenSummaryTab(null)
      setSelectedOffers({})
      setStep('estimates')
    } catch (e) {
      setFinalError(e instanceof Error ? e.message : 'Не удалось собрать итог')
    } finally {
      setFinalBusy(false)
    }
  }

  const runProductSearch = async () => {
    if (!current || productSearchBusy) return
    setProductSearchBusy(true); setProductSearchError('')
    try {
      const r = await fetch(`/api/renders/${encodeURIComponent(current.id)}/product-search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { onRequireLogin(); return }
      if (!r.ok) throw new Error(d.error || 'Не удалось подобрать товары')
      setIterations(prev => prev.map(item => item.id === current.id ? { ...item, analysis: d.analysis || item.analysis } : item))
      setOpenSummaryTab('products')
      setSelectedOffers({})
      setStep('estimates')
    } catch (e) {
      setProductSearchError(e instanceof Error ? e.message : 'Не удалось подобрать товары')
    } finally {
      setProductSearchBusy(false)
    }
  }

  const resetAll = () => {
    releaseUrl(photo)
    setStep('photo')
    setPhoto(null); setFile(null); setPhotoName(''); setPhotoError(''); setRoomType(null)
    setStyle(null); setPriceTier('comfort')
    setCleaned(null); setCleanupRequested(false); setCleanupError('')
    loadedRoomRef.current = ''
    clearEditRefs()
    setIterations([]); setCurrentId(null); setOpenHistory(null)
    setGenError(''); setGenStage('queued'); setElapsed(0); setRoomId(''); setBusy(false); setCreditOpen(false)
    if (photoInput.current) photoInput.current.value = ''
  }

  const pickCompatibleConcept = (styleKey: string | null) => {
    if (!styleKey || !concepts.length) return null
    const compatible = concepts.filter(concept => (compatibility[concept.id]?.[styleKey] || 'ok') !== 'conflict')
    if (!compatible.length) return null
    return compatible[Math.floor(Math.random() * compatible.length)].id
  }

  const activeStep = stepIndex(step)
  const genStages = genMode === 'edit' ? EDIT_GEN_STAGES : [
    ...BASE_GEN_STAGES.slice(0, 1),
    ...(cleanupRequested ? [{ key: 'cleanup', label: 'Очистка', hint: 'Убираем мебель и готовим пустую комнату' }] : []),
    ...BASE_GEN_STAGES.slice(1, 3),
    ...BASE_GEN_STAGES.slice(3),
  ]
  const genStageIndex = Math.max(0, genStages.findIndex(item => item.key === genStage))
  const genStageInfo = genStages[genStageIndex]
  const genPercent = Math.round(((genStageIndex + 1) / genStages.length) * 100)
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className={inline ? 'min-w-0' : 'gen-overlay'} data-open={open} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : 'true'} aria-label="Генератор дизайна интерьера">
      {!inline && <div className="flex min-h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
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
      </div>}

      <div className={inline ? 'min-w-0' : 'gen-body'}>
        {inline && step === 'result' && !current && <div className="py-10 text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-primary-text" /></div>}
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
                  <img src={cleaned && cleanupRequested ? cleaned.url : photo} alt="Фото комнаты" className="h-full w-full object-contain" onLoad={(event) => setPhotoRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-foreground/85 px-4 py-2 text-background">
                    <span className="truncate text-xs">{photoName}</span>
                    <button type="button" onClick={() => { releaseUrl(photo); setPhoto(null); setPhotoName(''); setCleaned(null); setCleanupRequested(false); setCleanupError(''); if (photoInput.current) photoInput.current.value = '' }} className="flex size-11 shrink-0 items-center justify-center hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Удалить фото"><X className="size-4" /></button>
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
                <div className="mt-5 border p-4">
                  <button type="button" aria-pressed={cleanupRequested} onClick={() => setCleanupRequested(value => !value)} className={`flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cleanupRequested ? '' : 'opacity-90'}`}>
                    <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center border ${cleanupRequested ? 'border-foreground bg-foreground text-background' : 'border-foreground/40'}`}>{cleanupRequested ? <Check className="size-3.5" /> : null}</span>
                    <span>
                      <span className="block text-sm font-medium">Очистить комнату перед генерацией</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{cleanupRequested ? 'Уберём мебель, технику, декор и свет. Оставим стены, окна, двери и пропорции.' : 'По умолчанию выключено: сохраняем вашу мебель и планировку.'}</span>
                    </span>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {cleanupBusy && <span>Очищаем комнату…</span>}
                    {!cleanupBusy && cleaned && cleanupRequested && <span className="text-primary-text">Очищено · можно перегенерировать</span>}
                    {!cleanupBusy && cleaned && !cleanupRequested && <span>Очищенная версия сохранена, но не выбрана</span>}
                    {!cleanupBusy && cleanupError && <span className="text-destructive" role="alert">{cleanupError}</span>}
                  </div>
                </div>
              )}
              <div className="mt-5">
                <p className="eyebrow">Тип комнаты</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{photo ? 'Чтобы в дизайне не появились предметы из другого помещения.' : 'Можно выбрать заранее — сначала загрузите фото.'}</p>
                <div className="mt-3 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
                  {roomTypes.map(type => <button key={type} type="button" disabled={!photo} aria-pressed={roomType === type} onClick={() => setRoomType(type)} className={`min-h-10 bg-background px-2 text-xs leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-foreground/60 ${roomType === type ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>{type}</button>)}
                </div>
              </div>
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
            {roomType && <p className="mt-2 text-sm text-muted-foreground">Комната: {roomType}. Выберите одно направление — оно задаст палитру, материалы и свет.</p>}
            <div className="mt-8 flex snap-x snap-mandatory gap-px overflow-x-auto border bg-border sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
              {stylePresets.map((item) => (
                <button key={item.key} type="button" aria-pressed={style === item.name} onClick={() => { const nextStyle = item.name; const changing = style !== nextStyle; setStyle(nextStyle); if (changing || !conceptKey) setConceptKey(pickCompatibleConcept(item.key)) }} className={`group relative w-60 shrink-0 snap-start bg-background text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:w-auto ${style === item.name ? 'shadow-[inset_0_0_0_2px_oklch(var(--foreground))]' : 'hover:bg-muted'}`}>
                  <span className={`block ${style === item.name ? '' : 'opacity-60'}`}>
                    <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                      <img src={item.image_url || `/images/style-${item.key}.webp`} alt={`Интерьер в стиле ${item.name}`} loading="lazy" onError={(event) => { event.currentTarget.src = '/images/style-modern.webp' }} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                    </span>
                    <span className={`flex min-h-12 items-center justify-between gap-2 px-3 text-sm font-medium ${style === item.name ? 'text-primary-text' : ''}`}>
                      {item.name}
                      {style === item.name ? <Check className="size-4 shrink-0 text-primary-text" /> : null}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-10 border-t pt-6">
              <div>
                <p className="eyebrow">Шаг 03 / Концепция</p>
                <p className="mt-1 text-sm text-muted-foreground">{style ? 'Выберите главный ход будущего интерьера.' : 'Сначала выберите стиль — покажем совместимые концепции.'}</p>
              </div>
              <div className="mt-4 flex snap-x snap-mandatory gap-px overflow-x-auto border bg-border sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
                {concepts.map((concept) => {
                  const selectedKey = stylePresets.find(item => item.name === style)?.key || null
                  const level = selectedKey ? (compatibility[concept.id]?.[selectedKey] || 'ok') : 'ok'
                  const disabled = !style || level === 'conflict'
                  const selected = conceptKey === concept.id
                  return (
                    <button key={concept.id} data-concept-id={concept.id} type="button" disabled={disabled} aria-pressed={selected} onClick={() => setConceptKey(concept.id)} className={`w-60 shrink-0 snap-start bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed sm:w-auto ${selected ? 'shadow-[inset_0_0_0_2px_oklch(var(--foreground))]' : 'hover:bg-muted'}`}>
                      <span className={`block ${selected ? '' : 'opacity-60'}`}>
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                          {concept.name}
                          {selected ? <Check className="size-4 shrink-0 text-primary-text" /> : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{concept.main_move}</span>
                        <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{level === 'weaken' ? 'ослабленная форма' : level === 'conflict' ? 'несовместимо со стилем' : 'совместимо'}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {genError && <p className="mt-4 text-sm text-destructive" role="alert">{genError}</p>}

            <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('photo')} className="action-secondary hidden sm:inline-flex"><ArrowLeft className="size-4" />Назад</button>
              <button
                type="button"
                disabled={busy || !style || (concepts.length > 0 && !conceptKey)}
                onClick={() => {
                  const conceptName = concepts.find(item => item.id === conceptKey)?.name
                  const request = style ? `Стиль: ${style}${conceptName ? ` · концепция: ${conceptName}` : ''}` : 'Стиль по референсу'
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
          <div className="mx-auto max-w-xl py-16" role="status" aria-live="polite">
            <div className="flex items-start gap-4">
              <LoaderCircle className="mt-1 size-8 shrink-0 animate-spin text-primary-text motion-reduce:animate-none" />
              <div>
                <h3 className="display-title text-3xl">{productBinding ? 'Привязываем товар' : genMode === 'edit' ? 'Применяем правку' : 'Создаём ваш дизайн'}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{genStageInfo.hint}</p>
              </div>
            </div>
            <div className="mt-8 h-1 w-full overflow-hidden bg-border" role="progressbar" aria-valuenow={genPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${genPercent}%` }} />
            </div>
            <ol className="mt-6 space-y-2.5">
              {genStages.map((item, index) => {
                const done = index < genStageIndex
                const active = index === genStageIndex
                return (
                  <li key={item.key} className={`flex items-center gap-3 text-sm ${done || active ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {done ? <Check className="size-4 shrink-0 text-primary-text" /> : active ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary-text motion-reduce:animate-none" /> : <span className="size-4 shrink-0 rounded-full border" />}
                    <span>{item.label}</span>
                    {active && <span className="ml-auto font-mono text-[11px] text-muted-foreground">сейчас</span>}
                  </li>
                )
              })}
            </ol>
            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              Прошло {elapsedLabel}. {elapsed >= 180 ? 'Идёт дольше обычного — можно не закрывать окно, результат сохранится в кабинете.' : 'Можно переключиться на другую вкладку, процесс продолжится.'}
            </p>
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
          <div className="min-w-0">
            <div className={showResultMain ? 'grid grid-cols-1 gap-8 xl:grid-cols-[1fr_22rem]' : 'min-w-0'}>
              {showResultMain && <div className="min-w-0">
                {!inline && <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                  <div>
                    <p className="eyebrow">Шаг 03 / Результат</p>
                    <h3 className="mt-2 text-xl font-light uppercase">{current.styleName}</h3>
                  </div>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Версия {iterations.length}</span>
                </div>}
                {!inline && <div className="relative mt-6 bg-foreground">
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
                    <button type="button" onClick={() => setShareOpen(true)} className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Поделиться результатом">
                      <Share2 className="size-5" />
                    </button>
                  </div>
                </div>}
                {!inline && current.artDirection && (current.artDirection.palette?.length || current.artDirection.focalPoint || current.artDirection.mood) ? (
                  <section className="mt-6 border p-4" aria-labelledby="art-direction">
                    <p id="art-direction" className="eyebrow">Авторский бриф</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Направление, которое арт-директор написал по вашему фото и стилю.</p>
                    {(current.dimensionsEstimate || current.lens) ? (
                      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                        {current.dimensionsEstimate ? `Оценка архитектора: ${current.dimensionsEstimate.width} × ${current.dimensionsEstimate.length} × ${current.dimensionsEstimate.height} м` : ''}
                        {current.dimensionsEstimate?.confidence ? ` · уверенность ${current.dimensionsEstimate.confidence === 'high' ? 'высокая' : current.dimensionsEstimate.confidence === 'medium' ? 'средняя' : 'низкая'}` : ''}
                        {current.lens?.type ? ` · объектив: ${current.lens.type === 'wide' ? 'широкий угол' : current.lens.type === 'tele' ? 'теле' : 'нормальный'}` : ''}
                        {current.lens?.distortion && current.lens.distortion !== 'none' ? ` · ${current.lens.distortion === 'strong' ? 'сильное' : 'умеренное'} искажение` : ''}
                      </p>
                    ) : null}
                    {current.artDirection.palette?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {current.artDirection.palette.map((color, index) => (
                          <span key={`${color.hex || color.name}-${index}`} className="inline-flex items-center gap-2 border bg-background px-2 py-1 text-[11px]">
                            <span className="size-4 shrink-0 border" style={{ background: color.hex || 'transparent' }} aria-hidden="true" />
                            {color.name || color.hex}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <dl className="mt-4 grid gap-3 text-xs leading-5 sm:grid-cols-2">
                      {current.artDirection.focalPoint ? <div><dt className="eyebrow">Акцент</dt><dd className="mt-1">{current.artDirection.focalPoint}</dd></div> : null}
                      {current.artDirection.featureWall ? <div><dt className="eyebrow">Стена</dt><dd className="mt-1">{current.artDirection.featureWall}</dd></div> : null}
                      {current.artDirection.lighting ? <div><dt className="eyebrow">Свет</dt><dd className="mt-1">{current.artDirection.lighting}</dd></div> : null}
                      {current.artDirection.mood ? <div><dt className="eyebrow">Настроение</dt><dd className="mt-1">{current.artDirection.mood}</dd></div> : null}
                    </dl>
                  </section>
                ) : null}
                {!inline && current.designDirection ? (
                  <section className="mt-6 border p-4" aria-labelledby="design-direction">
                    <p id="design-direction" className="eyebrow">Направление дизайна</p>
                    {current.designDirection.concept ? <p className="mt-2 text-sm font-medium">{current.designDirection.concept}</p> : null}
                    {current.designDirection.mainMove?.action ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {current.designDirection.mainMove.target ? `${current.designDirection.mainMove.target}: ` : ''}
                        {current.designDirection.mainMove.action}
                        {current.designDirection.mainMove.effect ? ` — ${current.designDirection.mainMove.effect}` : ''}
                      </p>
                    ) : null}
                    {current.designDirection.palette?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {current.designDirection.palette.map((color) => (
                          <span key={`${color.hex}-${color.name || ''}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="size-4 border border-foreground/20" style={{ background: color.hex }} />
                            {color.name || color.hex}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {current.designDirection.materialsStory?.length ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Материалы: {current.designDirection.materialsStory.join(', ')}</p> : null}
                    {current.designDirection.focalPoint ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Фокус: {current.designDirection.focalPoint}</p> : null}
                    {current.designDirection.compatibility === 'weaken' ? <p className="mt-1 text-[11px] text-muted-foreground">Ослабленная форма пары</p> : null}
                  </section>
                ) : null}
                {heroItems.length ? (
                  <section className="mt-6 border p-4" aria-labelledby="hero-products">
                    <p id="hero-products" className="eyebrow">Привязать товар к этому кадру</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Один товар за правку. Если сходство или качество не пройдут проверку, версия откатится, а кредит вернётся.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {heroItems.map(item => (
                        <div key={item.id} className="flex min-w-0 flex-col border border-foreground/20">
                          {item.image_url ? <img src={item.image_url} alt={item.name} className="aspect-[4/3] w-full border-b object-cover" /> : null}
                          <div className="flex flex-1 flex-col p-3">
                            <p className="line-clamp-2 text-xs font-medium leading-5">{item.name}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{presentationLabel(item.presentation_status)}</p>
                            <button type="button" onClick={() => startGeneration(`Перенести товар «${item.name}» в интерьер, изменив только этот объект`, current.styleName, { target: item.target, productId: item.id, parentId: current.id })} className="mt-3 min-h-10 border border-foreground px-2 text-[11px] leading-4 transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              Перенести в интерьер · 1 кредит
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>}

              <aside className={showResultMain ? 'min-w-0 border-t pt-8 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0' : 'min-w-0'}>
                <p className="eyebrow">История правок</p>
                <div className="mt-4 space-y-2">
                  {iterations.map((item, index) => {
                    const expanded = openHistory === item.id
                    const quickEdits = changesFromArchitect(item.analysis?.architect).map(change => ({
                      target: change.target || change.layer,
                      action: change.change,
                      why: change.current,
                      impact: change.impact || 0,
                      layerLabel: change.label || change.layer,
                    })).sort((a, b) => b.impact - a.impact)
                    return (
                      <div key={item.id} className="border border-foreground/25">
                        <button type="button" aria-expanded={expanded} onClick={() => { if (!expanded) { setEditRefs([]) } setOpenHistory(expanded ? null : item.id); setCurrentId(item.id); onSelectVersion?.(item.id) }} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
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
                            {quickEdits.length ? (
                              <div className="mt-3">
                                <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:hidden">
                                  {quickEdits.map((edit, editIndex) => (
                                    <button
                                      key={`${edit.layerLabel}-${editIndex}`}
                                      type="button"
                                      disabled={editRefs.length >= MAX_EDIT_BLOCKS}
                                      onClick={() => {
                                        addEditBlockWithText(edit.action)
                                        requestAnimationFrame(() => document.getElementById('edit-blocks')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
                                      }}
                                      className="flex min-h-12 w-44 max-w-[80vw] min-w-0 shrink-0 snap-start flex-col items-start gap-0.5 overflow-hidden border border-foreground/30 px-3 py-2 text-left transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <span className="line-clamp-2 w-full break-words text-xs font-medium leading-4" title={edit.action}>{edit.action}</span>
                                      <span className="w-full truncate text-[10px] text-muted-foreground">{edit.layerLabel} · {Math.round(edit.impact * 100)}%</span>
                                    </button>
                                  ))}
                                </div>
                                <div className="hidden gap-2 sm:flex sm:flex-wrap">
                                  {quickEdits.map((edit, editIndex) => (
                                    <button
                                      key={`${edit.layerLabel}-${editIndex}`}
                                      type="button"
                                      disabled={editRefs.length >= MAX_EDIT_BLOCKS}
                                      onClick={() => {
                                        addEditBlockWithText(edit.action)
                                        requestAnimationFrame(() => document.getElementById('edit-blocks')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
                                      }}
                                      className="flex min-h-12 w-44 max-w-[80vw] min-w-0 shrink-0 flex-col items-start gap-0.5 overflow-hidden border border-foreground/30 px-3 py-2 text-left transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <span className="line-clamp-2 w-full break-words text-xs font-medium leading-4" title={edit.action}>{edit.action}</span>
                                      <span className="w-full truncate text-[10px] text-muted-foreground">{edit.layerLabel} · {Math.round(edit.impact * 100)}%</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : <p className="mt-2 text-xs leading-5 text-muted-foreground">Архитектор не оставил подсказок — опишите правку ниже.</p>}
                            <div id="edit-blocks" className="mt-5 space-y-3">
                              {editRefs.map((ref) => {
                                const hasSource = Boolean(ref.file || ref.url)
                                return (
                                  <div
                                    key={ref.id}
                                    className={`relative border p-3 transition-colors ${ref.drag ? 'border-primary bg-primary/5' : 'border-foreground/25'}`}
                                    onDragOver={(event) => { event.preventDefault(); updateEditRef(ref.id, { drag: true }) }}
                                    onDragLeave={() => updateEditRef(ref.id, { drag: false })}
                                    onDrop={(event) => {
                                      event.preventDefault(); updateEditRef(ref.id, { drag: false })
                                      const file = event.dataTransfer.files?.[0]
                                      if (file) { setEditRefFile(ref.id, file); return }
                                      const text = event.dataTransfer.getData('text').trim()
                                      if (/^https?:\/\//i.test(text)) setEditRefUrl(ref.id, text)
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="eyebrow">Прикрепить референс</p>
                                      <button type="button" onClick={() => removeEditRef(ref.id)} className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Удалить изменение"><X className="size-4" strokeWidth={1.5} /></button>
                                    </div>
                                    {hasSource ? (
                                      <div className="mt-2 flex items-center gap-3 border border-foreground/25 p-2">
                                        {ref.preview ? (
                                          <img src={ref.preview} alt="" className="h-12 w-12 shrink-0 border border-foreground/25 object-cover" />
                                        ) : (
                                          <a href={ref.url} target="_blank" rel="noopener noreferrer" className="flex h-12 w-12 shrink-0 items-center justify-center border border-foreground/25 bg-muted text-[10px] uppercase tracking-widest text-muted-foreground">URL</a>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs">{ref.url || ref.name || 'Референс'}</p>
                                          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{ref.file ? 'Файл' : 'Ссылка'}</p>
                                        </div>
                                      </div>
                                    ) : null}
                                    <div className="mt-2 grid grid-cols-2 gap-px border border-foreground/25 bg-border">
                                      <label className="inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 bg-background px-2 text-xs transition-colors hover:bg-muted">
                                        <Upload className="size-4 shrink-0 text-primary-text" /> <span className="min-w-0 break-words">{hasSource ? 'Заменить файл' : 'Выбрать файл'}</span>
                                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => setEditRefFile(ref.id, event.target.files?.[0])} />
                                      </label>
                                      <button type="button" onClick={() => pasteEditRef(ref.id)} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 bg-background px-2 text-xs transition-colors hover:bg-muted">
                                        <Clipboard className="size-4 shrink-0 text-primary-text" /> <span className="min-w-0 break-words sm:hidden">Из буфера</span><span className="hidden min-w-0 break-words sm:inline">Вставить из буфера</span>
                                      </button>
                                    </div>
                                    {hasSource && (
                                      <button type="button" onClick={() => clearEditRefSource(ref.id)} className="mt-2 text-[11px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground">Убрать референс</button>
                                    )}
                                    <p className="eyebrow mt-4">Текст изменения</p>
                                    <textarea
                                      value={ref.text}
                                      onChange={(event) => updateEditRef(ref.id, { text: event.target.value })}
                                      rows={4}
                                      placeholder="Опишите, что изменить"
                                      aria-label="Текст изменения"
                                      className="mt-2 min-h-20 w-full min-w-0 border border-foreground/25 bg-background px-3 py-2 text-sm leading-5 outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground focus:ring-2 focus:ring-ring/20"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                            <button type="button" onClick={addEditBlock} disabled={editRefs.length >= MAX_EDIT_BLOCKS} className="mt-3 inline-flex min-h-10 items-center gap-2 border border-foreground px-3 text-xs transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                              <Plus className="size-4 shrink-0 text-primary-text" /> <span className="leading-none">Добавить правку</span> <span className="font-mono text-[11px] leading-none text-primary-text">{editRefs.length} из {MAX_EDIT_BLOCKS}</span>
                            </button>
                            <div className="mt-3">
                              <button
                                type="button"
                                disabled={!editRefs.some(ref => ref.text.trim() || ref.file || ref.url)}
                                onClick={() => {
                                  const textBlocks = editRefs.filter(ref => !ref.file && !ref.url && ref.text.trim())
                                    .map(ref => ref.text.trim())
                                    .join('\n')
                                  const refs = editRefs.filter(ref => ref.file || ref.url).map(ref => ({
                                    file: ref.file || undefined,
                                    url: ref.url || undefined,
                                    description: ref.text.trim(),
                                  }))
                                  startGeneration(textBlocks || 'Применить правки по референсам', item.styleName, { parentId: item.id, refs })
                                }}
                                className="action-primary w-full"
                              >
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

            {!inline && <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => { setStep('style'); setRoomId(''); setIterations([]); setCurrentId(null); setOpenHistory(null); }} className="action-secondary"><ArrowLeft className="size-4" />Изменить стиль</button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={resetAll} className="action-secondary">Новая комната</button>
                <Link to={`/room/${encodeURIComponent(current.roomId)}`} className="action-secondary min-h-14 px-6 text-base">Открыть комнату</Link>
                <button type="button" onClick={runFinalReview} disabled={finalBusy} className="action-primary min-h-14 px-8 text-base">{finalBusy ? <><LoaderCircle className="size-4 animate-spin" /> Собираем итог…</> : <>Готово · итог <Check className="size-5" /></>}</button>
              </div>
            </div>}
            {finalError && <p className="mt-3 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{finalError}</p>}
            {productSearchError && <p className="mt-3 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{productSearchError}</p>}
          </div>
        )}

        {step === 'estimates' && current && (
          <div>
            <p className="eyebrow">Шаг 04 / Смета и электрика</p>
            <div className="mt-6 grid gap-10 xl:grid-cols-2">
              <div>
                <div className="relative mx-auto w-full bg-foreground" style={{ aspectRatio: String(current.ratio), width: `min(100%, calc(58svh * ${current.ratio}))` }}>
                  <img src={current.image} alt="Сгенерированный дизайн интерьера" className="absolute inset-0 h-full w-full object-cover" />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><Zap className="size-4 text-primary-text" />Электрика — рекомендация, не проект</p>
                  <button type="button" onClick={() => setLightbox(true)} className="inline-flex min-h-11 items-center gap-2 text-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Во весь экран <Expand className="size-4" /></button>
                </div>
              </div>

              <div>
                <div className="flex gap-2 overflow-x-auto border-b pb-2">
                  {SUMMARY_TABS.map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setOpenSummaryTab(openSummaryTab === id ? null : id)} className={`min-h-10 shrink-0 border px-3 text-xs transition-colors ${openSummaryTab === id ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground'}`}>{label}</button>
                  ))}
                </div>

                {openSummaryTab === null && (
                  <p className="mt-5 border-y py-4 text-sm text-muted-foreground">Выберите раздел: план ремонта, что изменить, товары и смета, палитра, розетки или итог.</p>
                )}

                {openSummaryTab === 'repair' && ((repairRows(current.repairScope).length || current.repairScope?.storage?.length) ? (
                  <section className="mt-5" aria-labelledby="gen-repair">
                    <h4 id="gen-repair" className="eyebrow mb-4">План ремонта</h4>
                    <dl className="grid gap-2 border-y py-4 text-sm">
                      {repairRows(current.repairScope).map(row => (
                        <div key={row.label} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                          <dt className="text-muted-foreground">{row.label}</dt>
                          <dd><span className="font-medium">{row.action}</span>{row.material ? ` · ${row.material}` : ''}{row.why ? <span className="block text-xs text-muted-foreground">{row.why}</span> : null}</dd>
                        </div>
                      ))}
                      {current.repairScope?.storage?.length ? (
                        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                          <dt className="text-muted-foreground">Хранение</dt>
                          <dd><ul className="list-disc space-y-1 pl-4">{current.repairScope.storage.map((item, index) => <li key={`storage-${index}`}>{item}</li>)}</ul></dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>
                ) : <p className="mt-5 border-y py-4 text-sm text-muted-foreground">План ремонта пока не собран.</p>)}

                {openSummaryTab === 'changes' && (
                  <section className="mt-5" aria-labelledby="gen-changes">
                    <h4 id="gen-changes" className="eyebrow mb-4">Что можно изменить</h4>
                    {currentChanges.length ? (
                      <ol className="divide-y border-y">
                        {currentChanges.map((change, index) => (
                          <li key={`${change.layer}-${index}`} className="flex gap-3 py-3 text-sm">
                            <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                            <div><p className="font-medium">{change.change}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{change.label} · сейчас: {change.current}</p></div>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="border-y py-4 text-sm text-muted-foreground">Архитектор не оставил значимых изменений.</p>}
                  </section>
                )}

                {openSummaryTab === 'products' && (
                  <section className="mt-5" aria-labelledby="gen-products">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 id="gen-products" className="eyebrow">Товары</h4>
                      <button type="button" onClick={runProductSearch} disabled={productSearchBusy || current.productsEnabled === false} className="action-primary min-h-11 px-4 text-sm">{productSearchBusy ? <><LoaderCircle className="size-3.5 animate-spin" /> Ищем…</> : 'Собрать смету'}</button>
                    </div>
                    {productSearchError && <p className="mt-3 text-xs text-destructive" role="alert">{productSearchError}</p>}
                    {productMatches.length ? (
                      <div className="mt-4 space-y-4">
                        {productMatches.map((match, index) => (
                          <div key={`${match.item.category}-${index}`}>
                            <p className="text-xs font-medium">{match.item.label}</p>
                            {match.offers.length ? (
                              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                                {match.offers.map(offer => {
                                  const active = Boolean(selectedOffers[offer.id])
                                  return (
                                    <div key={offer.id} className={`w-40 shrink-0 border transition-colors ${active ? 'border-primary' : 'border-foreground/20'}`}>
                                      <button type="button" onClick={() => toggleOffer(offer)} className="block w-full text-left">
                                        <div className="h-24 w-full overflow-hidden bg-muted">{offer.image_url ? <img src={offer.image_url} alt={offer.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">Нет фото</div>}</div>
                                        <div className="p-2">
                                          <p className="line-clamp-2 text-[11px] font-medium leading-4">{offer.name}</p>
                                          <p className="mt-1 text-xs font-medium">{offer.price === null ? 'Цена не указана' : rub(offer.price)}</p>
                                        </div>
                                      </button>
                                      {offer.url ? <a href={offer.url} target="_blank" rel="noopener nofollow sponsored" className="block border-t px-2 py-1 text-[10px] underline underline-offset-2">{offer.merchant || 'в магазин'}</a> : null}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : <p className="mt-1 text-xs text-muted-foreground">{match.note || 'Нет в каталоге'}</p>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-4 border-y py-4 text-sm text-muted-foreground">{current.productsEnabled === false ? 'Подбор товаров выключен в админке.' : 'Смета ещё не собрана. Нажмите «Собрать смету» — подберём реальные товары по кадру.'}</p>}
                    {selectedOffersList.length ? (
                      <div className="mt-5 border-t pt-3">
                        <p className="eyebrow">Выбрано</p>
                        <ul className="mt-2 divide-y border-y text-sm">
                          {selectedOffersList.map(offer => (
                            <li key={offer.id} className="flex items-start justify-between gap-3 py-2"><span className="min-w-0">{offer.name}</span><span className="shrink-0 font-medium">{offer.price === null ? '—' : rub(offer.price)}</span></li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                )}

                {openSummaryTab === 'ral' && (
                  <section className="mt-5" aria-labelledby="gen-ral">
                    <h4 id="gen-ral" className="eyebrow mb-4">Палитра по рендеру · RAL ориентировочно</h4>
                    {current.analysis?.surfaces?.length ? (
                      <div className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
                        {current.analysis.surfaces.map((surface, index) => (
                          <div key={`${surface.surface}-${index}`} className="bg-background p-3">
                            <span className="block h-10 w-full border border-foreground/20" style={{ background: surface.hex }} />
                            <p className="mt-2 text-xs font-medium">{surface.label || surface.surface}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{surface.ral?.code || surface.hex}</p>
                            {surface.ral ? <p className="text-[11px] text-muted-foreground">{surface.ral.name}</p> : null}
                            {surface.description ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{surface.description}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : <p className="border-y py-4 text-sm text-muted-foreground">Палитра появится после анализа рендера.</p>}
                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">RAL подобран по оттенкам на картинке, точный код сверяйте по вееру.</p>
                  </section>
                )}

                {openSummaryTab === 'electrical' && (
                  <section className="mt-5" aria-labelledby="gen-electrical">
                    <h4 id="gen-electrical" className="eyebrow mb-4">Розетки и выключатели · рекомендация</h4>
                    {current.analysis?.electrical?.length ? (
                      <ul className="divide-y border-y">
                        {current.analysis.electrical.map((item, index) => (
                          <li key={`${item.title}-${index}`} className="flex gap-3 py-3 text-sm"><Zap className="mt-0.5 size-4 shrink-0 text-primary-text" /><div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div></li>
                        ))}
                      </ul>
                    ) : <p className="border-y py-4 text-sm text-muted-foreground">Рекомендации по электрике появятся после анализа рендера.</p>}
                  </section>
                )}

                {openSummaryTab === 'final' && (
                  <section className="mt-5" aria-labelledby="gen-final">
                    <h4 id="gen-final" className="eyebrow mb-4">Итог по дизайну</h4>
                    {current.analysis?.final ? (
                      <dl className="grid gap-3 border-y py-4 text-sm leading-6">
                        {current.analysis.final.concept ? <div><dt className="eyebrow">Концепция</dt><dd className="mt-1">{current.analysis.final.concept}</dd></div> : null}
                        {current.analysis.final.palette ? <div><dt className="eyebrow">Палитра</dt><dd className="mt-1">{current.analysis.final.palette}</dd></div> : null}
                        {current.analysis.final.materials ? <div><dt className="eyebrow">Материалы</dt><dd className="mt-1">{current.analysis.final.materials}</dd></div> : null}
                        {current.analysis.final.electrical ? <div><dt className="eyebrow">Свет и розетки</dt><dd className="mt-1">{current.analysis.final.electrical}</dd></div> : null}
                        {current.analysis.final.next_steps?.length ? <div><dt className="eyebrow">Что дальше</dt><dd className="mt-1"><ul className="list-disc space-y-1 pl-5">{current.analysis.final.next_steps.map((step, index) => <li key={`final-step-${index}`}>{step}</li>)}</ul></dd></div> : null}
                      </dl>
                    ) : <p className="border-y py-4 text-sm text-muted-foreground">Итог ещё не собран. Нажмите «Готово · итог».</p>}
                  </section>
                )}
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('result')} className="action-secondary"><ArrowLeft className="size-4" />Вернуться к результату</button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={resetAll} className="action-secondary"><RotateCcw className="size-4" />Новая комната</button>
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
          </div>
        </div>
      )}

      <ShareDialog renderId={current?.id || ''} open={shareOpen} onClose={() => setShareOpen(false)} />
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

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
  RotateCcw,
  Share2,
  Search,
  SlidersHorizontal,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import { ProcurementPanel } from '@/components/ProcurementPanel'

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
type Analysis = { surfaces?: Surface[]; electrical?: ElectricalItem[]; suggestions?: Suggestion[] }
type ArtDirection = {
  palette?: { hex?: string | null; name?: string }[]
  focalPoint?: string
  featureWall?: string
  lighting?: string
  mood?: string
  layoutPlan?: string
  framingNote?: string
  layoutItems?: { type?: string; description?: string; widthCm?: number | null; depthCm?: number | null; heightCm?: number | null; position?: string; clearanceCm?: number | null }[]
}
type RoomBrief = {
  roomType?: string
  width?: number | null
  length?: number | null
  height?: number | null
  confidence?: string
  styles?: string[]
  architecture?: { windows?: number | null; doors?: number | null; builtins?: string[]; radiators?: boolean; ceiling?: string }
  furniture?: string[]
  reasoning?: string
}
type RoomResult = {
  id: string; status: string; error?: string | null; notice?: string | null; style: string; budget: number; price_tier?: string;
  room_width_m?: number | null; room_length_m?: number | null; room_height_m?: number | null; bed_length_m?: number | null;
  dimension_orientation?: string | null;
  keep_furniture?: boolean; use_catalog?: boolean;
  render?: { id: string; image: string | null; status: string; analysis?: Analysis | null; art_direction?: ArtDirection | null } | null;
  items: GenItem[]; total: number; prices_as_of?: string | null;
}
type Iteration = {
  id: string; request: string; image: string; styleName: string;
  items: GenItem[]; total: number; roomId: string; ratio: number;
  budget: number; priceTier: string; pricesAsOf?: string | null; analysis?: Analysis | null;
  keepFurniture?: boolean; useCatalog?: boolean; artDirection?: ArtDirection | null;
}

type PanelStyle = CSSProperties & { '--photo-ratio': number }
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const rub = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'
const fmtDateTime = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null

type StylePreset = { key: string; name: string; accent: string; image_url?: string }
const defaultStylePresets: StylePreset[] = [
  { key: 'scandi', name: 'Скандинавский', accent: 'dust', image_url: '/images/style-scandi.webp' },
  { key: 'japandi', name: 'Джапанди', accent: 'forest', image_url: '/images/style-japandi.webp' },
  { key: 'wabi-sabi', name: 'Ваби-саби', accent: 'sand', image_url: '/images/style-japandi.webp' },
  { key: 'organic', name: 'Органик модерн', accent: 'sand', image_url: '/images/style-minimal.webp' },
  { key: 'warm-minimal', name: 'Тёплый минимализм', accent: 'dust', image_url: '/images/style-scandi.webp' },
  { key: 'biophilic', name: 'Биофильный', accent: 'forest', image_url: '/images/style-country.webp' },
  { key: 'heritage', name: 'Современная классика', accent: 'terra', image_url: '/images/style-neo.webp' },
  { key: 'mediterranean', name: 'Средиземноморский модерн', accent: 'terra', image_url: '/images/style-deco.webp' },
] as const

const refinePresets = [
  'Изменить цвет пола на тёмный дуб',
  'Сделать интерьер светлее',
  'Заменить текстиль на лён',
  'Добавить больше растений',
] as const

const priceTiers = [
  { key: 'start', name: 'Старт', short: 'Практично и аккуратно', description: 'Ламинат, керамика, painted MDF и базовые fixtures. Чисто и надёжно.' },
  { key: 'comfort', name: 'Комфорт', short: 'Лучший баланс', description: 'Инженерная доска, кварц, качественные фасады, латунь/сталь и layered lighting.' },
  { key: 'premium', name: 'Премиум', short: 'Статусные материалы', description: 'Натуральный камень, массив, дизайнерский свет и брендовая сантехника.' },
  { key: 'atelier', name: 'Ателье', short: 'Дизайнерские решения', description: 'Редкие фактуры, кастомные решения и коллекционные предметы.' },
] as const
const tierName = (key?: string | null) => priceTiers.find(item => item.key === key)?.name || 'Комфорт'
const presentationLabel = (status?: GenItem['presentation_status']) => status === 'verified'
  ? 'Проверен на рендере'
  : status === 'matched' ? 'Похожий по рендеру' : 'Подобран к дизайну'

const stepLabels = ['Фото', 'Стиль', 'Результат', 'Смета'] as const
const defaultRoomTypes = ['Гостиная (зал)', 'Спальня', 'Детская', 'Кухня', 'Санузел', 'Кладовка', 'Прихожая', 'Столовая', 'Кабинет', 'Балкон / лоджия', 'Гардеробная', 'Другое']

function stepIndex(step: Step): number {
  if (step === 'photo') return 0
  if (step === 'style') return 1
  if (step === 'generating' || step === 'result') return 2
  return 3
}

export function GenerationPanel({
  open,
  initialRoomId = '',
  onClose,
  onRequireLogin,
  onRefreshUser,
}: {
  open: boolean
  initialRoomId?: string
  onClose: () => void
  onRequireLogin: () => void
  onRefreshUser: () => void | Promise<void>
}) {
  const [step, setStep] = useState<Step>('photo')
  const [roomType, setRoomType] = useState<string | null>(null)
  const [roomTypes, setRoomTypes] = useState<string[]>(defaultRoomTypes)
  const [roomWidthM, setRoomWidthM] = useState('')
  const [roomLengthM, setRoomLengthM] = useState('')
  const [roomHeightM, setRoomHeightM] = useState('')
  const [bedLengthM, setBedLengthM] = useState('')
  const [dimensionOrientation, setDimensionOrientation] = useState('')
  const [estimateBusy, setEstimateBusy] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  const [estimateNote, setEstimateNote] = useState('')
  const [brief, setBrief] = useState<RoomBrief | null>(null)
  const [stylePresets, setStylePresets] = useState<StylePreset[]>(defaultStylePresets)
  const [photo, setPhoto] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [photoRatio, setPhotoRatio] = useState(4 / 3)
  const [photoError, setPhotoError] = useState('')
  const [cleaned, setCleaned] = useState<{ file: File; url: string; model?: string } | null>(null)
  const [useCleaned, setUseCleaned] = useState(true)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupError, setCleanupError] = useState('')
  const isBedRoom = roomType === 'Спальня' || roomType === 'Детская'
  const [style, setStyle] = useState<string | null>(null)
  const [priceTier, setPriceTier] = useState('comfort')
  const [keepFurniture, setKeepFurniture] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [refPhoto, setRefPhoto] = useState<string | null>(null)
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refName, setRefName] = useState('')
  const [refUrl, setRefUrl] = useState('')
  const [refUrlDraft, setRefUrlDraft] = useState('')
  const [usedRef, setUsedRef] = useState<File | null>(null)
  const [editRefPhoto, setEditRefPhoto] = useState<string | null>(null)
  const [editRefFile, setEditRefFile] = useState<File | null>(null)
  const [editRefName, setEditRefName] = useState('')
  const [editRefUrl, setEditRefUrl] = useState('')
  const [editRefDrag, setEditRefDrag] = useState(false)
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [genError, setGenError] = useState('')
  const [busy, setBusy] = useState(false)
  const [productBinding, setProductBinding] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [procurementOpen, setProcurementOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const refInput = useRef<HTMLInputElement>(null)
  const editRefInput = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  const loadedRoomRef = useRef('')

  const current = iterations.find((item) => item.id === currentId) ?? iterations[iterations.length - 1] ?? null
  const heroItems = current?.items.filter(item => item.can_bind).slice(0, 3) ?? []

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
    if (!open || !initialRoomId || loadedRoomRef.current === initialRoomId) return
    loadedRoomRef.current = initialRoomId
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/rooms/${initialRoomId}`)
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || String(r.status))
        if (cancelled) return
        setRoomId(initialRoomId)
        setStyle(d.style || null)
        setRoomType(d.room_type || null)
        if (d.room_type) setRoomTypes(prev => prev.includes(d.room_type) ? prev : [...prev, d.room_type])
        setRoomWidthM(d.room_width_m != null ? String(d.room_width_m) : '')
        setRoomLengthM(d.room_length_m != null ? String(d.room_length_m) : '')
        setRoomHeightM(d.room_height_m != null ? String(d.room_height_m) : '')
        const loadedBedRoom = d.room_type === 'Спальня' || d.room_type === 'Детская'
        setBedLengthM(d.bed_length_m != null ? String(d.bed_length_m) : (loadedBedRoom ? '2' : ''))
        setDimensionOrientation(d.dimension_orientation || '')
        setPriceTier(d.price_tier || 'comfort')
        setKeepFurniture(d.keep_furniture !== false)
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
          const next: Iteration = {
            id: render.id,
            request: render.request_text || 'Базовая версия',
            image: render.image,
            styleName: d.style || '',
            items: d.items || [],
            total: d.total || 0,
            budget: d.budget || 150,
            priceTier: d.price_tier || 'comfort',
            keepFurniture: d.keep_furniture !== false,
            useCatalog: false,
            roomId: initialRoomId,
            ratio: 4 / 3,
            pricesAsOf: d.prices_as_of,
            analysis: render.analysis || null,
            artDirection: render.art_direction || null,
          }
          setIterations([next])
          setCurrentId(next.id)
          setStep('result')
        } else {
          setStep('photo')
        }
      } catch (e) {
        if (!cancelled) setGenError(e instanceof Error ? e.message : 'Не удалось открыть комнату')
      }
    })()
    return () => { cancelled = true }
  }, [open, initialRoomId])

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
    setCleaned(null); setUseCleaned(true); setCleanupError('')
    setRoomType(null)
    setRoomWidthM(''); setRoomLengthM(''); setRoomHeightM(''); setBedLengthM(''); setDimensionOrientation('')
    setEstimateNote(''); setEstimateError(''); setBrief(null)
    setRoomId(''); setIterations([]); setCurrentId(null); setOpenHistory(null); setUsedRef(null)
    setKeepFurniture(false)
    // Агентский шаг: сразу читаем комнату по фото — тип, размеры и стиль.
    void estimateBrief(nextFile, { auto: true })
  }

  const cleanupRoom = async () => {
    if (!file || cleanupBusy) return
    setCleanupBusy(true); setCleanupError('')
    try {
      const fd = new FormData()
      fd.append('photo', file)
      fd.append('room_type', roomType || 'Другое')
      const r = await fetch('/api/cleanup', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { onRequireLogin(); return }
      if (!r.ok || !d.image) throw new Error(d.error || 'Не удалось очистить комнату')
      const blob = await (await fetch(d.image)).blob()
      const shellFile = new File([blob], 'cleaned-room.jpg', { type: blob.type || 'image/jpeg' })
      setCleaned({ file: shellFile, url: d.image, model: d.model })
      setUseCleaned(true)
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : 'Не удалось очистить комнату')
    } finally {
      setCleanupBusy(false)
    }
  }

  const estimateBrief = async (sourceFile: File, { auto = false } = {}) => {
    if (!sourceFile || estimateBusy) return
    setEstimateBusy(true); setEstimateError(''); setEstimateNote('')
    try {
      const fd = new FormData()
      fd.append('photo', sourceFile)
      fd.append('room_type', auto ? '' : (roomType || 'Другое'))
      const r = await fetch('/api/estimate-room', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { if (!auto) onRequireLogin(); return }
      if (!r.ok) throw new Error(d.error || 'Не удалось оценить комнату')
      const currentRoomType = auto ? null : roomType
      const guessedRoomType = d.room_type_guess && roomTypes.includes(d.room_type_guess) ? d.room_type_guess : null
      const effectiveRoomType = currentRoomType || guessedRoomType
      if (guessedRoomType) setRoomType(prev => prev || guessedRoomType)
      if (d.width_m) setRoomWidthM(prev => auto && prev ? prev : String(d.width_m))
      if (d.length_m) setRoomLengthM(prev => auto && prev ? prev : String(d.length_m))
      if (d.height_m) setRoomHeightM(prev => auto && prev ? prev : String(d.height_m))
      if (d.bed_present && (effectiveRoomType === 'Спальня' || effectiveRoomType === 'Детская')) setBedLengthM(prev => auto && prev ? prev : '2')
      const confidence = d.confidence === 'high' ? 'высокая' : d.confidence === 'medium' ? 'средняя' : 'низкая'
      const suggestedStyles = Array.isArray(d.style_suggestions)
        ? d.style_suggestions
            .map((item: { name?: string }) => item?.name)
            .filter((name: string | undefined): name is string => Boolean(name) && stylePresets.some(p => p.name === name))
            .slice(0, 3)
        : []
      if (suggestedStyles.length) setStyle(prev => prev || suggestedStyles[0])
      setBrief({
        roomType: guessedRoomType || undefined,
        width: d.width_m ?? null,
        length: d.length_m ?? null,
        height: d.height_m ?? null,
        confidence: d.confidence,
        styles: suggestedStyles,
        architecture: d.architecture && typeof d.architecture === 'object' ? d.architecture : undefined,
        furniture: Array.isArray(d.existing_furniture) ? d.existing_furniture.filter((x: unknown): x is string => typeof x === 'string') : [],
        reasoning: typeof d.reasoning === 'string' ? d.reasoning : undefined,
      })
      if (d.width_m || d.length_m || d.height_m) {
        setEstimateNote(`Оценка по фото, уверенность: ${confidence}. Проверьте и поправьте при необходимости.`)
      } else {
        setEstimateNote('Не удалось уверенно определить размеры — введите их вручную.')
      }
    } catch (e) {
      if (!auto) setEstimateError(e instanceof Error ? e.message : 'Не удалось оценить комнату')
    } finally {
      setEstimateBusy(false)
    }
  }

  const estimateDimensions = () => { if (file) void estimateBrief(file) }

  const acceptRef = (nextFile?: File) => {
    if (!nextFile || !nextFile.type.startsWith('image/')) return
    releaseUrl(refPhoto)
    const url = URL.createObjectURL(nextFile)
    rememberUrl(url)
    setRefPhoto(url)
    setRefFile(nextFile)
    setRefName(nextFile.name)
    setRefUrl(''); setRefUrlDraft('')
    setStyle(null)
    setUsedRef(null)
  }

  const acceptRefUrl = (url: string) => {
    const clean = url.trim()
    if (!/^https?:\/\//i.test(clean)) return
    releaseUrl(refPhoto)
    setRefPhoto(null)
    setRefFile(null)
    setRefUrl(clean)
    setRefUrlDraft('')
    setRefName('Референс по ссылке')
    setStyle(null)
    setUsedRef(null)
    if (refInput.current) refInput.current.value = ''
  }

  const clearRef = () => {
    releaseUrl(refPhoto)
    setRefPhoto(null); setRefFile(null); setRefName(''); setRefUrl(''); setRefUrlDraft(''); setUsedRef(null)
    if (refInput.current) refInput.current.value = ''
  }

  const clearEditRef = () => {
    releaseUrl(editRefPhoto)
    setEditRefPhoto(null)
    setEditRefFile(null)
    setEditRefName('')
    setEditRefUrl('')
    if (editRefInput.current) editRefInput.current.value = ''
  }

  const acceptEditRef = (nextFile?: File) => {
    if (!nextFile || !nextFile.type.startsWith('image/')) return
    if (nextFile.size > 15 * 1024 * 1024) { setGenError('Референс больше 15 МБ'); return }
    releaseUrl(editRefPhoto)
    const url = URL.createObjectURL(nextFile)
    rememberUrl(url)
    setEditRefPhoto(url)
    setEditRefFile(nextFile)
    setEditRefName(nextFile.name)
    setEditRefUrl('')
  }

  const acceptEditRefUrl = (url: string) => {
    const clean = url.trim()
    if (!/^https?:\/\//i.test(clean)) return
    releaseUrl(editRefPhoto)
    setEditRefPhoto(null)
    setEditRefFile(null)
    setEditRefName('Референс по ссылке')
    setEditRefUrl(clean)
    if (editRefInput.current) editRefInput.current.value = ''
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

  async function startGeneration(request: string, styleName: string, edit?: { target?: string; productId?: number; refFile?: File; refUrl?: string; parentId?: string }) {
    if (!file && !roomId) { setPhotoError('Сначала загрузите фото комнаты'); setStep('photo'); return }
    if (!roomType) { setPhotoError('Выберите тип комнаты'); setStep('photo'); return }
    const measureCount = [roomWidthM, roomLengthM, roomHeightM].filter(value => value.trim()).length
    if (measureCount > 0 && measureCount < 3) { setPhotoError('Заполните ширину, длину и высоту комнаты или оставьте все три поля пустыми'); setStep('photo'); return }
    if (busy) return
    setBusy(true); setProductBinding(Boolean(edit?.productId)); setGenError(''); setRefineText(''); setProgress(3); setStep('generating')
    try {
      const isBase = !roomId || Boolean(refFile && refFile !== usedRef)
      let id = roomId
      if (isBase) {
        if (!file) throw new Error('Для новой генерации нужно фото комнаты')
        const fd = new FormData()
        fd.append('photo', file)
        fd.append('style', styleName)
        fd.append('room_type', roomType)
        if (roomWidthM.trim()) fd.append('room_width_m', roomWidthM.replace(',', '.'))
        if (roomLengthM.trim()) fd.append('room_length_m', roomLengthM.replace(',', '.'))
        if (roomHeightM.trim()) fd.append('room_height_m', roomHeightM.replace(',', '.'))
        if (isBedRoom) fd.append('bed_length_m', (bedLengthM.trim() || '2').replace(',', '.'))
        if (dimensionOrientation.trim()) fd.append('dimension_orientation', dimensionOrientation.trim())
        fd.append('price_tier', priceTier)
        fd.append('keep_furniture', cleaned && useCleaned ? '0' : (keepFurniture ? '1' : '0'))
        fd.append('use_catalog', '0')
        if (refFile) fd.append('style_ref', refFile)
        if (!refFile && refUrl) fd.append('style_ref_url', refUrl)
        const r = await fetch('/api/rooms', { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { onRequireLogin(); return }
        if (r.status === 402) { setGenError(''); setStep('style'); setCreditOpen(true); return }
        if (!r.ok) throw new Error(d.error || String(r.status))
        id = d.id
        setRoomId(id)
        setUsedRef(refFile)
      } else {
        const fd = new FormData()
        fd.append('text', request)
        if (edit?.target) fd.append('target', edit.target)
        if (edit?.productId) fd.append('product_id', String(edit.productId))
        if (edit?.parentId) fd.append('parent_id', edit.parentId)
        if (edit?.refFile) fd.append('ref', edit.refFile)
        if (!edit?.refFile && edit?.refUrl) fd.append('ref_url', edit.refUrl)
        const r = await fetch(`/api/rooms/${id}/iterate`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { onRequireLogin(); return }
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
        useCatalog: false,
        roomId: id,
        ratio: photoRatio,
        pricesAsOf: room.prices_as_of,
        analysis: render.analysis || null,
        artDirection: render.art_direction || null,
      }
      setIterations(prev => [...prev, next])
      setCurrentId(next.id)
      setOpenHistory(next.id)
      setProgress(100)
      setStep('result')
      clearEditRef()
      await onRefreshUser()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Не удалось выполнить генерацию')
      setStep(iterations.length ? 'result' : 'style')
    } finally { setBusy(false); setProductBinding(false) }
  }

  const resetAll = () => {
    releaseUrl(photo)
    releaseUrl(refPhoto)
    setStep('photo')
    setPhoto(null); setFile(null); setPhotoName(''); setPhotoError(''); setRoomType(null)
    setRoomWidthM(''); setRoomLengthM(''); setRoomHeightM(''); setBedLengthM(''); setDimensionOrientation('')
    setEstimateNote(''); setEstimateError(''); setEstimateBusy(false); setBrief(null)
    setStyle(null); setPriceTier('comfort'); setKeepFurniture(false)
    setCustomOpen(false); setAdvancedOpen(false)
    setRefPhoto(null); setRefFile(null); setRefName(''); setRefUrl(''); setRefUrlDraft(''); setUsedRef(null)
    loadedRoomRef.current = ''
    clearEditRef()
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
                  <img src={cleaned && useCleaned ? cleaned.url : photo} alt="Фото комнаты" className="h-full w-full object-contain" onLoad={(event) => setPhotoRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-foreground/85 px-4 py-2 text-background">
                    <span className="truncate text-xs">{photoName}</span>
                    <button type="button" onClick={() => { releaseUrl(photo); setPhoto(null); setPhotoName(''); setCleaned(null); setUseCleaned(true); setCleanupError(''); if (photoInput.current) photoInput.current.value = '' }} className="flex size-11 shrink-0 items-center justify-center hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Удалить фото"><X className="size-4" /></button>
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
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="eyebrow">Очистка комнаты</p><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Уберём мебель, технику, декор и свет. Оставим стены, окна, двери и пропорции помещения.</p></div>
                    <button type="button" disabled={cleanupBusy} onClick={() => void cleanupRoom()} className="action-secondary min-h-11 px-4">{cleanupBusy ? 'Очищаем…' : cleaned ? 'Очистить заново' : 'Очистить комнату'}</button>
                  </div>
                  {cleaned && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setUseCleaned(false)} className={`min-h-9 border px-3 text-xs ${!useCleaned ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted'}`}>Оригинал</button>
                      <button type="button" onClick={() => setUseCleaned(true)} className={`min-h-9 border px-3 text-xs ${useCleaned ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted'}`}>Очищенная</button>
                      <span className="text-[11px] text-muted-foreground">Готово · можно перегенерировать дизайн по очищенной</span>
                    </div>
                  )}
                  {cleanupError && <p className="mt-3 text-sm text-destructive" role="alert">{cleanupError}</p>}
                </div>
              )}
              {photo && (
                <div className="mt-5">
                  <p className="eyebrow">Тип комнаты</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Чтобы в дизайне не появились предметы из другого помещения.</p>
                  <div className="mt-3 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
                    {roomTypes.map(type => <button key={type} type="button" aria-pressed={roomType === type} onClick={() => { setRoomType(type); setBedLengthM(type === 'Спальня' || type === 'Детская' ? '2' : ''); setCleaned(null); setUseCleaned(true); setCleanupError('') }} className={`min-h-10 bg-background px-2 text-xs leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${roomType === type ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>{type}</button>)}
                  </div>
                </div>
              )}
              {photo && (estimateBusy || brief) && (
                <div className="mt-5 border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="eyebrow">Бриф комнаты</p>
                    {estimateBusy ? (
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />Смотрим фото…</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Уверенность: {brief?.confidence === 'high' ? 'высокая' : brief?.confidence === 'medium' ? 'средняя' : 'низкая'}</span>
                    )}
                  </div>
                  {brief && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        {brief.roomType && <span className="border bg-muted px-2 py-1">Тип: {brief.roomType}</span>}
                        {brief.width && brief.length && <span className="border bg-muted px-2 py-1">{brief.width} × {brief.length} м</span>}
                        {brief.height && <span className="border bg-muted px-2 py-1">Потолок {brief.height} м</span>}
                        {brief.architecture?.windows != null && <span className="border bg-muted px-2 py-1">Окон: {brief.architecture.windows}</span>}
                        {brief.architecture?.doors != null && <span className="border bg-muted px-2 py-1">Дверей: {brief.architecture.doors}</span>}
                        {brief.architecture?.radiators && <span className="border bg-muted px-2 py-1">Радиатор</span>}
                      </div>
                      {brief.styles?.length ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Подойдут стили: <span className="text-foreground">{brief.styles.join(', ')}</span>. Первый уже выбран.</p> : null}
                      {brief.reasoning ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{brief.reasoning}</p> : null}
                    </>
                  )}
                </div>
              )}
              {photo && roomType && (
                <div className="mt-5 border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">Размеры комнаты <span className="ml-1 font-normal text-muted-foreground">необязательно</span></p>
                      <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">Укажите реальные ширину, длину и высоту — модель точнее подберёт мебель и проходы. Заполняйте все три поля вместе.</p>
                    </div>
                    <button type="button" disabled={!file || estimateBusy} onClick={() => void estimateDimensions()} className="action-secondary min-h-9 px-3 text-xs disabled:opacity-40">{estimateBusy ? 'Определяем…' : 'Определить по фото'}</button>
                  </div>
                  {estimateNote && <p className="mt-3 border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">{estimateNote}</p>}
                  {estimateError && <p className="mt-3 text-xs text-destructive" role="alert">{estimateError}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <label className="block"><span className="eyebrow mb-1 block">Ширина, м</span><input value={roomWidthM} onChange={event => setRoomWidthM(event.target.value)} inputMode="decimal" placeholder="3.0" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-1 block">Длина, м</span><input value={roomLengthM} onChange={event => setRoomLengthM(event.target.value)} inputMode="decimal" placeholder="6.0" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-1 block">Высота, м</span><input value={roomHeightM} onChange={event => setRoomHeightM(event.target.value)} inputMode="decimal" placeholder="2.5" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                  </div>
                  {isBedRoom && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Для спальни и детской длина кровати 2,0 м подставляется автоматически.</p>}
                  <label className="mt-3 block"><span className="eyebrow mb-1 block">Ориентация размеров</span><textarea value={dimensionOrientation} onChange={event => setDimensionOrientation(event.target.value)} rows={2} placeholder="Например: ширина — стена с окном, длина — от двери до окна" className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></label>
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
            {roomType && <p className="mt-2 text-sm text-muted-foreground">Комната: {roomType}. Можно не выбирать стиль — тогда загрузите свой референс ниже.</p>}
            <div className="mt-8 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3 lg:grid-cols-5">
              {stylePresets.map((item) => (
                <button key={item.key} type="button" aria-pressed={style === item.name} onClick={() => setStyle(item.name)} className={`group relative bg-background text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${style === item.name ? 'shadow-[inset_0_0_0_2px_oklch(var(--foreground))]' : 'hover:bg-muted'}`}>
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
                <div className="border-t border-foreground/25 p-4" onPaste={(event) => {
                  if ((event.target as HTMLElement).tagName === 'INPUT') return
                  const pastedFile = event.clipboardData.files?.[0]
                  if (pastedFile) { event.preventDefault(); acceptRef(pastedFile); return }
                  const pastedText = event.clipboardData.getData('text')
                  if (pastedText && /^https?:\/\//i.test(pastedText.trim())) { event.preventDefault(); acceptRefUrl(pastedText) }
                }}>
                  <input ref={refInput} id="gen-ref" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => acceptRef(event.target.files?.[0])} />
                  {refPhoto ? (
                    <div className="flex items-center justify-between gap-4 border bg-muted px-4 py-3">
                      <span className="truncate text-sm">{refName}</span>
                      <button type="button" onClick={clearRef} className="flex size-11 items-center justify-center hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Удалить референс"><X className="size-4" /></button>
                    </div>
                  ) : refUrl ? (
                    <div className="flex items-center justify-between gap-4 border bg-muted px-4 py-3">
                      <a href={refUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm underline underline-offset-2">{refUrl}</a>
                      <button type="button" onClick={clearRef} className="flex size-11 items-center justify-center hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Удалить референс"><X className="size-4" /></button>
                    </div>
                  ) : (
                    <>
                      <label htmlFor="gen-ref" className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-foreground/40 px-4 text-center text-sm transition-colors hover:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                        <Upload className="size-5 text-primary-text" />
                        <span>Загрузить фото или вставить из буфера</span>
                        <span className="text-xs text-muted-foreground">JPG, PNG, WebP — нейросеть перенесёт настроение референса</span>
                      </label>
                      <div className="mt-3 flex gap-2">
                        <input value={refUrlDraft} onChange={(event) => setRefUrlDraft(event.target.value)} onBlur={() => { if (refUrlDraft) acceptRefUrl(refUrlDraft) }} onKeyDown={(event) => { if (event.key === 'Enter' && refUrlDraft) { event.preventDefault(); acceptRefUrl(refUrlDraft) } }} placeholder="или вставьте ссылку на референс" className="h-11 min-w-0 flex-1 border bg-background px-3 text-sm outline-none focus:border-primary" />
                        <button type="button" disabled={!refUrlDraft.trim()} onClick={() => acceptRefUrl(refUrlDraft)} className="min-h-11 border border-foreground px-3 text-xs hover:bg-foreground hover:text-background disabled:opacity-40">Добавить</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 border">
              <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(v => !v)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex items-center gap-3"><SlidersHorizontal className="size-4 text-primary-text" />Дополнительно{keepFurniture ? ' · мебель сохраняем' : ' · мебель меняем'}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${advancedOpen ? 'rotate-180' : ''}`} />
              </button>
              {advancedOpen && (
                <div className="border-t border-foreground/25 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div><p className="eyebrow">Класс материалов</p><p className="mt-1 text-xs text-muted-foreground">Уровень отделки и мебели. Смета не собирается, пока каталог выключен.</p></div>
                    <output className="text-lg font-light">{tierName(priceTier)}</output>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-px border bg-border">
                    {priceTiers.map(item => (
                      <button key={item.key} type="button" aria-pressed={priceTier === item.key} onClick={() => setPriceTier(item.key)} className={`min-h-16 bg-background px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${priceTier === item.key ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
                        <span className="block text-sm font-medium">{item.name}</span>
                        <span className="mt-1 block text-[11px] leading-4 opacity-70">{item.short}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">{priceTiers.find(item => item.key === priceTier)?.description}</p>

                  <div className="mt-6 grid gap-px border bg-border">
                    <button type="button" aria-pressed={keepFurniture} onClick={() => setKeepFurniture(v => !v)} className={`flex min-h-24 gap-3 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${keepFurniture ? 'bg-foreground text-background' : 'bg-background hover:bg-muted'}`}>
                      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center border ${keepFurniture ? 'border-background' : 'border-foreground/40'}`}>{keepFurniture ? <Check className="size-3.5" /> : null}</span>
                      <span><span className="block text-sm font-medium">Оставить мебель</span><span className="mt-1 block text-[11px] leading-4 opacity-75">{keepFurniture ? 'Сохраняем существующую мебель и планировку. Можно обновить отделку.' : 'Меняем мебель и отделку, сохраняя архитектуру, окна и двери.'}</span></span>
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Каталог и смета отключены: дизайн генерируется свободно, без товаров.</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Очистка комнаты применяется автоматически, когда «Оставить мебель» выключено.</p>
                </div>
              )}
            </div>

            {genError && <p className="mt-4 text-sm text-destructive" role="alert">{genError}</p>}

            <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('photo')} className="action-secondary"><ArrowLeft className="size-4" />Назад</button>
              <button
                type="button"
                disabled={busy || (!style && !refFile && !refUrl)}
                onClick={() => {
                  const request = style ? `Стиль: ${style}` : 'Стиль по референсу'
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
            <h3 className="display-title mt-8 text-4xl">{productBinding ? 'Привязываем товар' : 'Создаём ваш дизайн'}</h3>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{productBinding ? 'Меняем только выбранный объект, затем проверяем сходство, архитектуру и качество кадра.' : 'Рисуем визуализацию без каталожных карточек, подбираем отделку и собираем палитру комнаты.'}</p>
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
                    <button type="button" onClick={() => setShareOpen(true)} className="flex size-12 items-center justify-center border border-background/40 bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Поделиться результатом">
                      <Share2 className="size-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-y py-3 text-sm">
                  <span className="text-muted-foreground">{current.useCatalog === false ? 'Каталог отключён · смета не формируется' : `Класс «${tierName(current.priceTier)}» · подборка ${rub(current.total)}`}</span>
                  <span className="text-muted-foreground">{current.useCatalog === false ? 'Свободный дизайн' : 'Итог ориентировочный'}</span>
                </div>
                {current.artDirection && (current.artDirection.palette?.length || current.artDirection.focalPoint || current.artDirection.mood) ? (
                  <section className="mt-6 border p-4" aria-labelledby="art-direction">
                    <p id="art-direction" className="eyebrow">Авторский бриф</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Направление, которое арт-директор написал по вашему фото и стилю.</p>
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
                      {current.artDirection.layoutPlan ? <div className="sm:col-span-2"><dt className="eyebrow">План на всю комнату</dt><dd className="mt-1">{current.artDirection.layoutPlan}</dd></div> : null}
                      {current.artDirection.framingNote ? <div className="sm:col-span-2"><dt className="eyebrow">Что видит камера</dt><dd className="mt-1">{current.artDirection.framingNote}</dd></div> : null}
                    </dl>
                    {current.artDirection.layoutItems?.length ? (
                      <div className="mt-4">
                        <p className="eyebrow">Объекты</p>
                        <ul className="mt-2 divide-y border-y text-xs">
                          {current.artDirection.layoutItems.map((item, index) => (
                            <li key={`${item.type}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                              <span><b>{item.type}</b>{item.description ? ` — ${item.description}` : ''}{item.position ? ` · ${item.position}` : ''}</span>
                              <span className="font-mono text-muted-foreground">{[item.widthCm, item.depthCm, item.heightCm].filter(value => typeof value === 'number').join(' × ') || '—'}{item.widthCm ? ' см' : ''}{item.clearanceCm ? ` · проход ${item.clearanceCm} см` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
                {current.analysis?.suggestions?.length ? (
                  <div className="mt-6 border p-4">
                    <p className="eyebrow">Что улучшить</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Кнопки прикрепляют референс товара и меняют только выбранный объект.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {current.analysis.suggestions.map(s => (
                        <button key={`${s.target}-${s.product_id}`} type="button" onClick={() => startGeneration(s.label, current.styleName, { target: s.target, productId: s.product_id, parentId: current.id })} className="inline-flex min-h-10 items-center gap-2 border border-foreground/30 px-3 text-xs transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {s.image_url ? <img src={s.image_url} alt="" className="size-7 border object-cover" /> : null}
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                                <button key={preset} type="button" onClick={() => startGeneration(preset, item.styleName, { parentId: item.id })} className="min-h-10 border border-foreground/30 px-3 text-xs transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <div className="mt-3 flex flex-col gap-2">
                              <input value={refineText} onChange={(event) => setRefineText(event.target.value)} onPaste={(event) => {
                                const file = event.clipboardData.files?.[0]
                                if (file) { event.preventDefault(); acceptEditRef(file); return }
                                const text = event.clipboardData.getData('text').trim()
                                if (/^https?:\/\//i.test(text)) { event.preventDefault(); acceptEditRefUrl(text) }
                              }} placeholder="Опишите правку. Можно вставить сюда ссылку на референс…" className="h-11 min-w-0 border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20" />
                              <div
                                className={`rounded-none border border-dashed p-2 transition-colors ${editRefDrag ? 'border-primary bg-primary/5' : 'border-foreground/35'}`}
                                onDragOver={(event) => { event.preventDefault(); setEditRefDrag(true) }}
                                onDragLeave={() => setEditRefDrag(false)}
                                onDrop={(event) => {
                                  event.preventDefault(); setEditRefDrag(false)
                                  const file = event.dataTransfer.files?.[0]
                                  if (file) { acceptEditRef(file); return }
                                  const text = event.dataTransfer.getData('text').trim()
                                  if (/^https?:\/\//i.test(text)) acceptEditRefUrl(text)
                                }}
                                onPaste={(event) => {
                                  const file = event.clipboardData.files?.[0]
                                  if (file) { event.preventDefault(); acceptEditRef(file); return }
                                  const text = event.clipboardData.getData('text').trim()
                                  if (/^https?:\/\//i.test(text)) { event.preventDefault(); acceptEditRefUrl(text) }
                                }}
                              >
                                {editRefPhoto ? (
                                  <div className="flex items-center gap-2">
                                    <img src={editRefPhoto} alt="" className="h-12 w-12 border object-cover" />
                                    <span className="min-w-0 flex-1 truncate text-xs">{editRefName}</span>
                                    <button type="button" onClick={clearEditRef} className="flex size-8 items-center justify-center text-destructive" aria-label="Убрать референс"><X className="size-4" /></button>
                                  </div>
                                ) : editRefUrl ? (
                                  <div className="flex items-center gap-2">
                                    <span className="flex size-12 shrink-0 items-center justify-center border bg-muted text-[10px] text-muted-foreground">URL</span>
                                    <a href={editRefUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs underline underline-offset-2">{editRefUrl}</a>
                                    <button type="button" onClick={clearEditRef} className="flex size-8 items-center justify-center text-destructive" aria-label="Убрать референс"><X className="size-4" /></button>
                                  </div>
                                ) : (
                                  <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 text-center">
                                    <Upload className="size-4 text-primary-text" />
                                    <span className="text-xs">Перетащите, вставьте из буфера или нажмите</span>
                                    <span className="text-[11px] leading-4 text-muted-foreground">файл JPG/PNG/WebP или ссылка на референс</span>
                                    <input ref={editRefInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => acceptEditRef(event.target.files?.[0])} />
                                  </label>
                                )}
                              </div>
                              <button type="button" disabled={!refineText.trim()} onClick={() => startGeneration(refineText.trim(), item.styleName, { parentId: item.id, refFile: editRefFile || undefined, refUrl: editRefUrl || undefined })} className="inline-flex min-h-11 items-center justify-center gap-2 border border-foreground px-4 text-sm transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
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
              <button type="button" onClick={() => { setStep('style'); setRoomId(''); setIterations([]); setCurrentId(null); setOpenHistory(null); }} className="action-secondary"><ArrowLeft className="size-4" />Изменить стиль</button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={resetAll} className="action-secondary">Новая комната</button>
                <a href={`/cabinet?room=${encodeURIComponent(current.roomId)}`} className="action-secondary"><ArrowUpRight className="size-4" />Открыть в кабинете</a>
                <button type="button" onClick={() => setProcurementOpen(true)} className="action-primary min-h-14 px-8 text-base">Найти товары · 1 кредит <Search className="size-5" /></button>
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
                  <img src={current.image} alt="Сгенерированный дизайн интерьера" className="absolute inset-0 h-full w-full object-cover" />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><Zap className="size-4 text-primary-text" />Электрика — рекомендация, не проект</p>
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
                          {` · ${presentationLabel(item.presentation_status)}`}
                          {item.source ? ` · ${item.source}` : ''}
                          {item.price_tier ? ` · ${tierName(item.price_tier)}` : ''}
                          {item.url ? <> · <a className={item.direct_url ? 'font-medium text-primary-text underline underline-offset-2' : 'underline underline-offset-2'} href={item.url} target="_blank" rel={item.direct_url ? 'noopener nofollow sponsored' : 'noopener nofollow'}>{item.link_label || 'в магазин'}</a></> : null}
                        </span>
                      </div>
                    )) : <p className="py-4 text-sm text-muted-foreground">Подборка не сформирована — попробуйте изменить запрос.</p>}
                  </div>
                  <p className="mt-3 flex items-center justify-between text-sm"><span className="text-muted-foreground">Итого, оценка · класс «{tierName(current.priceTier)}»</span><strong className="text-xl font-light text-primary-text">{rub(current.total)}</strong></p>
                  <p className="mt-1 text-right text-xs text-muted-foreground">Смета ориентировочная</p>
                  {fmtDateTime(current.pricesAsOf) && <p className="mt-1 text-right text-[11px] text-muted-foreground">Цены актуальны на {fmtDateTime(current.pricesAsOf)}</p>}
                </section>

                <section aria-labelledby="gen-ral">
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
                  ) : <p className="border-y py-4 text-sm text-muted-foreground">Палитра появится после анализа рендера — сейчас vision не вернул поверхности.</p>}
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground">RAL подобран по оттенкам на картинке, точный код сверяйте по вееру.</p>
                </section>

                <section aria-labelledby="gen-electrical">
                  <h4 id="gen-electrical" className="eyebrow mb-4">Розетки и выключатели · рекомендация</h4>
                  {current.analysis?.electrical?.length ? (
                    <ul className="divide-y border-y">
                      {current.analysis.electrical.map((item, index) => (
                        <li key={`${item.title}-${index}`} className="flex gap-3 py-3 text-sm"><Zap className="mt-0.5 size-4 shrink-0 text-primary-text" /><div><p>{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p></div></li>
                      ))}
                    </ul>
                  ) : <p className="border-y py-4 text-sm text-muted-foreground">Рекомендации по электрике появятся после анализа рендера.</p>}
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
          </div>
        </div>
      )}

      <ShareDialog renderId={current?.id || ''} open={shareOpen} onClose={() => setShareOpen(false)} />
      <ProcurementPanel renderId={current?.id || ''} open={procurementOpen} onClose={() => setProcurementOpen(false)} onCreditsChanged={onRefreshUser} />
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

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowUpRight, Check, LoaderCircle, LogOut, Plus, Search, Upload, X } from 'lucide-react'
import '../App.css'

type Tab = 'users' | 'packs' | 'rooms' | 'styles' | 'rules' | 'prompts' | 'models' | 'cleanup' | 'procurement' | 'proxy' | 'catalog'
type AdminUser = {
  id: number; email: string; balance: number; rooms_count: number; renders_count: number;
  created_at: string; last_generation_at: string | null;
}
type CreditRow = { id: number; delta: number; reason: string; note: string | null; created_at: string }
type GenRow = {
  id: string; room_id: string; style: string; room_type?: string | null; status: string; request_text: string | null;
  credits_spent: number; created_at: string; finished_at: string | null;
  prompt: string | null; model: string | null; cost_usd: number | null; duration_ms: number | null;
  image_url: string | null; photo_url: string | null; error: string | null;
}
type PromptRow = {
  id: string; room_id: string; email: string; style: string; room_type: string | null; budget: number;
  price_tier?: string | null;
  status: string; error: string | null; created_at: string; finished_at: string | null;
  request_text: string | null; prompt: string | null; model: string | null;
  cost_usd: number | null; duration_ms: number | null; credits_spent: number | null;
  image_url: string | null; photo_url: string | null;
  meta?: {
    mode?: string; target?: string | null; refs?: Array<{ index: number; role: string; label?: string }>;
    cleanup?: { model?: string; resolution?: string; cost_usd?: number | null; shell_path?: string; error?: string } | null;
    art_direction?: {
      text?: string; layoutPlan?: string; framingNote?: string;
      layoutItems?: Array<{ type?: string; description?: string; widthCm?: number | null; depthCm?: number | null; heightCm?: number | null; position?: string; clearanceCm?: number | null }>;
      palette?: Array<{ hex?: string | null; name?: string }>;
      focalPoint?: string; featureWall?: string; lighting?: string; mood?: string;
    } | null;
    dimension_qa?: { accepted?: boolean; score?: number | null; checks?: Record<string, boolean>; issues?: string[] } | null;
    cost_breakdown?: Record<string, number | null> | null;
  } | null;
}
type UserDetail = { user: AdminUser; credits: CreditRow[]; generations: GenRow[] }
type Pack = { id: string; title: string; credits: number; price_kopecks: number; active: boolean; sort: number }
type Style = {
  id: number; key: string; name: string; accent: string; description: string;
  image_url: string; active: boolean; sort: number;
  references_count?: number; products_count?: number;
}
type StyleRef = {
  id: number; title: string; image_url: string; sort: number; room_type?: string | null;
  kind?: string; source?: string | null; approved?: boolean;
  score?: { total?: number; style_score?: number; room_score?: number; beauty_score?: number; product_score?: number; issues?: string[] } | null;
  product_ids?: string | null;
}
type Product = {
  id: number; category: string; name: string; brand?: string | null; price: number;
  unit: string; qty: number; image_path?: string | null; image_url?: string | null;
  source?: string | null; url?: string | null; room_type?: string | null;
  price_tier?: string | null; room_types?: string | null; surface?: string | null; active?: boolean;
  seed_key?: string | null;
  dimensions?: { text?: string; width_cm?: number | null; depth_cm?: number | null; height_cm?: number | null; diameter_cm?: number | null } | null;
}
type KitSlot = { key: string; label: string; product: { id: number; name: string; price: number; unit: string; price_tier: string; url: string | null; image_url: string | null; dimensions?: { text?: string } | null } | null };
type KitResult = { style_id: number; style: string; room_type: string; price_tier: string; slots: KitSlot[]; missing: string[]; product_ids: number[] };
type CleanupConfig = { enabled: boolean; model: string; resolution: string; aspect_ratio: string; prompt: string };
type StyleReferenceConfig = { mode: 'text' | 'reference' | 'swatches' };
type ProcurementConfig = {
  enabled: boolean; enabled_layers: string[]; region: string; domains: string;
  search_limit: number; max_visual_items: number; max_text_items: number;
  max_candidates_per_item: number; max_visual_candidates: number;
  min_score: number; alt_score: number; max_run_cost_usd: number; credit_cost: number;
};
const procurementLayerLabels: Record<string, string> = { hero: 'Мебель, свет, декор', finish: 'Отделка: пол, стены, потолок', builtin: 'Техника и сантехника', textile: 'Текстиль: шторы, ковры, постель', completeness: 'Комплектующие: матрас, крепёж, карниз' };
type ImportPreview = {
  url: string; domain: string; allowed_domain: boolean;
  name: string; brand: string; description: string; price: number; currency: string;
  category: string | null; unit: string; qty: number; price_tier: string;
  room_types: string; style_tags: string; surface: string | null;
  source: string; url_source: string; image_path: string | null; image_url: string | null;
  sku?: string; availability?: string; rating?: number | null; reviews?: number | null;
  dimensions: { text?: string; width_cm?: number | null; depth_cm?: number | null; height_cm?: number | null; diameter_cm?: number | null; raw?: string };
  attrs: Record<string, unknown>;
  quality: { score: number; allowed_domain: boolean; used: boolean; duplicate_of?: { id: number; name: string; active: boolean } | null; image_ok: boolean; issues: string[] };
}
const productCategories = ['bed','wardrobe','sofa','armchair','coffee_table','dining_table','dining_chair','sideboard','desk','office_chair','storage','bench','rug','floor','paint','wallpaper','tile','skirting','countertop','cabinet','faucet','sink','toilet','shower','bathtub','light','outlets','appliance','textile'] as const
type ModelSettings = {
  render_model: string; vision_model: string; resolution: string; aspect_ratio: string;
  image_models: Array<{ id: string; input_refs: boolean }>;
}
type StyleDetail = { style: Style; prompt_description: string; references: StyleRef[]; products: Product[] }
type RoomType = {
  name: string; prompt: string; categories: string[]; slots: Array<{ key: string; categories: string[] }>;
  keep: string; change: string; guidance: string; forbid: string;
  electrical: Array<{ title: string; text: string }>; styling: string; active: boolean; sort: number;
}
type RoomTypeDraft = {
  name: string; prompt: string; categories: string; slots: string; keep: string; change: string;
  guidance: string; forbid: string; electrical: string; styling: string; active: boolean; sort: string;
}

const KEY_STORAGE = 'rv_admin_key'
const rub = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value / 100)) + ' ₽'
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'
const dateTime = (iso?: string | null) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const productImage = (p: Product) => p.image_path ? `/products/${p.image_path.split('/').pop()}` : (p.image_url || '')
const defaultRoomTypeNames = ['Гостиная (зал)', 'Спальня', 'Детская', 'Кухня', 'Санузел', 'Кладовка', 'Прихожая', 'Столовая', 'Кабинет', 'Балкон / лоджия', 'Гардеробная', 'Другое']
const emptyRoomTypeDraft = (): RoomTypeDraft => ({
  name: 'Новая комната',
  prompt: 'room',
  categories: 'floor, paint, light, outlets',
  slots: JSON.stringify([{ key: 'floor', categories: ['floor'] }, { key: 'wall', categories: ['paint'] }, { key: 'light', categories: ['light'] }, { key: 'outlets', categories: ['outlets'] }], null, 2),
  keep: 'the existing room purpose, architecture and camera angle.',
  change: 'finishes, lighting and styling that match the room purpose.',
  guidance: 'Keep the room purpose exactly as in the source photo.',
  forbid: 'Do not add fixtures from another room type. Do not change the room purpose.',
  electrical: JSON.stringify([{ title: 'Электрика', text: 'Розетки и выключатели по фактическому сценарию комнаты.' }], null, 2),
  styling: '',
  active: true,
  sort: '100',
})
const roomTypeToDraft = (room: RoomType): RoomTypeDraft => ({
  name: room.name,
  prompt: room.prompt,
  categories: room.categories.join(', '),
  slots: JSON.stringify(room.slots, null, 2),
  keep: room.keep,
  change: room.change,
  guidance: room.guidance,
  forbid: room.forbid,
  electrical: JSON.stringify(room.electrical, null, 2),
  styling: room.styling,
  active: room.active !== false,
  sort: String(room.sort ?? 0),
})
const parseRoomTypeArray = <T,>(value: string, label: string): T[] => {
  let parsed: unknown
  try { parsed = JSON.parse(value || '[]') }
  catch { throw new Error(`${label}: некорректный JSON`) }
  if (!Array.isArray(parsed)) throw new Error(`${label}: нужен JSON-массив`)
  return parsed as T[]
}
const draftToRoomType = (draft: RoomTypeDraft): RoomType => ({
  name: draft.name.trim(),
  prompt: draft.prompt.trim(),
  categories: draft.categories.split(',').map(item => item.trim()).filter(Boolean),
  slots: parseRoomTypeArray<RoomType['slots'][number]>(draft.slots, 'Слоты'),
  keep: draft.keep.trim(),
  change: draft.change.trim(),
  guidance: draft.guidance.trim(),
  forbid: draft.forbid.trim(),
  electrical: parseRoomTypeArray<RoomType['electrical'][number]>(draft.electrical, 'Электрика'),
  styling: draft.styling.trim(),
  active: draft.active,
  sort: Number(draft.sort) || 0,
})
const accents = ['sand', 'dust', 'graphite', 'forest', 'terra'] as const
const accentNames: Record<string, string> = { sand: 'Песочный', dust: 'Синева', graphite: 'Графит', forest: 'Оливковый', terra: 'Терракота' }
const modelFamily = (id: string) =>
  /^bytedance-seed\/seedream/.test(id) ? 'seedream'
    : /^black-forest-labs\/flux/.test(id) ? 'flux'
      : /^google\//.test(id) ? 'google' : 'other'
const fluxAspects = ['auto','21:9','2:1','16:9','3:2','7:5','4:3','5:4','1:1','4:5','3:4','5:7','2:3','9:16','1:2','9:21']
const modelCaps: Record<string, { resolutions: string[]; aspects: string[] }> = {
  seedream: { resolutions: ['1K', '2K'], aspects: ['auto','1:1','1:2','2:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','9:19.5','19.5:9','9:20','20:9','9:21','21:9'] },
  flux: { resolutions: [], aspects: ['auto','21:9','2:1','16:9','3:2','7:5','4:3','5:4','1:1','4:5','3:4','5:7','2:3','9:16','1:2','9:21'] },
  google: { resolutions: ['1K'], aspects: ['auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9'] },
  other: { resolutions: ['1K', '2K'], aspects: ['auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9'] },
}
const capsFor = (id: string) => {
  if (id.includes('flux-3-image')) return { resolutions: ['768', '1K', '1.5K', '2K', '4K'], aspects: fluxAspects }
  if (id.includes('flux.2-pro')) return { resolutions: [], aspects: fluxAspects }
  return modelCaps[modelFamily(id)] || modelCaps.other
}

const reasonNames: Record<string, string> = {
  signup_bonus: 'бонус регистрации', signup_bonus_2: 'бонус регистрации', purchase: 'пополнение',
  procurement: 'подбор товаров', procurement_refund: 'возврат за подбор товаров',
  render: 'генерация', iterate: 'правка', iterate_refund: 'возврат кредита', refund: 'возврат',
  admin_adjust: 'корректировка', admin_test: 'корректировка',
}

function AdminImage({ src, kind, alt = '' }: { src?: string | null; kind: 'renders' | 'files'; alt?: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    setUrl('')
    if (!src) return
    const file = src.split('/').pop()
    const key = localStorage.getItem(KEY_STORAGE) || ''
    if (!file || !key) return
    let objectUrl = ''
    fetch(`/api/admin/${kind}/${encodeURIComponent(file)}`, { headers: { 'X-Admin-Key': key } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } })
      .catch(() => {})
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src, kind])
  return url
    ? <img src={url} alt={alt} className="h-14 w-14 border border-foreground/20 object-cover" />
    : <span className="flex h-14 w-14 items-center justify-center border border-dashed border-foreground/25 text-[10px] text-muted-foreground">фото</span>
}

export default function Admin() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [authed, setAuthed] = useState(false)
  const [boot, setBoot] = useState(true)
  const [keyError, setKeyError] = useState('')
  const [tab, setTab] = useState<Tab>('users')

  const [users, setUsers] = useState<AdminUser[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null)
  const [creditDelta, setCreditDelta] = useState('1')
  const [creditReason, setCreditReason] = useState('бонус')
  const [creditNote, setCreditNote] = useState('')
  const [creditBusy, setCreditBusy] = useState(false)
  const [adminError, setAdminError] = useState('')

  const [packs, setPacks] = useState<Pack[]>([])
  const [editPackId, setEditPackId] = useState<string | null>(null)
  const [packForm, setPackForm] = useState({ id: '', title: '', credits: '2', price: '99', active: true, sort: '10' })

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [roomTypeNames, setRoomTypeNames] = useState<string[]>(defaultRoomTypeNames)
  const [roomTypeDefaults, setRoomTypeDefaults] = useState<RoomType[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState<string | null>(null)
  const [roomTypeForm, setRoomTypeForm] = useState<RoomTypeDraft>(emptyRoomTypeDraft)
  const [roomTypesBusy, setRoomTypesBusy] = useState(false)
  const [roomTypesNotice, setRoomTypesNotice] = useState('')

  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null)
  const [renderDraft, setRenderDraft] = useState('')
  const [visionDraft, setVisionDraft] = useState('')
  const [resolutionDraft, setResolutionDraft] = useState('1K')
  const [aspectDraft, setAspectDraft] = useState('auto')
  const [modelNotice, setModelNotice] = useState('')
  const [modelSaving, setModelSaving] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyEnv, setProxyEnv] = useState('')
  const [proxyStatus, setProxyStatus] = useState<{ ok: boolean; status: number; ms: number; at: string; error?: string } | null>(null)
  const [proxyNotice, setProxyNotice] = useState('')
  const [proxyBusy, setProxyBusy] = useState(false)
  const [catalog, setCatalog] = useState<Product[]>([])
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [importAllowAny, setImportAllowAny] = useState(false)
  const [bulkUrls, setBulkUrls] = useState('')
  const [bulkResults, setBulkResults] = useState<Array<{ url: string; preview?: ImportPreview; error?: string; added?: boolean }>>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [kitRoom, setKitRoom] = useState('Спальня')
  const [kitTier, setKitTier] = useState('comfort')
  const [kit, setKit] = useState<KitResult | null>(null)
  const [kitBusy, setKitBusy] = useState(false)
  const [kitNotice, setKitNotice] = useState('')
  const [promptConfig, setPromptConfig] = useState<Record<string, string> | null>(null)
  const [promptRulesBusy, setPromptRulesBusy] = useState(false)
  const [promptRulesNotice, setPromptRulesNotice] = useState('')
  const [cleanupConfig, setCleanupConfig] = useState<CleanupConfig | null>(null)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupNotice, setCleanupNotice] = useState('')
  const [procurementConfig, setProcurementConfig] = useState<ProcurementConfig | null>(null)
  const [procurementBusy, setProcurementBusy] = useState(false)
  const [procurementNotice, setProcurementNotice] = useState('')
  const [styleReferenceConfig, setStyleReferenceConfig] = useState<StyleReferenceConfig | null>(null)
  const [styleReferenceBusy, setStyleReferenceBusy] = useState(false)
  const [styleReferenceNotice, setStyleReferenceNotice] = useState('')
  const [promptRows, setPromptRows] = useState<PromptRow[]>([])
  const [promptQuery, setPromptQuery] = useState('')
  const [styles, setStyles] = useState<Style[]>([])
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null)
  const [styleDetail, setStyleDetail] = useState<StyleDetail | null>(null)
  const [styleForm, setStyleForm] = useState({ key: '', name: '', accent: 'sand', prompt_description: '', description: '', active: true, sort: '10' })
  const [editStyleId, setEditStyleId] = useState<number | null>(null)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [refTitle, setRefTitle] = useState('')
  const [styleRoomType, setStyleRoomType] = useState('Все')
  const [refRoomFilter, setRefRoomFilter] = useState('Все')
  const [styleBusy, setStyleBusy] = useState(false)
  const styleImageRef = useRef<HTMLInputElement>(null)
  const styleRefsRef = useRef<HTMLInputElement>(null)

  const api = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('X-Admin-Key', key)
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    const r = await fetch(path, { ...init, headers })
    if (r.status === 403) { setAuthed(false); throw new Error('Неверный ключ') }
    return r
  }
  const readJson = async (r: Response) => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || String(r.status))
    return data
  }

  useEffect(() => {
    if (!key) { setAuthed(false); setBoot(false); return }
    setBoot(true)
    fetch('/api/admin/users', { headers: { 'X-Admin-Key': key } })
      .then(r => { if (!r.ok) throw new Error('bad key'); setAuthed(true); setKeyError('') })
      .catch(() => { setAuthed(false); setKeyError('Неверный ключ') })
      .finally(() => setBoot(false))
  }, [key])

  const loadUsers = async (q = userQuery) => {
    try {
      const data = await readJson(await api('/api/admin/users?q=' + encodeURIComponent(q)))
      setUsers(data)
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const loadUser = async (id: number) => {
    setSelectedUserId(id)
    try { setUserDetail(await readJson(await api('/api/admin/users/' + id))) }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const loadPacks = async () => {
    try { setPacks(await readJson(await api('/api/admin/packs'))); }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const loadRoomTypes = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/room-types'))
      const config = Array.isArray(d.config) ? d.config as RoomType[] : []
      const defaults = Array.isArray(d.defaults) ? d.defaults as RoomType[] : []
      setRoomTypes(config)
      setRoomTypeDefaults(defaults)
      setRoomTypeNames(config.map(room => room.name))
      setRoomTypesNotice('')
      const current = selectedRoomType ? config.find(room => room.name === selectedRoomType) : null
      if (current) setRoomTypeForm(roomTypeToDraft(current))
      else if (config[0]) { setSelectedRoomType(config[0].name); setRoomTypeForm(roomTypeToDraft(config[0])) }
      else { setSelectedRoomType(null); setRoomTypeForm(emptyRoomTypeDraft()) }
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const selectRoomType = (room: RoomType) => {
    setSelectedRoomType(room.name)
    setRoomTypeForm(roomTypeToDraft(room))
    setRoomTypesNotice('')
  }
  const startNewRoomType = () => {
    const names = new Set(roomTypes.map(room => room.name.toLowerCase()))
    let name = 'Новая комната'
    let suffix = 2
    while (names.has(name.toLowerCase())) name = `Новая комната ${suffix++}`
    setSelectedRoomType(null)
    setRoomTypeForm({ ...emptyRoomTypeDraft(), name, sort: String((roomTypes.length + 1) * 10) })
    setRoomTypesNotice('Заполните поля и нажмите «Создать тип»')
  }
  const saveRoomType = async (event: FormEvent) => {
    event.preventDefault()
    setAdminError(''); setRoomTypesNotice('')
    let item: RoomType
    try { item = draftToRoomType(roomTypeForm) }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Проверьте JSON в слотах и электрике'); return }
    if (!item.name) { setAdminError('Введите название типа комнаты'); return }
    const next = [...roomTypes]
    const currentIndex = selectedRoomType ? next.findIndex(room => room.name === selectedRoomType) : -1
    if (next.some((room, index) => index !== currentIndex && room.name.toLowerCase() === item.name.toLowerCase())) {
      setAdminError(`Тип «${item.name}» уже существует`)
      return
    }
    if (currentIndex >= 0) next[currentIndex] = item
    else next.push(item)
    setRoomTypesBusy(true)
    try {
      const d = await readJson(await api('/api/admin/settings/room-types', { method: 'PUT', body: JSON.stringify({ config: next }) }))
      const config = Array.isArray(d.config) ? d.config as RoomType[] : next
      setRoomTypes(config)
      setRoomTypeNames(config.map(room => room.name))
      const saved = config.find(room => room.name === item.name) || item
      setSelectedRoomType(saved.name)
      setRoomTypeForm(roomTypeToDraft(saved))
      setRoomTypesNotice(currentIndex >= 0 ? 'Тип комнаты сохранён' : 'Тип комнаты создан')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось сохранить тип комнаты') }
    finally { setRoomTypesBusy(false) }
  }
  const deleteRoomType = async (name: string) => {
    if (name === 'Другое') { setAdminError('«Другое» — системный fallback для старых и неизвестных комнат, его нельзя удалить. Можно снять «активен».'); return }
    if (roomTypes.length <= 1) { setAdminError('Должен остаться хотя бы один тип комнаты'); return }
    if (!confirm(`Удалить тип «${name}»? Старые комнаты и референсы с этим room_type останутся в базе, но перестанут находить свои правила. Лучше выключить его галочкой «активен».`)) return
    const next = roomTypes.filter(room => room.name !== name)
    setRoomTypesBusy(true); setAdminError(''); setRoomTypesNotice('')
    try {
      const d = await readJson(await api('/api/admin/settings/room-types', { method: 'PUT', body: JSON.stringify({ config: next }) }))
      const config = Array.isArray(d.config) ? d.config as RoomType[] : next
      setRoomTypes(config)
      setRoomTypeNames(config.map(room => room.name))
      const first = config[0] || null
      setSelectedRoomType(first?.name || null)
      setRoomTypeForm(first ? roomTypeToDraft(first) : emptyRoomTypeDraft())
      setRoomTypesNotice(`Тип «${name}» удалён`)
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось удалить тип комнаты') }
    finally { setRoomTypesBusy(false) }
  }
  const resetRoomTypes = async () => {
    if (!confirm('Вернуть заводской список типов комнат? Все изменения справочника будут потеряны.')) return
    setRoomTypesBusy(true); setAdminError(''); setRoomTypesNotice('')
    try {
      const d = await readJson(await api('/api/admin/settings/room-types/reset', { method: 'POST' }))
      const config = Array.isArray(d.config) ? d.config as RoomType[] : []
      setRoomTypes(config)
      setRoomTypeDefaults(Array.isArray(d.defaults) ? d.defaults as RoomType[] : [])
      setRoomTypeNames(config.map(room => room.name))
      const first = config[0] || null
      setSelectedRoomType(first?.name || null)
      setRoomTypeForm(first ? roomTypeToDraft(first) : emptyRoomTypeDraft())
      setRoomTypesNotice('Возвращён заводской список типов комнат')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось сбросить типы комнат') }
    finally { setRoomTypesBusy(false) }
  }
  const loadStyles = async () => {
    try { setStyles(await readJson(await api('/api/admin/styles'))); }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const loadModels = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/models'))
      setModelSettings(d); setRenderDraft(d.render_model); setVisionDraft(d.vision_model)
      const caps = capsFor(d.render_model)
      setResolutionDraft(caps.resolutions.includes(d.resolution) ? d.resolution : (caps.resolutions[0] || ''))
      setAspectDraft(caps.aspects.includes(d.aspect_ratio) ? d.aspect_ratio : (caps.aspects.includes('auto') ? 'auto' : caps.aspects[0]))
      setModelNotice('')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const loadCatalog = async () => {
    try { setCatalog(await readJson(await api('/api/admin/products'))) }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const parseImport = async () => {
    if (!importUrl.trim()) return
    setImportBusy(true); setImportNotice(''); setImportPreview(null); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/products/import', { method: 'POST', body: JSON.stringify({ url: importUrl.trim() }) }))
      setImportPreview(d); setImportNotice(d.allowed_domain ? 'Товар разобран' : 'Домен не в allowlist — включите разрешение вручную')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка импорта') }
    finally { setImportBusy(false) }
  }
  const addImported = async (preview: ImportPreview | null = importPreview, clear = true) => {
    if (!preview) return false
    if (!preview.category || !preview.name || !preview.price) { setAdminError('Нужны название, цена и категория'); return false }
    if (!preview.allowed_domain && !importAllowAny) { setAdminError('Домен не в allowlist. Подтвердите импорт вручную'); return false }
    setCatalogBusy(true); setAdminError(''); setImportNotice('')
    try {
      await readJson(await api('/api/admin/products', { method: 'POST', body: JSON.stringify({
        name: preview.name, brand: preview.brand, attrs: preview.attrs,
        price: preview.price, unit: preview.unit, qty: preview.qty,
        source: preview.domain, keywords: [preview.name, preview.category, preview.brand].filter(Boolean).join(','),
        style_tags: preview.style_tags, url: preview.url_source || preview.url,
        image_path: preview.image_path, image_url: preview.image_url,
        price_tier: preview.price_tier, room_types: preview.room_types,
        surface: preview.surface, dimensions: preview.dimensions, active: false,
      }) }))
      setImportNotice('Товар добавлен черновиком. Включите его в таблице ниже.')
      if (clear) { setImportPreview(null); setImportUrl(''); setImportAllowAny(false) }
      await loadCatalog()
      return true
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка'); return false }
    finally { setCatalogBusy(false) }
  }
  const parseBulk = async () => {
    const urls = [...new Set(bulkUrls.split(/\s+/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s)))].slice(0, 20)
    if (!urls.length) return
    setBulkBusy(true); setAdminError(''); setImportNotice('')
    const out: Array<{ url: string; preview?: ImportPreview; error?: string; added?: boolean }> = urls.map(url => ({ url }))
    setBulkResults([...out])
    for (let i = 0; i < out.length; i++) {
      try {
        out[i].preview = await readJson(await api('/api/admin/products/import', { method: 'POST', body: JSON.stringify({ url: out[i].url }) }))
      } catch (e) {
        out[i].error = e instanceof Error ? e.message : 'Ошибка импорта'
      }
      setBulkResults([...out])
    }
    setBulkBusy(false)
  }
  const addBulkResult = async (index: number) => {
    const result = bulkResults[index]
    if (!result?.preview) return
    const ok = await addImported(result.preview, false)
    if (ok) setBulkResults(prev => prev.map((x, i) => i === index ? { ...x, added: true } : x))
  }
  const updateCatalog = async (p: Product, fields: Record<string, unknown>) => {
    setCatalogBusy(true); setAdminError('')
    try {
      await readJson(await api('/api/admin/products/' + p.id, { method: 'PUT', body: JSON.stringify(fields) }))
      await loadCatalog()
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setCatalogBusy(false) }
  }
  const deleteCatalog = async (p: Product) => {
    if (!confirm(`Удалить товар «${p.name}»?`)) return
    setCatalogBusy(true); setAdminError('')
    try { await api('/api/admin/products/' + p.id, { method: 'DELETE' }); await loadCatalog() }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setCatalogBusy(false) }
  }
  const loadCleanup = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/cleanup'))
      setCleanupConfig(d.config || null); setCleanupNotice('')
      if (!modelSettings) await loadModels()
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const saveCleanup = async () => {
    if (!cleanupConfig) return
    setCleanupBusy(true); setCleanupNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/cleanup', { method: 'PUT', body: JSON.stringify({ config: cleanupConfig }) }))
      setCleanupConfig(d.config || null)
      setCleanupNotice('Настройки очистки сохранены')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setCleanupBusy(false) }
  }
  const resetCleanup = async () => {
    setCleanupBusy(true); setCleanupNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/cleanup/reset', { method: 'POST' }))
      setCleanupConfig(d.config || null)
      setCleanupNotice('Возвращены заводские настройки очистки')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setCleanupBusy(false) }
  }
  const loadProcurement = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/procurement'))
      const c = d.config || null
      setProcurementConfig(c ? { ...c, domains: Array.isArray(c.domains) ? c.domains.join(', ') : String(c.domains || '') } : null)
      setProcurementNotice('')
    } catch { /* ignore */ }
  }

  const saveProcurement = async () => {
    if (!procurementConfig) return
    setProcurementBusy(true); setProcurementNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/procurement', { method: 'PUT', body: JSON.stringify({ config: procurementConfig }) }))
      const c = d.config || null
      setProcurementConfig(c ? { ...c, domains: Array.isArray(c.domains) ? c.domains.join(', ') : String(c.domains || '') } : null)
      setProcurementNotice('Настройки поиска сохранены')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось сохранить настройки поиска') }
    finally { setProcurementBusy(false) }
  }

  const resetProcurement = async () => {
    setProcurementBusy(true); setProcurementNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/procurement/reset', { method: 'POST' }))
      const c = d.config || null
      setProcurementConfig(c ? { ...c, domains: Array.isArray(c.domains) ? c.domains.join(', ') : String(c.domains || '') } : null)
      setProcurementNotice('Возвращены заводские настройки поиска')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось сбросить настройки поиска') }
    finally { setProcurementBusy(false) }
  }

  const loadStyleReference = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/style'))
      setStyleReferenceConfig(d.config || null); setStyleReferenceNotice('')
    } catch { /* ignore */ }
  }

  const saveStyleReference = async () => {
    if (!styleReferenceConfig) return
    setStyleReferenceBusy(true); setStyleReferenceNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/style', { method: 'PUT', body: JSON.stringify({ config: styleReferenceConfig }) }))
      setStyleReferenceConfig(d.config || null)
      setStyleReferenceNotice('Источник стиля сохранён')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось сохранить источник стиля') }
    finally { setStyleReferenceBusy(false) }
  }

  const resetStyleReference = async () => {
    setStyleReferenceBusy(true); setStyleReferenceNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/style/reset', { method: 'POST' }))
      setStyleReferenceConfig(d.config || null)
      setStyleReferenceNotice('Возвращён источник стиля по умолчанию')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Не удалось сбросить источник стиля') }
    finally { setStyleReferenceBusy(false) }
  }

  const loadPromptRules = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/prompt'))
      setPromptConfig(d.config || {});; setPromptRulesNotice('')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const savePromptRules = async () => {
    if (!promptConfig) return
    setPromptRulesBusy(true); setPromptRulesNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/prompt', { method: 'PUT', body: JSON.stringify({ config: promptConfig }) }))
      setPromptConfig(d.config || {});
      setPromptRulesNotice('Правила сохранены и применяются к новым генерациям')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setPromptRulesBusy(false) }
  }
  const resetPromptRules = async () => {
    setPromptRulesBusy(true); setPromptRulesNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/prompt/reset', { method: 'POST' }))
      setPromptConfig(d.config || {});
      setPromptRulesNotice('Возвращены заводские правила')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setPromptRulesBusy(false) }
  }
  const loadProxy = async () => {
    try {
      const d = await readJson(await api('/api/admin/settings/proxy'))
      setProxyUrl(d.url || ''); setProxyEnv(d.env_url || ''); setProxyStatus(d.status || null); setProxyNotice('')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const saveProxy = async () => {
    setProxyBusy(true); setProxyNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/proxy', { method: 'PUT', body: JSON.stringify({ url: proxyUrl }) }))
      setProxyUrl(d.url || ''); setProxyEnv(d.env_url || ''); setProxyStatus(d.status || null)
      setProxyNotice(d.has_url ? 'Прокси применён' : 'Прокси отключён')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setProxyBusy(false) }
  }
  const testProxy = async () => {
    setProxyBusy(true); setProxyNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/proxy/test', { method: 'POST', body: JSON.stringify({ url: proxyUrl }) }))
      setProxyStatus(d.status || null)
      setProxyNotice(d.status?.ok ? 'Прокси работает' : 'Прокси не ответил')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setProxyBusy(false) }
  }
  const saveModels = async () => {
    setModelSaving(true); setModelNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/settings/models', {
        method: 'PUT', body: JSON.stringify({ render_model: renderDraft, vision_model: visionDraft, resolution: resolutionDraft, aspect_ratio: aspectDraft }),
      }))
      setModelNotice(d.warning ? `Сохранено, но проверка предупредила: ${d.warning}` : 'Модели сохранены — новые генерации будут использовать их')
      await loadModels()
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setModelSaving(false) }
  }
  const loadPrompts = async () => {
    try { setPromptRows(await readJson(await api('/api/admin/renders?limit=150'))); }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const loadStyle = async (id: number) => {
    setSelectedStyleId(id); setKit(null); setKitNotice('')
    try {
      const d = await readJson(await api('/api/admin/styles/' + id))
      setStyleDetail(d)
      setStyleForm({
        key: d.style.key, name: d.style.name, accent: d.style.accent || 'sand',
        prompt_description: d.prompt_description || '', description: d.style.description || '',
        active: d.style.active, sort: String(d.style.sort || 0),
      })
      setEditStyleId(id)
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }

  useEffect(() => { if (!authed) return; if (tab === 'users') loadUsers(); if (tab === 'packs') loadPacks(); if (tab === 'styles') { loadStyles(); loadStyleReference() } if (tab === 'prompts') loadPrompts(); if (tab === 'models') loadModels(); if (tab === 'proxy') loadProxy(); if (tab === 'catalog') loadCatalog(); if (tab === 'rules') loadPromptRules(); if (tab === 'cleanup') loadCleanup(); if (tab === 'procurement') loadProcurement() }, [authed, tab])
  useEffect(() => { if (authed) void loadRoomTypes() }, [authed])
  useEffect(() => {
    if (!authed) return
    api('/api/admin/products').then(r => r.ok ? r.json() : []).then(setAllProducts).catch(() => {})
  }, [authed])

  const submitKey = (event: FormEvent) => {
    event.preventDefault()
    const value = keyInput.trim()
    if (!value) return setKeyError('Введите ключ')
    localStorage.setItem(KEY_STORAGE, value)
    setKey(value)
    setKeyError('')
  }
  const logout = () => {
    localStorage.removeItem(KEY_STORAGE)
    setKey(''); setKeyInput(''); setAuthed(false); setUserDetail(null); setStyleDetail(null)
  }
  const adjustCredits = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedUserId) return
    const delta = Number(creditDelta)
    if (!Number.isInteger(delta) || delta === 0) return setAdminError('Кредиты: целое число, не 0')
    setCreditBusy(true); setAdminError('')
    try {
      await readJson(await api('/api/admin/users/' + selectedUserId + '/credits', {
        method: 'POST', body: JSON.stringify({ delta, reason: creditReason || 'admin_adjust', note: creditNote || null }),
      }))
      setCreditNote('')
      await Promise.all([loadUsers(), loadUser(selectedUserId)])
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setCreditBusy(false) }
  }
  const startNewPack = () => {
    setEditPackId(null)
    setPackForm({ id: '', title: '', credits: '2', price: '99', active: true, sort: '10' })
  }
  const editPack = (p: Pack) => {
    setEditPackId(p.id)
    setPackForm({ id: p.id, title: p.title, credits: String(p.credits), price: String(p.price_kopecks / 100), active: p.active, sort: String(p.sort) })
  }
  const savePack = async (event: FormEvent) => {
    event.preventDefault()
    setAdminError('')
    try {
      const body = {
        id: packForm.id, title: packForm.title, credits: Number(packForm.credits),
        price_kopecks: Math.round(Number(packForm.price) * 100), active: packForm.active, sort: Number(packForm.sort) || 0,
      }
      const r = editPackId
        ? await api('/api/admin/packs/' + editPackId, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/admin/packs', { method: 'POST', body: JSON.stringify(body) })
      await readJson(r)
      await loadPacks()
      startNewPack()
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const deletePack = async (id: string) => {
    if (!confirm('Удалить пакет ' + id + '?')) return
    try { await api('/api/admin/packs/' + id, { method: 'DELETE' }); await loadPacks() }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const startNewStyle = () => {
    setEditStyleId(null); setSelectedStyleId(null); setStyleDetail(null)
    setStyleForm({ key: '', name: '', accent: 'sand', prompt_description: '', description: '', active: true, sort: '10' })
  }
  const saveStyle = async (event: FormEvent) => {
    event.preventDefault()
    setStyleBusy(true); setAdminError('')
    try {
      const fd = new FormData()
      fd.append('key', styleForm.key); fd.append('name', styleForm.name)
      fd.append('accent', styleForm.accent); fd.append('prompt_description', styleForm.prompt_description)
      fd.append('description', styleForm.description); fd.append('active', String(styleForm.active)); fd.append('sort', styleForm.sort)
      const file = styleImageRef.current?.files?.[0]
      if (file) fd.append('image', file)
      const r = editStyleId
        ? await api('/api/admin/styles/' + editStyleId, { method: 'PUT', body: fd })
        : await api('/api/admin/styles', { method: 'POST', body: fd })
      const data = await readJson(r)
      if (styleImageRef.current) styleImageRef.current.value = ''
      await loadStyles()
      await loadStyle(data.id)
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setStyleBusy(false) }
  }
  const uploadStyleRefs = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!selectedStyleId || !files?.length) return
    setStyleBusy(true); setAdminError('')
    try {
      for (let i = 0; i < files.length; i += 8) {
        const fd = new FormData()
        fd.append('title', refTitle)
        if (styleRoomType !== 'Все') fd.append('room_type', styleRoomType)
        for (const file of Array.from(files).slice(i, i + 8)) fd.append('images', file)
        await readJson(await api('/api/admin/styles/' + selectedStyleId + '/references', { method: 'POST', body: fd }))
      }
      if (styleRefsRef.current) styleRefsRef.current.value = ''
      setRefTitle('')
      await loadStyle(selectedStyleId)
      await loadStyles()
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setStyleBusy(false) }
  }
  const deleteStyleRef = async (refId: number) => {
    if (!selectedStyleId) return
    try { await api('/api/admin/styles/' + selectedStyleId + '/references/' + refId, { method: 'DELETE' }); await loadStyle(selectedStyleId); await loadStyles() }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const approveStyleRef = async (refId: number, approved: boolean) => {
    if (!selectedStyleId) return
    try {
      await readJson(await api('/api/admin/styles/' + selectedStyleId + '/references/' + refId, { method: 'PATCH', body: JSON.stringify({ approved }) }))
      await loadStyle(selectedStyleId); await loadStyles()
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const addStyleProduct = async (productId: number) => {
    if (!selectedStyleId) return
    try { await readJson(await api('/api/admin/styles/' + selectedStyleId + '/products', { method: 'POST', body: JSON.stringify({ product_id: productId, room_type: styleRoomType === 'Все' ? null : styleRoomType }) })); await loadStyle(selectedStyleId); await loadStyles() }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const buildKit = async () => {
    if (!selectedStyleId) return
    setKitBusy(true); setKitNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/styles/' + selectedStyleId + '/kit', { method: 'POST', body: JSON.stringify({ room_type: kitRoom, price_tier: kitTier }) }))
      setKit(d)
      setKitNotice(d.missing.length ? `Не хватает слотов: ${d.missing.length}. Добавьте реальные товары с URL.` : 'Комплект собран полностью')
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setKitBusy(false) }
  }
  const addKitToStyle = async () => {
    if (!selectedStyleId || !kit?.product_ids.length) return
    setKitBusy(true); setKitNotice(''); setAdminError('')
    try {
      const d = await readJson(await api('/api/admin/styles/' + selectedStyleId + '/products/bulk', { method: 'POST', body: JSON.stringify({ product_ids: kit.product_ids, room_type: kit.room_type }) }))
      await loadStyle(selectedStyleId); await loadStyles()
      setKitNotice(`Добавлено в стиль: ${d.added}`)
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
    finally { setKitBusy(false) }
  }
  const deleteStyleProduct = async (productId: number) => {
    if (!selectedStyleId) return
    try { await api('/api/admin/styles/' + selectedStyleId + '/products/' + productId, { method: 'DELETE' }); await loadStyle(selectedStyleId); await loadStyles() }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Ошибка') }
  }
  const filteredPrompts = useMemo(() => {
    const q = promptQuery.trim().toLowerCase()
    if (!q) return promptRows
    return promptRows.filter(p => [p.email, p.style, p.room_type, p.prompt, p.request_text].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [promptRows, promptQuery])

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    return allProducts.filter(p => !styleDetail?.products.some(sp => sp.id === p.id) && (!q || p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)))
  }, [allProducts, productQuery, styleDetail])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3"><a href="/" className="text-lg font-medium tracking-tight">ремонт<span className="text-primary-text">вижн</span></a><span className="eyebrow">/ админка</span></div>
          <nav className="flex items-center gap-3 text-sm">
            <a href="/" className="hidden min-h-11 items-center px-2 hover:opacity-50 sm:flex">На сайт</a>
            <a href="/cabinet" className="hidden min-h-11 items-center px-2 hover:opacity-50 sm:flex">Кабинет</a>
            {authed && <button type="button" onClick={logout} className="inline-flex min-h-11 items-center gap-2 px-2 hover:opacity-50"><LogOut className="size-4" />Выйти</button>}
          </nav>
        </div>
      </header>

      {boot ? (
        <div className="flex min-h-[60svh] items-center justify-center"><LoaderCircle className="size-8 animate-spin text-primary-text" /></div>
      ) : !authed ? (
        <main className="mx-auto flex min-h-[70svh] max-w-md flex-col justify-center px-4 py-12">
          <p className="eyebrow">Доступ</p>
          <h1 className="display-title mt-4 text-4xl">Админка</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Введите ключ администратора. Он хранится только в этом браузере.</p>
          <form onSubmit={submitKey} className="mt-6 space-y-3">
            <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="X-Admin-Key" autoFocus className="h-12 w-full border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
            {keyError && <p className="text-sm text-destructive" role="alert">{keyError}</p>}
            <button type="submit" className="action-primary w-full">Войти <ArrowUpRight className="size-4" /></button>
          </form>
        </main>
      ) : (
        <main className="page-shell py-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow">Управление</p><h1 className="display-title mt-2 text-4xl">Админка</h1></div>
            <nav className="flex border-b" aria-label="Разделы админки">
              {([['users', 'Пользователи'], ['packs', 'Пакеты кредитов'], ['rooms', 'Комнаты'], ['styles', 'Стили'], ['rules', 'Промт'], ['prompts', 'Логи'], ['models', 'Модели'], ['cleanup', 'Очистка'], ['procurement', 'Поиск'], ['proxy', 'Прокси'], ['catalog', 'Каталог']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-12 border-b-2 px-4 text-sm transition-colors ${tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
              ))}
            </nav>
          </div>
          {adminError && <p className="mt-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{adminError}</p>}

          {tab === 'users' && (
            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_26rem]">
              <section>
                <form onSubmit={e => { e.preventDefault(); loadUsers() }} className="flex gap-2">
                  <input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="Поиск по e-mail" className="h-11 min-w-0 flex-1 border bg-background px-3 text-sm outline-none focus:border-primary" />
                  <button type="submit" className="action-secondary px-4"><Search className="size-4" />Найти</button>
                </form>
                <div className="mt-4 overflow-x-auto border">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b"><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">E-mail</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Баланс</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Комнат</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Генераций</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Последняя</th></tr></thead>
                    <tbody>{users.map(u => <tr key={u.id} onClick={() => loadUser(u.id)} className={`cursor-pointer border-b last:border-b-0 hover:bg-muted ${selectedUserId === u.id ? 'bg-muted' : ''}`}><td className="p-3"><b>{u.email}</b><div className="text-xs text-muted-foreground">{dateTime(u.created_at)}</div></td><td className="p-3">{u.balance} кр.</td><td className="p-3">{u.rooms_count}</td><td className="p-3">{u.renders_count}</td><td className="p-3 text-xs text-muted-foreground">{dateTime(u.last_generation_at)}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
              <aside className="border-t pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                {userDetail ? (
                  <>
                    <div className="flex items-start justify-between gap-3 border-b pb-4"><div><p className="eyebrow">Пользователь</p><h2 className="mt-2 text-xl font-light">{userDetail.user.email}</h2><p className="mt-1 text-xs text-muted-foreground">с {dateTime(userDetail.user.created_at)}</p></div><strong className="text-2xl font-light text-primary-text">{userDetail.user.balance} кр.</strong></div>
                    <form onSubmit={adjustCredits} className="mt-4 border p-4">
                      <p className="eyebrow">Изменить кредиты</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <input value={creditDelta} onChange={e => setCreditDelta(e.target.value)} inputMode="numeric" placeholder="+1 / -1" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" />
                        <input value={creditReason} onChange={e => setCreditReason(e.target.value)} placeholder="Причина" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" />
                      </div>
                      <input value={creditNote} onChange={e => setCreditNote(e.target.value)} placeholder="Заметка" className="mt-2 h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" />
                      <button type="submit" disabled={creditBusy} className="action-primary mt-3 w-full">{creditBusy ? 'Сохраняем…' : 'Применить'}</button>
                    </form>
                    <h3 className="eyebrow mt-6">История кредитов</h3>
                    <div className="mt-2 max-h-64 overflow-y-auto border">
                      <table className="w-full text-left text-xs"><tbody>{userDetail.credits.map(c => <tr key={c.id} className="border-b last:border-b-0"><td className={`p-2 font-mono ${c.delta > 0 ? 'text-primary-text' : ''}`}>{c.delta > 0 ? '+' : ''}{c.delta}</td><td className="p-2">{reasonNames[c.reason] || c.reason}<div className="text-muted-foreground">{c.note}</div></td><td className="p-2 text-right text-muted-foreground">{dateTime(c.created_at)}</td></tr>)}</tbody></table>
                    </div>
                    <h3 className="eyebrow mt-6">Генерации</h3>
                    <div className="mt-2 divide-y border-y">
                      {userDetail.generations.map(g => <div key={g.id} className="flex gap-3 py-3"><AdminImage src={g.image_url || g.photo_url} kind={g.image_url ? 'renders' : 'files'} alt="" /><div className="min-w-0 flex-1 text-xs"><p className="truncate font-medium">{g.request_text || `Дизайн · ${g.style}`}</p><p className="mt-1 text-muted-foreground">{dateTime(g.created_at)} · {g.status} · {g.credits_spent} кр.{g.room_type ? ` · ${g.room_type}` : ''}</p>{g.error && <p className="mt-1 line-clamp-2 text-destructive">{g.error}</p>}{g.prompt && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-muted-foreground">Промт</summary><pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap border bg-muted p-2 text-[10px] leading-4">{g.prompt}</pre></details>}</div></div>)}
                      {!userDetail.generations.length && <p className="py-4 text-sm text-muted-foreground">Генераций пока нет</p>}
                    </div>
                  </>
                ) : <p className="text-sm text-muted-foreground">Выберите пользователя, чтобы увидеть кредиты и историю генераций.</p>}
              </aside>
            </div>
          )}

          {tab === 'packs' && (
            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_24rem]">
              <section className="overflow-x-auto border">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b"><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">ID</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Название</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Кредиты</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Цена</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Активен</th><th /></tr></thead>
                  <tbody>{packs.map(p => <tr key={p.id} className="border-b last:border-b-0"><td className="p-3 font-mono text-xs">{p.id}</td><td className="p-3">{p.title}</td><td className="p-3">{p.credits}</td><td className="p-3">{rub(p.price_kopecks)}</td><td className="p-3">{p.active ? <Check className="size-4 text-primary-text" /> : '—'}</td><td className="p-3 text-right"><button type="button" onClick={() => editPack(p)} className="mr-2 text-xs underline">изм.</button><button type="button" onClick={() => deletePack(p.id)} className="text-xs text-destructive underline">удал.</button></td></tr>)}</tbody>
                </table>
              </section>
              <form onSubmit={savePack} className="border p-4">
                <div className="flex items-center justify-between gap-2"><p className="eyebrow">{editPackId ? 'Редактировать пакет' : 'Новый пакет'}</p><button type="button" onClick={startNewPack} className="text-xs underline"><Plus className="mr-1 inline size-3" />сброс</button></div>
                <div className="mt-4 space-y-2">
                  <input value={packForm.id} disabled={Boolean(editPackId)} onChange={e => setPackForm({ ...packForm, id: e.target.value })} placeholder="id: pack2" className="h-10 w-full border bg-background px-3 font-mono text-sm outline-none focus:border-primary disabled:opacity-60" />
                  <input value={packForm.title} onChange={e => setPackForm({ ...packForm, title: e.target.value })} placeholder="Название" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" />
                  <div className="grid grid-cols-2 gap-2"><input value={packForm.credits} onChange={e => setPackForm({ ...packForm, credits: e.target.value })} inputMode="numeric" placeholder="Кредиты" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" /><input value={packForm.price} onChange={e => setPackForm({ ...packForm, price: e.target.value })} inputMode="decimal" placeholder="Цена, ₽" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                  <div className="grid grid-cols-2 gap-2"><input value={packForm.sort} onChange={e => setPackForm({ ...packForm, sort: e.target.value })} inputMode="numeric" placeholder="Сортировка" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" /><label className="flex min-h-10 items-center gap-2 border px-3 text-sm"><input type="checkbox" checked={packForm.active} onChange={e => setPackForm({ ...packForm, active: e.target.checked })} className="size-4 accent-primary" />активен</label></div>
                </div>
                <button type="submit" className="action-primary mt-4 w-full">{editPackId ? 'Сохранить' : 'Создать пакет'}</button>
              </form>
            </div>
          )}

          {tab === 'rooms' && (
            <div className="mt-8 grid gap-6 xl:grid-cols-[22rem_1fr]">
              <section>
                <div className="flex items-center justify-between gap-2"><p className="eyebrow">Справочник комнат</p><button type="button" onClick={startNewRoomType} className="text-xs underline"><Plus className="mr-1 inline size-3" />новый</button></div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Тип комнаты задаёт допустимые категории товаров, слоты сметы, правила сохранения/замены, электрику и стилизацию для промта. Выключенные типы не показываются пользователям, но старые комнаты продолжают работать.</p>
                <div className="mt-3 space-y-2">
                  {roomTypes.map(room => (
                    <button key={room.name} type="button" onClick={() => selectRoomType(room)} className={`flex w-full items-center gap-3 border p-2 text-left transition-colors hover:bg-muted ${selectedRoomType === room.name ? 'bg-muted' : ''}`}>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{room.name}</span><span className="mt-1 block text-xs text-muted-foreground">{room.categories.length} кат. · {room.slots.length} слотов · sort {room.sort}</span></span>
                      {room.active === false && <span className="text-[10px] uppercase text-muted-foreground">off</span>}
                    </button>
                  ))}
                  {!roomTypes.length && <p className="border p-3 text-sm text-muted-foreground">Загружаем типы комнат…</p>}
                </div>
              </section>
              <section className="min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="eyebrow">{selectedRoomType ? 'Редактирование типа' : 'Новый тип комнаты'}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Изменения применяются к новым генерациям. Переименование не обновляет старые комнаты, style references и товары, поэтому для вывода из использования лучше снять «активен».</p></div>
                  <button type="button" disabled={roomTypesBusy} onClick={() => void resetRoomTypes()} className="action-secondary">Сбросить всё</button>
                </div>
                {roomTypesNotice && <p className="mt-4 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{roomTypesNotice}</p>}
                <form onSubmit={saveRoomType} className="mt-4 border p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block"><span className="eyebrow mb-2 block">Название</span><input value={roomTypeForm.name} onChange={e => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })} placeholder="Например: Гостиная (зал)" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-2 block">Prompt для модели (английский)</span><input value={roomTypeForm.prompt} onChange={e => setRoomTypeForm({ ...roomTypeForm, prompt: e.target.value })} placeholder="living room" className="h-10 w-full border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-2 block">Сортировка</span><input value={roomTypeForm.sort} onChange={e => setRoomTypeForm({ ...roomTypeForm, sort: e.target.value })} inputMode="numeric" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                    <label className="flex min-h-10 items-center gap-2 border px-3 text-sm"><input type="checkbox" checked={roomTypeForm.active} onChange={e => setRoomTypeForm({ ...roomTypeForm, active: e.target.checked })} className="size-4 accent-primary" />активен для пользователей</label>
                    <label className="block sm:col-span-2"><span className="eyebrow mb-2 block">Категории товаров</span><input value={roomTypeForm.categories} onChange={e => setRoomTypeForm({ ...roomTypeForm, categories: e.target.value })} placeholder="floor, paint, light, outlets" className="h-10 w-full border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /><span className="mt-2 block text-[11px] leading-5 text-muted-foreground">Через запятую. Доступны: {productCategories.join(', ')}.</span></label>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className="block"><span className="eyebrow mb-2 block">Keep — что сохранить</span><textarea value={roomTypeForm.keep} onChange={e => setRoomTypeForm({ ...roomTypeForm, keep: e.target.value })} rows={3} className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-2 block">Change — что можно менять</span><textarea value={roomTypeForm.change} onChange={e => setRoomTypeForm({ ...roomTypeForm, change: e.target.value })} rows={3} className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-2 block">Guidance — что уместно</span><textarea value={roomTypeForm.guidance} onChange={e => setRoomTypeForm({ ...roomTypeForm, guidance: e.target.value })} rows={2} className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></label>
                    <label className="block"><span className="eyebrow mb-2 block">Forbid — что запрещено</span><textarea value={roomTypeForm.forbid} onChange={e => setRoomTypeForm({ ...roomTypeForm, forbid: e.target.value })} rows={2} className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></label>
                    <label className="block lg:col-span-2"><span className="eyebrow mb-2 block">Styling — Pinterest-стайлинг</span><textarea value={roomTypeForm.styling} onChange={e => setRoomTypeForm({ ...roomTypeForm, styling: e.target.value })} rows={4} className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></label>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className="block"><span className="eyebrow mb-2 block">Слоты сметы (JSON)</span><textarea value={roomTypeForm.slots} onChange={e => setRoomTypeForm({ ...roomTypeForm, slots: e.target.value })} rows={9} className="w-full border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-primary" /><span className="mt-2 block text-[11px] leading-5 text-muted-foreground">Массив объектов <code>{'{ key, categories }'}</code>. Категории слота должны входить в категории комнаты.</span></label>
                    <label className="block"><span className="eyebrow mb-2 block">Электрика (JSON)</span><textarea value={roomTypeForm.electrical} onChange={e => setRoomTypeForm({ ...roomTypeForm, electrical: e.target.value })} rows={9} className="w-full border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-primary" /><span className="mt-2 block text-[11px] leading-5 text-muted-foreground">Массив объектов <code>{'{ title, text }'}</code> для рекомендаций по розеткам и свету.</span></label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <button type="submit" disabled={roomTypesBusy} className="action-primary">{roomTypesBusy ? 'Сохраняем…' : selectedRoomType ? 'Сохранить тип' : 'Создать тип'}</button>
                    {selectedRoomType && <button type="button" disabled={roomTypesBusy} onClick={() => void deleteRoomType(selectedRoomType)} className="text-xs text-destructive underline">удалить тип</button>}
                  </div>
                </form>
                {roomTypeDefaults.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Заводской справочник: {roomTypeDefaults.length} типов. «Сбросить всё» вернёт их и удалит пользовательские изменения.</p>}
              </section>
            </div>
          )}

          {tab === 'styles' && (
            <div className="mt-8 grid gap-6 xl:grid-cols-[22rem_1fr]">
              <section>
                <div className="flex items-center justify-between gap-2"><p className="eyebrow">Стили</p><button type="button" onClick={startNewStyle} className="text-xs underline"><Plus className="mr-1 inline size-3" />новый</button></div>
                <div className="mt-3 space-y-2">
                  {styles.map(s => <button key={s.id} type="button" onClick={() => loadStyle(s.id)} className={`flex w-full items-center gap-3 border p-2 text-left transition-colors hover:bg-muted ${selectedStyleId === s.id ? 'bg-muted' : ''}`}><img src={s.image_url} alt="" className="h-14 w-16 shrink-0 object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{s.name}</span><span className="mt-1 block text-xs text-muted-foreground">{s.key} · {s.references_count || 0} реф. · {s.products_count || 0} тов.</span></span>{!s.active && <span className="text-[10px] uppercase text-muted-foreground">off</span>}</button>)}
                </div>
              </section>
              <section className="min-w-0">
                <div className="mb-4 border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="eyebrow">Источник стиля для генерации</p><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Что отправлять модели вместе с фото комнаты: текстовый бриф, фото-референс или свотчи палитры.</p></div>
                    <div className="flex gap-2"><button type="button" disabled={styleReferenceBusy} onClick={() => void resetStyleReference()} className="action-secondary">Сбросить</button><button type="button" disabled={styleReferenceBusy} onClick={() => void saveStyleReference()} className="action-primary">{styleReferenceBusy ? 'Сохраняем…' : 'Сохранить'}</button></div>
                  </div>
                  {styleReferenceNotice && <p className="mt-3 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{styleReferenceNotice}</p>}
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {([['text', 'Текст', 'Текстовый бриф стиля'], ['reference', 'Референс', 'Фото-референс стиля'], ['swatches', 'Свотчи', 'Палитра и материалы']] as const).map(([mode, label, help]) => (
                      <button key={mode} type="button" onClick={() => setStyleReferenceConfig({ mode })} className={`border p-3 text-left ${styleReferenceConfig?.mode === mode ? 'border-foreground bg-muted' : 'hover:bg-muted'}`}><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{help}</span></button>
                    ))}
                  </div>
                </div>
                <form onSubmit={saveStyle} className="border p-4">
                  <div className="flex items-center justify-between gap-2"><p className="eyebrow">{editStyleId ? 'Редактировать стиль' : 'Новый стиль'}</p>{editStyleId && <span className="font-mono text-xs text-muted-foreground">#{editStyleId}</span>}</div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <input value={styleForm.key} onChange={e => setStyleForm({ ...styleForm, key: e.target.value })} placeholder="key: modern" className="h-10 border bg-background px-3 font-mono text-sm outline-none focus:border-primary" />
                    <input value={styleForm.name} onChange={e => setStyleForm({ ...styleForm, name: e.target.value })} placeholder="Название" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" />
                    <select value={styleForm.accent} onChange={e => setStyleForm({ ...styleForm, accent: e.target.value })} className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary">{accents.map(a => <option key={a} value={a}>{accentNames[a]}</option>)}</select>
                    <input value={styleForm.sort} onChange={e => setStyleForm({ ...styleForm, sort: e.target.value })} inputMode="numeric" placeholder="Сортировка" className="h-10 border bg-background px-3 text-sm outline-none focus:border-primary" />
                    <label className="flex min-h-10 items-center gap-2 border px-3 text-sm sm:col-span-2"><input type="checkbox" checked={styleForm.active} onChange={e => setStyleForm({ ...styleForm, active: e.target.checked })} className="size-4 accent-primary" />активен</label>
                    <textarea value={styleForm.description} onChange={e => setStyleForm({ ...styleForm, description: e.target.value })} placeholder="Короткое описание для админки" rows={2} className="border bg-background px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2" />
                    <textarea value={styleForm.prompt_description} onChange={e => setStyleForm({ ...styleForm, prompt_description: e.target.value })} placeholder="Prompt description (английский, для модели)" rows={2} className="border bg-background px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2" />
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 border px-3 text-sm sm:col-span-2"><Upload className="size-4 text-primary-text" />Обложка стиля<input ref={styleImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" /></label>
                  </div>
                  <button type="submit" disabled={styleBusy} className="action-primary mt-4 w-full">{styleBusy ? 'Сохраняем…' : editStyleId ? 'Сохранить стиль' : 'Создать стиль'}</button>
                </form>

                {styleDetail && (
                  <div className="mt-6 space-y-6">
                    <section>
                      <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">Референсы общего дизайна</p><span className="text-xs text-muted-foreground">{styleDetail.references.length} шт.</span></div>
                      <div className="mt-3 flex flex-wrap items-center gap-2"><label htmlFor="style-room-type" className="text-xs text-muted-foreground">Добавлять для комнаты:</label><select id="style-room-type" value={styleRoomType} onChange={e => setStyleRoomType(e.target.value)} className="h-10 border bg-background px-2 text-sm outline-none focus:border-primary"><option value="Все">Все комнаты</option>{roomTypeNames.map(t => <option key={t} value={t}>{t}</option>)}</select><label htmlFor="ref-room-filter" className="ml-2 text-xs text-muted-foreground">Показать:</label><select id="ref-room-filter" value={refRoomFilter} onChange={e => setRefRoomFilter(e.target.value)} className="h-10 border bg-background px-2 text-sm outline-none focus:border-primary"><option value="Все">Все комнаты</option>{roomTypeNames.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input value={refTitle} onChange={e => setRefTitle(e.target.value)} placeholder="Подпись (необязательно)" className="h-10 min-w-40 flex-1 border bg-background px-3 text-sm outline-none focus:border-primary" />
                        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border px-3 text-sm hover:bg-muted"><Upload className="size-4 text-primary-text" />Добавить фото<input ref={styleRefsRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={uploadStyleRefs} /></label>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Одобренные референсы уходят в генерацию. Hero — настроение и стиль, Board — точные материалы. Альтернативы можно включить вручную.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {styleDetail.references.filter(ref => refRoomFilter === 'Все' || ref.room_type === refRoomFilter).map(ref => (
                          <div key={ref.id} className={`group relative border ${ref.approved === false ? 'opacity-60' : ''}`} title={ref.score?.issues?.join(' · ') || undefined}>
                            <img src={ref.image_url} alt={ref.title} className="aspect-[4/3] w-full object-cover" />
                            <div className="absolute left-1 top-1 flex flex-wrap gap-1">
                              {ref.room_type && <span className="bg-background/90 px-1.5 py-0.5 text-[10px]">{ref.room_type}</span>}
                              <span className="bg-background/90 px-1.5 py-0.5 text-[10px] uppercase">{ref.kind === 'hero' ? 'hero' : ref.kind === 'material_board' ? 'board' : 'фото'}</span>
                              {ref.score?.total != null && <span className="bg-foreground/90 px-1.5 py-0.5 text-[10px] text-background">{ref.score.total}</span>}
                            </div>
                            <div className="absolute right-1 top-1 flex gap-1">
                              <button type="button" onClick={() => approveStyleRef(ref.id, ref.approved === false)} className={`flex size-8 items-center justify-center bg-background/90 ${ref.approved === false ? 'text-primary-text' : 'text-muted-foreground'} hover:bg-background`} aria-label={ref.approved === false ? 'Одобрить' : 'Скрыть'}>{ref.approved === false ? <Check className="size-4" /> : <X className="size-4" />}</button>
                              <button type="button" onClick={() => deleteStyleRef(ref.id)} className="flex size-8 items-center justify-center bg-background/90 text-destructive hover:bg-background" aria-label="Удалить референс"><X className="size-4" /></button>
                            </div>
                            {ref.approved === false && <span className="absolute bottom-1 left-1 bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">не одобрен</span>}
                          </div>
                        ))}
                        {!styleDetail.references.length && <p className="col-span-full py-4 text-sm text-muted-foreground">Пока нет референсов. Добавьте 1–2 изображения общего настроения стиля.</p>}
                      </div>
                    </section>

                    <section>
                      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Генератор комплекта</p><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Собирает 6–8 товаров по слотам комнаты. В комплект попадают только товары с реальным URL — по ним можно заказать.</p></div></div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <select value={kitRoom} onChange={e => { setKitRoom(e.target.value); setKit(null) }} className="h-10 border bg-background px-2 text-sm outline-none focus:border-primary">{roomTypeNames.map(t => <option key={t} value={t}>{t}</option>)}</select>
                        <select value={kitTier} onChange={e => { setKitTier(e.target.value); setKit(null) }} className="h-10 border bg-background px-2 text-sm outline-none focus:border-primary">{['start','comfort','premium','atelier'].map(t => <option key={t} value={t}>{t}</option>)}</select>
                        <button type="button" disabled={kitBusy} onClick={() => void buildKit()} className="action-primary">{kitBusy ? 'Собираем…' : 'Собрать комплект'}</button>
                      </div>
                      {kitNotice && <p className="mt-3 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{kitNotice}</p>}
                      {kit && (
                        <>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {kit.slots.map(slot => <div key={slot.key} className={`border p-2 ${slot.product ? '' : 'border-dashed bg-muted/30'}`}><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{slot.label}</p>{slot.product ? <><img src={slot.product.image_url || ''} alt="" className="mt-1 h-16 w-full border object-cover" /><p className="mt-1 line-clamp-2 text-xs font-medium">{slot.product.name}</p><p className="text-[11px] text-muted-foreground">{money(slot.product.price)} · {slot.product.price_tier}{slot.product.dimensions?.text ? ` · ${slot.product.dimensions.text}` : ''}</p></> : <p className="mt-2 text-xs text-muted-foreground">нет товара с URL</p>}</div>)}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={kitBusy || !kit.product_ids.length} onClick={() => void addKitToStyle()} className="action-secondary">Добавить всё в стиль ({kit.product_ids.length})</button></div>
                        </>
                      )}
                    </section>

                    <section>
                      <p className="eyebrow">Товары стиля (избранное)</p>
                      <div className="mt-3 divide-y border-y">
                        {styleDetail.products.map(p => <div key={p.id} className="flex items-center gap-3 py-2 text-sm"><img src={productImage(p)} alt="" className="h-10 w-10 border object-cover" /><span className="min-w-0 flex-1 truncate">{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.category} · {p.price_tier || 'comfort'}{p.room_type ? ` · ${p.room_type}` : ' · все комнаты'}</span></span><button type="button" onClick={() => deleteStyleProduct(p.id)} className="text-xs text-destructive underline">убрать</button></div>)}
                        {!styleDetail.products.length && <p className="py-3 text-sm text-muted-foreground">Товары не выбраны — генерация возьмёт каталог по классу материалов.</p>}
                      </div>
                      <div className="mt-4">
                        <input value={productQuery} onChange={e => setProductQuery(e.target.value)} placeholder="Найти товар по названию или бренду" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" />
                        <div className="mt-2 max-h-64 overflow-y-auto border">
                          {filteredProducts.slice(0, 20).map(p => <button key={p.id} type="button" onClick={() => addStyleProduct(p.id)} className="flex w-full items-center gap-3 border-b p-2 text-left text-sm last:border-b-0 hover:bg-muted"><img src={productImage(p)} alt="" className="h-9 w-9 border object-cover" /><span className="min-w-0 flex-1 truncate">{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.category} · {p.price_tier || 'comfort'} · {money(p.price)}</span></span><Plus className="size-4 shrink-0 text-primary-text" /></button>)}
                          {!filteredProducts.length && <p className="p-3 text-sm text-muted-foreground">Ничего не найдено</p>}
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'rules' && (
            <div className="mt-8 max-w-5xl">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="eyebrow">Правила базового промта</p><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Редактируются без деплоя и применяются к новым генерациям. Стили, комнаты, товары и модели остаются отдельно. Сброс возвращает текущие заводские правила.</p></div>
                <div className="flex gap-2"><button type="button" disabled={promptRulesBusy} onClick={() => void resetPromptRules()} className="action-secondary">Сбросить</button><button type="button" disabled={promptRulesBusy} onClick={() => void savePromptRules()} className="action-primary">{promptRulesBusy ? 'Сохраняем…' : 'Сохранить'}</button></div>
              </div>
              {promptRulesNotice && <p className="mt-4 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{promptRulesNotice}</p>}
              {promptConfig ? (
                <div className="mt-6 space-y-5">
                  {([
                    ['lighting', 'Свет', 'Главный вау-инструмент: слои, cove, подсветка, запреты.'],
                    ['dimensions', 'Размеры комнаты', 'Плейсхолдеры: {room}, {width}, {length}, {height}, {orientation}.'],
                    ['scalePlan', 'План масштаба', 'Обёртка вокруг вычисленного плана мебели: {room}, {plan}.'],
                    ['bed', 'Кровать', 'Плейсхолдеры: {room}, {bed_length}.'],
                    ['radiators', 'Радиаторы', 'Вентилируемые экраны; не выдумывать радиаторы.'],
                    ['cleanup', 'Уборка и техника', 'Что убрать или спрятать: радиатор, ТВ, провода, старые вещи.'],
                    ['window', 'Окна и текстиль', 'Шторы, жалюзи, карнизы, тюль.'],
                    ['pinterest', 'Pinterest-стайлинг', 'Арт, полки, мелочи, техника, плюш, 3–5 сцен.'],
                    ['photo', 'Фотография', 'Камера, свет, плёнка, color grading, запрет CGI.'],
                  ] as const).map(([key, label, help]) => (
                    <label key={key} className="block">
                      <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="eyebrow">{label}</span><span className="text-[11px] text-muted-foreground">{help}</span></span>
                      <textarea value={promptConfig[key] || ''} onChange={e => setPromptConfig({ ...promptConfig, [key]: e.target.value })} rows={5} maxLength={8000} className="mt-2 w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" />
                    </label>
                  ))}
                  <details className="border p-4">
                    <summary className="cursor-pointer text-sm font-medium">Ещё правила: мебель, каталог, доп. art direction, запреты</summary>
                    <div className="mt-4 space-y-5">
                      {([
                        ['furnitureOn', 'Мебель: оставить', 'Когда тумблер «Оставить мебель» включён.'],
                        ['furnitureOff', 'Мебель: не учитывать', 'Когда мебель можно убрать или заменить.'],
                        ['catalogOn', 'Каталог включён', 'Как использовать товары и смету.'],
                        ['catalogOff', 'Каталог выключен', 'Свободный дизайн без товаров.'],
                        ['extra', 'Дополнительно', 'Свободный текст в конец art direction.'],
                        ['avoid', 'Запреты', 'Негативный список в конце промта.'],
                      ] as const).map(([key, label, help]) => (
                        <label key={key} className="block">
                          <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="eyebrow">{label}</span><span className="text-[11px] text-muted-foreground">{help}</span></span>
                          <textarea value={promptConfig[key] || ''} onChange={e => setPromptConfig({ ...promptConfig, [key]: e.target.value })} rows={4} maxLength={8000} className="mt-2 w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" />
                        </label>
                      ))}
                    </div>
                  </details>
                  <p className="text-xs text-muted-foreground">После сохранения новые генерации используют эти правила. Уже готовые рендеры не меняются.</p>
                </div>
              ) : <p className="mt-6 text-sm text-muted-foreground">Загружаем правила…</p>}
            </div>
          )}

          {tab === 'prompts' && (
            <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="eyebrow">Промты</p><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Что уходит модели: тип комнаты, стиль, класс материалов, товары, ограничения и карта референсов. Здесь видно, почему появилась та или иная люстра или предмет.</p></div>
                <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={promptQuery} onChange={e => setPromptQuery(e.target.value)} placeholder="E-mail, стиль, тип или текст промта" className="h-10 w-full border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" /></div>
              </div>
              <div className="mt-4 space-y-4">
                {filteredPrompts.map(p => (
                  <article key={p.id} className="border p-4">
                    <div className="flex gap-4">
                      <AdminImage src={p.image_url || p.photo_url} kind={p.image_url ? 'renders' : 'files'} alt="" />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="flex flex-wrap items-baseline justify-between gap-2"><b className="text-sm">{p.email}</b><span className="font-mono uppercase tracking-wider text-muted-foreground">{p.status} · {dateTime(p.created_at)}</span></div>
                        <p className="mt-1 text-muted-foreground">{p.style}{p.room_type ? ` · ${p.room_type}` : ''} · класс {p.price_tier || 'comfort'} · {p.credits_spent ?? '—'} кр.</p>
                        {p.meta?.refs?.length ? <p className="mt-1 text-muted-foreground">Референсы: {p.meta.refs.map(r => `${r.index}. ${r.role}${r.label ? ` (${r.label})` : ''}`).join(' · ')}</p> : null}
                        {p.meta?.mode === 'edit' && p.meta.target ? <p className="mt-1 text-muted-foreground">Правка: {p.meta.target}</p> : null}
                        {p.meta?.cleanup ? <p className="mt-1 text-muted-foreground">Очистка: {p.meta.cleanup.model || '—'} {p.meta.cleanup.resolution || ''}{p.meta.cleanup.error ? ` · ошибка: ${p.meta.cleanup.error}` : p.meta.cleanup.cost_usd != null ? ` · $${p.meta.cleanup.cost_usd}` : ''}</p> : null}
                        {p.meta?.dimension_qa ? <p className="mt-1 text-muted-foreground">QA размеров: {p.meta.dimension_qa.accepted ? 'пройден' : 'замечания'}{typeof p.meta.dimension_qa.score === 'number' ? ` · ${p.meta.dimension_qa.score}/10` : ''}{p.meta.dimension_qa.issues?.length ? ` · ${p.meta.dimension_qa.issues.join('; ')}` : ''}</p> : null}
                        <p className="mt-1 text-muted-foreground">{p.model || '—'} · {p.cost_usd != null ? `$${p.cost_usd}` : '—'}{p.duration_ms ? ` · ${(p.duration_ms / 1000).toFixed(1)} с` : ''}</p>
                        <p className="mt-1">{p.request_text || 'Базовый дизайн'}</p>
                      </div>
                    </div>
                    {p.meta?.art_direction ? (
                      <details className="mt-3 border-t pt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Арт-директор — что написал <span className="ml-2 underline">показать</span></summary>
                        <div className="mt-2 space-y-2 text-[11px] leading-5">
                          {p.meta.art_direction.text ? <p>{p.meta.art_direction.text}</p> : null}
                          {p.meta.art_direction.layoutPlan ? <p><b>План на всю комнату:</b> {p.meta.art_direction.layoutPlan}</p> : null}
                          {p.meta.art_direction.framingNote ? <p><b>Что видит камера:</b> {p.meta.art_direction.framingNote}</p> : null}
                          {p.meta.art_direction.layoutItems?.length ? (
                            <div className="overflow-auto">
                              <p className="font-medium">Объекты</p>
                              <table className="mt-1 w-full text-left text-[11px]">
                                <thead><tr className="border-b"><th className="py-1 pr-2">Тип</th><th className="py-1 pr-2">Описание</th><th className="py-1 pr-2">Размеры</th><th className="py-1 pr-2">Где</th><th className="py-1">Проход</th></tr></thead>
                                <tbody>
                                  {p.meta.art_direction.layoutItems.map((item, index) => (
                                    <tr key={`${item.type}-${index}`} className="border-b last:border-b-0">
                                      <td className="py-1 pr-2 font-medium">{item.type || '—'}</td>
                                      <td className="py-1 pr-2">{item.description || '—'}</td>
                                      <td className="py-1 pr-2 font-mono">{[item.widthCm, item.depthCm, item.heightCm].filter(v => typeof v === 'number').join(' × ') || '—'}{item.widthCm ? ' см' : ''}</td>
                                      <td className="py-1 pr-2">{item.position || '—'}</td>
                                      <td className="py-1 font-mono">{item.clearanceCm ? `${item.clearanceCm} см` : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                    {p.prompt ? <details className="mt-3 border-t pt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Промт дизайнера (image-модель) <span className="ml-2 underline">показать</span></summary><div className="mt-2"><button type="button" onClick={() => { navigator.clipboard?.writeText(p.prompt || '').catch(() => {}) }} className="mb-2 text-[11px] underline">копировать</button><pre className="max-h-80 overflow-auto whitespace-pre-wrap border bg-muted p-3 text-[11px] leading-5">{p.prompt}</pre></div></details> : <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Промт не сохранён</p>}
                  </article>
                ))}
                {!filteredPrompts.length && <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">Промтов пока нет.</p>}
              </div>
            </div>
          )}

          {tab === 'models' && (
            <div className="mt-8 max-w-3xl">
              <p className="eyebrow">Модели генерации</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Генерация и vision-разбор. Изменения применяются к новым рендерам; уже готовые не меняются. Seedream 5.0 Flash в OpenRouter: <code className="border bg-muted px-1.5 py-0.5 text-[11px]">bytedance-seed/seedream-5-0-flash</code>.</p>
              {modelSettings && (
                <form onSubmit={e => { e.preventDefault(); saveModels() }} className="mt-6 space-y-5 border p-4">
                  <div>
                    <label htmlFor="render-model" className="eyebrow mb-2 block">Модель генерации</label>
                    <select id="render-model" value={renderDraft} onChange={e => { const value = e.target.value; const caps = capsFor(value); setRenderDraft(value); if (!caps.resolutions.length) setResolutionDraft(''); else if (!caps.resolutions.includes(resolutionDraft)) setResolutionDraft(caps.resolutions[0]); if (!caps.aspects.includes(aspectDraft)) setAspectDraft(caps.aspects.includes('auto') ? 'auto' : caps.aspects[0]) }} className="h-11 w-full border bg-background px-3 font-mono text-xs outline-none focus:border-primary">
                      {modelSettings.image_models.some(m => m.id === renderDraft) ? null : <option value={renderDraft}>{renderDraft}</option>}
                      {[...modelSettings.image_models].sort((a, b) => a.id.localeCompare(b.id)).map(m => <option key={m.id} value={m.id}>{m.id}{m.input_refs ? ' · refs' : ''}</option>)}
                    </select>
                    <p className="mt-2 text-xs text-muted-foreground">{modelSettings.image_models.find(m => m.id === renderDraft)?.input_refs ? 'Поддерживает input_references — фото комнаты, референсы стиля и товаров уйдут в модель.' : 'Не заявлены input_references — фото и референсы могут не уйти. Проверьте перед включением.'}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label htmlFor="resolution" className="eyebrow mb-2 block">Разрешение</label>{capsFor(renderDraft).resolutions.length ? <select id="resolution" value={resolutionDraft} onChange={e => setResolutionDraft(e.target.value)} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary">{capsFor(renderDraft).resolutions.map(v => <option key={v} value={v}>{v}</option>)}</select> : <div className="flex h-11 items-center border bg-muted px-3 text-sm text-muted-foreground">Задаётся моделью</div>}</div>
                    <div><label htmlFor="aspect-ratio" className="eyebrow mb-2 block">Aspect ratio</label><select id="aspect-ratio" value={aspectDraft} onChange={e => setAspectDraft(e.target.value)} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary">{capsFor(renderDraft).aspects.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                  </div>
                  <p className="-mt-1 text-xs text-muted-foreground">Seedream 5.0 Flash: 1K/2K + auto. FLUX.2 Pro: разрешение задаёт модель, параметр resolution не отправляется. Для Gemini resolution тоже не отправляется. Итоговое изображение всегда приводится к пропорции загруженного кадра.</p>
                  <div>
                    <label htmlFor="vision-model" className="eyebrow mb-2 block">Модель разбора (vision)</label>
                    <input id="vision-model" value={visionDraft} onChange={e => setVisionDraft(e.target.value)} className="h-11 w-full border bg-background px-3 font-mono text-xs outline-none focus:border-primary" />
                    <p className="mt-2 text-xs text-muted-foreground">Обычно оставляем Gemini для разбора изображения и сметы.</p>
                  </div>
                  {modelNotice && <p className="border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{modelNotice}</p>}
                  <button type="submit" disabled={modelSaving} className="action-primary">{modelSaving ? 'Сохраняем…' : 'Сохранить модели'}</button>
                </form>
              )}
              {!modelSettings && <p className="mt-4 text-sm text-muted-foreground">Загружаем список моделей…</p>}
            </div>
          )}


          {tab === 'catalog' && (
            <div className="mt-8 space-y-8">
              <section className="border p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="eyebrow">Импорт товара по ссылке</p><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Вставьте ссылку на товар из allowlist. Мы разберём JSON-LD/OpenGraph, скачаем картинку, проверим дубли, рейтинг и цену. В каталог товар попадёт только после ручного подтверждения.</p></div>
                  <span className="text-xs text-muted-foreground">allowlist: 10 доменов</span>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://.../product/..." className="h-11 min-w-0 flex-1 border bg-background px-3 text-sm outline-none focus:border-primary" />
                  <button type="button" disabled={importBusy || !importUrl.trim()} onClick={() => void parseImport()} className="action-primary min-h-11">{importBusy ? 'Разбираем…' : 'Разобрать ссылку'}</button>
                </div>
                {importNotice && <p className="mt-3 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{importNotice}</p>}
                {importPreview && (
                  <div className="mt-5 grid gap-5 border-t pt-5 lg:grid-cols-[220px_1fr]">
                    <div>
                      {importPreview.image_url ? <img src={importPreview.image_url} alt="" className="aspect-square w-full border object-cover" /> : <div className="flex aspect-square items-center justify-center border bg-muted text-xs text-muted-foreground">нет картинки</div>}
                      <div className={`mt-3 border px-3 py-2 text-xs ${importPreview.quality.score >= 70 ? 'border-primary/40 bg-primary/5' : 'border-destructive/40 bg-destructive/5 text-destructive'}`}>
                        <p className="font-medium">Quality score: {importPreview.quality.score}/100</p>
                        {importPreview.quality.issues.length > 0 && <ul className="mt-1 list-disc space-y-1 pl-4">{importPreview.quality.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2"><label className="eyebrow mb-1 block">Название</label><input value={importPreview.name} onChange={e => setImportPreview({ ...importPreview, name: e.target.value })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div><label className="eyebrow mb-1 block">Бренд</label><input value={importPreview.brand} onChange={e => setImportPreview({ ...importPreview, brand: e.target.value })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div><label className="eyebrow mb-1 block">Цена, ₽</label><input value={importPreview.price || ''} inputMode="numeric" onChange={e => setImportPreview({ ...importPreview, price: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div><label className="eyebrow mb-1 block">Категория</label><select value={importPreview.category || ''} onChange={e => setImportPreview({ ...importPreview, category: e.target.value || null })} className="h-10 w-full border bg-background px-2 text-sm outline-none focus:border-primary"><option value="">— выберите —</option>{productCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                      <div><label className="eyebrow mb-1 block">Класс</label><select value={importPreview.price_tier} onChange={e => setImportPreview({ ...importPreview, price_tier: e.target.value })} className="h-10 w-full border bg-background px-2 text-sm outline-none focus:border-primary">{['start','comfort','premium','atelier'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                      <div><label className="eyebrow mb-1 block">Ед.</label><input value={importPreview.unit} onChange={e => setImportPreview({ ...importPreview, unit: e.target.value })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div><label className="eyebrow mb-1 block">Кол-во</label><input value={importPreview.qty} inputMode="numeric" onChange={e => setImportPreview({ ...importPreview, qty: Number(e.target.value.replace(/[^\d]/g, '')) || 1 })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['width_cm', 'Ширина, см'],
                          ['depth_cm', 'Глубина, см'],
                          ['height_cm', 'Высота, см'],
                          ['diameter_cm', 'Диаметр, см'],
                        ].map(([key, label]) => (
                          <div key={key}><label className="eyebrow mb-1 block">{label}</label><input value={(importPreview.dimensions as Record<string, number | null | undefined>)[key] ?? ''} inputMode="decimal" onChange={e => setImportPreview({ ...importPreview, dimensions: { ...importPreview.dimensions, [key]: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) || null } })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                        ))}
                      </div>
                      <div className="sm:col-span-2"><label className="eyebrow mb-1 block">Габариты текстом</label><input value={importPreview.dimensions.text || ''} onChange={e => setImportPreview({ ...importPreview, dimensions: { ...importPreview.dimensions, text: e.target.value } })} placeholder="например, 220×95×90 см" className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div className="sm:col-span-2"><label className="eyebrow mb-1 block">Комнаты</label><input value={importPreview.room_types} onChange={e => setImportPreview({ ...importPreview, room_types: e.target.value })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div className="sm:col-span-2"><label className="eyebrow mb-1 block">Стили</label><input value={importPreview.style_tags} onChange={e => setImportPreview({ ...importPreview, style_tags: e.target.value })} className="h-10 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                      <div className="sm:col-span-2"><label className="eyebrow mb-1 block">Ссылка</label><a href={importPreview.url_source || importPreview.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs underline underline-offset-2">{importPreview.url_source || importPreview.url}</a></div>
                      {!importPreview.allowed_domain && <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={importAllowAny} onChange={e => setImportAllowAny(e.target.checked)} />Домен не в allowlist — разрешить импорт вручную</label>}
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button type="button" disabled={catalogBusy || !importPreview.category || !importPreview.name || !importPreview.price || (!importPreview.allowed_domain && !importAllowAny)} onClick={() => void addImported()} className="action-primary">{catalogBusy ? 'Сохраняем…' : 'Добавить черновиком'}</button>
                        <button type="button" onClick={() => { setImportPreview(null); setImportNotice(''); setImportAllowAny(false) }} className="action-secondary">Сбросить</button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="border p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="eyebrow">Массовый импорт</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">По одной ссылке на строку, максимум 20. Каждый товар разбирается отдельно, в каталог попадает только после кнопки «Добавить».</p></div>
                  <button type="button" disabled={bulkBusy || !bulkUrls.trim()} onClick={() => void parseBulk()} className="action-secondary">{bulkBusy ? 'Разбираем…' : 'Разобрать список'}</button>
                </div>
                <textarea value={bulkUrls} onChange={e => setBulkUrls(e.target.value)} rows={4} placeholder="https://...&#10;https://..." className="mt-3 w-full border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary" />
                {bulkResults.length > 0 && <div className="mt-3 divide-y border-y">
                  {bulkResults.map((r, i) => <div key={`${r.url}-${i}`} className="flex flex-wrap items-center gap-3 py-3">
                    {r.preview?.image_url ? <img src={r.preview.image_url} alt="" className="h-12 w-12 border object-cover" /> : <div className="flex h-12 w-12 items-center justify-center border bg-muted text-[10px] text-muted-foreground">нет</div>}
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.preview?.name || r.url}</p><p className="truncate text-xs text-muted-foreground">{r.error ? r.error : `${r.preview?.category || '—'} · ${r.preview?.price ? money(r.preview.price) : 'цена не найдена'} · score ${r.preview?.quality?.score ?? '—'}${r.preview?.allowed_domain ? '' : ' · не allowlist'}`}</p></div>
                    {r.added ? <span className="text-xs text-primary-text">добавлен</span> : r.preview ? <button type="button" disabled={catalogBusy || (!r.preview.allowed_domain && !importAllowAny) || !r.preview.category || !r.preview.price} onClick={() => void addBulkResult(i)} className="min-h-9 border border-foreground px-3 text-xs hover:bg-foreground hover:text-background disabled:opacity-40">Добавить</button> : null}
                  </div>)}
                </div>}
              </section>

              <section>
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Каталог</p><p className="mt-1 text-xs text-muted-foreground">{catalog.filter(p => p.active !== false).length} активных · {catalog.filter(p => p.active === false).length} черновиков</p></div><input value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)} placeholder="Поиск по названию, категории, источнику" className="h-10 w-full max-w-sm border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                <div className="mt-3 overflow-x-auto border">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead><tr className="border-b"><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Товар</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Категория</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Класс</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Цена</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Комнаты</th><th className="p-3 text-xs uppercase tracking-wider text-muted-foreground">Статус</th><th /></tr></thead>
                    <tbody>
                      {catalog.filter(p => {
                        const q = catalogQuery.trim().toLowerCase()
                        return !q || [p.name, p.category, p.source, p.room_types].filter(Boolean).join(' ').toLowerCase().includes(q)
                      }).slice(0, 300).map(p => (
                        <tr key={p.id} className={`border-b last:border-b-0 ${p.active === false ? 'bg-muted/40' : ''}`}>
                          <td className="p-3"><div className="flex items-center gap-3"><img src={productImage(p)} alt="" className="h-12 w-12 border object-cover" /><div className="min-w-0"><p className="max-w-72 truncate font-medium">{p.name}</p><p className="max-w-72 truncate text-xs text-muted-foreground">{p.source || '—'}{p.seed_key ? ' · seed' : ''}{p.dimensions?.text ? ` · ${p.dimensions.text}` : ''}</p></div></div></td>
                          <td className="p-3 font-mono text-xs">{p.category}</td>
                          <td className="p-3"><select value={p.price_tier || 'comfort'} onChange={e => void updateCatalog(p, { price_tier: e.target.value })} className="h-8 border bg-background px-1 text-xs">{['start','comfort','premium','atelier'].map(t => <option key={t} value={t}>{t}</option>)}</select></td>
                          <td className="p-3"><input defaultValue={Math.round(Number(p.price) || 0)} inputMode="numeric" onBlur={e => { const value = Number(e.target.value.replace(/[^\d]/g, '')) || 0; if (value !== Number(p.price)) void updateCatalog(p, { price: value }) }} className="h-8 w-24 border bg-background px-2 text-xs" /></td>
                          <td className="max-w-52 truncate p-3 text-xs text-muted-foreground">{p.room_types || 'все'}</td>
                          <td className="p-3"><button type="button" onClick={() => void updateCatalog(p, { active: p.active === false })} className={`inline-flex min-h-8 items-center gap-1 border px-2 text-xs ${p.active === false ? 'border-foreground/30 text-muted-foreground' : 'border-primary/40 text-primary-text'}`}>{p.active === false ? 'включить' : 'активен'}</button></td>
                          <td className="p-3 text-right"><button type="button" onClick={() => void deleteCatalog(p)} className="text-xs text-destructive underline">удал.</button></td>
                        </tr>
                      ))}
                      {!catalog.length && <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">Каталог пуст.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {tab === 'cleanup' && (
            <div className="mt-8 max-w-4xl">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="eyebrow">Очистка комнаты перед дизайном</p><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Первый проход оставляет только архитектуру: стены, пол, потолок, окно, дверь и перспективу. Применяется только когда пользователь выключил «Оставить мебель». Если «Оставить мебель» включено — очистка не запускается. По умолчанию включена.</p></div>
                <div className="flex gap-2"><button type="button" disabled={cleanupBusy} onClick={() => void resetCleanup()} className="action-secondary">Сбросить</button><button type="button" disabled={cleanupBusy} onClick={() => void saveCleanup()} className="action-primary">{cleanupBusy ? 'Сохраняем…' : 'Сохранить'}</button></div>
              </div>
              {cleanupNotice && <p className="mt-4 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{cleanupNotice}</p>}
              {cleanupConfig ? (
                <div className="mt-6 space-y-5">
                  <label className="flex items-center gap-3 border p-3 text-sm"><input type="checkbox" checked={cleanupConfig.enabled} onChange={e => setCleanupConfig({ ...cleanupConfig, enabled: e.target.checked })} className="size-4 accent-primary" /><span><span className="font-medium">Очистка включена</span><span className="mt-1 block text-xs text-muted-foreground">Если выключить, при «Оставить мебель = выкл» сразу пойдёт обычный дизайн без пустого каркаса.</span></span></label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2"><label className="eyebrow mb-2 block">Модель очистки</label><select value={cleanupConfig.model} onChange={e => { const value = e.target.value; const caps = capsFor(value); const nextRes = caps.resolutions.length ? (caps.resolutions.includes(cleanupConfig.resolution) ? cleanupConfig.resolution : caps.resolutions[0]) : ''; const nextAspect = caps.aspects.includes(cleanupConfig.aspect_ratio) ? cleanupConfig.aspect_ratio : (caps.aspects.includes('auto') ? 'auto' : caps.aspects[0]); setCleanupConfig({ ...cleanupConfig, model: value, resolution: nextRes, aspect_ratio: nextAspect }) }} className="h-11 w-full border bg-background px-3 font-mono text-xs outline-none focus:border-primary">{modelSettings?.image_models?.some(m => m.id === cleanupConfig.model) ? null : <option value={cleanupConfig.model}>{cleanupConfig.model}</option>}{modelSettings?.image_models?.map(m => <option key={m.id} value={m.id}>{m.id}{m.input_refs ? ' · refs' : ''}</option>)}</select></div>
                    <div><label className="eyebrow mb-2 block">Разрешение</label>{capsFor(cleanupConfig.model).resolutions.length ? <select value={cleanupConfig.resolution} onChange={e => setCleanupConfig({ ...cleanupConfig, resolution: e.target.value })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary">{capsFor(cleanupConfig.model).resolutions.map(v => <option key={v} value={v}>{v}</option>)}</select> : <div className="flex h-11 items-center border bg-muted px-3 text-sm text-muted-foreground">Задаётся моделью</div>}</div>
                    <div><label className="eyebrow mb-2 block">Aspect ratio</label><select value={cleanupConfig.aspect_ratio} onChange={e => setCleanupConfig({ ...cleanupConfig, aspect_ratio: e.target.value })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary">{capsFor(cleanupConfig.model).aspects.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                  </div>
                  <label className="block"><span className="eyebrow mb-2 block">Промт очистки</span><textarea value={cleanupConfig.prompt} onChange={e => setCleanupConfig({ ...cleanupConfig, prompt: e.target.value })} rows={8} maxLength={8000} className="w-full border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /><span className="mt-2 block text-xs text-muted-foreground">Плейсхолдеры: <code>{'{room}'}</code> — тип комнаты, <code>{'{keep}'}</code> — что сохранить, <code>{'{remove}'}</code> — что удалить. Для кухни/санузла сохраняются встроенные элементы и технические точки.</span></label>
                  <p className="text-xs text-muted-foreground">Рекомендуем FLUX 3 Image Klein, 1K, auto. Очистка добавляет второй вызов модели и увеличивает время генерации.</p>
                </div>
              ) : <p className="mt-6 text-sm text-muted-foreground">Загружаем настройки…</p>}
            </div>
          )}

          {tab === 'procurement' && (
            <div className="mt-8 max-w-5xl">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="eyebrow">Поиск товаров</p><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Управляет тем, что ищется после нажатия «Найти товары». По умолчанию включены только мебель/свет/декор и текстиль; отделка, техника и комплектующие выключены, чтобы не искать крепёж и случайные карточки.</p></div>
                <div className="flex gap-2"><button type="button" disabled={procurementBusy} onClick={() => void resetProcurement()} className="action-secondary">Сбросить</button><button type="button" disabled={procurementBusy} onClick={() => void saveProcurement()} className="action-primary">{procurementBusy ? 'Сохраняем…' : 'Сохранить'}</button></div>
              </div>
              {procurementNotice && <p className="mt-4 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{procurementNotice}</p>}
              {procurementConfig ? (
                <div className="mt-6 space-y-5">
                  <label className="flex items-center gap-3 border p-3 text-sm"><input type="checkbox" checked={procurementConfig.enabled} onChange={e => setProcurementConfig({ ...procurementConfig, enabled: e.target.checked })} className="size-4 accent-primary" /><span><span className="font-medium">Поиск товаров включён</span><span className="mt-1 block text-xs text-muted-foreground">Если выключить, кнопка «Найти товары» вернёт ошибку и кредит не спишется.</span></span></label>
                  <div>
                    <p className="eyebrow mb-2">Что искать</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(procurementLayerLabels).map(([layer, label]) => (
                        <label key={layer} className="flex items-center gap-3 border p-3 text-sm">
                          <input type="checkbox" checked={procurementConfig.enabled_layers.includes(layer)} onChange={e => setProcurementConfig({ ...procurementConfig, enabled_layers: e.target.checked ? [...procurementConfig.enabled_layers, layer] : procurementConfig.enabled_layers.filter(v => v !== layer) })} className="size-4 accent-primary" />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><label className="eyebrow mb-2 block">Регион Яндекса</label><input value={procurementConfig.region} onChange={e => setProcurementConfig({ ...procurementConfig, region: e.target.value })} className="h-11 w-full border bg-background px-3 font-mono text-xs outline-none focus:border-primary" placeholder="213" /></div>
                    <div><label className="eyebrow mb-2 block">Кредитов за запуск</label><input type="number" min={0} max={10} value={procurementConfig.credit_cost} onChange={e => setProcurementConfig({ ...procurementConfig, credit_cost: Number(e.target.value) })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                    <div><label className="eyebrow mb-2 block">Макс. стоимость run, $</label><input type="number" min={0.01} max={5} step={0.01} value={procurementConfig.max_run_cost_usd} onChange={e => setProcurementConfig({ ...procurementConfig, max_run_cost_usd: Number(e.target.value) })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div><label className="eyebrow mb-2 block">Мин. score</label><input type="number" min={50} max={95} value={procurementConfig.min_score} onChange={e => setProcurementConfig({ ...procurementConfig, min_score: Number(e.target.value) })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                    <div><label className="eyebrow mb-2 block">Альтернатива</label><input type="number" min={40} max={90} value={procurementConfig.alt_score} onChange={e => setProcurementConfig({ ...procurementConfig, alt_score: Number(e.target.value) })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                    <div><label className="eyebrow mb-2 block">Кандидатов</label><input type="number" min={1} max={8} value={procurementConfig.max_candidates_per_item} onChange={e => setProcurementConfig({ ...procurementConfig, max_candidates_per_item: Number(e.target.value) })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                    <div><label className="eyebrow mb-2 block">Визуальных</label><input type="number" min={1} max={5} value={procurementConfig.max_visual_candidates} onChange={e => setProcurementConfig({ ...procurementConfig, max_visual_candidates: Number(e.target.value) })} className="h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary" /></div>
                  </div>
                  <label className="block"><span className="eyebrow mb-2 block">Магазины (через запятую)</span><textarea value={procurementConfig.domains} onChange={e => setProcurementConfig({ ...procurementConfig, domains: e.target.value })} rows={4} className="w-full border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-primary" /></label>
                  <p className="text-xs text-muted-foreground">Если слой выключен, его позиции не создаются и не ищутся. Комплектующие (матрас, крепёж, карниз) лучше держать выключенными до этапа сметы.</p>
                </div>
              ) : <p className="mt-6 text-sm text-muted-foreground">Загружаем настройки…</p>}
            </div>
          )}

          {tab === 'proxy' && (
            <div className="mt-8 max-w-3xl">
              <p className="eyebrow">Прокси для OpenRouter</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Нужен, если OpenRouter блокирует IP сервера. Сохраняется в app_settings и применяется без рестарта. Пустое поле выключает прокси, даже если HTTPS_PROXY задан в env.</p>
              <form onSubmit={e => { e.preventDefault(); void saveProxy() }} className="mt-6 space-y-4 border p-4">
                <div>
                  <label htmlFor="proxy-url" className="eyebrow mb-2 block">URL прокси</label>
                  <input id="proxy-url" value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} placeholder="http://user:pass@host:port" className="h-11 w-full border bg-background px-3 font-mono text-xs outline-none focus:border-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Env-фолбэк: {proxyEnv ? <span className="font-mono">{proxyEnv}</span> : 'не задан'}. Пароль в URL маскируется; чтобы изменить — введите новый URL целиком.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={proxyBusy} className="action-primary">{proxyBusy ? 'Проверяем…' : 'Сохранить'}</button>
                  <button type="button" disabled={proxyBusy} onClick={() => void testProxy()} className="action-secondary">Проверить</button>

                </div>
                {proxyNotice && <p className="border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{proxyNotice}</p>}
                {proxyStatus && (
                  <div className={`border px-3 py-2 text-sm ${proxyStatus.ok ? 'border-primary/40 bg-primary/5' : 'border-destructive/40 bg-destructive/5 text-destructive'}`}>
                    <p className="font-medium">{proxyStatus.ok ? 'Прокси работает' : 'Прокси не работает'}{proxyStatus.status ? ` · HTTP ${proxyStatus.status}` : ''} · {proxyStatus.ms} мс</p>
                    <p className="mt-1 text-xs opacity-80">Проверено: {dateTime(proxyStatus.at)}{proxyStatus.error ? ` · ${proxyStatus.error}` : ''}</p>
                  </div>
                )}
              </form>
            </div>
          )}
        </main>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  Check,
  Crop,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type SearchApi = (path: string, init?: RequestInit) => Promise<Response>

type SearchPipelineProps = {
  jobId: string | null
  api: SearchApi
  onJobCreated?: (jobId: string) => void
  onCost?: (costUsd: number) => void
}

type SearchObject = {
  id: number; index: number; category: string | null; label: string; description: string | null
  color: string | null; material: string | null; style: string | null; hex: string | null
  size: string | null; search_query: string | null; bbox: number[] | null
  confidence: number | null; visibility: string
  thumbnail_url: string | null; thumbnail_mode: 'A' | 'B' | null
  cell_check: { ok?: boolean; label?: string; description?: string } | null
  status: string
}
type SearchStep = {
  id: number; step: string; status: string; cost_usd: number | null; error: string | null
  created_at: string; input: unknown; output: unknown
}
type SearchJob = {
  id: string; source: string; source_url: string | null; mode: string; status: string
  stage: string | null; error: string | null; cost_usd: number; created_at: string
  finished_at: string | null; photo_quality: { score?: number | null; recommend_mode?: string }
  vision_raw: unknown; prompts: unknown; objects: SearchObject[]; steps: SearchStep[]
}
type SearchResult = {
  id: number; source: string; store: string | null; url: string; title: string
  image_url: string | null; price: number | null; currency: string
  match_score: number | null; checked_at: string | null
}
type ObjectFilters = {
  query: string; domains: string[]; price_from: string; price_to: string
  region: string; period: 'all' | 'day' | '2weeks' | 'month'
  sort: 'relevance' | 'time'; source: 'both' | 'text' | 'visual'
}
type RequestLine = {
  provider: string
  kind: string
  model?: string
  rate?: 'day' | 'night'
  count: number
  unit_cost_usd: number
  cost_usd: number
}
type SearchResponse = {
  results: SearchResult[]
  cost_usd?: number
  requests?: RequestLine[]
  requests_count?: number
  request_rates_usd?: { web: number; image: number; night: boolean }
}

const labUrl = (path: string | null | undefined) => {
  if (!path) return null
  if (path.startsWith('/')) return path
  return `/search-lab/${path.split('/').pop()}`
}

const isAuthArtifact = (src: string) => src.startsWith('/search-lab/') || src.startsWith('/renders/')

type AuthImageProps = {
  src: string
  alt: string
  className: string
  api: SearchApi
}

function AuthImage({ src, alt, className, api }: AuthImageProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isAuthArtifact(src)) return
    let cancelled = false
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)

    const load = async () => {
      try {
        const response = await api(src)
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, api])

  if (!isAuthArtifact(src)) {
    return <img src={src} alt={alt} className={className} loading="lazy" />
  }
  if (!url || failed) {
    return (
      <span
        className={`${className} block bg-muted`}
        role="img"
        aria-label={failed ? alt : undefined}
      />
    )
  }
  return <img src={url} alt={alt} className={className} />
}
const money = (v: number | null) => v === null ? '—' : `${new Intl.NumberFormat('ru-RU').format(Math.round(v))} ₽`
const usd = (v: number) => `$${(Number(v) || 0).toFixed(4)}`

const readRequests = (value: unknown): RequestLine[] => {
  if (!value || typeof value !== 'object') return []
  const raw = (value as { requests?: unknown }).requests
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is RequestLine => Boolean(item) && typeof item === 'object')
}

const requestLabel = (request: RequestLine) => {
  const kind = request.kind === 'web_search'
    ? `Yandex web${request.rate ? ` (${request.rate === 'night' ? 'ночь' : 'день'})` : ''}`
    : request.kind === 'image_search_by_image'
      ? 'Yandex image'
      : request.kind === 'vision'
        ? 'Vision'
        : request.kind === 'grid_image'
          ? 'Grid image'
          : request.kind === 'cell_check'
            ? 'Cell check'
            : request.kind
  return request.model ? `${kind} · ${request.model}` : kind
}

function RequestBreakdown({ requests }: { requests: RequestLine[] }) {
  if (requests.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {requests.map((request, index) => (
        <li key={`${request.kind}-${index}`} className="flex flex-wrap justify-between gap-2 font-mono">
          <span>{requestLabel(request)} × {request.count}</span>
          <span>{usd(request.unit_cost_usd)} → {usd(request.cost_usd)}</span>
        </li>
      ))}
    </ul>
  )
}

const readJson = async <T,>(r: Response): Promise<T> => {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error || String(r.status))
  return data as T
}

const isBusyStatus = (status: string) => status === 'queued' || status === 'processing'

const defaultFilters = (object?: SearchObject): ObjectFilters => ({
  query: object?.search_query || object?.label || '',
  domains: [],
  price_from: '',
  price_to: '',
  region: '213',
  period: 'all',
  sort: 'relevance',
  source: 'both',
})

const parsePrice = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

const PROMPT_LABELS: Array<[string, string]> = [
  ['vision', 'Распознавание'],
  ['grid', 'Сетка'],
  ['cell', 'Ячейка'],
]

const promptText = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.prompt === 'string') return record.prompt
  }
  const json = JSON.stringify(value, null, 2)
  return json ?? null
}

const objectMeta = (object: SearchObject) => [
  object.category,
  object.color,
  object.material,
  object.style,
  object.size,
].filter((value): value is string => Boolean(value))

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU')
}

export function SearchPipeline({ jobId, api, onJobCreated, onCost }: SearchPipelineProps) {
  const [job, setJob] = useState<SearchJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [renderId, setRenderId] = useState('')
  const [openingRender, setOpeningRender] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filters, setFilters] = useState<ObjectFilters>(() => defaultFilters())
  const [domainDraft, setDomainDraft] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [resultsBusy, setResultsBusy] = useState(false)
  const [resultsError, setResultsError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [searchMeta, setSearchMeta] = useState<{ cost_usd: number; requests: RequestLine[]; requests_count: number } | null>(null)

  const apiRef = useRef(api)
  const onCostRef = useRef(onCost)
  const costRef = useRef<number | null>(null)

  useEffect(() => {
    apiRef.current = api
  }, [api])

  useEffect(() => {
    onCostRef.current = onCost
  }, [onCost])

  const applyJob = useCallback((next: SearchJob) => {
    setJob(next)
    if (costRef.current !== next.cost_usd) {
      costRef.current = next.cost_usd
      onCostRef.current?.(next.cost_usd)
    }
  }, [])

  useEffect(() => {
    setSelectedId(null)
    setFilters(defaultFilters())
    setResults([])
    setResultsError('')
    setHasSearched(false)
    setError('')
    costRef.current = null

    if (!jobId) {
      setJob(null)
      setLoading(false)
      return
    }

    setJob(null)
    setLoading(true)
    let cancelled = false

    const load = async () => {
      try {
        const data = await readJson<SearchJob>(
          await apiRef.current(`/api/admin/search/jobs/${encodeURIComponent(jobId)}`),
        )
        if (!cancelled) applyJob(data)
      } catch (e) {
        if (!cancelled) setError(errorText(e, 'Не удалось загрузить поиск'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [jobId, applyJob])

  const polling = Boolean(jobId && job && isBusyStatus(job.status))

  useEffect(() => {
    if (!jobId || !polling) return
    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const data = await readJson<SearchJob>(
          await apiRef.current(`/api/admin/search/jobs/${encodeURIComponent(jobId)}`),
        )
        if (!cancelled) applyJob(data)
      } catch {
        // Ошибку опроса показывать не нужно: следующая попытка повторит запрос.
      }
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [jobId, polling, applyJob])

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('photo', file)
      const data = await readJson<SearchJob>(
        await apiRef.current('/api/admin/search/jobs', { method: 'POST', body: form }),
      )
      applyJob(data)
      onJobCreated?.(data.id)
    } catch (e) {
      setError(errorText(e, 'Не удалось загрузить фото'))
    } finally {
      setUploading(false)
    }
  }

  const openRender = async () => {
    const id = renderId.trim()
    if (!id) return

    setOpeningRender(true)
    setError('')
    try {
      const data = await readJson<SearchJob>(
        await apiRef.current('/api/admin/search/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ render_id: id }),
        }),
      )
      applyJob(data)
      onJobCreated?.(data.id)
    } catch (e) {
      setError(errorText(e, 'Не удалось открыть рендер'))
    } finally {
      setOpeningRender(false)
    }
  }

  const runStep = async (step: 'vision' | 'grid' | 'crops') => {
    if (!job) return
    setActing(true)
    setError('')
    try {
      const data = await readJson<SearchJob>(
        await apiRef.current(
          `/api/admin/search/jobs/${encodeURIComponent(job.id)}/${step}`,
          { method: 'POST' },
        ),
      )
      applyJob(data)
    } catch (e) {
      setError(errorText(e, 'Не удалось выполнить шаг поиска'))
    } finally {
      setActing(false)
    }
  }

  const selectObject = (object: SearchObject) => {
    setSelectedId(object.id)
    setFilters(defaultFilters(object))
    setDomainDraft('')
    setResults([])
    setResultsError('')
    setHasSearched(false)
    setSearchMeta(null)
  }

  const addDomain = () => {
    const domain = domainDraft.trim().toLowerCase().replace(/^www\./, '')
    if (!domain) return
    setFilters(prev => (
      prev.domains.includes(domain)
        ? prev
        : { ...prev, domains: [...prev.domains, domain] }
    ))
    setDomainDraft('')
  }

  const removeDomain = (domain: string) => {
    setFilters(prev => ({ ...prev, domains: prev.domains.filter(item => item !== domain) }))
  }

  const selected = job?.objects.find(object => object.id === selectedId) ?? null
  const busy = acting || Boolean(job && isBusyStatus(job.status))

  const runObjectSearch = async (force: boolean) => {
    if (!job || !selected) return
    setResultsBusy(true)
    setResultsError('')
    try {
      const path = `/api/admin/search/jobs/${encodeURIComponent(job.id)}/objects/${selected.id}/search`
      const response = force
        ? await apiRef.current(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: filters.query,
            domains: filters.domains,
            price_from: parsePrice(filters.price_from),
            price_to: parsePrice(filters.price_to),
            region: filters.region.trim() || '213',
            period: filters.period,
            sort: filters.sort,
            source: filters.source,
            force: true,
          }),
        })
        : await apiRef.current(path)
      const data = await readJson<SearchResponse>(response)
      setResults(data.results ?? [])
      setSearchMeta({
        cost_usd: Number(data.cost_usd) || 0,
        requests: Array.isArray(data.requests) ? data.requests : [],
        requests_count: Number(data.requests_count) || 0,
      })
      setHasSearched(true)
      try {
        const fresh = await readJson<SearchJob>(
          await apiRef.current(`/api/admin/search/jobs/${encodeURIComponent(job.id)}`),
        )
        applyJob(fresh)
      } catch {
        // обновление шапки не критично — результаты уже показаны
      }
    } catch (e) {
      setResultsError(errorText(e, 'Не удалось выполнить поиск'))
      setHasSearched(true)
    } finally {
      setResultsBusy(false)
    }
  }

  const visionStep = job?.steps.find(step => step.step === 'vision')
  const overlay = (visionStep?.output as { overlay_path?: string } | undefined)?.overlay_path
  const gridStep = job?.steps.find(step => step.step === 'grid')
  const gridOutput = gridStep?.output as
    | { grid_path?: string; grid_overlay_path?: string; cells?: unknown }
    | undefined

  const sourceUrl = labUrl(job?.source_url)
  const overlayUrl = labUrl(overlay)
  const gridUrl = labUrl(gridOutput?.grid_path)
  const gridOverlayUrl = labUrl(gridOutput?.grid_overlay_path)

  const promptSource = job?.prompts && typeof job.prompts === 'object'
    ? job.prompts as Record<string, unknown>
    : null
  const prompts = PROMPT_LABELS.flatMap(([key, label]) => {
    const text = promptSource ? promptText(promptSource[key]) : null
    return text ? [{ key, label, text }] : []
  })

  return (
    <section className="space-y-6">
      {!jobId && !job && (
        <>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:bg-muted/60">
            <span className="flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground">
              {uploading ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {uploading ? 'Загружаем фото…' : 'Загрузить фото комнаты'}
              </span>
              <span className="block text-xs text-muted-foreground">JPEG, PNG или WebP</span>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={upload}
            />
          </label>

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <p className="text-sm font-medium text-foreground">Или откройте существующий рендер</p>
            <p className="mt-1 text-xs text-muted-foreground">Вставьте ID рендера из кабинета.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={renderId}
                onChange={event => setRenderId(event.target.value)}
                placeholder="render_id"
                disabled={openingRender}
              />
              <Button
                variant="outline"
                disabled={openingRender || !renderId.trim()}
                onClick={() => void openRender()}
              >
                {openingRender
                  ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  : <ExternalLink className="size-4" aria-hidden="true" />}
                Открыть рендер
              </Button>
            </div>
          </div>
        </>
      )}

      {(loading || uploading || openingRender) && !job && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Загружаем данные поиска…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {job && (
        <>
          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Поиск предметов</h2>
                <p className="font-mono text-xs text-muted-foreground">{job.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Статус</p>
                  <p className="font-medium text-foreground">{job.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Этап</p>
                  <p className="font-medium text-foreground">{job.stage || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Режим</p>
                  <p className="font-medium text-foreground">{job.mode}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Стоимость</p>
                  <p className="font-medium text-foreground">{usd(job.cost_usd)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Качество фото</p>
                  <p className="font-medium text-foreground">
                    {job.photo_quality?.score == null ? '—' : `${Math.round(job.photo_quality.score)}%`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Рекомендация</p>
                  <p className="font-medium text-foreground">{job.photo_quality?.recommend_mode || '—'}</p>
                </div>
              </div>
            </div>

            {job.error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {job.error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void runStep('vision')}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Распознать заново
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void runStep('grid')}>
                <LayoutGrid className="size-4" aria-hidden="true" />
                Сгенерировать сетку
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void runStep('crops')}>
                <Crop className="size-4" aria-hidden="true" />
                Нарезать по bbox
              </Button>
              {busy && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  Выполняется…
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <figure className="space-y-2">
              <figcaption className="text-sm font-medium text-foreground">Исходное фото</figcaption>
              {sourceUrl ? (
                <AuthImage
                  src={sourceUrl}
                  alt="Исходное фото"
                  className="w-full rounded-lg border border-border bg-muted object-contain"
                  api={api}
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <ImageIcon className="size-6" aria-hidden="true" />
                </div>
              )}
            </figure>

            <figure className="space-y-2">
              <figcaption className="text-sm font-medium text-foreground">Разметка объектов</figcaption>
              {overlayUrl ? (
                <AuthImage
                  src={overlayUrl}
                  alt="Разметка объектов"
                  className="w-full rounded-lg border border-border bg-muted object-contain"
                  api={api}
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-muted text-xs text-muted-foreground">
                  Разметка появится после распознавания
                </div>
              )}
            </figure>
          </div>

          {(gridUrl || gridOverlayUrl) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {gridUrl && (
                <figure className="space-y-2">
                  <figcaption className="text-sm font-medium text-foreground">Сетка</figcaption>
                  <AuthImage
                    src={gridUrl}
                    alt="Сетка"
                    className="w-full rounded-lg border border-border bg-muted object-contain"
                    api={api}
                  />
                </figure>
              )}
              {gridOverlayUrl && (
                <figure className="space-y-2">
                  <figcaption className="text-sm font-medium text-foreground">Разметка сетки</figcaption>
                  <AuthImage
                    src={gridOverlayUrl}
                    alt="Разметка сетки"
                    className="w-full rounded-lg border border-border bg-muted object-contain"
                    api={api}
                  />
                </figure>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Объекты</h3>
              <span className="text-xs text-muted-foreground">{job.objects.length} шт.</span>
            </div>

            {job.status === 'done' && job.objects.length > 0 && job.objects.every(object => !object.thumbnail_url) && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                Миниатюр нет: у объектов не найден bbox. Нажмите «Сгенерировать сетку» — режим B нарежет товары из ИИ-сетки.
              </p>
            )}

            {job.objects.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                Объекты ещё не распознаны.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {job.objects.map(object => {
                  const thumbnail = labUrl(object.thumbnail_url)
                  const active = object.id === selectedId
                  return (
                    <article
                      key={object.id}
                      className={`flex flex-col gap-3 rounded-xl border p-3 transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                        {thumbnail ? (
                          <AuthImage
                            src={thumbnail}
                            alt={object.label}
                            className="h-full w-full object-cover"
                            api={api}
                          />
                        ) : (
                          <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {object.thumbnail_mode === 'A' && (
                          <Badge variant="secondary">вырезано с фото</Badge>
                        )}
                        {object.thumbnail_mode === 'B' && (
                          <Badge variant="secondary">ИИ-миниатюра</Badge>
                        )}
                        {!object.thumbnail_mode && (
                          <Badge variant="outline">нет миниатюры</Badge>
                        )}
                        {object.cell_check && (
                          <Badge variant={object.cell_check.ok ? 'default' : 'destructive'}>
                            {object.cell_check.ok
                              ? <Check className="size-3" aria-hidden="true" />
                              : <X className="size-3" aria-hidden="true" />}
                            {object.cell_check.ok ? 'ok' : 'отбраковано'}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {object.index}. {object.label}
                        </p>
                        {object.description && (
                          <p className="text-xs text-muted-foreground">{object.description}</p>
                        )}
                      </div>

                      {objectMeta(object).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {objectMeta(object).map((value, index) => (
                            <span
                              key={`${object.id}-${index}`}
                              className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div>
                          <dt className="text-muted-foreground">bbox</dt>
                          <dd className="font-mono text-foreground">
                            {object.bbox ? object.bbox.map(value => String(value)).join(', ') : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">confidence</dt>
                          <dd className="text-foreground">
                            {object.confidence == null ? '—' : `${Math.round(object.confidence * 100)}%`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">visibility</dt>
                          <dd className="text-foreground">{object.visibility}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">status</dt>
                          <dd className="text-foreground">{object.status}</dd>
                        </div>
                      </dl>

                      <Button
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        className="mt-auto"
                        onClick={() => selectObject(object)}
                      >
                        <Search className="size-4" aria-hidden="true" />
                        Искать
                      </Button>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {selected && (
            <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Фильтры: {selected.label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Поиск по объекту #{selected.index}
                </p>
              </div>

              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Запрос</span>
                  <Input
                    value={filters.query}
                    onChange={event => setFilters(prev => ({ ...prev, query: event.target.value }))}
                    placeholder="Что искать"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">Домены</span>
                  <div className="flex flex-wrap gap-1.5">
                    {filters.domains.length === 0 && (
                      <span className="text-xs text-muted-foreground">Все домены (поиск везде)</span>
                    )}
                    {filters.domains.map(domain => (
                      <span
                        key={domain}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                      >
                        {domain}
                        <button
                          type="button"
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={`Убрать ${domain}`}
                          onClick={() => removeDomain(domain)}
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={domainDraft}
                      onChange={event => setDomainDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addDomain()
                        }
                      }}
                      placeholder="example.ru"
                    />
                    <Button variant="outline" type="button" onClick={addDomain}>
                      Добавить сайт
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Цена от</span>
                    <Input
                      inputMode="numeric"
                      value={filters.price_from}
                      onChange={event => setFilters(prev => ({ ...prev, price_from: event.target.value }))}
                      placeholder="0"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Цена до</span>
                    <Input
                      inputMode="numeric"
                      value={filters.price_to}
                      onChange={event => setFilters(prev => ({ ...prev, price_to: event.target.value }))}
                      placeholder="100000"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Регион</span>
                    <Input
                      value={filters.region}
                      onChange={event => setFilters(prev => ({ ...prev, region: event.target.value }))}
                      placeholder="213"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Период</span>
                    <select
                      value={filters.period}
                      onChange={event => setFilters(prev => ({
                        ...prev,
                        period: event.target.value as ObjectFilters['period'],
                      }))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="all">За всё время</option>
                      <option value="day">За день</option>
                      <option value="2weeks">За 2 недели</option>
                      <option value="month">За месяц</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Сортировка</span>
                    <select
                      value={filters.sort}
                      onChange={event => setFilters(prev => ({
                        ...prev,
                        sort: event.target.value as ObjectFilters['sort'],
                      }))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="relevance">По релевантности</option>
                      <option value="time">По времени</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Источник</span>
                    <select
                      value={filters.source}
                      onChange={event => setFilters(prev => ({
                        ...prev,
                        source: event.target.value as ObjectFilters['source'],
                      }))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="both">Текст + изображения</option>
                      <option value="text">Только текст</option>
                      <option value="visual">Только изображения</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={resultsBusy} onClick={() => void runObjectSearch(true)}>
                    {resultsBusy
                      ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      : <Search className="size-4" aria-hidden="true" />}
                    Искать
                  </Button>
                  <Button
                    variant="outline"
                    disabled={resultsBusy}
                    onClick={() => void runObjectSearch(false)}
                  >
                    Показать сохранённые
                  </Button>
                </div>
              </div>

              {resultsError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {resultsError}
                </p>
              )}

              {hasSearched && !resultsBusy && results.length === 0 && !resultsError && (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                  Ничего не найдено. Попробуйте изменить запрос или убрать домены.
                </p>
              )}

              {searchMeta && (searchMeta.requests_count > 0 || searchMeta.cost_usd > 0) && (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Запросов: {searchMeta.requests_count} · итого {usd(searchMeta.cost_usd)}
                  </p>
                  <RequestBreakdown requests={searchMeta.requests} />
                </div>
              )}

              {results.length > 0 && (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {results.map(result => (
                    <li key={result.id} className="flex gap-3 p-3">
                      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {result.image_url ? (
                          <img
                            src={result.image_url}
                            alt={result.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">
                            {result.source === 'visual' ? 'визуал' : 'текст'}
                          </Badge>
                          {result.match_score !== null && (
                            <Badge variant="secondary">{Math.round(result.match_score)}%</Badge>
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm font-medium text-foreground">{result.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {result.store || 'Магазин не указан'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {money(result.price)}
                        </span>
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener nofollow"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Открыть
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Журнал шагов</h3>
            {job.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Шагов пока нет.</p>
            ) : (
              <ul className="divide-y divide-border">
                {job.steps.map(step => (
                  <li key={step.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{step.step}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(step.created_at)}</p>
                      <RequestBreakdown requests={readRequests(step.output)} />
                      {step.error && (
                        <p className="text-xs text-destructive">{step.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={step.status === 'done' ? 'secondary' : 'outline'}>
                        {step.status}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {usd(step.cost_usd ?? 0)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {prompts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Снимок промтов</h3>
              {prompts.map(prompt => (
                <details key={prompt.key} className="rounded-lg border border-border bg-background p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    {prompt.label}
                  </summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs text-muted-foreground">
                    {prompt.text}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

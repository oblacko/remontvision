import { useEffect, useRef, useState } from 'react'
import { SearchPipeline } from './SearchPipeline'

type SearchLabProps = {
  api: (path: string, init?: RequestInit) => Promise<Response>
  readJson: (r: Response) => Promise<unknown>
}

type SearchConfig = {
  enabled: boolean; vision_model: string; grid_model: string
  grid_resolution: string; grid_aspect: string
  domains: string[]; region: string; search_limit: number; max_objects: number
  max_run_cost_usd: number; cache_ttl_hours: number; visual_enabled: boolean
  buy_keyword: string; price_check_enabled: boolean
  price_check_limit: number; price_check_concurrency: number
  yandex_web_cost_usd: number
  yandex_web_night_cost_usd: number
  yandex_image_cost_usd: number
}
type PromptRow = { id: number; kind: string; version: number; prompt: string; active: boolean }
type PromptList = { vision: PromptRow[]; grid: PromptRow[]; cell: PromptRow[] }

type PromptKind = 'vision' | 'grid' | 'cell'
type Drafts = Record<PromptKind, string>

const PROMPT_KINDS: PromptKind[] = ['vision', 'grid', 'cell']
const PROMPT_LABELS: Record<PromptKind, string> = {
  vision: 'Промт зрения',
  grid: 'Промт сетки',
  cell: 'Промт проверки ячейки',
}
const GRID_RESOLUTIONS = ['768', '1K', '1.5K', '2K', '4K']
const GRID_ASPECTS = ['21:9', '16:9', '2:1', '3:2', '1:1']

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const activePromptText = (rows: PromptRow[]) => {
  const row = rows.find(item => item.active) ?? rows[0]
  return row?.prompt ?? ''
}

const draftsFrom = (list: PromptList): Drafts => ({
  vision: activePromptText(list.vision),
  grid: activePromptText(list.grid),
  cell: activePromptText(list.cell),
})

const parseDomains = (value: string) => [...new Set(
  value
    .split(',')
    .map(item => item.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean),
)]

const inputClass = 'h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary'
const selectClass = 'h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary'
const numberClass = 'h-11 w-full border bg-background px-3 text-sm outline-none focus:border-primary'

export function SearchLab({ api, readJson }: SearchLabProps) {
  const [config, setConfig] = useState<SearchConfig | null>(null)
  const [prompts, setPrompts] = useState<PromptList | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({ vision: '', grid: '', cell: '' })
  const [domainsDraft, setDomainsDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)

  const apiRef = useRef(api)
  const readJsonRef = useRef(readJson)

  useEffect(() => {
    apiRef.current = api
    readJsonRef.current = readJson
  }, [api, readJson])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [configData, promptsData] = await Promise.all([
          readJsonRef.current(await apiRef.current('/api/admin/search/config')),
          readJsonRef.current(await apiRef.current('/api/admin/search/prompts')),
        ])
        if (cancelled) return
        const nextConfig = configData as SearchConfig
        const nextPrompts = promptsData as PromptList
        setConfig(nextConfig)
        setDomainsDraft(nextConfig.domains.join(', '))
        setPrompts(nextPrompts)
        setDrafts(draftsFrom(nextPrompts))
      } catch (e) {
        if (!cancelled) setError(errorText(e, 'Не удалось загрузить настройки поиска'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const applyConfig = (next: SearchConfig) => {
    setConfig(next)
    setDomainsDraft(next.domains.join(', '))
  }

  const saveConfig = async () => {
    if (!config) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await readJsonRef.current(
        await apiRef.current('/api/admin/search/config', {
          method: 'PUT',
          body: JSON.stringify({
            config: { ...config, domains: parseDomains(domainsDraft) },
          }),
        }),
      ) as { config?: SearchConfig }
      if (data.config) applyConfig(data.config)
      setNotice('Настройки поиска сохранены')
    } catch (e) {
      setError(errorText(e, 'Не удалось сохранить настройки'))
    } finally {
      setBusy(false)
    }
  }

  const resetConfig = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await readJsonRef.current(
        await apiRef.current('/api/admin/search/config/reset', { method: 'POST' }),
      ) as { config?: SearchConfig }
      if (data.config) applyConfig(data.config)
      setNotice('Настройки поиска сброшены')
    } catch (e) {
      setError(errorText(e, 'Не удалось сбросить настройки'))
    } finally {
      setBusy(false)
    }
  }

  const fetchPrompts = async () => {
    const data = await readJsonRef.current(
      await apiRef.current('/api/admin/search/prompts'),
    ) as PromptList
    setPrompts(data)
    return data
  }

  const activatePrompt = async (kind: PromptKind, row: PromptRow) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await readJsonRef.current(
        await apiRef.current(`/api/admin/search/prompts/${row.id}/activate`, {
          method: 'POST',
          body: JSON.stringify({ kind }),
        }),
      )
      const list = await fetchPrompts()
      setDrafts(prev => ({ ...prev, [kind]: activePromptText(list[kind]) }))
      setNotice(`Активирована версия v${row.version}`)
    } catch (e) {
      setError(errorText(e, 'Не удалось активировать версию'))
    } finally {
      setBusy(false)
    }
  }

  const createVersion = async (kind: PromptKind) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await readJsonRef.current(
        await apiRef.current('/api/admin/search/prompts', {
          method: 'POST',
          body: JSON.stringify({ kind, prompt: drafts[kind] }),
        }),
      ) as PromptRow
      await fetchPrompts()
      setDrafts(prev => ({ ...prev, [kind]: created.prompt }))
      setNotice(`Создана версия v${created.version}`)
    } catch (e) {
      setError(errorText(e, 'Не удалось создать версию промта'))
    } finally {
      setBusy(false)
    }
  }

  const resetPrompts = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await readJsonRef.current(
        await apiRef.current('/api/admin/search/prompts/reset', { method: 'POST' }),
      )
      const list = await fetchPrompts()
      setDrafts(draftsFrom(list))
      setNotice('Промты сброшены к дефолтам')
    } catch (e) {
      setError(errorText(e, 'Не удалось сбросить промты'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Поиск</p>
          <h2 className="display-title mt-2 text-3xl">Поиск: тестовый стенд</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!config || busy}
            onClick={() => void resetConfig()}
            className="action-secondary"
          >
            Сбросить
          </button>
          <button
            type="button"
            disabled={!config || busy}
            onClick={() => void saveConfig()}
            className="action-primary"
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {error && (
        <p className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{notice}</p>
      )}

      {config ? (
        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-3 border p-3 text-sm">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                className="size-4 accent-primary"
              />
              <span className="font-medium">Стенд включён</span>
            </label>
            <label className="flex items-center gap-3 border p-3 text-sm">
              <input
                type="checkbox"
                checked={config.visual_enabled}
                onChange={e => setConfig({ ...config, visual_enabled: e.target.checked })}
                className="size-4 accent-primary"
              />
              <span className="font-medium">Визуальный поиск (search_by_image)</span>
            </label>
            <label className="flex items-center gap-3 border p-3 text-sm">
              <input
                type="checkbox"
                checked={config.price_check_enabled}
                onChange={e => setConfig({ ...config, price_check_enabled: e.target.checked })}
                className="size-4 accent-primary"
              />
              <span className="font-medium">Парсить цену и наличие со страниц результатов</span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-2 block">Модель зрения</label>
              <input
                value={config.vision_model}
                onChange={e => setConfig({ ...config, vision_model: e.target.value })}
                className={`${inputClass} font-mono text-xs`}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Модель сетки</label>
              <input
                value={config.grid_model}
                onChange={e => setConfig({ ...config, grid_model: e.target.value })}
                className={`${inputClass} font-mono text-xs`}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Разрешение сетки</label>
              <select
                value={config.grid_resolution}
                onChange={e => setConfig({ ...config, grid_resolution: e.target.value })}
                className={selectClass}
              >
                {GRID_RESOLUTIONS.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <label className="eyebrow mb-2 block">Пропорции сетки</label>
              <select
                value={config.grid_aspect}
                onChange={e => setConfig({ ...config, grid_aspect: e.target.value })}
                className={selectClass}
              >
                {GRID_ASPECTS.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="eyebrow mb-2 block">Регион</label>
              <input
                value={config.region}
                onChange={e => setConfig({ ...config, region: e.target.value })}
                className={`${inputClass} font-mono text-xs`}
                placeholder="213"
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Лимит поиска</label>
              <input
                type="number"
                min={1}
                max={100}
                value={config.search_limit}
                onChange={e => setConfig({ ...config, search_limit: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Макс. объектов</label>
              <input
                type="number"
                min={1}
                max={20}
                value={config.max_objects}
                onChange={e => setConfig({ ...config, max_objects: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Ключ «купить»</label>
              <input
                value={config.buy_keyword}
                onChange={e => setConfig({ ...config, buy_keyword: e.target.value })}
                className={`${inputClass} font-mono text-xs`}
                placeholder="купить"
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Проверять страниц</label>
              <input
                type="number"
                min={0}
                max={20}
                value={config.price_check_limit}
                onChange={e => setConfig({ ...config, price_check_limit: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Парсить параллельно</label>
              <input
                type="number"
                min={1}
                max={5}
                value={config.price_check_concurrency}
                onChange={e => setConfig({ ...config, price_check_concurrency: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Макс. стоимость run, $</label>
              <input
                type="number"
                min={0.01}
                max={10}
                step={0.01}
                value={config.max_run_cost_usd}
                onChange={e => setConfig({ ...config, max_run_cost_usd: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">TTL кэша, ч</label>
              <input
                type="number"
                min={1}
                max={168}
                value={config.cache_ttl_hours}
                onChange={e => setConfig({ ...config, cache_ttl_hours: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Yandex web, $/запрос (день)</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.0001}
                value={config.yandex_web_cost_usd}
                onChange={e => setConfig({ ...config, yandex_web_cost_usd: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Yandex web, $/запрос (ночь)</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.0001}
                value={config.yandex_web_night_cost_usd}
                onChange={e => setConfig({ ...config, yandex_web_night_cost_usd: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Yandex image, $/запрос</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.0001}
                value={config.yandex_image_cost_usd}
                onChange={e => setConfig({ ...config, yandex_image_cost_usd: Number(e.target.value) })}
                className={numberClass}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Тариф Yandex Search API: web-поиск $4/1000 днём и $3/1000 ночью (00:00–07:59 UTC+3), image-поиск $7.5/1000, без НДС. Ошибки и auth-ошибки не тарифицируются. Стоимость vision/grid/ячеек берётся из фактического ответа OpenRouter.
          </p>

          <label className="block">
            <span className="eyebrow mb-2 block">Домены (через запятую)</span>
            <textarea
              value={domainsDraft}
              onChange={e => setDomainsDraft(e.target.value)}
              rows={3}
              className="w-full border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-primary"
            />
          </label>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {loading ? 'Загружаем настройки…' : 'Настройки не загружены.'}
        </p>
      )}

      {prompts && (
        <div className="space-y-6 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Промты</h3>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resetPrompts()}
              className="action-secondary"
            >
              Сбросить дефолты промтов
            </button>
          </div>

          {PROMPT_KINDS.map(kind => (
            <div key={kind} className="space-y-3 border p-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">{PROMPT_LABELS[kind]}</h4>
                <div className="flex flex-wrap gap-2">
                  {prompts[kind].length === 0 ? (
                    <span className="text-xs text-muted-foreground">Версий пока нет.</span>
                  ) : prompts[kind].map(row => (
                    <span
                      key={row.id}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                    >
                      <span className={row.active ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                        v{row.version}{row.active ? ' · активный' : ''}
                      </span>
                      {!row.active && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void activatePrompt(kind, row)}
                          className="font-medium text-primary hover:underline"
                        >
                          Активировать
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <textarea
                rows={8}
                value={drafts[kind]}
                onChange={e => setDrafts(prev => ({ ...prev, [kind]: e.target.value }))}
                className="w-full border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-primary"
              />

              <button
                type="button"
                disabled={busy}
                onClick={() => void createVersion(kind)}
                className="action-primary"
              >
                Новая версия
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 border-t pt-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="eyebrow">Пайплайн</p>
          {jobId && <button type="button" onClick={() => setJobId(null)} className="action-secondary">Новый job</button>}
        </div>
        <SearchPipeline jobId={jobId} api={api} onJobCreated={id => setJobId(id)} />
      </div>
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Check, LoaderCircle, Search, X } from 'lucide-react'

type Candidate = {
  id: number
  title: string
  price: number | null
  currency: string
  store: string | null
  image_url: string | null
  url: string
  match_score: number | null
  status: 'verified' | 'alternative'
  checked_at: string | null
}

type ProcurementItem = {
  id: number
  layer: string
  category: string
  label: string
  search_mode: string
  status: string
  note: string | null
  candidates: Candidate[]
}

type ProcurementRun = {
  id: string
  status: string
  stage: string | null
  error: string | null
  credit_refunded: boolean
  items: ProcurementItem[]
}

const LAYERS: Array<[string, string]> = [
  ['hero', 'Мебель и свет'],
  ['finish', 'Отделка'],
  ['builtin', 'Техника и сантехника'],
  ['textile', 'Текстиль'],
  ['completeness', 'Что ещё понадобится'],
]

const rub = (value: number | null) => value === null
  ? 'Цена не найдена'
  : new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'

const itemStatus = (item: ProcurementItem) => {
  if (item.status === 'rule_based') return 'нужно уточнить'
  if (item.status === 'needs_input') return 'нужно уточнить'
  if (item.status === 'unresolved') return 'не найдено'
  if (item.status === 'error') return 'ошибка'
  if (item.status === 'skipped') return 'пропущено'
  if (item.candidates.length) return `${item.candidates.length} ${item.candidates.length === 1 ? 'вариант' : 'варианта'}`
  return 'ищем…'
}

export function ProcurementPanel({
  renderId,
  open,
  onClose,
  onCreditsChanged,
}: {
  renderId: string
  open: boolean
  onClose: () => void
  onCreditsChanged?: () => void | Promise<void>
}) {
  const [run, setRun] = useState<ProcurementRun | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setRun(null)
      setError('')
      setStarting(false)
    }
  }, [open, renderId])

  useEffect(() => {
    if (!run || !['queued', 'processing'].includes(run.status)) return
    const timer = setInterval(async () => {
      const r = await fetch(`/api/procurement/${run.id}`).catch(() => null)
      if (!r?.ok) return
      const next = await r.json().catch(() => null)
      if (next) setRun(next)
    }, 2000)
    return () => clearInterval(timer)
  }, [run?.id, run?.status])

  const start = async () => {
    setStarting(true)
    setError('')
    try {
      const r = await fetch(`/api/renders/${encodeURIComponent(renderId)}/procurement`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(r.status === 402 ? 'Не хватает кредита. Пополните баланс в кабинете.' : (data.error || 'Не удалось запустить подбор'))
        return
      }
      setRun(data)
      await onCreditsChanged?.()
    } catch {
      setError('Не удалось запустить подбор')
    } finally {
      setStarting(false)
    }
  }

  const grouped = useMemo(() => {
    if (!run) return []
    return LAYERS.map(([layer, label]) => ({
      layer,
      label,
      items: run.items.filter(item => item.layer === layer),
    })).filter(group => group.items.length)
  }, [run])

  if (!open) return null

  const busy = run && ['queued', 'processing'].includes(run.status)
  const done = run?.status === 'done'
  const progress = !run ? 0 : done ? 100 : run.status === 'error' ? 100 : Math.min(92, 12 + run.items.filter(item => item.status !== 'pending' && item.status !== 'searching').length * 6)

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-foreground/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Подбор товаров" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="mx-auto w-full max-w-5xl bg-background p-5 shadow-xl sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b pb-5">
          <div>
            <p className="eyebrow">Подбор товаров</p>
            <h2 className="display-title mt-2 text-3xl sm:text-4xl">Что купить по этому дизайну</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Ищем реальные карточки в магазинах, проверяем цену и ссылку. Без сметы и количества — только список товаров.</p>
          </div>
          <button type="button" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center border hover:bg-muted" aria-label="Закрыть"><X className="size-5" /></button>
        </div>

        {!run && (
          <div className="mt-6 border p-5 sm:p-6">
            <div className="flex items-start gap-3"><Search className="mt-0.5 size-5 shrink-0 text-primary-text" /><div><p className="font-medium">Подберём товары по выбранному дизайну</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Разберём 5–8 ключевых предметов и отделку, найдём похожие товары в магазинах. Это стоит 1 кредит. Повторное открытие результата — бесплатно.</p></div></div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={start} disabled={starting} className="action-primary min-h-12 px-6">{starting ? <><LoaderCircle className="size-4 animate-spin" /> Запускаем…</> : <>Начать поиск · 1 кредит <ArrowUpRight className="size-4" /></>}</button>
              <button type="button" onClick={onClose} className="action-secondary min-h-12 px-6">Позже</button>
            </div>
            {error && <p className="mt-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Если поиск не найдёт ни одного проверенного товара или упадёт, кредит вернётся автоматически.</p>
          </div>
        )}

        {run && (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div>
                <p className="text-sm font-medium">{run.status === 'done' ? 'Подбор готов' : run.status === 'error' ? 'Не удалось подобрать товары' : 'Идёт поиск товаров…'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{run.stage ? String(run.stage).slice(0, 120) : 'Проверяем карточки и ссылки'}</p>
              </div>
              {run.credit_refunded && <span className="border border-primary/40 bg-primary/5 px-3 py-2 text-xs">Кредит возвращён</span>}
              {run.status === 'error' && <button type="button" onClick={start} className="action-primary min-h-11 px-4">Попробовать снова · 1 кредит</button>}
            </div>

            {busy && (
              <div className="mt-5">
                <div className="h-1 w-full overflow-hidden bg-border"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">Обработано {run.items.filter(item => !['pending', 'searching'].includes(item.status)).length} из {run.items.length || '…'}</p>
              </div>
            )}

            {error && <p className="mt-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
            {run.error && <p className="mt-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{run.error}</p>}

            {grouped.map(group => (
              <section key={group.layer} className="mt-8" aria-labelledby={`proc-${group.layer}`}>
                <div className="flex items-baseline justify-between gap-3 border-b pb-3">
                  <h3 id={`proc-${group.layer}`} className="eyebrow">{group.label}</h3>
                  <span className="text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? 'позиция' : 'позиции'}</span>
                </div>
                <div className="divide-y">
                  {group.items.map(item => (
                    <div key={item.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.label}</p>
                        <span className={`text-xs ${item.candidates.length ? 'text-primary-text' : 'text-muted-foreground'}`}>{itemStatus(item)}</span>
                      </div>
                      {item.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.note}</p>}
                      {item.candidates.length > 0 && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {item.candidates.map(candidate => (
                            <a key={candidate.id} href={candidate.url} target="_blank" rel="noopener nofollow" className="group flex min-w-0 flex-col border transition-colors hover:border-foreground">
                              <div className="aspect-[4/3] overflow-hidden bg-muted">{candidate.image_url ? <img src={candidate.image_url} alt={candidate.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Нет фото</div>}</div>
                              <div className="flex flex-1 flex-col p-3">
                                <p className="line-clamp-2 text-xs font-medium leading-5">{candidate.title}</p>
                                <div className="mt-2 flex items-center justify-between gap-2"><span className="text-sm font-medium">{rub(candidate.price)}</span><span className="text-[11px] text-muted-foreground">{candidate.match_score !== null ? `${candidate.match_score}%` : ''}</span></div>
                                <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground"><span className="truncate">{candidate.store}</span><span className="inline-flex items-center gap-1">{candidate.status === 'verified' ? <><Check className="size-3" /> проверено</> : 'альтернатива'}</span></div>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                      {!item.candidates.length && item.status === 'unresolved' && <p className="mt-2 text-xs text-muted-foreground">Подходящий товар не найден. Можно попробовать позже или искать вручную.</p>}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">Цены и наличие проверены на момент поиска. Перед покупкой сверьте размеры, цвет и условия магазина.</p>
              <button type="button" onClick={onClose} className="action-secondary min-h-11 px-5">Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { ExternalLink, LoaderCircle, Search } from 'lucide-react'
import { goal } from '@/lib/analytics'

export type ProductOffer = {
  id: string
  name: string
  price: number | null
  currency: string
  merchant?: string | null
  url: string | null
  image_url?: string | null
  erid?: string | null
  score?: number | null
}

export type ProductMatch = {
  item: { key?: string; label: string; category: string }
  offers: ProductOffer[]
  note?: string
}

const rub = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'

const SEARCH_STEPS = [
  { label: 'Разбираем кадр', hint: 'Архитектор выделяет главные позиции' },
  { label: 'Подбираем в каталоге', hint: 'Ищем похожие товары по материалам и цвету' },
  { label: 'Готово', hint: 'Показываем список с ценами и ссылками' },
] as const

export function ProcurementPanel({ renderId, image, initialProducts, productsEnabled }: {
  renderId: string
  image: string | null
  initialProducts: ProductMatch[]
  productsEnabled: boolean
}) {
  const [products, setProducts] = useState<ProductMatch[]>(initialProducts)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const runSearch = async () => {
    if (busy || !renderId) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/renders/${encodeURIComponent(renderId)}/product-search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { setError('Войдите, чтобы подобрать товары'); return }
      if (!r.ok) throw new Error(d.error || 'Не удалось подобрать товары')
      setProducts(Array.isArray(d.analysis?.products) ? d.analysis.products : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подобрать товары')
    } finally {
      setBusy(false)
    }
  }

  const hasProducts = products.length > 0

  if (!productsEnabled) {
    return (
      <div className="border border-foreground/25 p-6">
        <p className="eyebrow">Поиск товаров</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Подбор товаров выключен в админке.</p>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {image ? (
        <div className="relative bg-foreground">
          <img src={image} alt="Дизайн комнаты" className="max-h-[46svh] w-full object-contain" />
        </div>
      ) : null}

      {!hasProducts && !busy && (
        <div className="mt-5 border border-foreground/25 p-5">
          <p className="eyebrow">Подбор по кадру</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Подберём похожие товары по материалам и цвету из вашего дизайна. Цены — ориентир, ссылки ведут в магазины.</p>
          {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
          <button type="button" onClick={() => void runSearch()} disabled={busy} className="action-primary mt-5 w-full sm:w-auto">
            <Search className="size-4" /> Запустить поиск
          </button>
        </div>
      )}

      {busy && !hasProducts && (
        <div className="mt-5 border border-foreground/25 p-6" role="status" aria-live="polite">
          <div className="flex items-start gap-4">
            <LoaderCircle className="mt-1 size-7 shrink-0 animate-spin text-primary-text motion-reduce:animate-none" />
            <div>
              <h2 className="text-lg font-medium">Ищем товары</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Обычно 10–60 секунд. Не закрывайте вкладку — иначе поиск прервётся.</p>
            </div>
          </div>
          <div className="mt-6 h-1 w-full overflow-hidden bg-border">
            <div className="rv-progress h-full w-1/3 bg-primary" />
          </div>
          <ol className="mt-6 space-y-2.5">
            {SEARCH_STEPS.map((step, index) => (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                {index === 0
                  ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary-text motion-reduce:animate-none" />
                  : <span className="size-4 shrink-0 rounded-full border" />}
                <span className={index === 0 ? 'text-foreground' : 'text-muted-foreground'}>{step.label}</span>
                {index === 0 && <span className="ml-auto font-mono text-[11px] text-muted-foreground">сейчас</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {hasProducts && (
        <div className="mt-5 space-y-5">
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Найдено по кадру</p>
            <button type="button" onClick={() => void runSearch()} disabled={busy} className="action-secondary min-h-11 px-4 text-sm">
              {busy ? <><LoaderCircle className="size-3.5 animate-spin" /> Ищем…</> : 'Обновить подбор'}
            </button>
          </div>
          <div className="divide-y border-y">
            {products.map((match, index) => (
              <section key={`${match.item.category}-${index}`} className="py-4">
                <p className="text-sm font-medium">{match.item.label}</p>
                {match.offers.length ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {match.offers.map(offer => (
                      <div key={offer.id} className="w-44 shrink-0 border border-foreground/20">
                        <div className="h-24 w-full overflow-hidden bg-muted">
                          {offer.image_url
                            ? <img src={offer.image_url} alt={offer.name} className="h-full w-full object-cover" loading="lazy" />
                            : <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">Нет фото</div>}
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-2 min-w-0 text-[11px] font-medium leading-4">{offer.name}</p>
                          <p className="mt-1 text-xs font-medium">{offer.price === null ? 'Цена не указана' : rub(offer.price)}</p>
                          {offer.url ? (
                            <a href={offer.url} target="_blank" rel="noopener nofollow sponsored" onClick={() => goal('product_click', { source: 'procurement', url: offer.url })} className="mt-1 inline-flex min-h-8 items-center gap-1 text-[11px] underline underline-offset-2">
                              {offer.merchant || 'в магазин'} <ExternalLink className="size-3 shrink-0" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-1 text-xs text-muted-foreground">{match.note || 'Нет в каталоге'}</p>}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

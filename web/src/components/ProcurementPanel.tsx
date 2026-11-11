import { useState } from 'react'
import { KitIcon } from './KitIcon'
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

const MARKETPLACES = [
  { key: 'hoff', label: 'Hoff', url: (q: string) => `https://hoff.ru/search/?q=${encodeURIComponent(q)}` },
  { key: 'ozon', label: 'Ozon', url: (q: string) => `https://www.ozon.ru/search/?text=${encodeURIComponent(q)}` },
  { key: 'wb', label: 'WB', url: (q: string) => `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(q)}` },
  { key: 'ym', label: 'Я.Маркет', url: (q: string) => `https://market.yandex.ru/search?text=${encodeURIComponent(q)}` },
] as const

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
      <div className="border bg-card p-6">
        <p className="eyebrow">Поиск товаров</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Подбор товаров выключен в админке.</p>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {image ? (
        <div className="relative bg-secondary">
          <img src={image} alt="Дизайн комнаты" className="max-h-[46svh] w-full object-contain" />
        </div>
      ) : null}

      {!hasProducts && !busy && (
        <div className="mt-5 border bg-card p-5">
          <p className="eyebrow">Подбор по кадру</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Подберём похожие товары по материалам и цвету из вашего дизайна. Цены — ориентир, ссылки ведут в магазины.</p>
          {error && <p className="k-er" role="alert"><KitIcon name="warn" className="mt-0.5" /><span>{error}</span></p>}
          <button type="button" onClick={() => void runSearch()} disabled={busy} className="k-btn k-btn--primary mt-5 w-full sm:w-auto">
            <KitIcon name="q" /> Запустить поиск
          </button>
        </div>
      )}
      {busy && !hasProducts && (
        <div className="mt-5 border bg-card p-6" role="status" aria-live="polite">
          <div className="flex items-start gap-4">
            <KitIcon name="sp" spin className="mt-1 size-7 shrink-0 text-primary-text" />
            <div>
              <h2 className="text-lg font-medium">Ищем товары</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Обычно 10–60 секунд. Не закрывайте вкладку — иначе поиск прервётся.</p>
            </div>
          </div>
          <div className="k-pb mt-6"><i className="rv-progress w-1/3" /></div>
          <ol className="k-steps">
            {SEARCH_STEPS.map((step, index) => (
              <li key={step.label}>
                <span className={`d${index === 0 ? ' go' : ''}`}>{index === 0 ? <KitIcon name="sp" spin className="size-3.5" /> : null}</span>
                <span className={index === 0 ? 'text-foreground' : 'text-muted-foreground'}>{step.label}</span>
                {index === 0 && <em>сейчас</em>}
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
            <button type="button" onClick={() => void runSearch()} disabled={busy} className="k-btn k-btn--s">
              {busy ? <><KitIcon name="sp" spin /> Ищем…</> : 'Обновить подбор'}
            </button>
          </div>
          <div className="divide-y border-y">
            {products.map((match, index) => (
              <section key={`${match.item.category}-${index}`} className="py-4">
                <p className="text-sm font-medium">{match.item.label}</p>
                {match.offers.length ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {match.offers.map(offer => (
                      <div key={offer.id} className="k-card w-44 shrink-0">
                        <div className="h-24 w-full overflow-hidden bg-secondary">
                          {offer.image_url
                            ? <img src={offer.image_url} alt={offer.name} className="h-full w-full object-cover" loading="lazy" />
                            : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Нет фото</div>}
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-2 min-w-0 text-xs font-medium leading-4">{offer.name}</p>
                          <p className="mt-1 text-xs font-medium">{offer.price === null ? 'Цена не указана' : rub(offer.price)}</p>
                          {offer.url ? (
                            <a href={offer.url} target="_blank" rel="noopener nofollow sponsored" onClick={() => goal('product_click', { source: 'procurement', url: offer.url })} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs underline underline-offset-2">
                              {offer.merchant || 'в магазин'} <KitIcon name="ur" className="size-3.5 shrink-0" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-1 text-xs text-muted-foreground">{match.note || 'Нет в каталоге'}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Найти похожее:</span>
                  {MARKETPLACES.map(market => (
                    <a
                      key={market.key}
                      href={market.url(match.item.label)}
                      target="_blank"
                      rel="noopener nofollow sponsored"
                      onClick={() => goal('product_click', { source: market.key, query: match.item.label })}
                      className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground"
                    >
                      {market.label}
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

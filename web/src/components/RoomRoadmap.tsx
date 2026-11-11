import { useMemo, useState } from 'react'
import { KitIcon } from './KitIcon'
import { GuideIcon } from '@/components/GuideIcon'
import { groupRoadmap, type RoadmapGroup, type RoadmapItem } from '@/lib/roadmap'
import { cn } from '@/lib/utils'

// Ссылки на поиск по позиции: это выдача магазина, а не подтверждённая карточка.
const SHOPS = [
  { key: 'hoff', label: 'Hoff', url: (q: string) => `https://hoff.ru/search/?q=${encodeURIComponent(q)}` },
  { key: 'ozon', label: 'Ozon', url: (q: string) => `https://www.ozon.ru/search/?text=${encodeURIComponent(q)}` },
  { key: 'wb', label: 'WB', url: (q: string) => `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(q)}` },
  { key: 'ym', label: 'Я.Маркет', url: (q: string) => `https://market.yandex.ru/search?text=${encodeURIComponent(q)}` },
] as const

export type RoadmapActions = {
  onGenerate: () => void
  onRegenerate: () => void
  onShare: () => void
  onToggleDone: (item: RoadmapItem) => void
  onToggleActive: (item: RoadmapItem) => void
  onComment: (item: RoadmapItem, comment: string) => void
  onAdd: (group: RoadmapGroup, text: string) => Promise<boolean>
  onDelete: (item: RoadmapItem) => void
}


function Progress({ items }: { items: RoadmapItem[] }) {
  const active = items.filter(item => item.active)
  const done = active.filter(item => item.done).length
  const percent = active.length ? Math.round((done / active.length) * 100) : 0
  return (
    <div className="border bg-card p-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm">Куплено <b>{done}</b> из {active.length}</p>
        <span className="font-mono text-xs text-primary-text">{percent}%</span>
      </div>
      <div className="k-pb mt-2">
        <i className="transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="border bg-card p-4">
        <p className="eyebrow">Роадмап покупок</p>
        <h2 className="display-title mt-2 text-3xl sm:text-4xl">План закупки по шагам</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Что нужно купить для электрики, стен, пола, потолка, света и финиша — по порядку, с чек-листом и прогрессом.</p>
      </div>
      {[0, 1, 2].map(index => (
        <div key={index} className="border bg-card opacity-60">
          <div className="flex items-center gap-3 border-b p-4">
            <span className="size-4 bg-secondary" />
            <span className="h-3 w-40 max-w-[60%] bg-secondary" />
          </div>
          <div className="space-y-3 p-3">
            {[0, 1, 2].map(row => (
              <div key={row} className="flex items-center gap-3">
                <span className="size-5 shrink-0 border" />
                <span className="h-3 flex-1 bg-secondary" style={{ maxWidth: `${80 - row * 12}%` }} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="border bg-card p-4">
        <p className="eyebrow">Доступно после покупки</p>
        <p className="mt-2 text-sm leading-6">Роадмап покупок открывается после покупки кредитов. Сейчас видно структуру плана.</p>
        <a href="/cabinet#credits" className="k-btn k-btn--primary mt-4 w-full sm:w-auto">Купить кредиты <KitIcon name="r" /></a>
      </div>
    </div>
  )
}

function EmptyRoadmap({ busy, error, onGenerate }: { busy: boolean; error: string; onGenerate: () => void }) {
  return (
    <div className="border bg-card p-5 sm:p-7">
      <p className="eyebrow">Роадмап покупок</p>
      <h2 className="display-title mt-3 text-2xl sm:text-3xl">Что нужно купить</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Соберём список закупки по этапам: электрика, стены и фартук, пол, потолок, освещение, окна, мебель. Только то, что реально нужно этому интерьеру.</p>
      {error && <p className="k-er" role="alert"><KitIcon name="warn" className="mt-0.5" /><span>{error}</span></p>}
      <button type="button" onClick={onGenerate} disabled={busy} className="k-btn k-btn--primary mt-5 w-full sm:w-auto">
        {busy ? <><KitIcon name="sp" spin /> Составляем…</> : <>Составить роадмап покупок <KitIcon name="r" /></>}
      </button>
    </div>
  )
}

export function RoadmapTab({ items, hasPurchased, busy, error, actions }: {
  items: RoadmapItem[]
  hasPurchased: boolean
  busy: boolean
  error: string
  actions: RoadmapActions
}) {
  const [commentId, setCommentId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [addFor, setAddFor] = useState<string | null>(null)
  const [addText, setAddText] = useState('')
  const groups = useMemo(() => groupRoadmap(items), [items])

  if (!hasPurchased) return <Skeleton />
  if (!items.length) return <EmptyRoadmap busy={busy} error={error} onGenerate={actions.onGenerate} />

  const openComment = (item: RoadmapItem) => {
    setCommentId(item.id)
    setCommentDraft(item.comment || '')
  }
  const saveComment = (item: RoadmapItem) => {
    actions.onComment(item, commentDraft.trim())
    setCommentId(null)
    setCommentDraft('')
  }
  const submitAdd = async (group: RoadmapGroup) => {
    const text = addText.trim()
    if (!text) return
    const ok = await actions.onAdd(group, text)
    if (ok) { setAddText(''); setAddFor(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Роадмап покупок</p>
          <h2 className="display-title mt-2 text-3xl sm:text-4xl">План закупки</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={actions.onRegenerate} disabled={busy} className="k-btn k-btn--s">
            {busy ? <KitIcon name="sp" spin /> : <KitIcon name="re" />} Перегенерировать
          </button>
          <button type="button" onClick={actions.onShare} className="k-btn k-btn--s">
            <KitIcon name="sh" /> Поделиться
          </button>
        </div>
      </div>

      <Progress items={items} />
      {error && <p className="k-ban k-ban--bad" role="alert">{error}</p>}

      <div className="space-y-3">
        {groups.map(group => {
          const active = group.items.filter(item => item.active)
          const done = active.filter(item => item.done).length
          return (
            <details key={group.key} className="group border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <GuideIcon name={group.icon} />
                <span className="min-w-0 flex-1 text-sm font-medium">{group.title}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{done} из {active.length}</span>
                <KitIcon name="cd" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t">
                <ul>
                  {group.items.map(item => (
                    <li key={item.id} className={cn('border-t first:border-t-0', !item.active && 'opacity-50')}>
                      <div className="flex items-start gap-3 px-3 py-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.done}
                          aria-label={item.done ? 'Отметить некупленным' : 'Отметить купленным'}
                          onClick={() => actions.onToggleDone(item)}
                          disabled={!item.active}
                          className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center border transition-colors disabled:pointer-events-none',
                            item.done ? 'border-foreground bg-foreground text-background' : 'hover:border-foreground')}
                        >
                          {item.done && <KitIcon name="ok" className="size-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm leading-5', (item.done || !item.active) && 'text-muted-foreground line-through')}>{item.text}</p>
                          {item.comment && commentId !== item.id && <p className="mt-1 text-xs leading-5 text-muted-foreground">· {item.comment}</p>}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-primary-text underline decoration-border underline-offset-2">Где купить</summary>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {SHOPS.map(shop => (
                                <a key={shop.key} href={shop.url(item.text)} target="_blank" rel="noopener nofollow sponsored" className="inline-flex min-h-9 items-center underline underline-offset-2 hover:text-foreground">{shop.label}</a>
                              ))}
                            </div>
                          </details>
                          {commentId === item.id && (
                            <div className="mt-2">
                              <input
                                autoFocus
                                value={commentDraft}
                                onChange={event => setCommentDraft(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') saveComment(item); if (event.key === 'Escape') setCommentId(null) }}
                                placeholder="Комментарий"
                                className="k-field text-sm"
                                style={{ minHeight: 44 }}
                              />
                              <div className="mt-1 flex gap-3 text-xs">
                                <button type="button" onClick={() => saveComment(item)} className="underline decoration-border underline-offset-2 hover:decoration-foreground">Сохранить</button>
                                <button type="button" onClick={() => setCommentId(null)} className="text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground">Отмена</button>
                              </div>
                            </div>
                          )}
                          {!item.active && <button type="button" onClick={() => actions.onToggleActive(item)} className="mt-1 text-xs text-primary-text underline decoration-border underline-offset-2">Вернуть в список</button>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => openComment(item)} className="k-btn k-btn--icon size-11 min-h-0" aria-label="Комментарий"><KitIcon name="info" /></button>
                          {item.active ? (
                            <button type="button" onClick={() => actions.onToggleActive(item)} className="k-btn k-btn--icon size-11 min-h-0" aria-label="Не нужно"><KitIcon name="x" /></button>
                          ) : (
                            <button type="button" onClick={() => actions.onToggleActive(item)} className="k-btn k-btn--icon size-11 min-h-0" aria-label="Вернуть в список"><KitIcon name="plus" /></button>
                          )}
                          {item.is_custom && (
                            <button type="button" onClick={() => actions.onDelete(item)} className="k-btn k-btn--icon size-11 min-h-0" aria-label="Удалить свою строку"><KitIcon name="tr" /></button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t p-3">
                  {addFor === group.key ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        autoFocus
                        value={addText}
                        onChange={event => setAddText(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') void submitAdd(group); if (event.key === 'Escape') { setAddFor(null); setAddText('') } }}
                        placeholder="Своя строка"
                        className="k-field min-w-0 flex-1 text-sm"
                        style={{ minHeight: 44 }}
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void submitAdd(group)} className="k-btn k-btn--s">Добавить</button>
                        <button type="button" onClick={() => { setAddFor(null); setAddText('') }} className="inline-flex min-h-11 items-center justify-center px-2 text-xs text-muted-foreground hover:text-foreground">Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setAddFor(group.key); setAddText('') }} className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                      <KitIcon name="plus" /> Добавить строку
                    </button>
                  )}
                </div>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

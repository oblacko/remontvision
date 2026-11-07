import { useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Eye, EyeOff, LoaderCircle, MessageSquare, Plus, RefreshCw, Share2, Trash2 } from 'lucide-react'
import { GuideIcon } from '@/components/GuideIcon'
import { groupRoadmap, type RoadmapGroup, type RoadmapItem } from '@/lib/roadmap'
import { cn } from '@/lib/utils'

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
    <div className="border border-foreground/25 p-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm">Куплено <b>{done}</b> из {active.length}</p>
        <span className="font-mono text-xs text-primary-text">{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden bg-border">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="border border-foreground/25 p-4">
        <p className="eyebrow">Роадмап покупок</p>
        <h2 className="display-title mt-2 text-3xl sm:text-4xl">План закупки по шагам</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Что нужно купить для электрики, стен, пола, потолка, света и финиша — по порядку, с чек-листом и прогрессом.</p>
      </div>
      {[0, 1, 2].map(index => (
        <div key={index} className="border border-foreground/25 opacity-60">
          <div className="flex items-center gap-3 border-b border-foreground/25 p-4">
            <span className="size-4 bg-muted" />
            <span className="h-3 w-40 max-w-[60%] bg-muted" />
          </div>
          <div className="space-y-3 p-3">
            {[0, 1, 2].map(row => (
              <div key={row} className="flex items-center gap-3">
                <span className="size-5 shrink-0 border border-foreground/30" />
                <span className="h-3 flex-1 bg-muted" style={{ maxWidth: `${80 - row * 12}%` }} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="border border-foreground bg-primary/5 p-4">
        <p className="eyebrow">Доступно после покупки</p>
        <p className="mt-2 text-sm leading-6">Роадмап покупок открывается после покупки кредитов. Сейчас видно структуру плана.</p>
        <a href="/cabinet#credits" className="action-primary mt-4 w-full sm:w-auto">Купить кредиты <ArrowRight className="size-4" /></a>
      </div>
    </div>
  )
}

function EmptyRoadmap({ busy, error, onGenerate }: { busy: boolean; error: string; onGenerate: () => void }) {
  return (
    <div className="border border-foreground/25 p-5 sm:p-7">
      <p className="eyebrow">Роадмап покупок</p>
      <h2 className="display-title mt-3 text-2xl sm:text-3xl">Что нужно купить</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Соберём список закупки по этапам: электрика, стены и фартук, пол, потолок, освещение, окна, мебель. Только то, что реально нужно этому интерьеру.</p>
      {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
      <button type="button" onClick={onGenerate} disabled={busy} className="action-primary mt-5 w-full sm:w-auto">
        {busy ? <><LoaderCircle className="size-4 animate-spin" /> Составляем…</> : <>Составить роадмап покупок <ArrowRight className="size-4" /></>}
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
          <button type="button" onClick={actions.onRegenerate} disabled={busy} className="inline-flex min-h-10 items-center gap-2 border border-foreground/30 px-3 text-xs transition-colors hover:border-foreground disabled:opacity-50">
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Перегенерировать
          </button>
          <button type="button" onClick={actions.onShare} className="inline-flex min-h-10 items-center gap-2 border border-foreground px-3 text-xs transition-colors hover:bg-foreground hover:text-background">
            <Share2 className="size-3.5" /> Поделиться
          </button>
        </div>
      </div>

      <Progress items={items} />
      {error && <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}

      <div className="space-y-3">
        {groups.map(group => {
          const active = group.items.filter(item => item.active)
          const done = active.filter(item => item.done).length
          return (
            <details key={group.key} className="group border border-foreground/25">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <GuideIcon name={group.icon} />
                <span className="min-w-0 flex-1 text-sm font-medium">{group.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{done} из {active.length}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-foreground/25">
                <ul>
                  {group.items.map(item => (
                    <li key={item.id} className={cn('border-t border-foreground/10 first:border-t-0', !item.active && 'opacity-50')}>
                      <div className="flex items-start gap-3 px-3 py-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.done}
                          aria-label={item.done ? 'Отметить некупленным' : 'Отметить купленным'}
                          onClick={() => actions.onToggleDone(item)}
                          disabled={!item.active}
                          className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors disabled:pointer-events-none',
                            item.done ? 'border-foreground bg-primary text-primary-foreground' : 'border-foreground/40 hover:border-foreground')}
                        >
                          {item.done && <Check className="size-3.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm leading-5', (item.done || !item.active) && 'text-muted-foreground line-through')}>{item.text}</p>
                          {item.comment && commentId !== item.id && <p className="mt-1 text-xs leading-5 text-muted-foreground">· {item.comment}</p>}
                          {commentId === item.id && (
                            <div className="mt-2">
                              <input
                                autoFocus
                                value={commentDraft}
                                onChange={event => setCommentDraft(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') saveComment(item); if (event.key === 'Escape') setCommentId(null) }}
                                placeholder="Комментарий"
                                className="h-9 w-full border border-foreground/25 bg-background px-2 text-xs outline-none focus:border-foreground"
                              />
                              <div className="mt-1 flex gap-3 text-[11px]">
                                <button type="button" onClick={() => saveComment(item)} className="underline decoration-border underline-offset-2 hover:decoration-foreground">Сохранить</button>
                                <button type="button" onClick={() => setCommentId(null)} className="text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground">Отмена</button>
                              </div>
                            </div>
                          )}
                          {!item.active && <button type="button" onClick={() => actions.onToggleActive(item)} className="mt-1 text-[11px] text-primary-text underline decoration-border underline-offset-2">Вернуть в список</button>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => openComment(item)} className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label="Комментарий"><MessageSquare className="size-4" /></button>
                          {item.active ? (
                            <button type="button" onClick={() => actions.onToggleActive(item)} className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label="Не нужно"><EyeOff className="size-4" /></button>
                          ) : (
                            <button type="button" onClick={() => actions.onToggleActive(item)} className="flex size-8 items-center justify-center text-primary-text" aria-label="Вернуть в список"><Eye className="size-4" /></button>
                          )}
                          {item.is_custom && (
                            <button type="button" onClick={() => actions.onDelete(item)} className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-destructive" aria-label="Удалить свою строку"><Trash2 className="size-4" /></button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-foreground/25 p-3">
                  {addFor === group.key ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        autoFocus
                        value={addText}
                        onChange={event => setAddText(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') void submitAdd(group); if (event.key === 'Escape') { setAddFor(null); setAddText('') } }}
                        placeholder="Своя строка"
                        className="h-10 min-w-0 flex-1 border border-foreground/25 bg-background px-3 text-sm outline-none focus:border-foreground"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void submitAdd(group)} className="inline-flex min-h-10 items-center justify-center border border-foreground px-3 text-xs transition-colors hover:bg-foreground hover:text-background">Добавить</button>
                        <button type="button" onClick={() => { setAddFor(null); setAddText('') }} className="inline-flex min-h-10 items-center justify-center px-2 text-xs text-muted-foreground hover:text-foreground">Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setAddFor(group.key); setAddText('') }} className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                      <Plus className="size-4" /> Добавить строку
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

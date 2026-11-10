import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { KitIcon } from './KitIcon'
import { goal } from '@/lib/analytics'

// Задача = одна генерация пользователя. Берём из /api/my/generations.
export type GenTask = {
  id: string
  kind?: 'render' | 'breakdown' | 'roadmap'
  render_id?: string
  room_id: string
  style: string
  room_type?: string | null
  status: string
  error?: string | null
  error_stage?: string | null
  created_at: string
  image_url?: string | null
  photo_url?: string | null
}

type TasksContextValue = {
  tasks: GenTask[]
  activeCount: number
  refresh: () => void
  dismiss: (id: string) => void
  setPanelOpen: (open: boolean) => void
  panelOpen: boolean
}

const TasksContext = createContext<TasksContextValue>({
  tasks: [],
  activeCount: 0,
  refresh: () => {},
  dismiss: () => {},
  setPanelOpen: () => {},
  panelOpen: false,
})

export const useTasks = () => useContext(TasksContext)

const isTerminal = (task: GenTask) => task.status === 'done' || task.status === 'error'

function readDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem('rv-dismissed-tasks')
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<GenTask[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed)
  const [authed, setAuthed] = useState(false)
  const [panelOpen, setPanelOpenState] = useState(false)
  const primed = useRef(false)
  const seenDone = useRef<Set<string>>(new Set())
  const seenError = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/my/generations?with=breakdown,roadmap')
      if (r.status === 401) {
        setAuthed(false)
        setAll([])
        return
      }
      if (!r.ok) return
      const list = await r.json()
      const items: GenTask[] = Array.isArray(list) ? list : []
      if (primed.current) {
        for (const task of items) {
          if ((task.kind || 'render') !== 'render') continue
          if (task.status === 'done' && !seenDone.current.has(task.id)) {
            seenDone.current.add(task.id)
            goal('render_done', { room_id: task.room_id })
          }
          if (task.status === 'error' && !seenError.current.has(task.id)) {
            seenError.current.add(task.id)
            goal('render_error', { room_id: task.room_id, stage: task.error_stage || 'unknown' })
          }
        }
      } else {
        // Первый ответ только запоминаем: не считаем готовыми/ошибочными старые генерации.
        primed.current = true
        for (const task of items) {
          if (task.status === 'done') seenDone.current.add(task.id)
          if (task.status === 'error') seenError.current.add(task.id)
        }
      }
      setAuthed(true)
      setAll(items)
    } catch {
      /* сеть недоступна — оставляем прошлое состояние */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/me')
        const d = r.ok ? await r.json() : null
        if (cancelled) return
        if (d) {
          setAuthed(true)
          void refresh()
        }
      } catch {
        /* ignore */
      }
    })()
    return () => { cancelled = true }
  }, [refresh])

  // пока залогинен — опрашиваем задачи: часто при активных, редко в простое
  useEffect(() => {
    if (!authed) return
    const period = all.some(task => !isTerminal(task)) ? 6000 : 60000
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const id = window.setInterval(tick, period)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [authed, all, refresh])

  // пока не залогинен — изредка проверяем, не вошёл ли пользователь
  useEffect(() => {
    if (authed) return
    const id = window.setInterval(async () => {
      try {
        const r = await fetch('/api/me')
        const d = r.ok ? await r.json() : null
        if (d) {
          setAuthed(true)
          void refresh()
        }
      } catch {
        /* ignore */
      }
    }, 15000)
    return () => window.clearInterval(id)
  }, [authed, refresh])

  useEffect(() => {
    try { sessionStorage.setItem('rv-dismissed-tasks', JSON.stringify([...dismissed])) } catch { /* ignore */ }
  }, [dismissed])

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const setPanelOpen = useCallback((open: boolean) => setPanelOpenState(open), [])

  const tasks = useMemo(() => {
    const cutoff = Date.now() - 10 * 60 * 1000
    return all
      .filter(task => {
        if (dismissed.has(task.id)) return false
        if (!isTerminal(task)) return true
        const created = new Date(task.created_at).getTime()
        return Number.isFinite(created) && created > cutoff
      })
      .slice(0, 8)
  }, [all, dismissed])

  const activeCount = useMemo(() => tasks.filter(task => !isTerminal(task)).length, [tasks])

  const value = useMemo(
    () => ({ tasks, activeCount, refresh, dismiss, setPanelOpen, panelOpen }),
    [tasks, activeCount, refresh, dismiss, setPanelOpen, panelOpen],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

function TaskRow({ task, onDismiss }: { task: GenTask; onDismiss: () => void }) {
  const done = task.status === 'done'
  const error = task.status === 'error'
  const active = !done && !error
  const isBreakdown = task.kind === 'breakdown'
  const isRoadmap = task.kind === 'roadmap'
  const tabQuery = isBreakdown ? '?tab=design' : isRoadmap ? '?tab=roadmap' : ''
  const thumb = done ? task.image_url : task.photo_url
  const to = task.room_id
    ? `/room/${encodeURIComponent(task.room_id)}${tabQuery}`
    : '/cabinet'
  const doneLabel = isBreakdown ? 'Разбор готов' : isRoadmap ? 'Список готов' : 'Готово'
  const activeLabel = isBreakdown ? 'Идёт разбор' : isRoadmap ? 'Идёт закупка' : 'Идёт создание'
  const progressLabel = isBreakdown ? 'Разбор выполняется' : isRoadmap ? 'Закупка составляется' : 'Дизайн создаётся'
  const label = error ? 'Ошибка' : done ? doneLabel : activeLabel
  const labelClass = error ? 'text-destructive' : done ? 'text-primary-text' : 'text-muted-foreground'

  return (
    <li className="relative border-t border-foreground/15 first:border-t-0">
      <Link to={to} onClick={onDismiss} className="group flex gap-3 px-3 py-3 pr-8 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring">
        <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden border border-foreground/20 bg-secondary">
          {thumb
            ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <KitIcon name="img" className="size-5 text-muted-foreground" />}
          {active && <span className="absolute inset-0 bg-foreground/10" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{task.style}{task.room_type ? ` · ${task.room_type}` : ''}</span>
          <span className={`mt-0.5 block text-xs ${labelClass}`}>{label}</span>
          {active && (
            <span className="k-pb mt-2 block" role="progressbar" aria-label={progressLabel}>
              <span className="rv-progress block h-full w-1/3 bg-primary" />
            </span>
          )}
          {done && (
            <span className="mt-1 flex items-center gap-1 text-xs font-medium text-foreground">Открыть <KitIcon name="ur" className="size-3.5" /></span>
          )}
          {error && task.error && <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{task.error}</span>}
        </span>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        aria-label="Скрыть задачу"
      >
        <KitIcon name="x" className="size-3.5" />
      </button>
    </li>
  )
}

export function TaskDock() {
  const { tasks, activeCount, dismiss, panelOpen } = useTasks()
  const [collapsed, setCollapsed] = useState(false)
  if (panelOpen || !tasks.length) return null
  return (
    <aside className="fixed inset-x-3 bottom-3 z-[70] border border-foreground bg-card shadow-[4px_4px_0_oklch(var(--primary))] sm:bottom-4 sm:left-auto sm:right-4 sm:w-[24rem]" aria-label="Мои задачи">
      <button type="button" onClick={() => setCollapsed(value => !value)} className="flex w-full items-center justify-between gap-2 bg-foreground px-3 py-2 text-left text-background focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-background" aria-expanded={!collapsed}>
        <span className="flex min-w-0 items-center gap-2">
          {activeCount > 0
            ? <KitIcon name="sp" spin className="size-4 shrink-0" />
            : <KitIcon name="ok" className="size-4 shrink-0" />}
          <span className="truncate font-mono text-xs uppercase tracking-[0.18em]">Мои задачи</span>
          {activeCount > 0 && <span className="border border-background/40 px-1.5 py-0.5 font-mono text-xs leading-none">{activeCount}</span>}
        </span>
        {collapsed ? <KitIcon name="cu" className="size-4 shrink-0" /> : <KitIcon name="cd" className="size-4 shrink-0" />}
      </button>
      {!collapsed && (
        <ul className="max-h-[52vh] overflow-y-auto">
          {tasks.map(task => <TaskRow key={task.id} task={task} onDismiss={() => dismiss(task.id)} />)}
        </ul>
      )}
    </aside>
  )
}

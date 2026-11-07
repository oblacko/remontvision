import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, LoaderCircle, X } from 'lucide-react'

// Задача = одна генерация пользователя. Берём из /api/my/generations.
export type GenTask = {
  id: string
  room_id: string
  style: string
  room_type?: string | null
  status: string
  error?: string | null
  created_at: string
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

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/my/generations')
      if (r.status === 401) {
        setAuthed(false)
        setAll([])
        return
      }
      if (!r.ok) return
      const list = await r.json()
      setAuthed(true)
      setAll(Array.isArray(list) ? list : [])
    } catch {
      /* сеть недоступна — оставляем прошлое состояние */
    }
  }, [])

  // первичная проверка входа
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

  // активные всегда; завершённые — только свежие (10 минут) и не скрытые
  const tasks = useMemo(() => {
    const cutoff = Date.now() - 10 * 60 * 1000
    return all
      .filter(task => {
        if (!isTerminal(task)) return true
        if (dismissed.has(task.id)) return false
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
  return (
    <li className="border-t px-3 py-2.5 first:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{task.style}{task.room_type ? ` · ${task.room_type}` : ''}</p>
          <p className={`mt-0.5 text-[11px] ${error ? 'text-destructive' : done ? 'text-emerald-700' : 'text-muted-foreground'}`}>
            {error ? 'Ошибка' : done ? 'Готово' : 'Идёт генерация'}
          </p>
        </div>
        {!active && (
          <button type="button" onClick={onDismiss} className="flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Скрыть задачу">
            <X className="size-4" />
          </button>
        )}
      </div>
      {active && (
        <div className="relative mt-2 h-1 overflow-hidden bg-border" role="progressbar" aria-label="Генерация выполняется">
          <div className="rv-progress absolute inset-y-0 left-0 w-1/3 bg-primary" />
        </div>
      )}
      {done && task.room_id && (
        <a href={`/?panel=1&room=${encodeURIComponent(task.room_id)}`} className="mt-1.5 inline-flex text-xs font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">Открыть</a>
      )}
      {error && task.error && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{task.error}</p>}
    </li>
  )
}

export function TaskDock() {
  const { tasks, activeCount, dismiss, panelOpen } = useTasks()
  const [collapsed, setCollapsed] = useState(false)
  if (panelOpen || !tasks.length) return null
  return (
    <aside className="fixed inset-x-3 bottom-3 z-[70] border bg-background shadow-[4px_4px_0_oklch(var(--foreground)/0.15)] sm:bottom-4 sm:left-auto sm:right-4 sm:w-[22rem]" aria-label="Мои задачи">
      <button type="button" onClick={() => setCollapsed(value => !value)} className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={!collapsed}>
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {activeCount > 0
            ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary-text motion-reduce:animate-none" />
            : <Check className="size-4 shrink-0 text-emerald-600" />}
          <span className="truncate">Мои задачи{activeCount > 0 ? ` · ${activeCount}` : ''}</span>
        </span>
        {collapsed ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
      </button>
      {!collapsed && (
        <ul className="max-h-[50vh] overflow-y-auto">
          {tasks.map(task => <TaskRow key={task.id} task={task} onDismiss={() => dismiss(task.id)} />)}
        </ul>
      )}
    </aside>
  )
}

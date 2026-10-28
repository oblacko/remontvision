import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Download, LoaderCircle, LogOut, Search, Share2, Trash2, X } from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import '../App.css'

type Me = { email: string; balance: number }
type Consents = { offer: boolean; personal: boolean; transfer: boolean }
type GenRow = {
  id: string; room_id: string; style: string; room_type?: string | null; budget: number; price_tier?: string | null; status: string; error: string | null;
  created_at: string; finished_at: string | null; request_text: string | null;
  credits_spent: number; image_url: string | null; photo_url: string | null;
}
type CreditRow = { id: number; delta: number; reason: string; payment_id: number | null; render_id: string | null; note: string | null; created_at: string }
type Pack = { id: string; title: string; credits: number; price_kopecks: number }
type GenItem = { name: string; price: number; qty: number; unit: string; url: string; link_label?: string; direct_url?: boolean; source?: string; match_score?: number; presentation_status?: 'curated' | 'matched' | 'verified' }
type RoomData = {
  id: string; style: string; room_type?: string | null; budget: number; price_tier?: string | null; keep_furniture?: boolean; use_catalog?: boolean; status: string; error: string | null;
  photo_url: string | null; render: { id: string; image: string | null; status: string; created_at?: string; request_text?: string | null } | null;
  items: GenItem[]; total: number; prices_as_of: string | null;
}
type RoomGroup = { roomId: string; style: string; versions: GenRow[]; latest: GenRow; image: string | null; credits: number }

const reasonNames: Record<string, string> = {
  signup_bonus: 'бонус регистрации', signup_bonus_2: 'бонус регистрации', purchase: 'пополнение',
  render: 'создание дизайна', iterate: 'правка', iterate_refund: 'возврат кредита',
  refund: 'возврат', admin_adjust: 'корректировка администратором', admin_test: 'корректировка',
}
const rub = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'
const tierNames: Record<string, string> = { start: 'Старт', comfort: 'Комфорт', premium: 'Премиум', atelier: 'Ателье' }
const tierName = (key?: string | null) => tierNames[key || 'comfort'] || 'Комфорт'
const dateTime = (iso?: string | null) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const plural = (n: number, one: string, few: string, many: string) => {
  const m = n % 100, d = n % 10
  if (m >= 11 && m <= 14) return many
  if (d === 1) return one
  if (d >= 2 && d <= 4) return few
  return many
}
const statusLabel = (status: string) => status === 'done' ? 'готово' : status === 'error' ? 'ошибка' : status === 'queued' ? 'в очереди' : status

export default function Cabinet() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [generations, setGenerations] = useState<GenRow[]>([])
  const [credits, setCredits] = useState<CreditRow[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [tab, setTab] = useState<'history' | 'credits'>(() => location.hash.includes('credits') ? 'credits' : 'history')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'error'>('all')
  const [selectedRoom, setSelectedRoom] = useState<RoomGroup | null>(null)
  const [selectedRenderId, setSelectedRenderId] = useState<string | null>(null)
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [error, setError] = useState('')
  const [buyConsent, setBuyConsent] = useState(false)
  const [buying, setBuying] = useState('')
  const [loginStep, setLoginStep] = useState<'email' | 'code'>('email')
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem('rv_last_email') || '')
  const [loginCode, setLoginCode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [consents, setConsents] = useState<Consents>({ offer: false, personal: false, transfer: false })
  const paidRef = useRef(false)

  const loadMe = async () => {
    const r = await fetch('/api/me')
    if (!r.ok) { setMe(null); return false }
    setMe(await r.json()); return true
  }
  const loadData = async () => {
    const [g, c, p] = await Promise.all([
      fetch('/api/my/generations').then(r => r.ok ? r.json() : []),
      fetch('/api/credits').then(r => r.ok ? r.json() : { balance: 0, history: [] }),
      fetch('/api/packs').then(r => r.ok ? r.json() : []),
    ])
    setGenerations(Array.isArray(g) ? g : [])
    setCredits(Array.isArray(c.history) ? c.history : [])
    if (typeof c.balance === 'number' && me) setMe({ ...me, balance: c.balance })
    setPacks(Array.isArray(p) ? p : [])
  }

  useEffect(() => {
    (async () => {
      const ok = await loadMe()
      if (ok) await loadData()
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!me || paidRef.current) return
    const params = new URLSearchParams(location.search)
    const paid = Boolean(params.get('paid')) || /\/cabinet\/paid\/?$/.test(location.pathname)
    const failed = /\/cabinet\/fail\/?$/.test(location.pathname)
    if (!paid && !failed) return
    paidRef.current = true
    setTab('credits')
    if (failed) {
      setNotice('Оплата не завершена — кредиты не начислены')
      history.replaceState(null, '', '/cabinet' + location.hash)
      return
    }
    ;(async () => {
      setNotice('Проверяем оплату…')
      let sync: { granted?: boolean; status?: string } = {}
      try {
        const r = await fetch('/api/payments/sync', { method: 'POST' })
        sync = await r.json().catch(() => ({}))
      } catch { /* ignore */ }
      let balance = me.balance
      let updated = Boolean(sync.granted) || sync.status === 'already' || sync.status === 'no_pending'
      for (let i = 0; !updated && i < 15; i++) {
        await new Promise(r => setTimeout(r, 1500))
        const r = await fetch('/api/me')
        if (!r.ok) continue
        const next = await r.json()
        if (next.balance > balance) { balance = next.balance; updated = true; break }
      }
      await loadMe()
      await loadData()
      setNotice(updated ? 'Оплата прошла — баланс обновлён' : 'Оплата ещё обрабатывается — обновите страницу через минуту')
      history.replaceState(null, '', '/cabinet' + location.hash)
    })()
  }, [me])

  useEffect(() => {
    if (location.hash.includes('credits')) setTab('credits')
  }, [])

  const groups = useMemo<RoomGroup[]>(() => {
    const map = new Map<string, GenRow[]>()
    for (const g of generations) {
      const list = map.get(g.room_id) || []
      list.push(g)
      map.set(g.room_id, list)
    }
    const result: RoomGroup[] = []
    for (const [roomId, versions] of map) {
      const sorted = [...versions].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      const latest = sorted[0]
      const image = sorted.find(v => v.image_url)?.image_url || sorted.find(v => v.photo_url)?.photo_url || null
      const creditsTotal = sorted.reduce((sum, v) => sum + Number(v.credits_spent || 0), 0)
      result.push({ roomId, style: latest.style, versions: sorted, latest, image, credits: creditsTotal })
    }
    return result.sort((a, b) => +new Date(b.latest.created_at) - +new Date(a.latest.created_at))
  }, [generations])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups.filter(group => {
      const matchesQuery = !q || group.style.toLowerCase().includes(q) || group.versions.some(v => (v.request_text || '').toLowerCase().includes(q))
      const matchesStatus = statusFilter === 'all' || group.versions.some(v => v.status === statusFilter)
      return matchesQuery && matchesStatus
    })
  }, [groups, query, statusFilter])

  const stats = useMemo(() => ({
    rooms: groups.length,
    generations: generations.length,
    creditsSpent: generations.reduce((sum, g) => sum + Number(g.credits_spent || 0), 0),
  }), [groups, generations])

  const openRoom = async (group: RoomGroup, renderId?: string | null) => {
    setSelectedRoom(group)
    const preferred = renderId || group.versions.find(v => v.status === 'done' && v.image_url)?.id || group.versions[0]?.id || null
    setSelectedRenderId(preferred)
    setRoomData(null); setDetailLoading(true); setError('')
    try {
      const r = await fetch(`/api/rooms/${group.roomId}${preferred ? `?render_id=${encodeURIComponent(preferred)}` : ''}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      setRoomData(d)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть комнату') }
    finally { setDetailLoading(false) }
  }
  const selectVersion = async (versionId: string) => {
    if (!selectedRoom) return
    setSelectedRenderId(versionId); setDetailLoading(true); setError('')
    try {
      const r = await fetch(`/api/rooms/${selectedRoom.roomId}?render_id=${encodeURIComponent(versionId)}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      setRoomData(d)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть версию') }
    finally { setDetailLoading(false) }
  }
  const deleteRoom = async () => {
    if (!selectedRoom) return
    if (!confirm(`Удалить комнату и все ${selectedRoom.versions.length} ${plural(selectedRoom.versions.length, 'версия', 'версии', 'версий')}? Это действие необратимо.`)) return
    try {
      const r = await fetch('/api/rooms/' + selectedRoom.roomId, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || String(r.status))
      setSelectedRoom(null); setRoomData(null); setSelectedRenderId(null)
      setNotice('Комната удалена')
      await loadData()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить комнату') }
  }
  useEffect(() => {
    if (!me || !groups.length) return
    const params = new URLSearchParams(location.search)
    const room = params.get('room')
    if (!room) return
    const group = groups.find(g => g.roomId === room)
    if (group && (!selectedRoom || selectedRoom.roomId !== room)) void openRoom(group)
    params.delete('room')
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash)
  }, [me, groups])

  const sendLogin = async () => {
    const email = loginEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setLoginError('Проверьте e-mail')
    if (!consents.offer || !consents.personal || !consents.transfer) return setLoginError('Отметьте оферту, согласие на ПДн и трансграничную передачу')
    setLoginBusy(true); setLoginError('')
    try {
      const r = await fetch('/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      localStorage.setItem('rv_last_email', email); setLoginEmail(email); setLoginCode(''); setLoginStep('code')
    } catch (e) { setLoginError(e instanceof Error ? e.message : 'Не удалось отправить код') }
    finally { setLoginBusy(false) }
  }
  const verifyLogin = async () => {
    if (!/^\d{6}$/.test(loginCode)) return setLoginError('Код — 6 цифр')
    setLoginBusy(true); setLoginError('')
    try {
      const r = await fetch('/api/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, code: loginCode, consents: { offer: consents.offer, privacy: consents.personal, cross_border: consents.transfer } }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      localStorage.setItem('rv_last_email', loginEmail)
      setLoading(true)
      await loadMe(); await loadData(); setLoading(false)
    } catch (e) { setLoginError(e instanceof Error ? e.message : 'Не удалось войти') }
    finally { setLoginBusy(false) }
  }
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMe(null); setGenerations([]); setCredits([]); setSelectedRoom(null); setRoomData(null)
  }
  const buyPack = async (pack: Pack) => {
    if (!buyConsent) return setError('Отметьте акцепт оферты перед оплатой')
    setBuying(pack.id); setError('')
    try {
      const r = await fetch('/api/payments/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: pack.id, accept_offer: true, return_path: '/cabinet' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      if (d.confirmation_url) window.location.href = d.confirmation_url
      else throw new Error('Не удалось получить ссылку на оплату')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось начать оплату') }
    finally { setBuying('') }
  }

  useEffect(() => {
    if (!selectedRoom) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedRoom(null) }
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close) }
  }, [selectedRoom])

  if (loading) return <div className="flex min-h-dvh items-center justify-center bg-background"><LoaderCircle className="size-8 animate-spin text-primary-text" /></div>

  if (!me) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <header className="border-b"><div className="page-shell flex min-h-16 items-center justify-between"><a href="/" className="text-lg font-medium tracking-tight">ремонт<span className="text-primary-text">вижн</span></a><a href="/" className="text-sm underline decoration-border underline-offset-4">На сайт</a></div></header>
        <main className="mx-auto flex min-h-[75svh] max-w-md flex-col justify-center px-4 py-12">
          <p className="eyebrow">Личный кабинет</p>
          <h1 className="display-title mt-4 text-4xl">Вход по e-mail</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Пришлём код на почту — без паролей.</p>
          <div className="mt-6 space-y-4">
            {loginStep === 'email' ? (
              <>
                <input type="email" autoComplete="email" autoFocus value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@example.ru" className="h-12 w-full border bg-background px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
                <div className="space-y-2 text-sm">
                  {([['offer', <>Принимаю <a className="underline" href="/offer">публичную оферту</a></>], ['personal', <>Согласен на <a className="underline" href="/privacy">обработку персональных данных</a></>], ['transfer', <>Согласен на <a className="underline" href="/privacy#cross-border">трансграничную передачу</a> фото и запросов</>]] as const).map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 leading-5"><input type="checkbox" checked={consents[key]} onChange={e => setConsents(prev => ({ ...prev, [key]: e.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-primary" /><span>{label}</span></label>)}
                </div>
                {loginError && <p className="text-sm text-destructive" role="alert">{loginError}</p>}
                <button type="button" disabled={loginBusy} onClick={sendLogin} className="action-primary w-full">{loginBusy ? 'Отправляем…' : 'Получить код'}</button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Код отправлен на {loginEmail}</p>
                <input type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus value={loginCode} onChange={e => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="h-14 w-full border bg-background px-4 text-center font-mono text-2xl tracking-[0.35em] outline-none focus:border-primary" />
                {loginError && <p className="text-sm text-destructive" role="alert">{loginError}</p>}
                <button type="button" disabled={loginBusy} onClick={verifyLogin} className="action-primary w-full">{loginBusy ? 'Проверяем…' : 'Войти'}</button>
                <div className="flex justify-between text-sm"><button type="button" className="underline underline-offset-4" onClick={() => { setLoginStep('email'); setLoginError('') }}>Изменить e-mail</button><button type="button" className="underline underline-offset-4" onClick={sendLogin} disabled={loginBusy}>Отправить ещё раз</button></div>
              </>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3"><a href="/" className="text-lg font-medium tracking-tight">ремонт<span className="text-primary-text">вижн</span></a><span className="eyebrow hidden sm:inline">/ кабинет</span></div>
          <div className="flex items-center gap-2 text-sm">
            <a href="/" className="hidden min-h-11 items-center px-2 hover:opacity-50 sm:flex">На сайт</a>
            <a href="/?panel=1" className="action-primary hidden min-h-11 items-center px-4 sm:inline-flex">Новый дизайн <ArrowUpRight className="size-4" /></a>
            <span className="hidden items-center gap-1 border px-3 py-2 md:inline-flex"><b>{me.balance}</b> кр.</span>
            <button type="button" onClick={logout} className="inline-flex min-h-11 items-center gap-2 px-2 hover:opacity-50"><LogOut className="size-4" /><span className="hidden sm:inline">Выйти</span></button>
          </div>
        </div>
      </header>
      <main className="page-shell py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div><p className="eyebrow">Личный кабинет</p><h1 className="display-title mt-2 text-4xl sm:text-5xl">{tab === 'history' ? 'Мои дизайны' : 'Кредиты'}</h1><p className="mt-2 text-sm text-muted-foreground">{me.email}</p></div>
          <div className="flex gap-4 font-mono text-xs uppercase tracking-wider text-muted-foreground"><span>{stats.rooms} {plural(stats.rooms, 'комната', 'комнаты', 'комнат')}</span><span>{stats.generations} {plural(stats.generations, 'генерация', 'генерации', 'генераций')}</span><span>{stats.creditsSpent} кр. использовано</span></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex border-b" aria-label="Разделы кабинета">
            <button type="button" onClick={() => setTab('history')} className={`min-h-12 border-b-2 px-4 text-sm ${tab === 'history' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>История</button>
            <button type="button" onClick={() => setTab('credits')} className={`min-h-12 border-b-2 px-4 text-sm ${tab === 'credits' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Кредиты</button>
          </nav>
          <a href="/?panel=1" className="action-primary sm:hidden">Новый дизайн <ArrowUpRight className="size-4" /></a>
        </div>
        {(notice || error) && <p className={`mt-4 border px-4 py-3 text-sm ${error ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-primary/40 bg-primary/5 text-foreground'}`} role="status">{error || notice}</p>}

        {tab === 'history' ? (
          <div className="mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                {([['all', 'Все'], ['done', 'Готовые'], ['error', 'С ошибками']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setStatusFilter(key)} className={`min-h-10 border px-3 text-xs ${statusFilter === key ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground'}`}>{label}</button>)}
              </div>
              <div className="relative sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Стиль или запрос правки" className="h-10 w-full border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" /></div>
            </div>
            {filteredGroups.length ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredGroups.map(group => <button key={group.roomId} type="button" onClick={() => openRoom(group)} className="group border bg-background text-left transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="relative aspect-[4/3] overflow-hidden bg-foreground/10">{group.image ? <img src={group.image} alt={`Дизайн · ${group.style}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Нет изображения</div>}<span className="absolute left-2 top-2 bg-background/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider">{group.versions.length} {plural(group.versions.length, 'версия', 'версии', 'версий')}</span></div>
                  <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{group.style}{group.latest.room_type ? ` · ${group.latest.room_type}` : ''}</p><p className="mt-1 truncate text-xs text-muted-foreground">{group.latest.request_text || 'Базовый дизайн'}</p></div><span className="shrink-0 text-[11px] text-muted-foreground">{statusLabel(group.latest.status)}</span></div><div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{dateTime(group.latest.created_at)}</span><span>{group.credits} кр.</span></div></div>
                </button>)}
              </div>
            ) : <div className="mt-8 border border-dashed p-10 text-center"><p className="display-title text-3xl">Пока пусто</p><p className="mt-3 text-sm text-muted-foreground">Создайте первый дизайн — он появится здесь вместе с версиями и сметой.</p><a href="/?panel=1" className="action-primary mt-6">Создать дизайн <ArrowUpRight className="size-4" /></a></div>}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_24rem]">
            <section>
              <div className="flex items-end justify-between gap-3 border-b pb-4"><div><p className="eyebrow">Баланс</p><p className="display-title mt-2 text-5xl">{me.balance} <span className="text-2xl font-light">кр.</span></p></div><span className="text-xs text-muted-foreground">1 кредит = 1 генерация или правка</span></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {packs.map(pack => <div key={pack.id} className="border p-4"><div className="flex items-end justify-between gap-2"><span className="display-title text-4xl">{String(pack.credits).padStart(2, '0')}</span><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{pack.credits === 1 ? 'кредит' : pack.credits < 5 ? 'кредита' : 'кредитов'}</span></div><p className="mt-4 text-xl font-light">{rub(pack.price_kopecks / 100)}</p><p className="mt-1 text-xs text-muted-foreground">{pack.title}</p><button type="button" onClick={() => buyPack(pack)} disabled={buying === pack.id} className="action-primary mt-4 w-full">{buying === pack.id ? 'Переходим…' : 'Купить'} <ArrowUpRight className="size-4" /></button></div>)}
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-5"><input type="checkbox" checked={buyConsent} onChange={e => setBuyConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" /><span>Принимаю <a className="underline" href="/offer" target="_blank" rel="noopener">оферту</a> и <a className="underline" href="/prices" target="_blank" rel="noopener">условия и цены</a></span></label>
              <div className="mt-8"><div className="flex items-center justify-between border-b pb-3"><h2 className="eyebrow">История кредитов</h2><span className="text-xs text-muted-foreground">{credits.length} {plural(credits.length, 'операция', 'операции', 'операций')}</span></div><div className="divide-y">{credits.map(c => <div key={c.id} className="flex items-start justify-between gap-4 py-3 text-sm"><div><b className={c.delta > 0 ? 'text-primary-text' : ''}>{c.delta > 0 ? '+' : ''}{c.delta} кр.</b><p className="mt-1 text-xs text-muted-foreground">{reasonNames[c.reason] || c.reason}{c.note ? ` · ${c.note}` : ''}</p></div><span className="shrink-0 text-xs text-muted-foreground">{dateTime(c.created_at)}</span></div>)}{!credits.length && <p className="py-4 text-sm text-muted-foreground">Операций пока нет.</p>}</div></div>
            </section>
            <aside className="border-t pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"><p className="eyebrow">Как это работает</p><ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><li>2 кредита начисляются при регистрации.</li><li>1 кредит — одна генерация или правка.</li><li>При сбое кредит возвращается.</li><li>Кредиты не сгорают.</li></ul><a href="/prices" className="mt-6 inline-flex text-sm underline decoration-border underline-offset-4">Все условия и цены <ArrowUpRight className="ml-1 size-4" /></a></aside>
          </div>
        )}
      </main>

      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/50" role="dialog" aria-modal="true" aria-label="История комнаты" onClick={e => { if (e.target === e.currentTarget) setSelectedRoom(null) }}>
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-background p-5 sm:p-8">
            <div className="flex items-start justify-between gap-4 border-b pb-4"><div><p className="eyebrow">Комната</p><h2 className="display-title mt-2 text-3xl">{selectedRoom.style}</h2>{selectedRoom.latest.room_type && <p className="mt-1 text-xs text-muted-foreground">{selectedRoom.latest.room_type}</p>}<p className="mt-1 text-xs text-muted-foreground">{selectedRoom.versions.length} {plural(selectedRoom.versions.length, 'версия', 'версии', 'версий')} · {dateTime(selectedRoom.latest.created_at)}</p></div><button type="button" onClick={() => setSelectedRoom(null)} className="flex size-11 items-center justify-center border hover:bg-muted" aria-label="Закрыть"><X className="size-5" /></button></div>
            {detailLoading ? <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-primary-text" /></div> : roomData ? (
              <>
                <div className="mt-5 bg-foreground">{roomData.render?.image ? <img src={roomData.render.image} alt="Дизайн комнаты" className="max-h-[52svh] w-full object-contain" /> : <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{roomData.error || 'Изображение недоступно'}</div>}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {roomData.render?.image && <a href={roomData.render.image} download="remontvision-design.jpg" className="action-secondary"><Download className="size-4" />Скачать</a>}
                  {roomData.render?.image && <button type="button" onClick={() => setShareOpen(true)} className="action-secondary"><Share2 className="size-4" />Поделиться</button>}
                  <a href={`/?panel=1&room=${encodeURIComponent(selectedRoom.roomId)}`} className="action-secondary"><ArrowUpRight className="size-4" />Редактировать</a>
                  <button type="button" onClick={deleteRoom} className="inline-flex min-h-12 items-center gap-2 border border-destructive/50 px-4 text-sm text-destructive hover:bg-destructive/5"><Trash2 className="size-4" />Удалить комнату</button>
                </div>
                <div className="mt-6 grid gap-4 border-y py-5 sm:grid-cols-2"><div><p className="eyebrow">Класс материалов</p><p className="mt-2 text-xl font-light">{tierName(roomData.price_tier)}</p><p className="mt-1 text-[11px] text-muted-foreground">Подбор по уровню, а не по сумме</p></div><div><p className="eyebrow">Оценка материалов</p><p className="mt-2 text-xl font-light">{rub(roomData.total)}</p><p className="mt-1 text-[11px] text-muted-foreground">Смета ориентировочная</p>{roomData.prices_as_of && <p className="mt-1 text-[11px] text-muted-foreground">Цены актуальны на {dateTime(roomData.prices_as_of)}</p>}</div></div>
                <div className="mt-6"><p className="eyebrow">Версии</p><div className="mt-3 flex flex-wrap gap-2">{selectedRoom.versions.map((v, index) => <button key={v.id} type="button" onClick={() => selectVersion(v.id)} className={`min-h-10 border px-3 text-xs ${selectedRenderId === v.id ? 'border-foreground bg-foreground text-background' : 'border-foreground/30 hover:border-foreground'}`}>Версия {selectedRoom.versions.length - index} · {v.request_text ? 'правка' : 'базовая'} · {statusLabel(v.status)}</button>)}</div></div>
                {roomData.use_catalog === false && <p className="mt-6 border-y py-4 text-sm text-muted-foreground">Каталог был отключён для этой генерации — смета не формировалась.</p>}
                {roomData.items.length > 0 && <div className="mt-6"><p className="eyebrow">Товары и смета</p><div className="mt-3 divide-y border-y">{roomData.items.map((item, i) => <div key={`${item.name}-${i}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 text-sm"><span>{item.name}</span><span className="font-medium">{rub(item.price * item.qty)}</span><span className="col-span-2 text-xs text-muted-foreground">{rub(item.price)} × {item.qty} {item.unit}{` · ${item.presentation_status === 'verified' ? 'Проверен на рендере' : item.presentation_status === 'matched' ? 'Похожий по рендеру' : 'Подобран к дизайну'}`}{item.source ? ` · ${item.source}` : ''}{item.url ? <> · <a className={item.direct_url ? 'font-medium text-primary-text underline underline-offset-2' : 'underline underline-offset-2'} href={item.url} target="_blank" rel={item.direct_url ? 'noopener nofollow sponsored' : 'noopener nofollow'}>{item.link_label || 'в магазин'}</a></> : null}</span></div>)}</div></div>}
                {roomData.error && <p className="mt-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{roomData.error}</p>}
              </>
            ) : <p className="mt-6 text-sm text-muted-foreground">Не удалось загрузить комнату.</p>}
          </div>
        </div>
      )}
      <ShareDialog renderId={roomData?.render?.id || ''} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}

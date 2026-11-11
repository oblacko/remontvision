import { useEffect, useMemo, useRef, useState } from 'react'
import { KitIcon } from '@/components/KitIcon'
import { KitLightbox, KitSheet } from '@/components/KitSheet'
import { Link } from 'react-router'
import { Logo } from '@/components/Logo'
import { ShareDialog } from '@/components/ShareDialog'
import { goal } from '@/lib/analytics'
import '../App.css'

type Me = { email: string; balance: number }
// Согласие действием (вариант A): чекбоксов нет, флаги уходят при клике по кнопке.
const CONSENTS = { offer: true, privacy: true, cross_border: true }
type GenRow = {
  id: string; room_id: string; batch_id?: string | null; parent_render_id?: string | null; style: string; room_type?: string | null; budget: number; price_tier?: string | null; status: string; error: string | null;
  created_at: string; finished_at: string | null; request_text: string | null;
  credits_spent: number; image_url: string | null; photo_url: string | null;
}
type CreditRow = { id: number; delta: number; reason: string; payment_id: number | null; render_id: string | null; note: string | null; created_at: string }
type Pack = { id: string; title: string; credits: number; price_kopecks: number }
type Referral = { code: string; link: string; invited: number }
type GenItem = { name: string; price: number; qty: number; unit: string; url: string; link_label?: string; direct_url?: boolean; source?: string; match_score?: number; presentation_status?: 'curated' | 'matched' | 'verified' }
type ProductOffer = { id: string; name: string; price: number | null; currency: string; merchant?: string | null; url: string | null; image_url?: string | null; erid?: string | null }
type ProductMatch = { item: { label: string; category: string }; offers: ProductOffer[]; note?: string }
type RoomAnalysis = { products?: ProductMatch[] } | null
type RoomData = {
  id: string; style: string; room_type?: string | null; budget: number; price_tier?: string | null; keep_furniture?: boolean; use_catalog?: boolean; status: string; error: string | null;
  photo_url: string | null; render: { id: string; image: string | null; status: string; created_at?: string; request_text?: string | null; analysis?: RoomAnalysis } | null;
  items: GenItem[]; total: number; prices_as_of: string | null;
}
type RoomGroup = { roomId: string; batchId: string; style: string; versions: GenRow[]; designs: GenRow[]; latest: GenRow; image: string | null; credits: number }

const reasonNames: Record<string, string> = {
  signup_bonus: 'бонус регистрации', signup_bonus_2: 'бонус регистрации', purchase: 'пополнение',
  render: 'создание дизайна', iterate: 'редактирование', iterate_refund: 'возврат кредита',
  procurement: 'подбор товаров', procurement_refund: 'возврат за подбор товаров',
  refund: 'возврат', admin_adjust: 'корректировка администратором', admin_test: 'корректировка',
  referral: 'реферальная программа',
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
const statusView = (status: string): { label: string; className: string } => {
  if (status === 'done') return { label: 'готово', className: 'text-emerald-600' }
  if (status === 'error') return { label: 'ошибка', className: 'text-destructive underline decoration-destructive decoration-2 underline-offset-4' }
  if (status === 'processing') return { label: 'в процессе', className: 'text-sky-600' }
  if (status === 'queued') return { label: 'в очереди', className: 'text-sky-600' }
  return { label: status, className: 'text-muted-foreground' }
}
const editName = (text: string | null | undefined, fallback: string) => text ? text.replace(/(^|\n)\d+\)\s*/g, '$1').trim() || fallback : fallback

export default function Cabinet() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [generations, setGenerations] = useState<GenRow[]>([])
  const [credits, setCredits] = useState<CreditRow[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [referral, setReferral] = useState<Referral | null>(null)
  const [tab, setTab] = useState<'history' | 'credits'>(() => location.hash.includes('credits') ? 'credits' : 'history')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'error'>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<RoomGroup | null>(null)
  const [selectedRenderId, setSelectedRenderId] = useState<string | null>(null)
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareRenderId, setShareRenderId] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const [buying, setBuying] = useState('')
  const [loginStep, setLoginStep] = useState<'email' | 'code'>('email')
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem('rv_last_email') || '')
  const [loginCode, setLoginCode] = useState('')
  const [loginError, setLoginError] = useState(() => new URLSearchParams(location.search).get('auth_error') ? 'Не удалось войти через Яндекс, попробуйте ещё раз' : '')
  const [loginBusy, setLoginBusy] = useState(false)
  const paidRef = useRef(false)

  const loadMe = async () => {
    const r = await fetch('/api/me')
    if (!r.ok) { setMe(null); return false }
    setMe(await r.json()); return true
  }
  const loadData = async () => {
    const [g, c, p, ref] = await Promise.all([
      fetch('/api/my/generations').then(r => r.ok ? r.json() : []),
      fetch('/api/credits').then(r => r.ok ? r.json() : { balance: 0, history: [] }),
      fetch('/api/packs').then(r => r.ok ? r.json() : []),
      fetch('/api/referral').then(r => r.ok ? r.json() : null),
    ])
    setGenerations(Array.isArray(g) ? g : [])
    setCredits(Array.isArray(c.history) ? c.history : [])
    if (typeof c.balance === 'number' && me) setMe({ ...me, balance: c.balance })
    setPacks(Array.isArray(p) ? p : [])
    setReferral(ref && typeof ref.link === 'string' ? ref : null)
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
    const paidId = params.get('paid') || 'robokassa'
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
      if (updated) goal('purchase', { pack_id: paidId })
      history.replaceState(null, '', '/cabinet' + location.hash)
    })()
  }, [me])

  useEffect(() => {
    if (location.hash.includes('credits')) setTab('credits')
  }, [])

  // Возврат после успешного OAuth: бэкенд добавляет ?auth=yandex&new=1|0.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.get('auth')) return
    goal(params.get('new') === '1' ? 'signup' : 'login')
    params.delete('auth')
    params.delete('new')
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash)
  }, [])

  const groups = useMemo<RoomGroup[]>(() => {
    // Группируем по пакету: несколько стилей одного запуска — отдельные дизайны,
    // а не «версии» одного. Старые записи без batch_id группируются по комнате.
    const map = new Map<string, GenRow[]>()
    for (const g of generations) {
      const key = g.batch_id || g.room_id
      const list = map.get(key) || []
      list.push(g)
      map.set(key, list)
    }
    const result: RoomGroup[] = []
    for (const [batchId, versions] of map) {
      const sorted = [...versions].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      const latest = sorted[0]
      const image = sorted.find(v => v.image_url)?.image_url || sorted.find(v => v.photo_url)?.photo_url || null
      const creditsTotal = sorted.reduce((sum, v) => sum + Number(v.credits_spent || 0), 0)
      const designs = sorted.filter(v => !v.parent_render_id)
      result.push({ roomId: latest.room_id, batchId, style: latest.style, versions: sorted, designs, latest, image, credits: creditsTotal })
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

  const openRoom = async (group: RoomGroup, renderId?: string | null) => {
    setFullscreen(false)
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
    setFullscreen(false)
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
        body: JSON.stringify({ email: loginEmail, code: loginCode, consents: CONSENTS }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      goal(d.is_new ? 'signup' : 'login')
      localStorage.setItem('rv_last_email', loginEmail)
      setLoading(true)
      await loadMe(); await loadData(); setLoading(false)
    } catch (e) { setLoginError(e instanceof Error ? e.message : 'Не удалось войти') }
    finally { setLoginBusy(false) }
  }
  const yandexLogin = async () => {
    setLoginBusy(true); setLoginError('')
    try {
      const r = await fetch('/api/auth/yandex/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consents: CONSENTS, redirect_to: '/cabinet' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      window.location.href = d.url
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Не удалось войти через Яндекс')
      setLoginBusy(false)
    }
  }
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMe(null); setGenerations([]); setCredits([]); setSelectedRoom(null); setRoomData(null)
  }
  const showToast = (text: string) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2000)
  }
  const copyReferral = async () => {
    if (!referral) return
    try {
      await navigator.clipboard.writeText(referral.link)
    } catch {
      const el = document.createElement('textarea')
      el.value = referral.link
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    showToast('Ссылка скопирована')
  }
  const buyPack = async (pack: Pack) => {
    setBuying(pack.id); setError('')
    try {
      const r = await fetch('/api/payments/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: pack.id, accept_offer: true, return_path: '/cabinet' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      goal('buy_click', { pack_id: pack.id })
      if (d.confirmation_url) window.location.href = d.confirmation_url
      else throw new Error('Не удалось получить ссылку на оплату')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось начать оплату') }
    finally { setBuying('') }
  }

  if (loading) return <div className="flex min-h-dvh items-center justify-center bg-page"><KitIcon name="sp" spin className="size-8 text-primary-text" /></div>

  if (!me) {
    return (
      <div className="min-h-dvh bg-page text-foreground">
        <header className="border-b bg-page"><div className="page-shell flex min-h-16 items-center justify-between"><Logo animated /><a href="/" className="text-sm underline decoration-border underline-offset-4">На сайт</a></div></header>
        <main className="mx-auto flex min-h-[75svh] max-w-md flex-col justify-center px-4 py-12">
          <p className="eyebrow">Личный кабинет</p>
          <h1 className="display-title mt-4 break-words text-3xl sm:text-4xl">Войдите или зарегистрируйтесь</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Чтобы создавать дизайны с помощью нейросети</p>
          <div className="mt-6 space-y-4">
            {loginStep === 'email' ? (
              <>
                <div className="k-note"><KitIcon name="bolt" /><span><b>2 бесплатных дизайна</b> при регистрации</span></div>
                <button type="button" onClick={yandexLogin} disabled={loginBusy} className="k-btn k-btn--block k-btn--l">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#FC3F1D] text-sm font-bold text-white">Я</span>
                  Войти через Яндекс
                </button>
                <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />или по почте<span className="h-px flex-1 bg-border" /></div>
                <div>
                  <label htmlFor="login-email" className="k-label">E-mail</label>
                  <input id="login-email" type="email" autoComplete="email" autoFocus value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@example.ru" className="k-field" />
                </div>
                {loginError && <p className="k-er" role="alert"><KitIcon name="warn" className="mt-0.5" /><span>{loginError}</span></p>}
                <button type="button" disabled={loginBusy} onClick={sendLogin} className="k-btn k-btn--primary k-btn--l k-btn--block">{loginBusy ? 'Отправляем…' : 'Получить код для входа'}</button>
                <p className="text-center text-xs leading-5 text-muted-foreground">
                  Продолжая, вы соглашаетесь на <a className="underline underline-offset-2" href="/privacy">обработку персональных данных</a>, включая <a className="underline underline-offset-2" href="/privacy#cross-border">трансграничную передачу</a>, и принимаете <a className="underline underline-offset-2" href="/offer">Условия использования</a> и <a className="underline underline-offset-2" href="/privacy">Политику конфиденциальности</a>.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Код отправлен на {loginEmail}</p>
                <input type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus value={loginCode} onChange={e => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="k-field text-center font-mono text-xl tracking-[0.35em]" />
                {loginError && <p className="k-er" role="alert"><KitIcon name="warn" className="mt-0.5" /><span>{loginError}</span></p>}
                <button type="button" disabled={loginBusy} onClick={verifyLogin} className="k-btn k-btn--primary k-btn--l k-btn--block">{loginBusy ? 'Проверяем…' : 'Войти'}</button>
                <div className="flex justify-between text-sm"><button type="button" className="underline underline-offset-4" onClick={() => { setLoginStep('email'); setLoginError('') }}>Изменить e-mail</button><button type="button" className="underline underline-offset-4" onClick={sendLogin} disabled={loginBusy}>Отправить ещё раз</button></div>
              </>
            )}
          </div>
        </main>
      </div>
    )
  }

  const realProducts = roomData?.render?.analysis?.products || []
  const realOfferCount = realProducts.reduce((sum, match) => sum + match.offers.length, 0)
  return (
    <div className="min-h-dvh bg-page text-foreground">
      <header className="sticky top-0 z-40 border-b bg-page">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3"><Logo animated /><span className="eyebrow hidden sm:inline">/ кабинет</span></div>
          <div className="flex items-center gap-2 text-sm">
            <a href="/" className="hidden min-h-11 items-center px-2 hover:opacity-50 sm:flex">На сайт</a>
            <a href="/?panel=1" className="k-btn k-btn--primary k-btn--s">Новый дизайн <KitIcon name="ur" /></a>
            <div className="relative">
              <button type="button" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-haspopup="menu" className="k-badge inline-flex min-h-11 items-center gap-1"><b>{me.balance}</b> кр. <KitIcon name="cd" className="size-3.5" /></button>
              {profileOpen && (
                <>
                  <button type="button" aria-label="Закрыть профиль" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-20 cursor-default" />
                  <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 border bg-card p-1 shadow-[4px_4px_0_oklch(var(--primary))]">
                    <p className="px-3 py-2 text-xs text-muted-foreground">Баланс: <b className="text-foreground">{me.balance} кр.</b></p>
                    <button type="button" role="menuitem" onClick={() => { setTab('credits'); setProfileOpen(false) }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary"><KitIcon name="bolt" className="size-4" />История платежей</button>
                    <button type="button" role="menuitem" onClick={() => { setTab('credits'); setProfileOpen(false); requestAnimationFrame(() => document.getElementById('referral-block')?.scrollIntoView({ behavior: 'smooth', block: 'center' })) }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary"><KitIcon name="r" className="size-4" />Пригласить друга</button>
                    <div className="my-1 h-px bg-border" />
                    <button type="button" role="menuitem" onClick={logout} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary"><KitIcon name="out" className="size-4" />Выйти</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="page-shell py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div><p className="eyebrow">Личный кабинет</p><h1 className="display-title mt-2 text-4xl sm:text-5xl">{tab === 'history' ? 'Мои дизайны' : 'Профиль'}</h1><p className="mt-2 text-sm text-muted-foreground">{me.email}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="k-ut" aria-label="Разделы кабинета">
            <button type="button" aria-selected={tab === 'history'} onClick={() => setTab('history')}>История</button>
            <button type="button" aria-selected={tab === 'credits'} onClick={() => setTab('credits')}>Профиль</button>
          </nav>
        </div>
        {(notice || error) && <p className={`mt-4 border px-4 py-3 text-sm ${error ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-primary/40 bg-primary/5 text-foreground'}`} role="status">{error || notice}</p>}

        {tab === 'history' ? (
          <div className="mt-6">
            <div className="flex items-center justify-end">
              <div className="relative">
                <button type="button" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} className="k-btn k-btn--s">
                  <KitIcon name="q" className="size-4" />
                  Фильтры
                  {(statusFilter !== 'all' || query) && <span className="ml-1 size-2 rounded-full bg-primary" aria-hidden="true" />}
                </button>
                {filtersOpen && (
                  <>
                    <button type="button" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)} className="fixed inset-0 z-20 cursor-default" />
                    <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[90vw] border bg-card p-3 shadow-[4px_4px_0_oklch(var(--primary))]">
                      <div className="k-tabs">
                        {([['all', 'Все'], ['done', 'Готовые'], ['error', 'С ошибками']] as const).map(([key, label]) => <button key={key} type="button" aria-selected={statusFilter === key} onClick={() => { setStatusFilter(key); setFiltersOpen(false) }} className="k-tab">{label}</button>)}
                      </div>
                      <div className="relative mt-3"><KitIcon name="q" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Стиль или запрос редактирования" className="k-field pl-10 pr-3 text-sm" /></div>
                    </div>
                  </>
                )}
              </div>
            </div>
            {filteredGroups.length ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredGroups.map(group => <div key={group.batchId} className="k-card group relative min-w-0">
                  <Link to={`/room/${encodeURIComponent(group.roomId)}`} className="block text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                  <div className="relative aspect-[4/3] overflow-hidden bg-foreground/10">{group.image ? <img src={group.image} alt={`Дизайн · ${group.style}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Нет изображения</div>}<span className="k-badge absolute left-2 top-2">{group.designs.length > 1 ? `${group.designs.length} ${plural(group.designs.length, 'дизайн', 'дизайна', 'дизайнов')}` : `${group.versions.length} ${plural(group.versions.length, 'версия', 'версии', 'версий')}`}</span></div>
                  <div className="bo"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{group.style}{group.latest.room_type ? ` · ${group.latest.room_type}` : ''}</p><p className="mt-1 truncate text-xs text-muted-foreground">{editName(group.latest.request_text, 'Базовый дизайн')}</p></div><span className={`k-caption shrink-0 ${statusView(group.latest.status).className}`}>{statusView(group.latest.status).label}</span></div><div className="rw mt-4 border-t pt-3 text-xs text-muted-foreground"><span>{dateTime(group.latest.created_at)}</span><span>{group.credits} кр.</span></div></div>
                  </Link>
                  <button type="button" onClick={() => { setShareRenderId(group.latest.id); setShareOpen(true) }} className="k-btn k-btn--ov k-btn--icon absolute right-2 top-2" aria-label="Поделиться дизайном"><KitIcon name="sh" /></button>
                </div>)}
              </div>
            ) : <div className="k-empty mt-8"><p className="display-title text-3xl">Пока пусто</p><p className="text-sm text-muted-foreground">Создайте первый дизайн — он появится здесь вместе с версиями и подборкой.</p><a href="/?panel=1" className="k-btn k-btn--primary">Создать дизайн <KitIcon name="ur" /></a></div>}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_24rem]">
            <section>
              <div className="flex items-end justify-between gap-3 border-b pb-4"><div><p className="eyebrow">Баланс</p><p className="display-title mt-2 flex items-baseline gap-2 text-5xl">{me.balance} <span className="text-2xl font-light">кр.</span></p></div><span className="max-w-[20rem] text-xs text-muted-foreground">1 кредит = дизайн (в каждом 3 бесплатных редактирования) или подбор товаров</span></div>
              <div id="referral-block" className="k-note mt-6">
                <KitIcon name="bolt" /><div className="min-w-0"><p className="text-sm font-medium">Пригласите друга — +2 кредита вам</p><p className="mt-1 text-xs leading-5">+2 кредита начислим после первой покупки друга по вашей ссылке.</p></div>
              </div>
              {referral ? (
                <div className="mt-4">
                  <div className="flex gap-2"><input readOnly value={referral.link} onFocus={e => e.currentTarget.select()} className="k-field min-w-0 flex-1 text-xs" style={{ minHeight: 44 }} aria-label="Реферальная ссылка" /><button type="button" onClick={copyReferral} className="k-btn k-btn--s shrink-0">Скопировать</button></div>
                  <p className="mt-2 text-xs text-muted-foreground">{referral.invited > 0 ? `Приглашено по ссылке: ${referral.invited}` : 'Поделитесь ссылкой — получите 2 кредита после первой покупки друга.'}</p>
                </div>
              ) : <p className="mt-4 text-sm text-muted-foreground">Загружаем ссылку…</p>}
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {packs.map(pack => <div key={pack.id} className={`k-pl${pack.id === 'flat' ? ' on' : ''}`}><div className="flex items-end justify-between gap-2"><span className="display-title text-4xl">{String(pack.credits).padStart(2, '0')}</span><span className="k-caption">{pack.credits === 1 ? 'кредит' : pack.credits < 5 ? 'кредита' : 'кредитов'}</span></div><p className="mt-3 text-xl font-light">{rub(pack.price_kopecks / 100)}</p><p className="text-xs text-muted-foreground">{pack.title}</p>{pack.id === 'flat' && <p className="k-badge k-badge--hot self-start">Выгодно</p>}<button type="button" onClick={() => buyPack(pack)} disabled={buying === pack.id} className="k-btn k-btn--primary k-btn--block mt-2">{buying === pack.id ? 'Переходим…' : 'Купить'} <KitIcon name="ur" /></button></div>)}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">Нажимая «Купить», вы принимаете <a className="underline underline-offset-2" href="/offer" target="_blank" rel="noopener">оферту</a> и <a className="underline underline-offset-2" href="/prices" target="_blank" rel="noopener">условия и цены</a>.</p>
              <div className="mt-8"><div className="flex items-center justify-between border-b pb-3"><h2 className="eyebrow">История кредитов</h2><span className="text-xs text-muted-foreground">{credits.length} {plural(credits.length, 'операция', 'операции', 'операций')}</span></div><div className="divide-y">{credits.map(c => <div key={c.id} className="flex items-start justify-between gap-4 py-3 text-sm"><div><b className={c.delta > 0 ? 'text-primary-text' : ''}>{c.delta > 0 ? '+' : ''}{c.delta} кр.</b><p className="mt-1 text-xs text-muted-foreground">{reasonNames[c.reason] || c.reason}{c.note ? ` · ${c.note}` : ''}</p></div><span className="shrink-0 text-xs text-muted-foreground">{dateTime(c.created_at)}</span></div>)}{!credits.length && <p className="py-4 text-sm text-muted-foreground">Операций пока нет.</p>}</div></div>
            </section>
            <aside className="border-t pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"><p className="eyebrow">Как это работает</p><ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><li>2 кредита начисляются при регистрации.</li><li>1 кредит — дизайн (в каждом 3 бесплатных редактирования) или подбор товаров.</li><li>+2 кредита за друга после его первой покупки.</li><li>При сбое кредит возвращается.</li><li>Кредиты не сгорают.</li></ul><a href="/prices" className="lnk mt-6 inline-flex text-sm underline decoration-border underline-offset-4">Все условия и цены <KitIcon name="ur" /></a></aside>
          </div>
        )}
      </main>

      <KitSheet open={Boolean(selectedRoom)} onClose={() => setSelectedRoom(null)} title={selectedRoom?.style} wide>
        {selectedRoom && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="eyebrow">Комната</span>
              {selectedRoom.latest.room_type && <span>· {selectedRoom.latest.room_type}</span>}
              <span>· {selectedRoom.versions.length} {plural(selectedRoom.versions.length, 'версия', 'версии', 'версий')}</span>
              <span>· {dateTime(selectedRoom.latest.created_at)}</span>
            </div>
            {detailLoading ? <div className="flex min-h-64 items-center justify-center"><KitIcon name="sp" spin className="size-7 text-primary-text" /></div> : roomData ? (
              <>
                <div className="relative bg-secondary">
                  {roomData.render?.image ? <img src={roomData.render.image} alt="Дизайн комнаты" className="max-h-[52svh] w-full object-contain" /> : <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{roomData.error || 'Изображение недоступно'}</div>}
                  {roomData.render?.image && <button type="button" onClick={() => setFullscreen(true)} className="k-btn k-btn--ov k-btn--icon absolute right-3 top-3" aria-label="Открыть на весь экран"><KitIcon name="fs" /></button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {roomData.render?.image && <button type="button" onClick={() => setFullscreen(true)} className="k-btn k-btn--s"><KitIcon name="fs" />На весь экран</button>}
                  {roomData.render?.image && <a href={roomData.render.image} download="remontvision-design.jpg" className="k-btn k-btn--s"><KitIcon name="dl" />Скачать</a>}
                  {roomData.render?.image && <button type="button" onClick={() => { setShareRenderId(roomData.render?.id || ''); setShareOpen(true) }} className="k-btn k-btn--s"><KitIcon name="sh" />Поделиться</button>}
                  <a href={`/?panel=1&room=${encodeURIComponent(selectedRoom.roomId)}`} className="k-btn k-btn--s"><KitIcon name="ur" />Редактировать</a>
                  <button type="button" onClick={deleteRoom} className="k-btn k-btn--s k-btn--danger"><KitIcon name="tr" />Удалить комнату</button>
                </div>
                <div className="grid gap-4 border-y py-5 sm:grid-cols-2"><div><p className="eyebrow">Класс материалов</p><p className="mt-2 text-xl font-light">{tierName(roomData.price_tier)}</p><p className="mt-1 text-xs text-muted-foreground">Подбор по уровню, а не по сумме</p></div><div><p className="eyebrow">Оценка материалов</p><p className="mt-2 text-xl font-light">{rub(roomData.total)}</p><p className="mt-1 text-xs text-muted-foreground">Стоимость ориентировочная</p>{roomData.prices_as_of && <p className="mt-1 text-xs text-muted-foreground">Цены актуальны на {dateTime(roomData.prices_as_of)}</p>}</div></div>
                <div><p className="eyebrow">Версии</p><div className="mt-3 flex flex-wrap gap-2">{selectedRoom.versions.map((v, index) => <button key={v.id} type="button" aria-selected={selectedRenderId === v.id} onClick={() => selectVersion(v.id)} className="k-tab">Версия {selectedRoom.versions.length - index} · {v.request_text ? 'редактирование' : 'базовая'} · <span className={statusView(v.status).className}>{statusView(v.status).label}</span></button>)}</div></div>
                {realProducts.length > 0 && <div><p className="eyebrow">Подобранные товары · {realOfferCount}</p><div className="mt-3 space-y-5">{realProducts.map((match, index) => <div key={`${match.item.category}-${index}`}><div className="flex items-baseline justify-between gap-3 border-b pb-2"><p className="text-sm font-medium">{match.item.label}</p><span className="text-xs text-muted-foreground">{match.offers.length ? `${match.offers.length} в каталоге` : 'нет в каталоге'}</span></div>{match.offers.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{match.offers.map(offer => <a key={offer.id} href={offer.url || '#'} target="_blank" rel={offer.url ? 'noopener nofollow sponsored' : 'noopener nofollow'} className="k-card flex min-w-0 gap-3 p-2">{offer.image_url ? <img src={offer.image_url} alt={offer.name} className="size-16 shrink-0 object-cover" loading="lazy" /> : <div className="flex size-16 shrink-0 items-center justify-center bg-secondary text-xs text-muted-foreground">нет фото</div>}<div className="min-w-0"><p className="line-clamp-2 text-xs font-medium leading-5">{offer.name}</p><p className="mt-1 text-xs">{offer.price === null ? 'цена не указана' : rub(offer.price)}{offer.merchant ? ` · ${offer.merchant}` : ''}</p>{offer.erid ? <p className="text-xs text-muted-foreground">реклама · erid {offer.erid}</p> : null}</div></a>)}</div> : <p className="mt-2 text-xs text-muted-foreground">{match.note || 'Нет в каталоге'}</p>}</div>)}</div></div>}
                {roomData.use_catalog === false && <p className="border-y py-4 text-sm text-muted-foreground">Товары были отключены для этого дизайна — подборка не формировалась.</p>}
                {roomData.items.length > 0 && <div><p className="eyebrow">Товары и стоимость</p><div className="mt-3 divide-y border-y">{roomData.items.map((item, i) => <div key={`${item.name}-${i}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 text-sm"><span>{item.name}</span><span className="font-medium">{rub(item.price * item.qty)}</span><span className="col-span-2 text-xs text-muted-foreground">{rub(item.price)} × {item.qty} {item.unit}{` · ${item.presentation_status === 'verified' ? 'Проверен на рендере' : item.presentation_status === 'matched' ? 'Похожий по рендеру' : 'Подобран к дизайну'}`}{item.source ? ` · ${item.source}` : ''}{item.url ? <> · <a className={item.direct_url ? 'font-medium text-primary-text underline underline-offset-2' : 'underline underline-offset-2'} href={item.url} target="_blank" rel={item.direct_url ? 'noopener nofollow sponsored' : 'noopener nofollow'}>{item.link_label || 'в магазин'}</a></> : null}</span></div>)}</div></div>}
                {roomData.error && <p className="k-ban k-ban--bad">{roomData.error}</p>}
              </>
            ) : <p className="text-sm text-muted-foreground">Не удалось загрузить комнату.</p>}
          </>
        )}
      </KitSheet>
      <KitLightbox open={fullscreen && Boolean(roomData?.render?.image)} onClose={() => setFullscreen(false)} label="Просмотр дизайна на весь экран">
        {roomData?.render?.image && <img src={roomData.render.image} alt="Дизайн комнаты на весь экран" className="max-h-full max-w-full object-contain" />}
      </KitLightbox>
      <ShareDialog renderId={shareRenderId || roomData?.render?.id || ''} open={shareOpen} onClose={() => setShareOpen(false)} />
      {toast && <div className="kit-toast" role="status">{toast}</div>}
    </div>
  )
}

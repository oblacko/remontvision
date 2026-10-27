import { useEffect, useState } from 'react'
import '../App.css'
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ExamplesCarousel } from '@/components/ExamplesCarousel'
import { GenerationPanel } from '@/components/GenerationPanel'

const site = 'https://www.remontvision.ru'
const navItems = [['До / после', '#examples', 'examples'], ['Что вы получите', '#result', 'result'], ['Как работает', '#how', 'how'], ['Цены', '#prices', 'prices']] as const

type Me = { email: string; balance: number }
type PublicPack = { id: string; title: string; credits: number; price_kopecks: number }
const defaultPacks: PublicPack[] = [
  { id: 'pack2', title: 'Попробовать ещё', credits: 2, price_kopecks: 9900 },
  { id: 'pack5', title: 'Обдумать варианты', credits: 5, price_kopecks: 22900 },
  { id: 'pack15', title: 'Для нескольких комнат', credits: 15, price_kopecks: 59900 },
]
type Consents = { offer: boolean; personal: boolean; transfer: boolean }
const consentsOf = (c: Consents) => ({ offer: c.offer, privacy: c.personal, cross_border: c.transfer })

const faq = [
  { q: 'Сколько стоит дизайн по фото?', a: 'После регистрации доступны 2 бесплатные генерации. Дальше: 2 кредита за 99 ₽, 5 за 229 ₽ или 15 за 599 ₽. Один кредит — одна генерация или правка. Подписка не нужна.' },
  { q: 'Какое фото подойдёт?', a: 'Чёткое фото комнаты при дневном свете: JPG, PNG или WebP до 15 МБ. Подойдут портретные, квадратные и альбомные кадры. Чем лучше видно стены, пол и мебель, тем полезнее результат.' },
  { q: 'Что я получу, кроме картинки?', a: 'Подбор материалов и товаров с ценами и ссылками на магазины, палитру в RAL и рекомендации по розеткам и выключателям — всё для выбранного интерьера.' },
  { q: 'Можно изменить готовый дизайн?', a: 'Да, результат можно уточнять текстовыми запросами: например, изменить цвет пола, заменить текстиль или сделать интерьер светлее. Каждая версия сохраняется в истории правок.' },
  { q: 'Можно сразу закупаться по смете?', a: 'Смета помогает сориентироваться, но ИИ может ошибаться. Перед покупкой проверьте размеры, количество, цены и наличие товаров в магазинах.' },
]

function Logo() {
  return (
    <a href="#top" className="text-lg font-medium tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4" aria-label="Ремонтвижн — на главную">
      ремонт<span className="text-primary-text">вижн</span><span className="align-super text-xs">®</span>
    </a>
  )
}

function ShiftLabel({ children }: { children: string }) {
  return <span className="shift-label" aria-hidden="true"><span>{children}</span><span>{children}</span></span>
}

function SectionMarker({ index, children }: { index: string; children: string }) {
  return <p className="eyebrow">[ {index} ] <span className="ml-3">{children}</span></p>
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginStep, setLoginStep] = useState<'email' | 'code'>('email')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [consents, setConsents] = useState<Consents>({ offer: false, personal: false, transfer: false })
  const [me, setMe] = useState<Me | null>(null)
  const [pendingPanel, setPendingPanel] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelRoomId, setPanelRoomId] = useState('')
  const [packs, setPacks] = useState<PublicPack[]>(defaultPacks)

  async function loadMe() {
    try {
      const r = await fetch('/api/me')
      setMe(r.ok ? await r.json() : null)
    } catch { setMe(null) }
  }

  useEffect(() => { void loadMe() }, [])
  useEffect(() => {
    if (!me) return
    const params = new URLSearchParams(location.search)
    if (params.get('panel') !== '1') return
    const room = params.get('room') || ''
    params.delete('panel')
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash)
    setPanelRoomId(room)
    setPanelOpen(true)
  }, [me])
  useEffect(() => {
    fetch('/api/packs').then(r => r.ok ? r.json() : null).then(list => {
      if (Array.isArray(list) && list.length) setPacks(list)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const sections = navItems.map(([, , id]) => document.getElementById(id)).filter((section): section is HTMLElement => Boolean(section))
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting)
      if (visible) setActiveSection(visible.target.id)
    }, { rootMargin: '-20% 0px -65% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  const openLogin = () => {
    setLoginStep('email')
    setLoginEmail(localStorage.getItem('rv_last_email') || '')
    setLoginCode(''); setLoginError('')
    setConsents({ offer: false, personal: false, transfer: false })
    setLoginOpen(true)
  }

  const closeLogin = (open: boolean) => {
    setLoginOpen(open)
    if (!open) {
      setLoginStep('email'); setLoginCode(''); setLoginError(''); setLoginBusy(false)
      setPendingPanel(false)
    }
  }

  const requestLogin = async () => {
    const email = loginEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setLoginError('Проверьте e-mail'); return }
    if (!consents.offer || !consents.personal || !consents.transfer) {
      setLoginError('Отметьте оферту, согласие на ПДн и трансграничную передачу'); return
    }
    setLoginBusy(true); setLoginError('')
    try {
      const r = await fetch('/api/auth/request-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      localStorage.setItem('rv_last_email', email)
      setLoginEmail(email); setLoginCode(''); setLoginStep('code')
    } catch (e) { setLoginError(e instanceof Error ? e.message : 'Не удалось отправить код') }
    finally { setLoginBusy(false) }
  }

  const verifyLogin = async () => {
    if (!/^\d{6}$/.test(loginCode)) { setLoginError('Код — 6 цифр'); return }
    const openAfter = pendingPanel
    setLoginBusy(true); setLoginError('')
    try {
      const r = await fetch('/api/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, code: loginCode, consents: consentsOf(consents) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || String(r.status))
      localStorage.setItem('rv_last_email', loginEmail)
      await loadMe()
      setPendingPanel(false)
      setLoginOpen(false)
      if (openAfter) setPanelOpen(true)
    } catch (e) { setLoginError(e instanceof Error ? e.message : 'Не удалось войти') }
    finally { setLoginBusy(false) }
  }

  const openPanel = () => {
    setMenuOpen(false)
    if (!me) { setPendingPanel(true); openLogin(); return }
    setPanelOpen(true)
  }

  return (
    <div id="top" className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <a href="#main" className="fixed left-4 top-4 z-50 -translate-y-24 bg-foreground px-4 py-2 text-sm text-background transition-transform focus-visible:translate-y-0">К содержанию</a>

      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm lg:flex" aria-label="Основная навигация">
            {navItems.map(([label, href, id]) => <a key={id} className={`nav-link ${activeSection === id ? 'nav-link-active' : ''}`} href={href} aria-current={activeSection === id ? 'location' : undefined}>{label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {me ? (
              <a href="/cabinet" className="hidden min-h-11 items-center gap-2 px-3 text-sm transition-opacity hover:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex">
                Кабинет · {me.balance} кр. <ArrowUpRight className="size-4" />
              </a>
            ) : (
              <button type="button" onClick={openLogin} className="hidden min-h-11 items-center gap-2 px-3 text-sm transition-opacity hover:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex">Войти <ArrowUpRight className="size-4" /></button>
            )}
            <Dialog open={loginOpen} onOpenChange={closeLogin}>
              <DialogContent className="rounded-none bg-background p-6 sm:max-w-md">
                {loginStep === 'email' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle className="display-title text-3xl">Вход по e-mail</DialogTitle>
                      <DialogDescription>Пришлём код на почту. Без паролей.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-4">
                      <div>
                        <label htmlFor="login-email" className="mb-2 block text-sm font-medium">E-mail</label>
                        <input id="login-email" type="email" autoComplete="email" autoFocus placeholder="you@example.ru" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} className="h-12 w-full rounded-none border bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20" />
                      </div>
                      <div className="space-y-2 text-sm">
                        {([
                          ['offer', <>Принимаю <a className="underline" href={`${site}/offer`}>публичную оферту</a></>],
                          ['personal', <>Согласен на <a className="underline" href={`${site}/privacy`}>обработку персональных данных</a></>],
                          ['transfer', <>Согласен на <a className="underline" href={`${site}/privacy#cross-border`}>трансграничную передачу</a> фото и запросов</>],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 leading-5">
                            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={consents[key]} onChange={(event) => setConsents(prev => ({ ...prev, [key]: event.target.checked }))} /><span>{label}</span>
                          </label>
                        ))}
                      </div>
                      {loginError && <p className="text-sm text-destructive" role="alert">{loginError}</p>}
                      <Button type="button" disabled={loginBusy} onClick={requestLogin} className="h-12 w-full rounded-none text-base">{loginBusy ? 'Отправляем…' : 'Получить код'}</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle className="display-title text-3xl">Код из письма</DialogTitle>
                      <DialogDescription>Отправили на {loginEmail}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-4">
                      <div>
                        <label htmlFor="login-code" className="mb-2 block text-sm font-medium">Код</label>
                        <input id="login-code" type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus value={loginCode} onChange={(event) => setLoginCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-12 w-full rounded-none border bg-background px-4 text-center font-mono text-xl tracking-[0.35em] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/20" />
                      </div>
                      {loginError && <p className="text-sm text-destructive" role="alert">{loginError}</p>}
                      <Button type="button" disabled={loginBusy} onClick={verifyLogin} className="h-12 w-full rounded-none text-base">{loginBusy ? 'Проверяем…' : 'Войти'}</Button>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <button type="button" className="underline underline-offset-4" onClick={() => { setLoginStep('email'); setLoginError('') }}>Изменить e-mail</button>
                        <button type="button" className="underline underline-offset-4" onClick={requestLogin} disabled={loginBusy}>Отправить ещё раз</button>
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
            <button type="button" onClick={openPanel} className="action-primary hidden sm:inline-flex">Попробовать <ArrowUpRight className="size-4" /></button>
            <button type="button" className="flex size-12 items-center justify-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="page-shell grid border-t py-3 lg:hidden" aria-label="Мобильная навигация">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center justify-between border-b text-sm last:border-0 hover:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}<ArrowUpRight className="size-4" /></a>
            ))}
            {me ? (
              <a href="/cabinet" className="flex min-h-12 items-center justify-between border-b text-sm hover:opacity-50">Кабинет · {me.balance} кр.<ArrowUpRight className="size-4" /></a>
            ) : (
              <button type="button" onClick={() => { setMenuOpen(false); openLogin() }} className="flex min-h-12 items-center justify-between border-b text-left text-sm hover:opacity-50">Войти<ArrowUpRight className="size-4" /></button>
            )}
            <button type="button" onClick={openPanel} className="action-primary mt-3">Попробовать бесплатно</button>
          </nav>
        )}
      </header>

      <main id="main">
        <section className="hero-scene" aria-labelledby="hero-title">
          <img src="/images/hero-editorial.webp" alt="Светлая гостиная с дубовой мебелью, льняным диваном и мягким естественным светом" className="hero-backdrop" fetchPriority="high" />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-grid-lines" aria-hidden="true" />
          <HeroBlueprint />

          <div className="page-shell hero-content">
            <div className="hero-enter hero-delay-1 flex items-center justify-between gap-4 border-t border-background/35 pt-3 font-mono text-xs uppercase tracking-widest text-background/80">
              <span>[ 01 ] / AI INTERIOR STUDIO</span>
              <span className="hidden sm:block">Фото → дизайн → смета</span>
            </div>

            <div className="mt-auto pt-16 sm:pt-24">
              <h1 id="hero-title" className="display-title hero-title hero-enter hero-delay-2">
                <span className="block">Примерьте ремонт</span>
                <span className="block text-primary">до покупок</span>
              </h1>

              <div className="hero-enter hero-delay-3 mt-8 grid gap-8 border-t border-background/35 pt-6 lg:grid-cols-12 lg:items-start">
                <p className="max-w-xl text-lg font-light leading-7 text-background sm:text-xl lg:col-span-5">
                  По вашему фото — дизайн комнаты, реальные товары и смета. <strong className="font-medium text-primary">Сначала увидьте результат, потом тратьте деньги.</strong>
                </p>
                <div className="lg:col-span-7 lg:pl-8">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <button type="button" onClick={openPanel} className="action-primary hero-action-primary button-shift min-h-14 flex-1 px-8 text-base">
                      <span className="sr-only">Создать мой дизайн</span><ShiftLabel>Создать мой дизайн</ShiftLabel><ArrowUpRight className="size-5" />
                    </button>
                    <a href="#how" className="action-hero-secondary button-shift min-h-14 flex-1 px-8 text-base">
                      <span className="sr-only">Как это работает</span><ShiftLabel>Как это работает</ShiftLabel><ArrowRight className="size-5" />
                    </a>
                  </div>
                  <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-wider text-background/80">
                    <span>2 генерации — 0 ₽</span><span>Без подписки</span><span>30–60 секунд</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="hero-enter hero-delay-4 mt-8 flex items-end justify-between gap-4 border-t border-background/35 pt-3 font-mono text-xs uppercase tracking-widest text-background/70">
              <span>Гостиная / тёплый минимализм</span>
              <span className="hidden items-center gap-2 sm:flex">Ваш интерьер начинается здесь <ArrowRight className="hero-caption-arrow size-4" /></span>
            </div>
          </div>
        </section>

        <section className="mt-8 bg-foreground text-background" aria-label="Главные преимущества">
          <div className="page-shell grid md:grid-cols-3">
            {[
              ['[ 01 ]', 'Изображение + подбор', 'Увидьте интерьер и узнайте, из чего его собрать: пол, краска, свет, мебель и отделка.'],
              ['[ 02 ]', 'Бюджет до генерации', 'Задайте сумму заранее — сервис учтёт её при подборе материалов и товаров.'],
              ['[ 03 ]', 'Без подписки', 'Начните с двух бесплатных генераций. Дальше платите только за нужные кредиты.'],
            ].map(([index, title, text]) => (
              <div key={index} className="border-b border-background/20 py-8 md:border-b-0 md:border-r md:px-8 md:py-10 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
                <span className="font-mono text-xs text-primary">{index}</span>
                <h2 className="mt-6 text-xl font-light uppercase tracking-wide">{title}</h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-background/65">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="examples" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="examples-title">
          <div className="page-shell">
            <SectionMarker index="02">До / после</SectionMarker>
            <div className="mb-10 mt-6 grid gap-6 md:grid-cols-12 md:items-end">
              <h2 id="examples-title" className="display-title section-title md:col-span-8">Одна комната.<br />Новая жизнь.</h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground md:col-span-4">Листайте примеры и двигайте ползунок. Каждый формат сохраняет пропорции — без случайной обрезки.</p>
            </div>
            <ExamplesCarousel />
          </div>
        </section>

        <section id="upload" className="scroll-mt-20 border-y bg-secondary" aria-labelledby="upload-title">
          <div className="page-shell grid lg:grid-cols-12">
            <div className="border-b py-12 lg:col-span-5 lg:border-b-0 lg:border-r lg:py-16 lg:pr-12">
              <SectionMarker index="03">Генератор</SectionMarker>
              <h2 id="upload-title" className="display-title mt-8 text-4xl sm:text-5xl">Четыре шага<br />до сметы</h2>
              <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">Фото комнаты, пресет стиля или ваш референс, правки текстом — а в финале товары, цвета RAL и разметка розеток.</p>
              <ol className="mt-8 space-y-3 border-t pt-6 text-sm">
                {['Загрузите фото комнаты', 'Выберите пресет стиля или референс', 'Правьте результат текстом', 'Получите смету, RAL и электрику'].map((item, index) => (
                  <li key={item} className="flex gap-3"><span className="font-mono text-xs text-primary-text">0{index + 1}</span>{item}</li>
                ))}
              </ol>
              <button type="button" onClick={openPanel} className="action-primary button-shift mt-8 min-h-14 px-8 text-base">
                <span className="sr-only">Открыть генератор</span><ShiftLabel>Открыть генератор</ShiftLabel><ArrowUpRight className="size-5" />
              </button>
              <p className="mt-4 text-xs text-muted-foreground">2 генерации бесплатно после регистрации · без подписки</p>
            </div>
            <div className="relative min-h-80 overflow-hidden bg-foreground lg:col-span-7 lg:min-h-full">
              <img src="/images/living-after.webp" alt="Готовая гостиная в современной классике после генерации" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
              <div className="absolute inset-0 bg-foreground/35" aria-hidden="true" />
              <button type="button" onClick={openPanel} className="action-primary absolute inset-x-6 bottom-6 min-h-14 text-base sm:inset-x-auto sm:bottom-10 sm:left-1/2 sm:w-80 sm:-translate-x-1/2">
                Собрать мой дизайн <ArrowUpRight className="size-5" />
              </button>
            </div>
          </div>
        </section>

        <section id="result" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="result-title">
          <div className="page-shell">
            <SectionMarker index="04">Не только картинка</SectionMarker>
            <div className="mt-6 grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h2 id="result-title" className="display-title section-title">От идеи<br />к покупкам</h2>
                <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">Не тратьте время на поиск «такого же пола» или «похожего светильника» после рендера. Сервис покажет позиции, цены и ссылки на магазины в одном результате.</p>
                <div className="mt-8 divide-y border-y">
                  {['Пол, краска и отделка', 'Свет, мебель и товары', 'Цены и ссылки на магазины'].map((item, index) => <div key={item} className="flex items-center gap-4 py-4 text-sm"><span className="font-mono text-xs text-primary-text">0{index + 1}</span>{item}</div>)}
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="bg-foreground p-6 text-background sm:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-background/20 pb-6">
                    <div><p className="font-mono text-xs uppercase tracking-widest text-background/60">Пример результата</p><h3 className="mt-2 text-xl font-light uppercase">Спальня / смета</h3></div>
                    <span className="border border-background/25 px-3 py-2 font-mono text-xs">6 позиций</span>
                  </div>
                  <div className="divide-y divide-background/15">
                    {[
                      ['Краска для стен', '10 л', '8 400 ₽'], ['Ламинат дуб натуральный', '18 м²', '41 800 ₽'], ['Плинтус и профиль', '1 комплект', '9 600 ₽'], ['Шторы и карниз', '1 комплект', '18 900 ₽'], ['Прикроватный светильник', '2 шт.', '7 800 ₽'], ['Потолочный свет', '1 комплект', '12 400 ₽'],
                    ].map(([name, qty, price]) => <div key={name} className="estimate-row grid gap-x-4 gap-y-1 py-4 text-sm"><span>{name}</span><span className="row-span-2 self-center font-medium">{price}</span><span className="text-xs text-background/55">{qty}</span></div>)}
                  </div>
                  <div className="flex items-end justify-between gap-4 border-t border-background/20 pt-6"><span className="text-sm text-background/65">Итого, оценка</span><strong className="text-3xl font-light text-primary">98 900 ₽</strong></div>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Состав и суммы демонстрационные. Это не оферта и не актуальный прайс магазинов.</p>
              </div>
            </div>
            <figure className="mt-12">
              <div className="material-image overflow-hidden bg-muted">
                <img src="/images/materials-editorial.webp" alt="Подбор материалов для интерьера: дуб, травертин, лён, керамика и тёплые оттенки краски" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </div>
              <figcaption className="mt-3 flex items-center justify-between gap-4 font-mono text-xs uppercase tracking-widest text-muted-foreground"><span>Материалы / палитра</span><span>Реальные текстуры</span></figcaption>
            </figure>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-y bg-foreground text-background" aria-labelledby="how-title">
          <div className="page-shell grid lg:grid-cols-12">
            <div className="py-12 lg:col-span-5 lg:py-16 lg:pr-12">
              <p className="font-mono text-xs uppercase tracking-widest text-background/60">[ 05 ] / Процесс</p>
              <h2 id="how-title" className="display-title mt-8 text-4xl sm:text-5xl">От фото<br />до решения</h2>
              <p className="mt-6 max-w-sm text-sm leading-6 text-background/60">Без установки программ и освоения 3D-редактора. Всё происходит в браузере.</p>
            </div>
            <div className="lg:col-span-7 lg:pl-12">
              {[
                ['Сфотографируйте комнату', 'Подойдёт чёткий кадр при дневном свете. Загрузите JPG, PNG или WebP до 15 МБ.'],
                ['Выберите стиль и палитру', 'Задайте направление интерьера, цветовую схему или загрузите свой референс.'],
                ['Получите дизайн и правьте текстом', 'Каждая версия сохраняется в истории — можно вернуться к любой.'],
                ['Соберите смету', 'Товары с ценами, цвета RAL и рекомендации по розеткам и выключателям.'],
              ].map(([title, text], index) => <div key={title} className="step-row grid gap-4 border-t border-background/20 py-6"><span className="font-mono text-xs text-primary">0{index + 1}</span><div><h3 className="text-lg font-light uppercase tracking-wide">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-background/60">{text}</p></div></div>)}
            </div>
          </div>
        </section>

        <section id="prices" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="prices-title">
          <div className="page-shell">
            <SectionMarker index="06">Прозрачная оплата</SectionMarker>
            <div className="mt-6 grid gap-8 md:grid-cols-12 md:items-end">
              <h2 id="prices-title" className="display-title section-title md:col-span-8">Без подписки.<br />Без сюрпризов.</h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground md:col-span-4">Один кредит — одна генерация или правка. Покупайте только то, что нужно сейчас.</p>
            </div>
            <div className="mt-12 grid border-y md:grid-cols-3">
              {packs.map((pack, index) => {
                const unit = pack.credits === 1 ? 'кредит' : pack.credits < 5 ? 'кредита' : 'кредитов'
                const price = new Intl.NumberFormat('ru-RU').format(pack.price_kopecks / 100) + ' ₽'
                return <div key={pack.id} className="border-b py-8 last:border-b-0 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"><div className="flex items-start justify-between gap-4"><span className="display-title text-6xl">{String(pack.credits).padStart(2, '0')}</span><span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{unit}</span></div><p className="mt-8 text-2xl font-light">{price}</p><p className="mt-2 text-sm text-muted-foreground">{pack.title}</p>{index === 0 && <p className="mt-4 text-xs text-primary-text">До этого — 2 генерации бесплатно</p>}</div>
              })}
            </div>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={openPanel} className="action-primary">Начать бесплатно <ArrowUpRight className="size-4" /></button>
                <a href="/cabinet#credits" className="action-secondary">Купить кредиты <ArrowUpRight className="size-4" /></a>
              </div>
              <a href={`${site}/prices`} className="inline-flex min-h-11 items-center gap-2 text-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Все условия и цены <ArrowUpRight className="size-4" /></a>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t bg-secondary" aria-labelledby="faq-title">
          <div className="page-shell grid gap-10 py-16 lg:grid-cols-12 lg:py-24">
            <div className="lg:col-span-4"><SectionMarker index="07">Вопросы</SectionMarker><h2 id="faq-title" className="display-title mt-6 text-4xl sm:text-5xl">Перед<br />началом</h2><p className="mt-6 text-sm leading-6 text-muted-foreground">Остался вопрос?<br /><a className="mt-2 inline-block text-foreground underline decoration-border underline-offset-4" href="mailto:support@remontvision.ru">support@remontvision.ru</a></p></div>
            <Accordion type="single" collapsible className="lg:col-span-8" defaultValue="item-0">
              {faq.map((item, index) => <AccordionItem key={item.q} value={`item-${index}`} className="border-b border-foreground/20"><AccordionTrigger className="min-h-16 py-5 text-left text-lg font-light hover:opacity-50 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">{item.q}</AccordionTrigger><AccordionContent className="max-w-2xl pb-6 text-sm leading-6 text-muted-foreground">{item.a}</AccordionContent></AccordionItem>)}
            </Accordion>
          </div>
        </section>

        <section className="bg-primary text-primary-foreground" aria-labelledby="final-cta-title">
          <div className="mx-auto grid max-w-screen-2xl lg:grid-cols-12">
            <div className="px-4 py-12 sm:px-6 lg:col-span-8 lg:px-8 lg:py-16">
              <div className="flex items-center justify-between gap-4 border-t border-foreground/30 pt-3 font-mono text-xs uppercase tracking-widest"><span>Ваш интерьер начинается с фото</span><ArrowUpRight className="size-5" /></div>
              <h2 id="final-cta-title" className="display-title section-title mt-8">Посмотрите,<br />что возможно</h2>
              <div className="mt-8 flex flex-col gap-6 border-t border-foreground/30 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-lg text-sm leading-6">Две генерации бесплатно после регистрации. Дизайн, материалы, цены и ссылки — в одном результате.</p>
                <button type="button" onClick={openPanel} className="action-final button-shift"><span className="sr-only">Загрузить комнату</span><ShiftLabel>Загрузить комнату</ShiftLabel><ArrowRight className="size-4" /></button>
              </div>
            </div>
            <div className="relative min-h-80 overflow-hidden lg:col-span-4 lg:min-h-full">
              <img src="/images/bedroom-editorial.webp" alt="Спокойная спальня в тёплых натуральных оттенках с льняным постельным бельём" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
              <span className="absolute bottom-4 left-4 bg-background px-3 py-2 font-mono text-xs uppercase tracking-widest text-foreground">Спальня / вдохновение</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="page-shell py-8">
        <div className="grid gap-8 border-t pt-8 md:grid-cols-12">
          <div className="md:col-span-5"><Logo /><p className="mt-4 max-w-md text-xs leading-5 text-muted-foreground">Самозанятый Чернов Олег Геннадьевич<br />ИНН 526311206266</p></div>
          <nav className="flex flex-wrap content-start gap-x-6 gap-y-3 text-xs text-muted-foreground md:col-span-7 md:justify-end" aria-label="Юридическая информация">
            <a className="footer-link" href={`${site}/prices`}>Услуги и цены</a><a className="footer-link" href={`${site}/offer`}>Оферта</a><a className="footer-link" href={`${site}/delivery`}>Получение</a><a className="footer-link" href={`${site}/contacts`}>Контакты</a><a className="footer-link" href={`${site}/privacy`}>Конфиденциальность</a>
          </nav>
        </div>
      </footer>

      <GenerationPanel
        open={panelOpen}
        initialRoomId={panelRoomId}
        onClose={() => { setPanelOpen(false); setPanelRoomId('') }}
        onRequireLogin={() => { setPanelOpen(false); openLogin() }}
        onRefreshUser={loadMe}
      />
    </div>
  )
}

function HeroBlueprint() {
  return (
    <svg className="hero-blueprint" viewBox="0 0 560 400" fill="none" aria-hidden="true">
      <g className="hero-blueprint-room" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
        <path d="M72 306V126L264 48L488 132V306H72Z" />
        <path d="M264 48V226M72 126L264 226L488 132M264 226V306" />
        <path d="M110 270V186L176 160V240L110 270ZM342 264V190L430 162V238L342 264Z" />
        <path d="M308 306V250L402 224L450 242V306M308 250L350 272L450 242M350 272V306" />
        <path d="M42 334H516M42 324V344M516 324V344M42 334L58 328M42 334L58 340M516 334L500 328M516 334L500 340" />
        <path d="M42 126H22V306H42M16 126H28M16 306H28" />
        <circle cx="264" cy="226" r="5" />
        <circle cx="72" cy="306" r="3" />
        <circle cx="488" cy="306" r="3" />
      </g>
      <g className="hero-blueprint-accent" stroke="currentColor" strokeWidth="2">
        <path d="M176 160L264 126L342 154" />
        <path d="M238 346H290" />
      </g>
      <g className="hero-blueprint-labels" fill="currentColor">
        <text x="248" y="366">4 200 MM</text>
        <text x="4" y="222" transform="rotate(-90 4 222)">2 800 MM</text>
        <text x="300" y="116">01 / ПЛАН КОМНАТЫ</text>
      </g>
      <g className="hero-blueprint-compass" stroke="currentColor" strokeWidth="1.2">
        <circle cx="488" cy="62" r="28" />
        <path d="M488 26V98M452 62H524M488 38L496 62L488 86L480 62L488 38Z" />
        <circle cx="488" cy="62" r="3" fill="currentColor" />
      </g>
    </svg>
  )
}

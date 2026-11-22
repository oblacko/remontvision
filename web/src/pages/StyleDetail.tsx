import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

type Style = {
  id: number
  key: string
  name: string
  display_name: string
  family: string
  era: string
  is_featured: boolean
  description: string
  image_url: string
  swatches: { hex: string; name?: string }[]
}

export default function StyleDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [style, setStyle] = useState<Style | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/styles')
      .then(r => r.ok ? r.json() : [])
      .then((list: Style[]) => {
        const found = Array.isArray(list) ? list.find(item => item.key === id) || null : null
        setStyle(found)
        if (found) {
          document.title = `${found.name} — ${found.display_name}: фото, особенности, визуализация | Ремонтвижн`
          const meta = document.querySelector('meta[name="description"]')
          const text = `${found.name} в интерьере: ${found.description} Палитра, материалы, примеры и визуализация по фото.`
          if (meta) meta.setAttribute('content', text)
          else {
            const tag = document.createElement('meta')
            tag.name = 'description'
            tag.content = text
            document.head.appendChild(tag)
          }
        }
      })
      .catch(() => setStyle(null))
      .finally(() => setLoading(false))
  }, [id])

  const generate = () => {
    if (!style) return
    localStorage.setItem('rv_prefill_style', style.name)
    navigate('/')
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-12 text-sm text-muted-foreground">Загружаем стиль…</main>
  }

  if (!style) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Стиль не найден</h1>
        <p className="mt-3 text-sm text-muted-foreground">Вернитесь в <Link to="/styles" className="underline underline-offset-2">библиотеку стилей</Link>.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="text-xs text-muted-foreground" aria-label="Хлебные крошки">
        <Link to="/" className="underline underline-offset-2">Главная</Link>
        <span className="mx-2">/</span>
        <Link to="/styles" className="underline underline-offset-2">Библиотека стилей</Link>
        <span className="mx-2">/</span>
        <span>{style.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="eyebrow">{style.family}{style.era ? ` · ${style.era}` : ''}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{style.name}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{style.display_name}</p>
          <p className="mt-5 max-w-2xl text-sm leading-6">{style.description}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={generate} className="k-btn k-btn--s">Сгенерировать такой же</button>
            <Link to="/styles" className="k-btn k-btn--ov k-btn--s">Все стили</Link>
          </div>

          {style.swatches.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold">Палитра</h2>
              <div className="mt-3 flex flex-wrap gap-3">
                {style.swatches.map((swatch, index) => (
                  <div key={`${swatch.hex}-${index}`} className="w-24">
                    <div className="h-16 border" style={{ background: swatch.hex }} />
                    <p className="mt-1 text-[10px] text-muted-foreground">{swatch.name || swatch.hex}</p>
                    <p className="text-[10px] text-muted-foreground">{swatch.hex}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div>
          <div className="relative aspect-[4/5] overflow-hidden border bg-muted">
            <img
              src={style.image_url}
              alt={`Пример интерьера в стиле ${style.name}`}
              className="h-full w-full object-cover"
              onError={(event) => { event.currentTarget.src = '/images/style-modern.webp' }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            Пример визуализации. Ваша комната сохранит архитектуру, окна и двери.
          </p>
        </div>
      </div>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold">Как мы описываем этот стиль</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          В визуализации стиль задаётся не одним словом, а сценой: свет, материалы, палитра, формы и камера.
          Поэтому один и тот же стиль даёт разные комнаты, но сохраняет характер.
        </p>
        <button type="button" onClick={generate} className="mt-5 k-btn k-btn--s">Примерить на своё фото</button>
      </section>
    </main>
  )
}

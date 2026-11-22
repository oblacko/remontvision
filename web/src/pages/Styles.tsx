import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

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

const FAMILIES = ['Все', 'Современные', 'Классика', 'Тёплые / природные', 'Акцентные']

export default function Styles() {
  const [styles, setStyles] = useState<Style[]>([])
  const [family, setFamily] = useState('Все')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Библиотека стилей интерьера — 32 направления | Ремонтвижн'
    const meta = document.querySelector('meta[name="description"]')
    const text = '32 стиля интерьера: от скандинавского и джапанди до советского модернизма и нео-деко. Примеры, палитры и визуализация по фото.'
    if (meta) meta.setAttribute('content', text)
    else {
      const tag = document.createElement('meta')
      tag.name = 'description'
      tag.content = text
      document.head.appendChild(tag)
    }
  }, [])

  useEffect(() => {
    fetch('/api/styles')
      .then(r => r.ok ? r.json() : [])
      .then(list => setStyles(Array.isArray(list) ? list : []))
      .catch(() => setStyles([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => family === 'Все' ? styles : styles.filter(item => item.family === family),
    [styles, family],
  )

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="text-xs text-muted-foreground" aria-label="Хлебные крошки">
        <Link to="/" className="underline underline-offset-2">Главная</Link>
        <span className="mx-2">/</span>
        <span>Библиотека стилей</span>
      </nav>

      <header className="mt-6 max-w-3xl">
        <p className="eyebrow">[ Библиотека ]</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">32 стиля интерьера</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Выберите настроение: от северного света и тихой гармонии до дворцового очарования и советской романтики.
          У каждого стиля — палитра, материалы и примеры. Понравившийся можно сразу примерить на своё фото.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Семейства стилей">
        {FAMILIES.map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={family === item}
            onClick={() => setFamily(item)}
            className={`min-h-10 border px-4 text-xs transition-colors ${family === item ? 'border-foreground bg-foreground text-background' : 'border-input hover:border-foreground'}`}
          >{item}</button>
        ))}
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Загружаем стили…</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(item => (
            <Link key={item.key} to={`/styles/${item.key}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden border bg-muted">
                <img
                  src={item.image_url}
                  alt={`Интерьер в стиле ${item.name}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  onError={(event) => { event.currentTarget.src = '/images/style-modern.webp' }}
                />
              </div>
              <p className="mt-2 text-sm font-medium leading-5">{item.display_name}</p>
              <p className="text-xs text-muted-foreground">{item.name}</p>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        Не знаете, что выбрать? <Link to="/" className="underline underline-offset-2">Загрузите фото</Link> — мы покажем 10 самых популярных направлений, а остальные откроются здесь.
      </p>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { ExamplesCarousel } from './ExamplesCarousel'
import { GalleryRail } from './GalleryRail'
import { SectionMarker } from './SectionMarker'
import { KitIcon } from './KitIcon'
import { goal } from '@/lib/analytics'
import { galleryCopy, copyVariant } from '@/lib/landingCopy'
import type { GalleryItem, GalleryRoom } from '@/lib/types'

// Статичный fallback ряда комнат на случай сбоя API (slug совпадает с server-side slugify).
const GALLERY_ROOMS_FALLBACK: GalleryRoom[] = [
  { name: 'Спальня', slug: 'spalnya' },
  { name: 'Гостиная', slug: 'gostinaya-zal' },
  { name: 'Кухня', slug: 'kuhnya' },
  { name: 'Кабинет', slug: 'kabinet' },
  { name: 'Санузел', slug: 'sanuzel' },
  { name: 'Детская', slug: 'detskaya' },
]

// Блок «Галерея»: заменяет прежний #examples. Курируемый слайдер «до/после»
// (ExamplesCarousel) + лента реальных рендеров (GalleryRail) + ссылки на комнаты.
export function GallerySection({ onOpenGenerator }: { onOpenGenerator: () => void }) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [rooms, setRooms] = useState<GalleryRoom[]>(GALLERY_ROOMS_FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/gallery/featured')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive || !data) return
        if (Array.isArray(data.items)) setItems(data.items)
        if (Array.isArray(data.rooms) && data.rooms.length) setRooms(data.rooms)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // block_view: ≥50% видимости, один раз за сессию (знаменатель CTR).
  useEffect(() => {
    const el = document.getElementById('gallery')
    if (!el) return
    if (sessionStorage.getItem('rv_block_view:gallery')) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          sessionStorage.setItem('rv_block_view:gallery', '1')
          goal('block_view', { block: 'gallery', variant: copyVariant })
          observer.disconnect()
        }
      }
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const showRail = items.length >= 4

  return (
    <section id="gallery" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="gallery-title">
      <div className="page-shell">
        <SectionMarker index="02">Галерея</SectionMarker>
        <div className="mb-10 mt-6 grid gap-6 md:grid-cols-12 md:items-end">
          <h2 id="gallery-title" className="display-title section-title md:col-span-8">Одна комната.<br />Новая жизнь.</h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground md:col-span-4">{galleryCopy.lead}</p>
        </div>

        <ExamplesCarousel />

        {/* Зона реальных дизайнов — отдельная подзона, чтобы не смешивать с курируемым до/после (D1).
            Лента скрывается при <4 карточках; ссылки на комнаты и /gallery остаются. */}
        <div className="mt-14 border-t pt-10">
          {(showRail || loading) && (
            <>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{galleryCopy.railHeading}</p>
              {showRail ? (
                <div className="mt-6"><GalleryRail items={items} /></div>
              ) : (
                <div className="mt-6 flex gap-4 overflow-hidden" aria-hidden="true">
                  {[0, 1, 2, 3].map(i => <div key={i} className="k-sk aspect-[4/3] w-64 shrink-0 sm:w-72" />)}
                </div>
              )}
            </>
          )}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={onOpenGenerator} className="k-btn k-btn--primary">
                {galleryCopy.ctaPrimary} <KitIcon name="ur" />
              </button>
              <a href="/gallery" onClick={() => goal('gallery_click', { place: 'landing', target: 'all' })} className="k-btn">
                {galleryCopy.ctaSecondary} <KitIcon name="ur" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">{galleryCopy.microtext}</p>
          </div>

          <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4" aria-label="Галерея по комнатам">
            {rooms.map(room => (
              <a
                key={room.slug}
                href={`/gallery/${room.slug}`}
                className="inline-flex min-h-11 items-center gap-2 text-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >{room.name}</a>
            ))}
          </nav>
        </div>
      </div>
    </section>
  )
}

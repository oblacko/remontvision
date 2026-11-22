import { useRef } from 'react'
import { KitIcon } from './KitIcon'
import { goal } from '@/lib/analytics'
import type { GalleryItem } from '@/lib/types'

// Лента реальных публичных рендеров («после», без «до») в блоке «Галерея».
// Карточка — одна ссылка (share, noindex); изображение /gallery/img/:id уже
// отдаёт 404 для приватных/незавершённых. Скролл — нативный scroll-snap.
export function GalleryRail({ items }: { items: GalleryItem[] }) {
  const railRef = useRef<HTMLDivElement>(null)

  const scrollBy = (dir: 1 | -1) => {
    const el = railRef.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <div>
      <div
        ref={railRef}
        className="rv-rail -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        role="region"
        aria-roledescription="carousel"
        aria-label="Галерея дизайнов"
      >
        {items.map((item, index) => (
          <a
            key={item.id}
            href={item.shareToken ? `/s/${encodeURIComponent(item.shareToken)}` : item.imageUrl}
            className="rv-gallery-card group"
            onClick={() => goal('gallery_click', {
              place: 'landing',
              target: 'card',
              room: item.roomType,
              style: item.style,
              position: index,
            })}
          >
            <span className="rv-gallery-media">
              <img
                src={item.imageUrl}
                alt={`${item.roomType} в стиле ${item.style}`}
                width={720}
                height={540}
                loading="lazy"
                decoding="async"
              />
            </span>
            <span className="rv-gallery-badge">дизайн в ремонтвижн</span>
            <h3 className="rv-gallery-caption">{item.roomType} · {item.style}</h3>
          </a>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => scrollBy(-1)} className="k-btn k-btn--icon" aria-label="Предыдущие дизайны">
          <KitIcon name="l" />
        </button>
        <button type="button" onClick={() => scrollBy(1)} className="k-btn k-btn--icon" aria-label="Следующие дизайны">
          <KitIcon name="r" />
        </button>
      </div>
    </div>
  )
}

import { useRef } from 'react'
import { KitIcon } from './KitIcon'
import { goal } from '@/lib/analytics'
import { copyVariant } from '@/lib/landingCopy'
import type { StyleCard } from '@/lib/types'

// Слайдер стилей: нативный scroll-snap, стрелки, клавиатура. Карточка — div
// с отдельной ссылкой (на /styles/:key) и кнопкой «Примерить» (без вложенных
// интерактивных элементов). Тап по площади карточки ведёт на страницу стиля,
// «Примерить» — ставит prefill и открывает генератор.
export function StylesRail({ styles, onApply }: { styles: StyleCard[]; onApply: (style: StyleCard) => void }) {
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
        aria-label="Стили интерьера"
      >
        {styles.map((style, index) => (
          <div key={style.key} className="rv-style-card">
            <a
              href={`/styles/${style.key}`}
              className="rv-style-link group"
              onClick={() => goal('style_click', { key: style.key, place: 'landing_rail', position: index, variant: copyVariant })}
            >
              <span className="rv-style-media">
                <img
                  src={style.image_url}
                  alt={`${style.name} в интерьере`}
                  width={480}
                  height={600}
                  loading="lazy"
                  decoding="async"
                  onError={(event) => { event.currentTarget.src = '/images/style-modern.webp' }}
                />
              </span>
              <span className="rv-style-body">
                <span className="rv-style-display">{style.display_name}</span>
                <span className="rv-style-name">{style.name}</span>
                {style.swatches.length > 0 && (
                  <span className="rv-style-swatches">
                    <span className="flex gap-1.5" aria-hidden="true">
                      {style.swatches.slice(0, 4).map((swatch, i) => (
                        <span key={i} className="rv-style-swatch" style={{ backgroundColor: swatch.hex }} />
                      ))}
                    </span>
                    <span className="sr-only">Палитра: {style.swatches.map(s => s.name || s.hex).join(', ')}</span>
                  </span>
                )}
              </span>
            </a>
            <button
              type="button"
              className="rv-style-apply"
              onClick={() => {
                goal('style_apply', { key: style.key, place: 'landing_rail', position: index })
                onApply(style)
              }}
            >
              Примерить <KitIcon name="ur" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => scrollBy(-1)} className="k-btn k-btn--icon" aria-label="Предыдущие стили">
          <KitIcon name="l" />
        </button>
        <button type="button" onClick={() => scrollBy(1)} className="k-btn k-btn--icon" aria-label="Следующие стили">
          <KitIcon name="r" />
        </button>
      </div>
    </div>
  )
}

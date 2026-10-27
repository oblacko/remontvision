import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { ImageComparison } from './ImageComparison'

const examples = [
  {
    title: 'Спальня',
    style: 'Тёплый минимализм',
    before: '/images/room-before.webp',
    after: '/images/room-after.webp',
    ratio: 2 / 3,
    format: 'Портрет 2:3',
  },
  {
    title: 'Гостиная',
    style: 'Современная классика',
    before: '/images/living-before.webp',
    after: '/images/living-after.webp',
    ratio: 3 / 2,
    format: 'Альбом 3:2',
  },
  {
    title: 'Кухня',
    style: 'Светлый современный',
    before: '/images/kitchen-before.webp',
    after: '/images/kitchen-after.webp',
    ratio: 1,
    format: 'Квадрат 1:1',
  },
]

export function ExamplesCarousel() {
  const [active, setActive] = useState(0)
  const example = examples[active]
  const previous = () => setActive((value) => (value - 1 + examples.length) % examples.length)
  const next = () => setActive((value) => (value + 1) % examples.length)

  return (
    <div>
      <div className="mb-6 flex flex-col gap-6 border-t border-foreground/20 pt-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-end gap-6">
          <span className="font-mono text-sm text-muted-foreground">{String(active + 1).padStart(2, '0')} / {String(examples.length).padStart(2, '0')}</span>
          <div aria-live="polite" aria-atomic="true">
            <h3 className="text-2xl font-light uppercase tracking-wide">{example.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{example.style} · {example.format}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={previous} className="carousel-button" aria-label="Предыдущий пример">
            <ArrowLeft className="size-5" />
          </button>
          <button type="button" onClick={next} className="carousel-button" aria-label="Следующий пример">
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>

      <ImageComparison
        key={example.title}
        before={example.before}
        after={example.after}
        beforeAlt={`${example.title} до ремонта`}
        afterAlt={`${example.title} после дизайна в стиле «${example.style}»`}
        ratio={example.ratio}
        label={example.title}
      />

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label="Выбрать комнату">
          {examples.map((item, index) => (
            <button
              key={item.title}
              type="button"
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              className={`carousel-tab ${active === index ? 'carousel-tab-active' : ''}`}
            >
              {String(index + 1).padStart(2, '0')} {item.title}
            </button>
          ))}
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Потяните ползунок</p>
      </div>
    </div>
  )
}

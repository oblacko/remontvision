import { useEffect, useState } from 'react'
import { StylesRail } from './StylesRail'
import { SectionMarker } from './SectionMarker'
import { KitIcon } from './KitIcon'
import { goal } from '@/lib/analytics'
import { stylesCopy, copyVariant } from '@/lib/landingCopy'
import type { StyleCard } from '@/lib/types'

// Статичный fallback 10 featured стилей (порядок продукта, совпадает с
// defaultStylePresets в GenerationPanel.tsx) — на случай сбоя /api/styles.
// Палитра — из designdata.js (DESIGN_STYLES palette), только для деградации.
const FEATURED_STYLES_FALLBACK: StyleCard[] = [
  { key: 'modern', name: 'Современный', display_name: 'Миланская нежность', image_url: '/images/style-modern.webp', swatches: ['#F4F2EE', '#D8CBB8', '#5A3E2B', '#1F4E5F'].map(hex => ({ hex })) },
  { key: 'loft', name: 'Лофт', display_name: 'Бруклинский ритм', image_url: '/images/style-loft.webp', swatches: ['#F0EDE8', '#D9A441', '#1C1C1C', '#2F4B8F'].map(hex => ({ hex })) },
  { key: 'scandinavian', name: 'Скандинавский', display_name: 'Копенгагенский свет', image_url: '/images/style-scandi.webp', swatches: ['#FAF8F4', '#D8B98A', '#8A9A8B', '#C26D5A'].map(hex => ({ hex })) },
  { key: 'provence', name: 'Прованс', display_name: 'Лавандовое поле', image_url: '/images/style-country.webp', swatches: ['#F6F1E7', '#C9856A', '#7E8B72', '#8E7AA8'].map(hex => ({ hex })) },
  { key: 'minimalism', name: 'Современный минимализм', display_name: 'Токийская лёгкость', image_url: '/images/style-minimal.webp', swatches: ['#F5F3EF', '#C9C4BB', '#7C8A5A', '#D2A24C'].map(hex => ({ hex })) },
  { key: 'neoclassic', name: 'Неоклассика', display_name: 'Парижская классика', image_url: '/images/style-neo.webp', swatches: ['#F2EDE4', '#C9A961', '#1F3A5F', '#7A2E3A'].map(hex => ({ hex })) },
  { key: 'boho', name: 'Бохо', display_name: 'Марракеш-текстиль', image_url: '/images/style-boho.webp', swatches: ['#EFE3D2', '#D99A3D', '#6E7A4A', '#B4553F'].map(hex => ({ hex })) },
  { key: 'baroque', name: 'Современное барокко', display_name: 'Версальское очарование', image_url: '/images/style-deco.webp', swatches: ['#F3EAD9', '#C9A961', '#1F5A45', '#6E1F2E'].map(hex => ({ hex })) },
  { key: 'japandi', name: 'Джапанди', display_name: 'Киотская тишина', image_url: '/images/style-japandi.webp', swatches: ['#EDE8DF', '#B76E4A', '#4A3B2A', '#6E7A4A'].map(hex => ({ hex })) },
  { key: 'classic', name: 'Классический', display_name: 'Лондонская библиотека', image_url: '/images/style-neo.webp', swatches: ['#EDE4D3', '#C9A961', '#4A2E22', '#6E1F2A'].map(hex => ({ hex })) },
]

// Блок «Стили»: 10 featured в слайдере + плитка «Все 32 стиля».
export function StylesSection({ onOpenGenerator }: { onOpenGenerator: (place: 'styles_rail', styleKey?: string) => void }) {
  const [styles, setStyles] = useState<StyleCard[]>(FEATURED_STYLES_FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/styles?featured=1')
      .then(r => r.ok ? r.json() : null)
      .then(list => {
        if (alive && Array.isArray(list) && list.length) setStyles(list)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // block_view: ≥50% видимости, один раз за сессию (знаменатель CTR).
  useEffect(() => {
    const el = document.getElementById('styles')
    if (!el) return
    if (sessionStorage.getItem('rv_block_view:styles')) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          sessionStorage.setItem('rv_block_view:styles', '1')
          goal('block_view', { block: 'styles', variant: copyVariant })
          observer.disconnect()
        }
      }
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const applyStyle = (style: StyleCard) => {
    localStorage.setItem('rv_prefill_style', style.name)
    onOpenGenerator('styles_rail', style.key)
  }

  return (
    <section id="styles" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="styles-title">
      <div className="page-shell">
        <SectionMarker index="03">Стили</SectionMarker>
        <div className="mb-10 mt-6 grid gap-6 md:grid-cols-12 md:items-end">
          <h2 id="styles-title" className="display-title section-title md:col-span-8">{stylesCopy.h2}</h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground md:col-span-4">{stylesCopy.lead}</p>
        </div>

        {loading ? (
          <div className="flex gap-4 overflow-hidden" aria-hidden="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="k-sk aspect-[4/5] w-56 shrink-0 sm:w-64" />)}
          </div>
        ) : (
          <StylesRail styles={styles} onApply={applyStyle} />
        )}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <a href="/styles" className="k-btn">{stylesCopy.tileLabel} <KitIcon name="ur" /></a>
          <p className="text-xs text-muted-foreground">{stylesCopy.microtext}</p>
        </div>
      </div>
    </section>
  )
}

import { useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { ChevronsLeftRight } from 'lucide-react'

type ImageComparisonProps = {
  before: string
  after: string
  beforeAlt: string
  afterAlt: string
  ratio: number
  label: string
}

type ComparisonStyle = CSSProperties & { '--comparison-ratio': number }

export function ImageComparison({ before, after, beforeAlt, afterAlt, ratio, label }: ImageComparisonProps) {
  const [position, setPosition] = useState(50)

  const updatePosition = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = ((event.clientX - rect.left) / rect.width) * 100
    setPosition(Math.max(2, Math.min(98, next)))
  }

  return (
    <div className="comparison-viewport">
      <div
        className="comparison-canvas comparison-enter group relative select-none overflow-hidden"
        style={{ '--comparison-ratio': ratio } as ComparisonStyle}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          updatePosition(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePosition(event)
        }}
      >
        <img src={after} alt={afterAlt} className="absolute inset-0 h-full w-full object-contain" draggable="false" loading="lazy" decoding="async" />
        <img
          src={before}
          alt={beforeAlt}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          draggable="false"
          loading="lazy"
          decoding="async"
        />
        <span className="comparison-tag left-4 top-4">До</span>
        <span className="comparison-tag right-4 top-4">После</span>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-background" style={{ left: `${position}%` }}>
          <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ChevronsLeftRight className="size-5" aria-hidden="true" />
          </span>
        </div>
        <input
          type="range"
          min="2"
          max="98"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          aria-label={`${label}: сравнить фото до и после`}
          aria-valuetext={`Исходное фото видно на ${Math.round(position)} процентов ширины`}
        />
      </div>
    </div>
  )
}

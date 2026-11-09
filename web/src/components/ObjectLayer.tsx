import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ruLabel } from '@/lib/objects'
import type { VisibleObject } from '@/lib/objects'

type Props = {
  image: string
  ratio: number
  objects: VisibleObject[]
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  onMove: (index: number, dx: number, dy: number) => void
}

// Слой объектов поверх рендера: клик выбирает, перетаскивание задаёт дельту.
// bbox нормализован (0..1), поэтому позиции задаются процентами и не зависят от размера экрана.
export function ObjectLayer({ image, ratio, objects, selectedIndex, onSelect, onMove }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ index: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [offset, setOffset] = useState<{ index: number; dx: number; dy: number } | null>(null)

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { index, startX: event.clientX, startY: event.clientY, moved: false }
    setOffset({ index, dx: 0, dy: 0 })
    onSelect(index)
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    setOffset({ index: drag.index, dx, dy })
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setOffset(null)
    if (!drag || !drag.moved) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    if (Math.abs(dx) + Math.abs(dy) < 0.005) return
    onMove(drag.index, dx, dy)
  }

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto w-full overflow-hidden bg-foreground"
      style={{ aspectRatio: String(safeRatio), width: `min(100%, calc(62svh * ${safeRatio}))` }}
    >
      <img src={image} alt="Сгенерированный дизайн интерьера" className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
      {objects.map((object, index) => {
        const box = object.bbox
        if (!Array.isArray(box) || box.length !== 4) return null
        const [x = 0, y = 0, w = 0, h = 0] = box
        const selected = selectedIndex === index
        const drag = offset?.index === index ? offset : null
        return (
          <button
            key={`${object.label || 'object'}-${index}`}
            type="button"
            aria-pressed={selected}
            aria-label={`Объект: ${ruLabel(object.label)}`}
            onPointerDown={event => onPointerDown(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current = null; setOffset(null) }}
            className={`absolute cursor-move touch-none border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary bg-primary/15' : 'border-primary/70 bg-transparent hover:bg-primary/10'}`}
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
            }}
          >
            <span className={`pointer-events-none absolute left-0 top-0 max-w-full truncate px-1.5 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-wide ${selected ? 'bg-primary text-primary-foreground' : 'bg-foreground/85 text-background'}`}>
              {ruLabel(object.label)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

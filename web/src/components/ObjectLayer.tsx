import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { cropObjectDataUrl, moveDirection, ruLabel } from '@/lib/objects'
import type { VisibleObject } from '@/lib/objects'

type Props = {
  image: string
  ratio: number
  objects: VisibleObject[]
  onCreateEdit: (index: number) => void
  onConfirmMove: (index: number, dx: number, dy: number) => void
}

type Popup = { index: number; dx: number; dy: number; moved: boolean }

// Слой объектов: клик — подсветка и попап «создать правку», перетаскивание —
// попап «переместить». Правка создаётся в существующей вкладке (3 на дизайн).
export function ObjectLayer({ image, ratio, objects, onCreateEdit, onConfirmMove }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ index: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [offset, setOffset] = useState<{ index: number; dx: number; dy: number } | null>(null)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [dragImage, setDragImage] = useState<string | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  // Размер обёртки, снятый в обработчике события: в рендере ref читать нельзя.
  const [wrapSize, setWrapSize] = useState<{ width: number; height: number } | null>(null)

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { index, startX: event.clientX, startY: event.clientY, moved: false }
    setActiveIndex(index)
    setOffset({ index, dx: 0, dy: 0 })
    setPopup(null)
    const box = objects[index]?.bbox
    if (box) void cropObjectDataUrl(image, box).then(url => setDragImage(url))
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      setWrapSize({ width: rect.width, height: rect.height })
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    setOffset({ index: drag.index, dx, dy })
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      setWrapSize({ width: rect.width, height: rect.height })
    }
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setOffset(null)
    setDragImage(null)
    setPointer(null)
    setWrapSize(null)
    if (!drag) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    if (drag.moved && Math.abs(dx) + Math.abs(dy) >= 0.005) setPopup({ index: drag.index, dx, dy, moved: true })
    else setPopup({ index: drag.index, dx: 0, dy: 0, moved: false })
  }

  const closePopup = () => { setPopup(null); setActiveIndex(null) }

  const popupObject = popup ? objects[popup.index] : null
  const popupBox = popupObject?.bbox
  const placeBelow = popupBox ? (popupBox[1] + popupBox[3]) < 0.62 : true
  const popupLeft = popupBox ? Math.min(0.75, Math.max(0.25, popupBox[0] + popupBox[2] / 2)) : 0.5
  const popupTop = popupBox ? (placeBelow ? popupBox[1] + popupBox[3] : popupBox[1]) : 0.5

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto w-full"
      style={{ aspectRatio: String(safeRatio), width: `min(100%, calc(62svh * ${safeRatio}))` }}
    >
      <div className="absolute inset-0 overflow-hidden bg-secondary">
        <img src={image} alt="Сгенерированный дизайн интерьера" className="h-full w-full select-none object-cover" draggable={false} />
      </div>
      {objects.map((object, index) => {
        const box = object.bbox
        if (!Array.isArray(box) || box.length !== 4) return null
        const [x = 0, y = 0, w = 0, h = 0] = box
        const selected = activeIndex === index
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
            onPointerCancel={() => { dragRef.current = null; setOffset(null); setPointer(null); setWrapSize(null) }}
            className={`absolute cursor-move touch-none border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary ${selected ? 'border-primary bg-primary/15' : 'border-primary/70 bg-transparent hover:bg-primary/10'}`}
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
            }}
          >
            <span className={`pointer-events-none absolute left-0 top-0 max-w-full truncate px-1.5 py-0.5 font-mono text-xs uppercase leading-4 tracking-wide ${selected ? 'bg-primary text-primary-foreground' : 'bg-foreground/85 text-background'}`}>
              {ruLabel(object.label)}
            </span>
          </button>
        )
      })}
      {offset && dragImage && pointer && wrapSize && (() => {
        const object = objects[offset.index]
        const box = object?.bbox
        if (!box) return null
        const [x = 0, y = 0, w = 0, h = 0] = box
        return (
          <>
            <div className="pointer-events-none absolute z-10 border-2 border-dashed border-primary" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, transform: `translate(${offset.dx}px, ${offset.dy}px)` }} />
            <img src={dragImage} alt="" className="pointer-events-none absolute z-10 border-2 border-primary object-cover opacity-90 shadow-[0_8px_24px_rgba(0,0,0,0.35)]" style={{ left: pointer.x - (w * wrapSize.width) / 2, top: pointer.y - (h * wrapSize.height) / 2, width: w * wrapSize.width, height: h * wrapSize.height }} />
          </>
        )
      })()}
      {popup && popupObject && popupBox && (
        <div
          className="absolute z-20 w-56 border-2 border-foreground bg-background p-3 shadow-[4px_4px_0_oklch(var(--primary))]"
          style={{ left: `${popupLeft * 100}%`, top: `${popupTop * 100}%`, transform: `translate(-50%, ${placeBelow ? '10px' : 'calc(-100% - 10px)'})` }}
          role="dialog"
          aria-label="Действие с объектом"
        >
          <p className="text-sm font-medium">{ruLabel(popupObject.label)}</p>
          {popup.moved ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Переместить {moveDirection(popup.dx, popup.dy).text} на {moveDirection(popup.dx, popup.dy).percent}% кадра?</p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Редактировать этот объект? Его можно и перетащить.</p>
          )}
          <div className="mt-2 flex flex-col gap-1">
            {popup.moved && (
              <button type="button" className="action-primary min-h-11 text-xs" onClick={() => { onConfirmMove(popup.index, popup.dx, popup.dy); closePopup() }}>Переместить</button>
            )}
            <button type="button" className="action-secondary min-h-11 text-xs" onClick={() => { onCreateEdit(popup.index); closePopup() }}>Редактировать</button>
            <button type="button" className="min-h-11 text-xs text-muted-foreground underline" onClick={closePopup}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}

import { ruLabel } from '@/lib/objects'
import type { VisibleObject } from '@/lib/objects'

type Props = {
  image: string
  ratio: number
  objects: VisibleObject[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}

// Слой объектов поверх рендера: клик выбирает объект для правки.
// Без перетаскивания — правка создаётся в существующей вкладке (3 правки на дизайн).
export function ObjectLayer({ image, ratio, objects, selectedIndex, onSelect }: Props) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5

  return (
    <div
      className="relative mx-auto w-full overflow-hidden bg-foreground"
      style={{ aspectRatio: String(safeRatio), width: `min(100%, calc(62svh * ${safeRatio}))` }}
    >
      <img src={image} alt="Сгенерированный дизайн интерьера" className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
      {objects.map((object, index) => {
        const box = object.bbox
        if (!Array.isArray(box) || box.length !== 4) return null
        const [x = 0, y = 0, w = 0, h = 0] = box
        const selected = selectedIndex === index
        return (
          <button
            key={`${object.label || 'object'}-${index}`}
            type="button"
            aria-pressed={selected}
            aria-label={`Объект: ${ruLabel(object.label)}`}
            onClick={() => onSelect(index)}
            className={`absolute border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary bg-primary/15' : 'border-primary/70 bg-transparent hover:bg-primary/10'}`}
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
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

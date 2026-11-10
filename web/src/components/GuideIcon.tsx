import { KitIcon, type KitIconName } from './KitIcon'
import { cn } from '@/lib/utils'

// Иконки категорий роадмапа сводим к набору UI-кита.
const GUIDE_ICONS: Record<string, KitIconName> = {
  palette: 'img', layers: 'img', paint: 'img', wallpaper: 'img',
  sofa: 'img', armchair: 'img', bed: 'img', table: 'img', lamp: 'bolt',
  lightbulb: 'bolt', refrigerator: 'img', cooktop: 'img', utensils: 'img', hood: 'bolt',
  washing: 'img', shower: 'img', water: 'img', ruler: 'ur', zap: 'bolt',
  calculator: 'info', coins: 'info', receipt: 'info', check: 'ok', shield: 'ok',
  rocket: 'ur', flag: 'info', arrow: 'r', hammer: 'tr', wrench: 'tr', box: 'img',
  door: 'img', blinds: 'img', shopping: 'ur', tag: 'ur', sparkles: 'info',
}

export function GuideIcon({ name, className }: { name?: string; className?: string }) {
  return <KitIcon name={(name && GUIDE_ICONS[name]) || 'info'} className={cn('size-4 shrink-0 text-primary-text', className)} />
}

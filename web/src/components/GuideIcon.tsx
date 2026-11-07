import {
  Armchair,
  ArrowRight,
  Bed,
  Blinds,
  Box,
  Calculator,
  ClipboardCheck,
  Coins,
  CookingPot,
  DoorOpen,
  Droplet,
  Fan,
  Flag,
  Hammer,
  Lamp,
  Layers,
  Lightbulb,
  PaintRoller,
  Palette,
  Receipt,
  Refrigerator,
  Rocket,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  ShowerHead,
  Sofa,
  Sparkles,
  Table,
  Tag,
  Utensils,
  Wallpaper,
  WashingMachine,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const GUIDE_ICONS: Record<string, LucideIcon> = {
  palette: Palette, layers: Layers, paint: PaintRoller, wallpaper: Wallpaper,
  sofa: Sofa, armchair: Armchair, bed: Bed, table: Table, lamp: Lamp,
  lightbulb: Lightbulb, refrigerator: Refrigerator, cooktop: CookingPot,
  utensils: Utensils, hood: Fan, washing: WashingMachine, shower: ShowerHead,
  water: Droplet, ruler: Ruler, zap: Zap, calculator: Calculator, coins: Coins,
  receipt: Receipt, check: ClipboardCheck, shield: ShieldCheck, rocket: Rocket,
  flag: Flag, arrow: ArrowRight, hammer: Hammer, wrench: Wrench, box: Box,
  door: DoorOpen, blinds: Blinds, shopping: ShoppingCart, tag: Tag, sparkles: Sparkles,
}

export function GuideIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && GUIDE_ICONS[name]) || Sparkles
  return <Icon className={cn('size-4 shrink-0 text-primary-text', className)} />
}

// «ТЗ для мастера» — текстовый бриф из уже собранного разбора.
// Никаких новых расчётов: берём габариты, отделку, RAL, электрику и порядок работ.

export type BriefDimensions = { width: number; length: number; height: number; confidence?: string } | null

export type BriefSurface = {
  surface?: string
  label?: string
  description?: string
  hex?: string
  ral?: { code?: string; name?: string } | null
}

export type BriefElectrical = { title?: string; text?: string }

export type BriefRepairAction = { action?: string; material?: string; why?: string }
export type BriefRepairScope = {
  floor?: BriefRepairAction | null
  ceiling?: BriefRepairAction | null
  walls?: BriefRepairAction | null
  doors?: BriefRepairAction | null
  windows?: BriefRepairAction | null
  storage?: string[]
} | null

export type MasterBriefInput = {
  roomType?: string | null
  style?: string | null
  dimensions?: BriefDimensions
  surfaces?: BriefSurface[]
  electrical?: BriefElectrical[]
  repairScope?: BriefRepairScope
  nextSteps?: string[]
  concept?: string | null
  date?: string
}

const REPAIR_LABELS: Array<[keyof Pick<NonNullable<BriefRepairScope>, 'floor' | 'ceiling' | 'walls' | 'doors' | 'windows'>, string]> = [
  ['floor', 'Пол'],
  ['ceiling', 'Потолок'],
  ['walls', 'Стены'],
  ['doors', 'Двери'],
  ['windows', 'Окна'],
]

const clean = (value?: string | null) => String(value || '').trim()

export function buildMasterBrief(input: MasterBriefInput): string {
  const lines: string[] = []
  const room = clean(input.roomType) || 'Комната'
  const style = clean(input.style)
  lines.push(`ТЗ для мастера — ${room}${style ? `, стиль: ${style}` : ''}`)
  lines.push(`Дата: ${input.date || new Date().toISOString().slice(0, 10)}`)
  lines.push('')

  if (input.dimensions) {
    const { width, length, height } = input.dimensions
    lines.push('ГАБАРИТЫ')
    lines.push(`Ширина × длина × высота: ${width} × ${length} × ${height} м (ориентир по фото).`)
    lines.push('Перед началом работ проверьте размеры на замере.')
    lines.push('')
  }

  const repair = input.repairScope
  const repairRows = repair
    ? REPAIR_LABELS
      .map(([key, label]) => ({ label, ...(repair[key] || {}) }))
      .filter(item => clean(item.action))
    : []
  if (repairRows.length) {
    lines.push('ОТДЕЛКА')
    for (const row of repairRows) {
      const material = clean(row.material) ? ` · материал: ${clean(row.material)}` : ''
      const why = clean(row.why) ? ` (${clean(row.why)})` : ''
      lines.push(`- ${row.label}: ${clean(row.action)}${material}${why}`)
    }
    lines.push('')
  }

  const surfaces = (input.surfaces || []).filter(surface => surface && (clean(surface.label) || clean(surface.description) || clean(surface.ral?.code)))
  if (surfaces.length) {
    lines.push('ЦВЕТА И МАТЕРИАЛЫ')
    for (const surface of surfaces) {
      const label = clean(surface.label) || clean(surface.surface) || 'Поверхность'
      const description = clean(surface.description)
      const ral = clean(surface.ral?.code) ? `RAL ${clean(surface.ral?.code)}${clean(surface.ral?.name) ? ` (${clean(surface.ral?.name)})` : ''}` : ''
      const parts = [description, ral].filter(Boolean).join(' · ')
      lines.push(`- ${label}: ${parts || clean(surface.hex) || 'уточнить на замере'}`)
    }
    lines.push('')
  }

  const electrical = (input.electrical || []).filter(item => clean(item.title) || clean(item.text))
  if (electrical.length) {
    lines.push('ЭЛЕКТРИКА')
    for (const item of electrical) lines.push(`- ${clean(item.title)}: ${clean(item.text)}`)
    lines.push('')
  }

  if (repair?.storage?.length) {
    lines.push('ХРАНЕНИЕ')
    for (const item of repair.storage) lines.push(`- ${clean(item)}`)
    lines.push('')
  }

  if (clean(input.concept)) {
    lines.push('КОНЦЕПЦИЯ')
    lines.push(clean(input.concept))
    lines.push('')
  }

  const steps = (input.nextSteps || []).map(clean).filter(Boolean)
  if (steps.length) {
    lines.push('ПОРЯДОК РАБОТ')
    steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`))
    lines.push('')
  }

  lines.push('Проверьте размеры, материалы и наличие товаров перед покупкой. Это ориентир для обсуждения с мастером, а не дизайн-проект.')
  return lines.join('\n')
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

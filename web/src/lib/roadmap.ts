export type RoadmapItem = {
  priority?: 'high' | 'medium' | 'low' | null
  who?: 'self' | 'specialist' | 'measure' | null
  id: string
  section_key: string
  section_title: string
  section_icon: string
  section_sort: number
  sort: number
  text: string
  done: boolean
  active: boolean
  comment: string | null
  is_custom: boolean
  created_at: string
}

export type RoadmapGroup = {
  key: string
  title: string
  icon: string
  sort: number
  items: RoadmapItem[]
}

export function groupRoadmap(items: RoadmapItem[]): RoadmapGroup[] {
  const map = new Map<string, RoadmapGroup>()
  for (const item of items) {
    const group = map.get(item.section_key) || {
      key: item.section_key,
      title: item.section_title,
      icon: item.section_icon || 'hammer',
      sort: item.section_sort,
      items: [],
    }
    group.items.push(item)
    map.set(item.section_key, group)
  }
  return [...map.values()]
    .sort((a, b) => a.sort - b.sort)
    .map(group => ({
      ...group,
      items: [...group.items].sort((a, b) => a.active === b.active ? a.sort - b.sort : a.active ? -1 : 1),
    }))
}

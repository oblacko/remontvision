import test from 'node:test'
import assert from 'node:assert/strict'

let mod = null
try {
  mod = await import('../web/src/lib/masterbrief.ts')
} catch {
  // .ts-импорт требует Node >= 24; на старых версиях честно скипаем.
}

const maybe = (name, fn) => mod ? test(name, fn) : test.skip(`${name} (client .ts requires Node >= 24)`)

maybe('includes room, style and dimensions', () => {
  const text = mod.buildMasterBrief({
    roomType: 'Спальня', style: 'Скандинавский', date: '2026-11-10',
    dimensions: { width: 3.2, length: 4.1, height: 2.7 },
  })
  assert.match(text, /Спальня/)
  assert.match(text, /Скандинавский/)
  assert.match(text, /3\.2 × 4\.1 × 2\.7/)
  assert.match(text, /2026-11-10/)
})

maybe('includes repair scope, RAL and electrical', () => {
  const text = mod.buildMasterBrief({
    roomType: 'Гостиная', date: '2026-11-10',
    repairScope: { walls: { action: 'Покраска', material: 'матовая краска' }, floor: { action: 'Ламинат' } },
    surfaces: [{ label: 'Стены', description: 'тёплый белый', ral: { code: '9016', name: 'Транспортный белый' } }],
    electrical: [{ title: 'Розетки', text: 'добавить 2 у дивана' }],
  })
  assert.match(text, /Стены: Покраска/)
  assert.match(text, /RAL 9016/)
  assert.match(text, /Розетки: добавить 2/)
})

maybe('omits empty sections and keeps the disclaimer', () => {
  const text = mod.buildMasterBrief({ date: '2026-11-10' })
  assert.doesNotMatch(text, /ГАБАРИТЫ/)
  assert.doesNotMatch(text, /ЭЛЕКТРИКА/)
  assert.match(text, /не дизайн-проект/)
})

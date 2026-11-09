import test from 'node:test'
import assert from 'node:assert/strict'

let mod = null
try {
  mod = await import('../web/src/lib/objects.ts')
} catch {
  // .ts-импорт требует Node >= 24; на старых версиях честно скипаем.
}

const maybe = (name, fn) => mod ? test(name, fn) : test.skip(`${name} (client .ts requires Node >= 24)`)

maybe('ruLabel maps known english labels and falls back', () => {
  assert.equal(mod.ruLabel('bed'), 'кровать')
  assert.equal(mod.ruLabel('Coffee Table'), 'журнальный стол')
  assert.equal(mod.ruLabel('неизвестный'), 'неизвестный')
  assert.equal(mod.ruLabel(''), 'объект')
})

maybe('moveDirection picks the dominant axis and percent', () => {
  assert.deepEqual(mod.moveDirection(0.2, 0.03), { text: 'вправо', percent: 20 })
  assert.deepEqual(mod.moveDirection(-0.12, 0.01), { text: 'влево', percent: 12 })
  assert.deepEqual(mod.moveDirection(0.01, 0.15), { text: 'вниз', percent: 15 })
  assert.deepEqual(mod.moveDirection(0, -0.08), { text: 'вверх', percent: 8 })
})

maybe('buildMoveInstruction includes object, direction and percent', () => {
  const text = mod.buildMoveInstruction({ label: 'lamp', bbox: [0.2, 0.3, 0.1, 0.2], dx: 0.15, dy: 0 })
  assert.match(text, /светильник/)
  assert.match(text, /вправо/)
  assert.match(text, /15% кадра/)
  assert.match(text, /Меняйте только объект/)
  assert.match(text, /области/)
})

maybe('buildObjectAction covers all four actions', () => {
  for (const action of ['replace', 'color', 'bigger', 'smaller']) {
    const text = mod.buildObjectAction('sofa', action, [0.1, 0.2, 0.3, 0.4])
    assert.match(text, /диван/)
    assert.match(text, /похожие объекты/)
  }
})

maybe('buildObjectText keeps the selected object as the target', () => {
  const text = mod.buildObjectText('wardrobe', 'сделай светлее', [0.5, 0.2, 0.2, 0.5])
  assert.match(text, /шкаф/)
  assert.match(text, /сделай светлее/)
  assert.match(text, /область/)
})

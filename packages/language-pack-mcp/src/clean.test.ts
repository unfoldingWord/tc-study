import { expect, test } from 'bun:test'
import { clean, lookupLine } from './server'

test('a note loses headings, internal links and bold marks', () => {
  expect(clean('# Connecting Statement:\n\nPablo anima a Tito.')).toBe('Connecting Statement:\n\nPablo anima a Tito.')
  expect(clean('Puede usar el TPS. (ver: rc://es-419/ta/man/translate/x)')).toBe('Puede usar el TPS.')
  expect(clean('como está en el TPS. (ver: [[ta:translate/figs-personification]]).')).toBe('como está en el TPS.')
  expect(clean('La palabra **«Porque»** introduce')).toBe('La palabra «Porque» introduce')
})

test('an ellipsis stays', () => {
  expect(clean('la gracia … de Dios... y más')).toBe('la gracia … de Dios... y más')
})

test('lookup_term prints the question of an article after its names', () => {
  expect(lookupLine({ id: 'ta:manage/translate-team', names: ['Setting Up A Translation Team'], subtitle: 'How can I set up a translation team?' })).toBe(
    'ta:manage/translate-team — Setting Up A Translation Team (asks: How can I set up a translation team?)',
  )
  expect(lookupLine({ id: 'tw:kt/grace', names: ['gracia', 'grace'] })).toBe('tw:kt/grace — gracia, grace')
})

import { expect, test } from 'bun:test'
import { alignIndex, quoteIn } from './align'

// "Porque la gracia salvadora de Dios fue manifestada": word pieces, with spaces as non-word pieces.
const words = ['Porque', 'la', 'gracia', 'salvadora', 'de', 'Dios', 'fue', 'manifestada']
const pieces = words.flatMap((w, i) => (i === 0 ? [[w, true]] : [[' ', false], [w, true]])) as [string, boolean][]
// Original positions: γάρ 365, ἐπεφάνη 364, ἡ 366, χάρις 367, τοῦ 368, Θεοῦ 369, σωτήριος 370.
const align = [[365], [366], [367], [370], [368], [369], [364], [364]]
const model = { texts: [{ res: 'es-419_gl/es-419/glt', pieces, align }, { res: 'x/x/plain', pieces: [['palabra', true]] as [string, boolean][] }] }

test('only aligned texts are indexed', () => {
  expect(alignIndex(model).map((t) => t.res)).toEqual(['es-419_gl/es-419/glt'])
})

test('a quote reads in text order, gaps shown as an ellipsis', () => {
  const t = alignIndex(model)
  expect(quoteIn(t, [364, 366, 367, 368, 369])).toEqual([{ res: 'es-419_gl/es-419/glt', text: 'la gracia … de Dios fue manifestada' }])
  expect(quoteIn(t, [367])).toEqual([{ res: 'es-419_gl/es-419/glt', text: 'gracia' }])
})

test('no positions, or positions no text translates, give nothing', () => {
  const t = alignIndex(model)
  expect(quoteIn(t, [])).toEqual([])
  expect(quoteIn(t, undefined)).toEqual([])
  expect(quoteIn(t, [999])).toEqual([])
})

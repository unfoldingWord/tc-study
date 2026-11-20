import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { examplesOf, render } from '../build/train'
import { mask, predict, train } from './classifier'
import { loadComplement } from './complements'
import type { QueryName } from './decision'

const meta = { lang: 'xx', version: 't' }
const tiny: [string, QueryName][] = [
  ['open ref', 'passage'],
  ['show ref now', 'passage'],
  ['what is tw', 'concept'],
  ['who is name', 'concept'],
  ['list of cat', 'topics'],
  ['all cat of book', 'topics'],
]
const bytes = (s: string) => new TextEncoder().encode(s)

describe('classifier', () => {
  test('training twice gives byte-equal JSON', () => {
    expect(JSON.stringify(train(tiny, meta))).toBe(JSON.stringify(train([...tiny], meta)))
    expect(render('es')).toBe(render('es'))
  })
  test('a tiny model predicts each training sentence class', () => {
    const m = train(tiny, meta)
    for (const [text, label] of tiny) expect(predict(m, text)[0]![0]).toBe(label)
  })
  test('probabilities sum to 1, best first', () => {
    const p = predict(train(tiny, meta), 'something unseen about ref')
    expect(Math.abs(p.reduce((a, [, x]) => a + x, 0) - 1)).toBeLessThan(1e-9)
    for (let i = 1; i < p.length; i++) expect(p[i - 1]![1]).toBeGreaterThanOrEqual(p[i]![1])
  })
  test('the generated files load, a file for queries/2 does not', () => {
    for (const lang of ['en', 'es', 'pt']) {
      const raw = readFileSync(join(import.meta.dir, '..', 'complements', `${lang}.classifier.json`), 'utf8').split(String.fromCharCode(13)).join('')
      expect(loadComplement(bytes(raw)).ok).toBe(true)
      expect(raw).toBe(render(lang))
      expect(examplesOf(lang).length).toBeGreaterThan(80)
      expect(loadComplement(bytes(raw.replace('"for":"queries/1"', '"for":"queries/2"'))).ok).toBe(false)
    }
  })
  test('no brace remains after the slots are replaced', () => {
    for (const lang of ['en', 'es', 'pt']) for (const [t] of examplesOf(lang)) expect(t).not.toMatch(/[{}]/)
  })
  test('mask replaces entities by their slot words', () => {
    const tokens = ['tito', '2:11', 'que', 'dice']
    expect(mask(tokens, [{ kind: 'ref', book: 'tit', chapter: 2, verse: 11, start: 0, end: 2 }])).toBe('ref que dice')
    expect(mask(['que', 'es', 'x', 'y'], [{ kind: 'concept', ids: ['a'], cls: 'name', start: 2, end: 4 }])).toBe('que es name')
  })
  test('mask keeps the first, longest of overlapping spans and drops the others', () => {
    const a = { kind: 'concept', ids: ['a'], cls: 'name', start: 0, end: 2 } as const
    const b = { kind: 'concept', ids: ['b'], cls: 'tw', start: 1, end: 3 } as const
    const c = { kind: 'concept', ids: ['c'], cls: 'tw', start: 0, end: 1 } as const
    expect(mask(['x', 'y', 'z', 'w'], [b, a])).toBe('name z w')
    expect(mask(['x', 'y', 'z', 'w'], [c, a, b])).toBe('name z w')
  })
  test('predict gives the same answer on repeated calls', () => {
    const m = train([['a b', 'concept'], ['c d', 'search']], { lang: 'es', version: 't' })
    expect(predict(m, 'a b')).toEqual(predict(m, 'a b'))
    expect(predict(m, 'a b')[0]![0]).toBe('concept')
  })
})

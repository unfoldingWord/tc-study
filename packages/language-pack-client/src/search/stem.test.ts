import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fold } from '../query/lookup'
import { baseLang, stemmerFor, stemWord } from './stem'

const pairs = (l: string): [string, string][] =>
  readFileSync(new URL(`./snowball/fixtures/${l}.tsv`, import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((r) => r.split('\t') as [string, string])

describe('stem', () => {
  for (const l of ['es', 'pt', 'en']) {
    test(`fixture ${l}`, () => {
      // Folding first drops accents the stemmer reads, so only words without marks must match exactly.
      const bad = pairs(l).filter(([w, s]) => fold(w) === w && stemWord(l, w) !== fold(s))
      expect(bad.slice(0, 5)).toEqual([])
    })
  }
  test('accented fixtures keep the same leading letters', () => {
    for (const l of ['es', 'pt']) {
      const rows = pairs(l).filter(([w]) => fold(w) !== w)
      expect(rows.length).toBeGreaterThan(0)
      for (const [w, s] of rows) expect(stemWord(l, w).slice(0, 3)).toBe(fold(s).slice(0, 3))
    }
  })
  test('plurals agree', () => {
    expect(stemWord('es-419', 'gracias')).toBe(stemWord('es-419', 'gracia'))
    expect(stemWord('pt-BR', 'alianças')).toBe(stemWord('pt-BR', 'aliança'))
  })
  test('other languages fold only', () => {
    expect(stemWord('fr', 'Grâce')).toBe('grace')
    expect(stemmerFor('fr')).toBeUndefined()
    expect(stemmerFor('constructor')).toBeUndefined()
  })
  test('baseLang', () => {
    expect([baseLang('es-419'), baseLang('pt-BR'), baseLang('EN')]).toEqual(['es', 'pt', 'en'])
  })
})

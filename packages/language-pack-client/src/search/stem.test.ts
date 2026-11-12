import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fold } from '../query/lookup'
import { baseLang, stemForms, stemmerFor, stemWord } from './stem'

const pairs = (l: string): [string, string][] =>
  readFileSync(new URL(`./snowball/fixtures/${l}.tsv`, import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((r) => r.split('\t') as [string, string])

describe('stem', () => {
  for (const l of ['es', 'pt', 'en']) {
    test(`fixture ${l}`, () => {
      const bad = pairs(l).filter(([w, s]) => stemWord(l, w) !== fold(s))
      expect(bad.slice(0, 5)).toEqual([])
    })
  }
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

describe('stemForms', () => {
  test('accent variants of one word stay together', () => {
    expect(stemWord('pt-BR', 'acusação')).toBe(stemWord('pt-BR', 'acusações'))
    expect(stemWord('pt-BR', 'mão')).toBe(stemWord('pt-BR', 'mãos'))
    expect(stemWord('pt-BR', 'pão')).toBe(stemWord('pt-BR', 'pães'))
    const a = stemForms('pt-BR', 'acusacoes')
    expect(stemForms('pt-BR', 'acusações').some((x) => a.includes(x))).toBe(true)
  })
  test('no stemmer gives the folded word', () => {
    expect(stemForms('fr', 'Grâce')).toEqual(['grace'])
  })
})

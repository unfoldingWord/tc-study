import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOOKS, type MapSet } from '@bt-synergy/language-pack-v3'
import { loadComplement, type NumbersComplement } from './complements'
import { buildLexicon } from './lexicon'

const books: unknown[][] = BOOKS.map(() => ['', '', '', 'none'])
const set = (code: string, n: [string, string, string]): void => {
  books[BOOKS.indexOf(code)] = [...n, 'text']
}
set('tit', ['Tito', 'Tito', 'Tit'])
set('exo', ['Éxodo', 'Éxodo', 'Éx'])
set('jhn', ['Juan', 'Juan', 'Jn'])
set('1jn', ['1 Juan', '1 Juan', '1Jn'])

const maps = {
  revision: 1,
  map: {
    core: {
      lang: 'es-419',
      part: 'core',
      res: [],
      books,
      names: { 'tw:kt/grace': ['gracia'], 'tw:names/john': ['Juan'], 'tw:kt/appear': ['aparecer'], 'ta:translate/figs-metaphor': ['Metáfora'] },
      subtitles: { 'ta:translate/figs-metaphor': '¿Qué es una metáfora?' },
      coverage: {},
    },
    parts: new Map(),
  },
  topics: { core: { names: { 'per:john': [['Juan', 3]] } }, parts: new Map() },
  xtopics: { core: { topics: new Map([['per:john', { title: 'John' }]]) }, parts: new Map() },
  xmap: { core: { concepts: new Map([['tw:kt/grace', 0], ['tw:names/john', 0], ['tw:kt/appear', 0], ['ta:translate/figs-metaphor', 0]]) }, parts: new Map() },
} as unknown as MapSet

const loaded = loadComplement(new Uint8Array(readFileSync(join(import.meta.dir, '../complements/es.numbers.json'))))
const numbers = (loaded.ok ? loaded.value : undefined) as NumbersComplement
const lex = buildLexicon(maps, 'es-419', numbers)
const ents = (q: string) => lex.entities(q).entities

test('number words give a reference', () => {
  expect(ents('Tito dos once')).toEqual([{ kind: 'ref', book: 'tit', chapter: 2, verse: 11, start: 0, end: 3 }])
})

test('an abbreviation with a number, a chapter word, a leading numeral', () => {
  expect(ents('Éx. 7')).toEqual([{ kind: 'ref', book: 'exo', chapter: 7, start: 0, end: 2 }])
  expect(ents('exodo capitulo siete')).toEqual([{ kind: 'ref', book: 'exo', chapter: 7, start: 0, end: 3 }])
  expect(ents('1 Juan 3')).toEqual([{ kind: 'ref', book: '1jn', chapter: 3, start: 0, end: 3 }])
  expect(ents('Primera de Juan 3')[0]).toMatchObject({ kind: 'ref', book: '1jn', chapter: 3 })
  expect(ents('Juan 3:16-18')[0]).toMatchObject({ kind: 'ref', book: 'jhn', chapter: 3, verse: 16, verseEnd: 18 })
})

test('an abbreviation alone is not a book, a full name is', () => {
  expect(ents('que dice tit')).toEqual([])
  expect(ents('el libro de Tito')).toEqual([{ kind: 'book', book: 'tit', start: 3, end: 4 }])
})

test('a Strong number', () => {
  expect(ents('H85')).toEqual([{ kind: 'strong', value: 'H85', start: 0, end: 1 }])
})

test('a concept through the stem, and a subtitle', () => {
  expect(ents('gracias')).toEqual([{ kind: 'concept', ids: ['tw:kt/grace'], cls: 'tw', start: 0, end: 1 }])
  expect(ents('que es una metafora')[0]).toMatchObject({ kind: 'concept', ids: ['ta:translate/figs-metaphor'], cls: 'ta' })
})

test('a book that is also a person', () => {
  expect(ents('Juan')).toEqual([
    { kind: 'book', book: 'jhn', start: 0, end: 1 },
    { kind: 'concept', ids: ['tw:names/john', 'per:john'], cls: 'name', start: 0, end: 1 },
  ])
  expect(lex.ambiguousBooks.get('jhn')).toEqual(['tw:names/john', 'per:john'])
})

test('a frame word is no concept, a category word is a category', () => {
  expect(ents('aparece')).toEqual([])
  expect(ents('lugares')).toEqual([{ kind: 'category', value: 'place', start: 0, end: 1 }])
})

test('an unsupported language has no stems or numbers but still finds references', () => {
  const l = buildLexicon(maps, 'zz', undefined)
  expect(l.entities('Tito 2').entities).toEqual([{ kind: 'ref', book: 'tit', chapter: 2, start: 0, end: 2 }])
})

import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOOKS, type MapSet } from '@bt-synergy/language-pack-v3'
import { loadComplement, type NumbersComplement } from './complements'
import { buildLexicon } from './lexicon'
import { fixtureMaps } from './rules.fixture'

const books: unknown[][] = BOOKS.map(() => ['', '', '', 'none'])
const set = (code: string, n: [string, string, string]): void => {
  books[BOOKS.indexOf(code)] = [...n, 'text']
}
set('tit', ['La carta de Pablo a Tito', 'Tito', 'Tit'])
set('num', ['Números', 'Números', 'Núm'])
set('rut', ['El Libro de Rut', 'Rut', 'Rut'])
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
      names: { 'tw:kt/grace': ['gracia'], 'tw:names/john': ['Juan'], 'tw:names/titus': ['Tito'], 'tw:names/ruth': ['Rut'], 'tw:kt/appear': ['aparecer'], 'ta:translate/figs-metaphor': ['Metáfora'] },
      subtitles: { 'ta:translate/figs-metaphor': '¿Qué es una metáfora?' },
      coverage: {},
    },
    parts: new Map(),
  },
  topics: { core: { names: { 'per:john': [['Juan', 'list', 3, []]], 'per:titus': [['Tito', 'list', 2, []]], 'lug:moab': [['Rut', 'alignment', 1, []], ['Moab', 'list', 1, []], ['Sion', 'alignment', 1, []]], 'lug:zion': [['Sion', 'list', 1, []]], 'per:mary': [['la Maria', 'alignment', 1, []]] } }, parts: new Map() },
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
  expect(ents('que dice num')).toEqual([])
  expect(ents('el libro de Tito')).toContainEqual({ kind: 'book', book: 'tit', start: 3, end: 4 })
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

test('a short book name that is a common noun needs a number or a cue', () => {
  expect(ents('Números 3:4')[0]).toMatchObject({ kind: 'ref', book: 'num', chapter: 3, verse: 4 })
  expect(ents('los números de la tabla')).toEqual([])
  expect(ents('el libro de Números')).toEqual([{ kind: 'book', book: 'num', start: 3, end: 4 }])
})

test('a short name that differs from the full name: a person-name book is standalone and ambiguous', () => {
  const e = ents('Tito')
  expect(e).toContainEqual({ kind: 'book', book: 'tit', start: 0, end: 1 })
  expect(e).toContainEqual({ kind: 'concept', ids: ['tw:names/titus', 'per:titus'], cls: 'name', start: 0, end: 1 })
  expect(lex.ambiguousBooks.get('tit')).toEqual(['tw:names/titus', 'per:titus'])
})

test('an alignment name is dropped when another id has it, when it is a book name, or when it starts with a stop word', () => {
  const rut = ents('Rut').find((x) => x.kind === 'concept')
  expect(rut).toMatchObject({ ids: ['tw:names/ruth'] })
  expect(ents('moab')).toEqual([{ kind: 'concept', ids: ['lug:moab'], cls: 'topic', start: 0, end: 1 }])
  expect(ents('Sion')).toEqual([{ kind: 'concept', ids: ['lug:zion'], cls: 'topic', start: 0, end: 1 }])
  expect(ents('Maria')).toEqual([])
})

// Numbered books written short, and one-chapter books (Task 9c, fixes c and g). The names are the maps' own; the rule finds the short forms.
const numbered = (lang: 'es-419' | 'en', b: Record<string, [string, string, string]>) => buildLexicon(fixtureMaps(lang, b, {}, {}), lang, undefined)
const EN_NUM = numbered('en', {
  '1co': ['1 Corinthians', '1 Corinthians', '1Co'],
  '2co': ['2 Corinthians', '2 Corinthians', '2Co'],
  '1ti': ['1 Timothy', '1 Timothy', '1Ti'],
  '2ti': ['2 Timothy', '2 Timothy', '2Ti'],
  '1th': ['1 Thessalonians', '1 Thessalonians', '1Th'],
  '3jn': ['3 John', '3 John', '3Jn'],
  jud: ['Jude', 'Jude', 'Jud'],
  phm: ['Philemon', 'Philemon', 'Phm'],
})
const ES_NUM = numbered('es-419', {
  '1jn': ['1 Juan', '1 Juan', '1Jn'],
  '3jn': ['3 Juan', '3 Juan', '3Jn'],
  '2ki': ['2 Reyes', '2 Reyes', '2Re'],
  '1co': ['1 Corintios', '1 Corintios', '1Co'],
  oba: ['Abdías', 'Abdías', 'Abd'],
})
const PT_NUM = buildLexicon(fixtureMaps('es-419', { '2ki': ['2 Reis', '2 Reis', '2Rs'], '1co': ['1 Coríntios', '1 Coríntios', '1Co'] }, {}, {}), 'pt-BR', undefined)
const first = (l: ReturnType<typeof buildLexicon>, q: string) => l.entities(q).entities[0]

test('a numbered book with a digit and an abbreviation, with or without a space or a dot', () => {
  expect(first(EN_NUM, '1 Cor 13:4-7')).toMatchObject({ kind: 'ref', book: '1co', chapter: 13, verse: 4, verseEnd: 7 })
  expect(first(EN_NUM, '1Co 2:3')).toMatchObject({ kind: 'ref', book: '1co', chapter: 2, verse: 3 })
  expect(first(EN_NUM, '1Cor 2:3')).toMatchObject({ kind: 'ref', book: '1co', chapter: 2, verse: 3 })
  expect(first(EN_NUM, '2 Tim. 3:16')).toMatchObject({ kind: 'ref', book: '2ti', chapter: 3, verse: 16 })
  expect(first(EN_NUM, '2 Cor 5:17')).toMatchObject({ kind: 'ref', book: '2co', chapter: 5, verse: 17 })
  expect(first(EN_NUM, '1 Thess 4:13')).toMatchObject({ kind: 'ref', book: '1th', chapter: 4, verse: 13 })
  expect(EN_NUM.entities('topics in 1 Cor').entities.filter((e) => e.kind === 'book')).toEqual([{ kind: 'book', book: '1co', start: 2, end: 4 }])
  expect(first(ES_NUM, '1 Juan 4:8')).toMatchObject({ kind: 'ref', book: '1jn', chapter: 4, verse: 8 })
  expect(first(ES_NUM, '2 Reyes 5:1')).toMatchObject({ kind: 'ref', book: '2ki', chapter: 5, verse: 1 })
  expect(first(ES_NUM, '2 Rey. 5:1')).toMatchObject({ kind: 'ref', book: '2ki', chapter: 5, verse: 1 })
  expect(first(ES_NUM, '1 Cor 13:4')).toMatchObject({ kind: 'ref', book: '1co', chapter: 13, verse: 4 })
  expect(first(PT_NUM, '2 Reis 5:1')).toMatchObject({ kind: 'ref', book: '2ki', chapter: 5, verse: 1 })
  expect(first(PT_NUM, '1 Cor 13:4')).toMatchObject({ kind: 'ref', book: '1co', chapter: 13, verse: 4 })
})

test('a short form two numbered books share is no book', () => {
  // "1 co" is the map's abbreviation of 1co; "2 co" of 2co; "1 c" is too short; "1 t" too.
  expect(first(EN_NUM, '1 T 3:2')).toBeUndefined()
  const shared = numbered('en', { '1co': ['1 Corinthians', '1 Corinthians', '1Co'], '1ch': ['1 Chronicles', '1 Chronicles', '1Ch'] })
  expect(first(shared, '1 Cor 1:1')).toMatchObject({ book: '1co' })
  expect(first(shared, '1 Chr 1:1')).toMatchObject({ book: '1ch' })
})

test('a one-chapter book with one number is a verse of chapter 1', () => {
  expect(first(EN_NUM, '3 Jn 4')).toEqual({ kind: 'ref', book: '3jn', chapter: 1, verse: 4, start: 0, end: 3 })
  expect(first(EN_NUM, 'Jude 3-5')).toMatchObject({ kind: 'ref', book: 'jud', chapter: 1, verse: 3, verseEnd: 5 })
  expect(first(EN_NUM, 'Philemon 1:6')).toMatchObject({ kind: 'ref', book: 'phm', chapter: 1, verse: 6 })
  expect(first(ES_NUM, '3 Juan 4')).toMatchObject({ kind: 'ref', book: '3jn', chapter: 1, verse: 4 })
  expect(first(ES_NUM, 'Abdías 15')).toMatchObject({ kind: 'ref', book: 'oba', chapter: 1, verse: 15 })
  expect(first(EN_NUM, '1 Cor 13')).toMatchObject({ kind: 'ref', book: '1co', chapter: 13 })
  expect(first(EN_NUM, '1 Cor 13')).not.toHaveProperty('verse')
})

import { describe, expect, test } from 'bun:test'
import type { MapCore, MapPart, XmapCore, XmapPart } from '../model'
import { canonicalJson } from '../read/output'
import { answer, type MapSet, TN, TWL, UGNT, UHB } from './maps'

const ESTN = 'es/tn'
const MET = 'ta:translate/figs-metaphor'
const GRACE = 'tw:kt/grace'

const xcore: XmapCore = {
  part: 'core',
  res: [[TN, 'v1']],
  coverage: new Map([
    [TN, { whole: ['tit', 'jon'], partial: [] }],
    [TWL, { whole: ['tit', 'rom'], partial: [] }],
    [UGNT, { whole: ['tit', 'rom'], partial: [] }],
    [UHB, { whole: ['rut'], partial: ['jon'] }],
  ]),
  strong: { unit: 'occurrences', rows: new Map([['G54850', new Map([['tit', [3, 2]]])]]) },
  concepts: new Map([
    [GRACE, { kind: 'none', tw: 'kt', source: 'x' }],
    ['tw:names/paul', { kind: 'person', tw: 'names', source: 'x' }],
  ]),
  links: {
    unit: 'links',
    rows: new Map([
      [
        GRACE,
        new Map([
          ['tit', [2, 2]],
          ['rom', [5, 4]],
        ]),
      ],
    ]),
  },
  notes: { unit: 'notes', rows: new Map([[MET, new Map([['tit', [22, 21]]])]]) },
  relations: [
    { from: 'tw:names/paul', to: GRACE, type: 'writes-of', source: 'x', confidence: 80 },
    { from: GRACE, to: 'tw:names/paul', type: 'a-type', source: 'x', confidence: 5 },
  ],
  aliases: { 'tw:kt/oldgrace': GRACE },
  strongs: { [GRACE]: ['G26', 'G54850', 'H2580'], 'tw:names/paul': ['G26'] },
}
const xtit: XmapPart = {
  part: 'tit',
  strong: new Map([
    ['G54850', [56001002, 56002001]],
    ['G26', [56002001, 56003001]],
  ]),
  links: new Map([[GRACE, [56001002, 56001002, 56002001]]]),
  notes: new Map([[MET, [56003001]]]),
}

const mcore: MapCore = {
  lang: 'es',
  part: 'core',
  res: [],
  books: [],
  names: { [GRACE]: ['Grace', 'Favor'] },
  coverage: new Map([[ESTN, { whole: ['tit'], partial: ['rut'] }]]),
  usage: {
    unit: 'notes',
    rows: new Map([
      [
        MET,
        new Map([
          ['rut', [3, 3]],
          ['tit', [4, 4]],
        ]),
      ],
    ]),
  },
}

const m: MapSet = {
  xmap: { core: xcore, parts: new Map([['tit', xtit]]) },
  map: { core: mcore, parts: new Map<string, MapPart>([['tit', { lang: 'es', part: 'tit', usage: new Map([[MET, [56003001, 56001001]]]) }]]) },
  revision: 7,
}

type A = Record<string, any>
const ask = (query: { kind: string; [k: string]: unknown }, set: MapSet = m): A => answer(set, query) as A

describe('strong', () => {
  test('G5485 finds G54850; one source per book, never added', () => {
    const a = ask({ kind: 'strong', key: 'G5485' })
    expect(a.key).toBe('G54850')
    expect(a.unit).toBe('occurrences')
    expect(Object.keys(a.books)).toHaveLength(66)
    expect(a.books.tit).toEqual({ state: 'count', count: 3, verses: 2 })
    expect(a.books.rom).toEqual({ state: 'zero', count: 0, verses: 0 })
    expect(a.books.rut).toEqual({ state: 'zero', count: 0, verses: 0 })
    expect(a.books.jon).toEqual({ state: 'partial', count: 0, verses: 0 })
    expect(a.books.gen).toEqual({ state: 'none' })
  })
  test('a key with no row keeps the key as asked', () => {
    const a = ask({ kind: 'strong', key: 'H7462b' })
    expect(a.key).toBe('H7462b')
    expect(a.books.rut.state).toBe('zero')
  })
})

describe('usage', () => {
  test('English notes: count, zero, none', () => {
    const a = ask({ kind: 'usage', concept: MET, source: TN })
    expect(a).toMatchObject({ kind: 'usage', source: TN, unit: 'notes' })
    expect(a.books.tit).toEqual({ state: 'count', count: 22, verses: 21 })
    expect(a.books.jon).toEqual({ state: 'zero', count: 0, verses: 0 })
    expect(a.books.isa).toEqual({ state: 'none' })
  })
  test('a language usage with a partial book', () => {
    const a = ask({ kind: 'usage', concept: MET, source: ESTN })
    expect(a.books.rut).toEqual({ state: 'partial', count: 3, verses: 3 })
    expect(a.books.tit).toEqual({ state: 'count', count: 4, verses: 4 })
    expect(ask({ kind: 'usage', concept: 'ta:other', source: ESTN }).books.rut).toEqual({ state: 'partial', count: 0, verses: 0 })
  })
  test('links; and a source no coverage lists has no unit and every cell none', () => {
    expect(ask({ kind: 'usage', concept: GRACE, source: TWL }).books.rom).toEqual({ state: 'count', count: 5, verses: 4 })
    const a = ask({ kind: 'usage', concept: GRACE, source: 'x/y/z' })
    expect('unit' in a).toBe(false)
    expect(Object.values(a.books).every((c) => (c as { state: string }).state === 'none')).toBe(true)
  })
})

describe('book', () => {
  test('coverage of every source and the tables with their keys, with both maps', () => {
    const a = ask({ kind: 'book', book: 'tit' })
    expect(a.coverage).toEqual({ [TN]: 'whole', [TWL]: 'whole', [UGNT]: 'whole', [UHB]: 'none', [ESTN]: 'whole' })
    expect(a.tables).toEqual({
      strong: { unit: 'occurrences', keys: 1 },
      links: { unit: 'links', keys: 1 },
      notes: { unit: 'notes', keys: 1 },
      usage: { unit: 'notes', keys: 1 },
    })
    expect(ask({ kind: 'book', book: 'rut' }).coverage[ESTN]).toBe('partial')
  })
  test('the common map alone lists only its sources and tables', () => {
    const a = ask({ kind: 'book', book: 'tit' }, { xmap: m.xmap, revision: 7 })
    expect(Object.keys(a.coverage)).not.toContain(ESTN)
    expect(a.tables.usage).toBeUndefined()
  })
})

describe('keyterms', () => {
  test('a key term whose strongs share a key with the book', () => {
    expect(ask({ kind: 'keyterms', book: 'tit' }).candidates).toEqual([{ concept: GRACE, strongs: ['G26', 'G54850', 'H2580'], matched: ['G54850'] }])
    expect(ask({ kind: 'keyterms', book: 'jon' })).toEqual({ kind: 'keyterms', book: 'jon', candidates: [] })
  })
})

describe('concept', () => {
  test('found, with names and sorted relations', () => {
    const a = ask({ kind: 'concept', id: GRACE })
    expect(a.concept).toEqual({ kind: 'none', tw: 'kt', source: 'x' })
    expect(a.names).toEqual(['Grace', 'Favor'])
    expect(a.relations.map((r: A) => r.type)).toEqual(['a-type', 'writes-of'])
    expect('alias' in a).toBe(false)
    expect(ask({ kind: 'concept', id: 'tw:names/paul' }).names).toEqual([])
  })
  test('a moved id answers with the new id and the alias; an unknown id is not found', () => {
    const a = ask({ kind: 'concept', id: 'tw:kt/oldgrace' })
    expect(a).toMatchObject({ id: GRACE, alias: 'tw:kt/oldgrace', found: true })
    expect(ask({ kind: 'concept', id: 'nope' })).toEqual({ kind: 'concept', id: 'nope', found: false })
  })
})

describe('revision', () => {
  test('names the revision, the sorted verses and a cell per source', () => {
    const a = ask({ kind: 'revision', concept: MET, book: 'tit' })
    expect(a.revision).toBe(7)
    expect(a.verses).toEqual([56001001, 56003001])
    expect(a.sources).toEqual({ [TN]: { state: 'count', count: 22, verses: 21 }, [ESTN]: { state: 'count', count: 4, verses: 4 } })
    const w = ask({ kind: 'revision', concept: GRACE, book: 'tit' })
    expect(w.verses).toEqual([56001002, 56002001])
    expect(Object.keys(w.sources)).toEqual([TWL])
  })
})

describe('answer', () => {
  test('is plain data that canonicalJson writes, and an unknown kind throws', () => {
    expect(canonicalJson(answer(m, { kind: 'book', book: 'tit' }))).toContain('"kind":"book"')
    expect(() => answer(m, { kind: 'nope' })).toThrow()
  })
})

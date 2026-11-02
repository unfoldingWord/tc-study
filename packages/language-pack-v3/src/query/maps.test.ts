import { describe, expect, test } from 'bun:test'
import type { BookModel, MapCore, MapPart, XmapCore, XmapPart } from '../model'
import { answer, bookCoverage, conceptWhere, keyTerms, type MapSet, revisionAnswer, strongWhere, usage } from './maps'

const TN = 'unfoldingWord/en/tn'
const MET = 'ta:translate/figs-metaphor'
const GRACE = 'tw:kt/grace'

const xcore: XmapCore = {
  part: 'core',
  res: [[TN, 'v1']],
  coverage: new Map([[TN, { whole: ['tit', 'jon'], partial: [] }]]),
  strong: { unit: 'occurrences', rows: new Map([['G54850', new Map([['tit', [3, 2]]])]]) },
  concepts: new Map([[GRACE, { kind: 'none', tw: 'kt', source: 'x' }]]),
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
  strongs: { [GRACE]: ['G54850', 'G26', 'b:H2580'] },
}
const xtit: XmapPart = {
  part: 'tit',
  strong: new Map([
    ['G54850', [56001002, 56002001]],
    ['G26', [56002001, 56003001]],
  ]),
}

const mcore: MapCore = {
  lang: 'es',
  part: 'core',
  res: [],
  books: [],
  names: {},
  coverage: new Map([['es/tn', { whole: ['tit'], partial: ['rut'] }]]),
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
  map: { core: mcore, parts: new Map<string, MapPart>() },
  revision: 7,
}

describe('usage', () => {
  test('count, zero, none for the English notes', () => {
    const u = usage(m, MET, 'xmap')
    expect(u.revision).toBe(7)
    expect(u.source).toBe('xmap')
    expect(u.books).toHaveLength(66)
    expect(u.books.find((b) => b.book === 'tit')).toEqual({ book: 'tit', state: 'count', count: 22, verses: 21 })
    expect(u.books.find((b) => b.book === 'jon')).toEqual({ book: 'jon', state: 'zero' })
    expect(u.books.find((b) => b.book === 'isa')).toEqual({ book: 'isa', state: 'none' })
  })
  test('a partial book answers partial with the count', () => {
    const u = usage(m, MET, 'map')
    expect(u.books.find((b) => b.book === 'rut')).toEqual({ book: 'rut', state: 'partial', count: 3, verses: 3 })
    expect(u.books.find((b) => b.book === 'tit')).toEqual({ book: 'tit', state: 'count', count: 4, verses: 4 })
  })
  test('a partial book with no row is partial 0', () => {
    expect(usage(m, 'ta:other', 'map').books.find((b) => b.book === 'rut')).toEqual({ book: 'rut', state: 'partial', count: 0, verses: 0 })
  })
})

describe('several coverage keys and bridged packs', () => {
  const x2: XmapCore = {
    ...xcore,
    coverage: new Map([
      ['o/en/ult', { whole: ['tit', 'mat'], partial: [] }],
      [TN, { whole: [], partial: ['tit'] }],
      ['o/en/twl', { whole: [], partial: ['rom'] }],
    ]),
    notes: { unit: 'notes', rows: new Map([[MET, new Map([['tit', [2, 2]]])]]) },
  }
  const m2: MapSet = {
    xmap: { core: x2, parts: new Map() },
    map: {
      core: { ...mcore, coverage: new Map([['es/ult', { whole: ['jon', 'rut'], partial: [] }], ['es/tn', { whole: [], partial: ['tit'] }]]) },
      parts: new Map(),
    },
    revision: 1,
  }
  test('only tN decides the map usage', () => {
    const b = usage(m2, MET, 'map').books
    expect(b.find((x) => x.book === 'jon')).toEqual({ book: 'jon', state: 'none' })
    expect(b.find((x) => x.book === 'tit')).toEqual({ book: 'tit', state: 'partial', count: 4, verses: 4 })
  })
  test('a partial book is partial through strongWhere and conceptWhere', () => {
    expect(conceptWhere(m2, MET).notes).toEqual([{ book: 'tit', state: 'partial', count: 2, verses: 2 }])
    expect(conceptWhere(m2, GRACE).links.find((b) => b.book === 'rom')).toEqual({ book: 'rom', state: 'partial', count: 5, verses: 4 })
    expect(conceptWhere(m2, GRACE).links.find((b) => b.book === 'tit')).toEqual({ book: 'tit', state: 'count', count: 2, verses: 2 })
    const bridged: MapSet = { ...m2, xmap: { core: { ...x2, coverage: new Map([['o/en/ult', { whole: [], partial: ['tit'] }]]) }, parts: new Map() } }
    expect(strongWhere(bridged, 'G5485').books).toEqual([{ book: 'tit', state: 'partial', count: 3, verses: 2 }])
  })
})

describe('where', () => {
  test('G5485 finds G54850', () => {
    expect(strongWhere(m, 'G5485')).toEqual({ key: 'G54850', books: [{ book: 'tit', state: 'count', count: 3, verses: 2 }], count: 3, verses: 2 })
  })
  test('a key with no row', () => {
    expect(strongWhere(m, 'H7462b')).toEqual({ key: 'H7462b', books: [], count: 0, verses: 0 })
  })
  test('concept links and notes', () => {
    const w = conceptWhere(m, GRACE)
    expect(w.links.map((b) => b.book)).toEqual(['rom', 'tit'])
    expect(w.notes).toEqual([])
  })
})

describe('coverage and key terms', () => {
  test('bookCoverage', () => {
    expect(bookCoverage(m, 'rut')).toEqual({ [TN]: 'none', 'es/tn': 'partial' })
    expect(bookCoverage(m, 'tit')).toEqual({ [TN]: 'count', 'es/tn': 'count' })
  })
  test('keyTerms', () => {
    expect(keyTerms(m, 'tit')).toEqual([{ concept: GRACE, links: [2, 2], candidates: 3, otherBooks: ['rom'] }])
    expect(keyTerms(m, 'jon')).toEqual([])
  })
})

describe('revision', () => {
  const book = {
    notes: {
      res: TN,
      rows: [
        { id: 'a', ref: '1:1', from: 1, to: 1, concept: MET, cols: {} },
        { id: 'b', ref: '1:2', from: 2, to: 2, concept: 'x', cols: {} },
      ],
    },
  } as unknown as BookModel
  test('without and with the installed book', () => {
    expect(revisionAnswer(m, MET, 'tit')).toEqual({ fromMap: 4, revision: 7 })
    expect(revisionAnswer({ ...m, installed: new Map([['tit', book]]) }, MET, 'tit')).toEqual({ fromMap: 4, revision: 7, installed: 1 })
  })
  test('answer dispatches', () => {
    expect(answer(m, { kind: 'revision', concept: MET, book: 'tit' })).toEqual({ fromMap: 4, revision: 7 })
    expect(answer(m, { kind: 'strong', key: 'G5485' })).toEqual(strongWhere(m, 'G5485'))
    expect(() => answer(m, { kind: 'nope' })).toThrow()
  })
})

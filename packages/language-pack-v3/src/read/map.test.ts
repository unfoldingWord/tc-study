import { describe, expect, test } from 'bun:test'
import { mapSegment } from '../build/map/segment'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { BookName, MapCore, MapPart } from '../model'
import { MAP_TABLES, mapView } from './map'

const TN = 'es-419_gl/es-419/tn'

const books: BookName[] = Array.from({ length: 66 }, () => ['', '', '', 'none'] as BookName)
books[55] = ['La carta de Pablo a Tito', 'Tito', 'Tit', 'text']

const core: MapCore = {
  lang: 'es-419',
  part: 'core',
  res: [[TN, 'v1']],
  books,
  names: { 'tw:kt/grace': ['gracia', 'amable'], 'ta:translate/figs-metaphor': ['Metáfora'] },
  subtitles: { 'ta:translate/figs-metaphor': '¿Qué es una metáfora?' },
  coverage: new Map([[TN, { whole: ['tit'], partial: [] }]]),
  usage: { unit: 'notes', rows: new Map([['ta:translate/figs-metaphor', new Map([['tit', [1, 3]]])]]) },
  obs: [[10, 'Las plagas']],
}

const part: MapPart = { lang: 'es-419', part: 'tit', usage: new Map([['ta:translate/figs-metaphor', [56001002, 56001003, 56001004]]]) }
const bare: MapPart = { lang: 'es-419', part: 'tit' }

const fresh = (m: MapCore | MapPart = core): Segment => structuredClone(mapSegment(m))
const t = (s: Segment, name: string) => s.t[name] as any

function rejects(seg: Segment) {
  try {
    mapView(seg)
  } catch (e) {
    expect(e).toBeInstanceOf(FormatError)
    expect((e as FormatError).code).toBe('E_BODY')
    return
  }
  throw new Error('mapView accepted the segment')
}

describe('mapView', () => {
  test('a core round-trips', () => {
    expect(mapView(fresh())).toEqual(core)
  })

  test('a core with only the required tables round-trips', () => {
    const min: MapCore = { lang: 'es-419', part: 'core', res: core.res, books, names: {}, coverage: core.coverage }
    expect(mapView(fresh(min))).toEqual(min)
  })

  test('a core and parts round-trip through the file', async () => {
    for (const m of [core, part, bare]) {
      const { bytes } = await writeSegment(mapSegment(m))
      const { seg } = await readSegment(bytes, { known: MAP_TABLES })
      expect(mapView(seg)).toEqual(m)
    }
  })

  test('a part round-trips, with and without usage', () => {
    expect(mapView(fresh(part))).toEqual(part)
    expect(mapView(fresh(bare))).toEqual(bare)
    expect(fresh(part).h.res).toEqual([])
  })

  test('the writer rejects an inconsistent model', () => {
    expect(() => mapSegment({ ...core, books: books.slice(0, 65) })).toThrow()
    expect(() => mapSegment({ ...core, res: [] })).toThrow()
    expect(() => mapSegment({ ...core, usage: { unit: 'occurrences', rows: new Map() } })).toThrow()
  })

  test('a core with 65 books is rejected', () => {
    const s = fresh()
    s.t.books = t(s, 'books').slice(0, 65)
    rejects(s)
  })

  test('a source other than text, list or none is rejected', () => {
    const s = fresh()
    t(s, 'books')[55][3] = 'web'
    rejects(s)
  })

  test('usage with the unit occurrences is rejected', () => {
    const s = fresh()
    t(s, 'usage').unit = 'occurrences'
    rejects(s)
  })

  test('a core with empty res is rejected', () => {
    const s = fresh()
    s.h.res = []
    rejects(s)
  })


  test('an empty names list is rejected', () => {
    const s = fresh()
    s.t.names = { 'tw:kt/grace': [] }
    rejects(s)
  })

  test('a part table shape in the core, and a core table in a part, are rejected', () => {
    const s = fresh()
    s.t.usage = { keys: ['k'], verses: new Uint8Array() }
    rejects(s)
    const p = fresh(part)
    p.t.books = t(fresh(), 'books')
    rejects(p)
  })

  test('a part with resources or a wrong book is rejected', () => {
    const s = fresh(part)
    s.h.res = [[TN, 'v1']]
    rejects(s)
    const u = fresh(part)
    u.h.book = 'gen'
    rejects(u)
  })

  test('a header without lang or part, or of another class, is rejected', () => {
    const s = fresh()
    delete s.h.lang
    rejects(s)
    const u = fresh()
    delete u.h.part
    rejects(u)
    const v = fresh()
    v.h.class = 'xmap'
    rejects(v)
  })

  test('a bad obs row is rejected', () => {
    const s = fresh()
    s.t.obs = [[10]]
    rejects(s)
  })
})

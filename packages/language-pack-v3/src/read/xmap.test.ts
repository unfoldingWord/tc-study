import { describe, expect, test } from 'bun:test'
import { xmapSegment } from '../build/xmap/segment'
import { encodeUvarints } from '../codec/columns'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { Concept, XmapCore, XmapPart } from '../model'
import { XMAP_TABLES, xmapView } from './xmap'

const TWL = 'unfoldingWord/en/twl'
const TA = 'unfoldingWord/en/ta'

const concepts = new Map<string, Concept>([
  ['obs:10', { kind: 'story', tw: 'none', source: TA }],
  ['ta:translate/figs-metaphor', { kind: 'none', tw: 'none', source: TA }],
  ['tw:kt/grace', { kind: 'none', tw: 'kt', source: TWL }],
])

const core: XmapCore = {
  part: 'core',
  res: [
    [TWL, 'v91'],
    [TA, 'v91'],
  ],
  coverage: new Map([['unfoldingWord/en/twl', { whole: ['gen', 'tit'], partial: ['mat'] }]]),
  strong: {
    unit: 'occurrences',
    rows: new Map([
      ['G54850', new Map([['tit', [3, 2]]])],
      ['H0001', new Map([['gen', [5, 4]], ['exo', [1, 1]]])],
    ]),
  },
  concepts,
  links: { unit: 'links', rows: new Map([['tw:kt/grace', new Map([['tit', [2, 2]]])]]) },
  notes: { unit: 'notes', rows: new Map([['ta:translate/figs-metaphor', new Map([['tit', [1, 3]]])]]) },
  relations: [{ from: 'tw:kt/grace', to: 'obs:10', type: 'related', source: TA, confidence: 80 }],
  aliases: { 'tw:other/x': 'tw:kt/x' },
  strongs: { 'tw:kt/grace': ['G54850'] },
}

const part: XmapPart = {
  part: 'tit',
  strong: new Map([['G54850', [56001001, 56001004]]]),
  notes: new Map([['ta:translate/figs-metaphor', [56001002, 56001003, 56001004]]]),
}

const fresh = (m: XmapCore | XmapPart = core): Segment => structuredClone(xmapSegment(m))
const bodyOf = (s: Segment, name: string) => s.t[name] as any

describe('xmapView', () => {
  test('a core round-trips', () => {
    expect(xmapView(fresh())).toEqual(core)
  })

  test('a core round-trips through the file', async () => {
    const { bytes } = await writeSegment(xmapSegment(core))
    const { seg } = await readSegment(bytes, { known: XMAP_TABLES })
    expect(xmapView(seg)).toEqual(core)
  })

  test('a part round-trips, with res [] and book equal to part', async () => {
    const seg = xmapSegment(part)
    expect(seg.h.res).toEqual([])
    expect(seg.h.book).toBe('tit')
    expect(xmapView(fresh(part))).toEqual(part)
    const { bytes } = await writeSegment(seg)
    expect(xmapView((await readSegment(bytes, { known: XMAP_TABLES })).seg)).toEqual(part)
  })

  test('the required flags follow xmap.cddl', () => {
    expect(xmapSegment(core).h.tables).toEqual({
      coverage: [1, true],
      strong: [1, true],
      concepts: [1, true],
      links: [1, false],
      notes: [1, false],
      relations: [1, false],
      aliases: [1, false],
      strongs: [1, false],
    })
    expect(xmapSegment(part).h.tables).toEqual({ strong: [1, true], notes: [1, false] })
  })

  test('the concept ids are sorted by code point', () => {
    const ids = bodyOf(xmapSegment({ ...core, concepts: new Map([...concepts].reverse()) }), 'concepts').ids
    expect(ids).toEqual(['obs:10', 'ta:translate/figs-metaphor', 'tw:kt/grace'])
  })

  test('a core with no optional table round-trips', () => {
    const small: XmapCore = { part: 'core', res: [[TWL, 'v91']], coverage: new Map(), strong: core.strong, concepts: new Map() }
    expect(xmapView(fresh(small))).toEqual(small)
  })

  test('the writer rejects a model that does not hold together', () => {
    expect(() => xmapSegment({ ...core, relations: [{ from: 'x', to: 'obs:10', type: 't', source: TA, confidence: 1 }] })).toThrow()
    expect(() => xmapSegment({ ...core, relations: [{ from: 'obs:10', to: 'obs:10', type: 't', source: TA, confidence: 101 }] })).toThrow()
    expect(() => xmapSegment({ ...core, concepts: new Map([['a', { kind: 'none', tw: 'none', source: 'nope' }]]) })).toThrow()
  })

  test('the types of relations are in first-use order', () => {
    const rel = (type: string) => ({ from: 'obs:10', to: 'obs:10', type, source: TA, confidence: 1 })
    const seg = xmapSegment({ ...core, relations: [rel('zeta'), rel('alpha'), rel('zeta')] })
    expect(bodyOf(seg, 'relations').types).toEqual(['zeta', 'alpha'])
  })
})

describe('xmapView rejects', () => {
  const rejects = (mutate: (s: Segment) => void, m: XmapCore | XmapPart = core) => {
    const s = fresh(m)
    mutate(s)
    try {
      xmapView(s)
    } catch (e) {
      expect(e).toBeInstanceOf(FormatError)
      expect((e as FormatError).code).toBe('E_BODY')
      return
    }
    throw new Error('did not throw')
  }

  test('concept columns of different lengths', () => rejects((s) => (bodyOf(s, 'concepts').tw = encodeUvarints([1, 0]))))
  test('kind 6', () => rejects((s) => (bodyOf(s, 'concepts').kind = encodeUvarints([5, 6, 0]))))
  test('tw 4', () => rejects((s) => (bodyOf(s, 'concepts').tw = encodeUvarints([0, 4, 0]))))
  test('a concept source outside res', () => rejects((s) => (bodyOf(s, 'concepts').source = encodeUvarints([1, 1, 2]))))
  test('concept ids not sorted', () => rejects((s) => bodyOf(s, 'concepts').ids.reverse()))
  test('a relation to concept 99', () => rejects((s) => (bodyOf(s, 'relations').to = encodeUvarints([99]))))
  test('a relation type outside types', () => rejects((s) => (bodyOf(s, 'relations').type = encodeUvarints([4]))))
  test('a relation source outside res', () => rejects((s) => (bodyOf(s, 'relations').source = encodeUvarints([2]))))
  test('confidence 101', () => rejects((s) => (bodyOf(s, 'relations').confidence = encodeUvarints([101]))))
  test('a part whose book differs from part', () => rejects((s) => (s.h.book = 'gen'), part))
  test('a part with a core table', () => rejects((s) => (s.t.concepts = {}), part))
  test('a core with a book', () => rejects((s) => (s.h.book = 'tit')))
  test('a core with a count table of the wrong unit', () => rejects((s) => (bodyOf(s, 'links').unit = 'notes')))
  test('a part with the shape of a core table', () => rejects((s) => (s.t.strong = fresh().t.strong), part))
  test('aliases not sorted', () => rejects((s) => (s.t.aliases = { b: 'x', a: 'y' })))
  test('strongs with an empty list', () => rejects((s) => (s.t.strongs = { a: [] })))
  test('a segment of another class', () => rejects((s) => (s.h.class = 'map')))
})

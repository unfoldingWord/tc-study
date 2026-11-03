import { describe, expect, test } from 'bun:test'
import { topicsSegment, xtopicsSegment } from '../build/topics/segment'
import { encodeUvarints } from '../codec/columns'
import { CLASS_NAMES, readSegment, type Segment, writeSegment } from '../codec/container'
import { encodeBookSet } from '../codec/counts'
import { FormatError } from '../codec/errors'
import type { Topic, TopicsCore, TopicsPart, XtopicsCore, XtopicsPart } from '../model'
import { TOPICS_TABLES, topicsView, XTOPICS_TABLES, xtopicsView } from './topics'

const TIPNR = 'STEPBible/TIPNR'
const OBS = 'unfoldingWord/en/obs'

const topics = new Map<string, Topic>([
  ['ev:plagues', { kind: 'event', source: OBS, ref: 'e1', title: 'Plagues', ustrong: '' }],
  ['obs:10', { kind: 'story', source: OBS, ref: '10', title: 'The Plagues', ustrong: '' }],
  ['per:abraham', { kind: 'person', source: TIPNR, ref: 'Abraham@Gen.11.26', title: 'Abraham', ustrong: 'H0085' }],
  ['sec:a', { kind: 'section', source: OBS, ref: '10', title: 'Same ref', ustrong: '' }],
])

const core: XtopicsCore = {
  part: 'core',
  res: [
    [TIPNR, 'r1'],
    [OBS, 'v9'],
  ],
  coverage: new Map([[TIPNR, { whole: ['gen', 'tit'], partial: ['mat'] }]]),
  topics,
  occurrences: new Map([
    ['per:abraham', new Map([['gen', [3, 3]], ['tit', [1, 1]]])],
    ['obs:10', new Map([['exo', [2, 2]]])],
  ]),
  relations: [
    { from: 'per:abraham', to: 'tw:names/abraham', type: 'same-as', source: TIPNR, confidence: 90 },
    { from: 'tw:names/b', to: 'tw:names/a', type: 'related', source: OBS, confidence: 10 },
  ],
  strongs: { 'per:abraham': ['H0085', 'H0087'] },
  ranges: { 'obs:10': [[2_001_001, 2_001_010]] },
}
const xpart: XtopicsPart = { part: 'gen', occurrences: new Map([['per:abraham', [1_011_026, 1_012_001, 1_012_004]]]) }

const tcore: TopicsCore = {
  lang: 'es-419',
  part: 'core',
  res: [['aligned/es-419', 'a1']],
  names: {
    'per:abraham': [
      ['Abraham', 'alignment', 5, ['gen', 'mat']],
      ['Abram', 'alignment', 2, ['gen']],
      ['Abraham', 'list', 1, ['gen']],
    ],
    'obs:10': [['Las plagas', 'obs', 1, ['exo']]],
  },
  local: { 'es-419:tema/x': { names: ['X'], refs: [[1_001_001, 1_001_002]], related: ['tw:kt/grace'] } },
  coverage: new Map([['aligned/es-419', { whole: ['gen'], partial: [] }]]),
}
const tpart: TopicsPart = { lang: 'es-419', part: 'gen', names: new Map([['per:abraham', [1_011_026]]]) }

const xfresh = (m: XtopicsCore | XtopicsPart = core): Segment => structuredClone(xtopicsSegment(m))
const tfresh = (m: TopicsCore | TopicsPart = tcore): Segment => structuredClone(topicsSegment(m))
const body = (s: Segment, name: string) => s.t[name] as any

describe('classes', () => {
  test('CLASS_NAMES lists xtopics and topics after map', () => {
    const i = CLASS_NAMES.indexOf('map')
    expect(CLASS_NAMES[i + 1]).toBe('xtopics')
    expect(CLASS_NAMES[i + 2]).toBe('topics')
  })
})

describe('xtopics round trips', () => {
  test('a core', () => expect(xtopicsView(xfresh())).toEqual(core))
  test('a core through the file', async () => {
    const { bytes } = await writeSegment(xtopicsSegment(core))
    expect(xtopicsView((await readSegment(bytes, { known: XTOPICS_TABLES })).seg)).toEqual(core)
  })
  test('a part, with res [] and book equal to part', async () => {
    const seg = xtopicsSegment(xpart)
    expect(seg.h.res).toEqual([])
    expect(seg.h.book).toBe('gen')
    const { bytes } = await writeSegment(seg)
    expect(xtopicsView((await readSegment(bytes, { known: XTOPICS_TABLES })).seg)).toEqual(xpart)
  })
  test('a core with no optional table', () => {
    const small: XtopicsCore = { ...core, relations: undefined, strongs: undefined, ranges: undefined }
    delete small.relations
    delete small.strongs
    delete small.ranges
    expect(xtopicsView(xfresh(small))).toEqual(small)
    expect(xtopicsSegment(small).h.tables).toEqual({ coverage: [1, true], topics: [1, true], occurrences: [1, true] })
  })
  test('refs are in first-use order and shared refs are stored once', () => {
    const t = body(xtopicsSegment(core), 'topics')
    expect(t.ids).toEqual(['ev:plagues', 'obs:10', 'per:abraham', 'sec:a'])
    expect(t.refs).toEqual(['e1', '10', 'Abraham@Gen.11.26'])
    expect(t.title).toEqual(['Plagues', 'The Plagues', 'Abraham', 'Same ref'])
    expect(t.ustrong).toEqual(['', '', 'H0085', ''])
  })
  test('relation ends beyond the topics are external, numbered after them', () => {
    const r = body(xtopicsSegment(core), 'relations')
    expect(r.external).toEqual(['tw:names/a', 'tw:names/abraham', 'tw:names/b'])
    expect(r.from).toEqual(encodeUvarints([2, 6]))
    expect(r.to).toEqual(encodeUvarints([5, 4]))
  })
  test('the writer rejects a model that does not hold together', () => {
    expect(() => xtopicsSegment({ ...core, res: [] })).toThrow()
    expect(() => xtopicsSegment({ ...core, occurrences: new Map([['per:nobody', new Map([['gen', [1, 1]]])]]) })).toThrow()
    expect(() => xtopicsSegment({ ...core, occurrences: new Map([['obs:10', new Map([['gen', [2, 3]]])]]) })).toThrow()
    expect(() => xtopicsSegment({ ...core, ranges: { 'per:nobody': [[1_001_001, 1_001_002]] } })).toThrow()
    expect(() => xtopicsSegment({ ...core, topics: new Map([['a', { ...topics.get('obs:10')!, source: 'nope' }]]) })).toThrow()
  })
})

describe('xtopicsView rejects', () => {
  const rejects = (mutate: (s: Segment) => void, m: XtopicsCore | XtopicsPart = core) => {
    const s = xfresh(m)
    mutate(s)
    try {
      xtopicsView(s)
    } catch (e) {
      expect(e).toBeInstanceOf(FormatError)
      expect((e as FormatError).code).toBe('E_BODY')
      return
    }
    throw new Error('did not throw')
  }
  const hasPart = (s: Segment) => ((s.h as any).part = undefined)

  test('a header with no part', () => rejects(hasPart))
  test('a part whose res is not []', () => rejects((s) => (s.h.res = [[TIPNR, 'r1']]), xpart))
  test('a core with empty res', () => rejects((s) => (s.h.res = [])))
  test('a book that differs from part', () => rejects((s) => (s.h.book = 'exo'), xpart))
  test('a core with a book', () => rejects((s) => (s.h.book = 'gen')))
  test('a core table in a part', () => rejects((s) => (s.t.topics = {}), xpart))
  test('the part table in a core', () => rejects((s) => (s.t.occurrences = { keys: [], verses: new Uint8Array() })))
  test('ids not sorted', () => rejects((s) => (body(s, 'topics').ids = ['per:abraham', 'ev:plagues', 'obs:10', 'sec:a'])))
  test('ids repeated', () => rejects((s) => (body(s, 'topics').ids = ['ev:plagues', 'ev:plagues', 'obs:10', 'sec:a'])))
  test('columns of different lengths', () => rejects((s) => (body(s, 'topics').kind = encodeUvarints([3, 5]))))
  test('kind 0', () => rejects((s) => (body(s, 'topics').kind = encodeUvarints([0, 5, 1, 6]))))
  test('kind above 6', () => rejects((s) => (body(s, 'topics').kind = encodeUvarints([3, 5, 7, 6]))))
  test('a source outside res', () => rejects((s) => (body(s, 'topics').source = encodeUvarints([1, 1, 0, 2]))))
  test('a ref outside refs', () => rejects((s) => (body(s, 'topics').ref = encodeUvarints([0, 1, 3, 1]))))
  test('refs with a text twice', () => rejects((s) => (body(s, 'topics').refs = ['e1', '10', 'e1'])))
  test('a ref no id uses', () => rejects((s) => (body(s, 'topics').refs = ['e1', '10', 'Abraham@Gen.11.26', 'extra'])))
  test('refs not in the order of first use', () => {
    rejects((s) => {
      body(s, 'topics').refs = ['10', 'e1', 'Abraham@Gen.11.26']
      body(s, 'topics').ref = encodeUvarints([1, 0, 2, 0])
    })
    rejects((s) => (body(s, 'topics').ref = encodeUvarints([0, 2, 1, 2])))
  })
  test('title with a count other than the ids', () => rejects((s) => (body(s, 'topics').title = ['a'])))
  test('ustrong with a count other than the ids', () => rejects((s) => (body(s, 'topics').ustrong = ['', '', '', '', ''])))
  test('a relation end beyond topics plus external', () => rejects((s) => (body(s, 'relations').to = encodeUvarints([5, 7]))))
  test('a relation type outside types', () => rejects((s) => (body(s, 'relations').type = encodeUvarints([0, 5]))))
  test('a relation source outside res', () => rejects((s) => (body(s, 'relations').source = encodeUvarints([0, 2]))))
  test('a relation confidence above 100', () => rejects((s) => (body(s, 'relations').confidence = encodeUvarints([101, 1]))))
  test('relation columns of different lengths', () => rejects((s) => (body(s, 'relations').confidence = encodeUvarints([1]))))
  test('external not sorted', () => rejects((s) => (body(s, 'relations').external = ['tw:names/b', 'tw:names/a', 'x'])))
  test('external repeated', () => rejects((s) => (body(s, 'relations').external = ['a', 'a', 'b'])))
  test('strongs: a key not in topics', () => rejects((s) => (body(s, 'strongs')['per:zz'] = ['H1'])))
  test('strongs: an empty list', () => rejects((s) => (body(s, 'strongs')['per:abraham'] = [])))
  test('strongs: not sorted', () => rejects((s) => (body(s, 'strongs')['per:abraham'] = ['H2', 'H1'])))
  test('strongs: a repeat', () => rejects((s) => (body(s, 'strongs')['per:abraham'] = ['H1', 'H1'])))
  test('ranges: a key not in topics', () => rejects((s) => (body(s, 'ranges')['per:zz'] = [[1_001_001, 1_001_002]])))
  test('ranges: an empty list', () => rejects((s) => (body(s, 'ranges')['obs:10'] = [])))
  test('ranges: backwards', () => rejects((s) => (body(s, 'ranges')['obs:10'] = [[2_001_010, 2_001_001]])))
  test('ranges: a verse id of no book', () => {
    rejects((s) => (body(s, 'ranges')['obs:10'] = [[999, 2_001_001]]))
    rejects((s) => (body(s, 'ranges')['obs:10'] = [[2_001_001, 67_000_001]]))
  })
  test('occurrences: another unit', () => rejects((s) => (body(s, 'occurrences').unit = 'notes')))
  test('occurrences: a key not in topics', () => rejects((s) => (body(s, 'occurrences').keys = ['per:abraham', 'per:zz'])))
  test('occurrences: count differs from verses', () => {
    const c = body(xfresh(), 'occurrences')
    rejects((s) => (body(s, 'occurrences').counts = encodeUvarints([1, 2, 5, 4, 2, 1, 5, 5])), core)
    expect(c.keys).toEqual(['obs:10', 'per:abraham'])
  })
  test('occurrences: a count of 0', () => rejects((s) => (body(s, 'occurrences').counts = encodeUvarints([1, 3, 0, 0, 2, 1, 3, 3, 1, 1, 1]))))
  test('occurrences in a part: verse lists defects', () => {
    rejects((s) => (body(s, 'occurrences').keys = ['b', 'a']), xpart)
    rejects((s) => (body(s, 'occurrences').verses = encodeUvarints([0])), xpart)
  })
  test('a coverage book set of another length', () => rejects((s) => (body(s, 'coverage')[TIPNR] = [new Uint8Array(8)])))
})

describe('topics round trips', () => {
  test('a core', () => expect(topicsView(tfresh())).toEqual(tcore))
  test('a core through the file', async () => {
    const { bytes } = await writeSegment(topicsSegment(tcore))
    expect(topicsView((await readSegment(bytes, { known: TOPICS_TABLES })).seg)).toEqual(tcore)
  })
  test('a part, with and without names', async () => {
    const seg = topicsSegment(tpart)
    expect(seg.h.res).toEqual([])
    expect(seg.h.book).toBe('gen')
    const { bytes } = await writeSegment(seg)
    expect(topicsView((await readSegment(bytes, { known: TOPICS_TABLES })).seg)).toEqual(tpart)
    const bare: TopicsPart = { lang: 'es-419', part: 'gen' }
    expect(topicsView(tfresh(bare))).toEqual(bare)
    expect(topicsSegment(bare).h.tables).toEqual({})
  })
  test('the order of names is kept and the flags follow topics.cddl', () => {
    const seg = topicsSegment(tcore)
    expect(body(seg, 'names')['per:abraham'].map((n: any[]) => n[0])).toEqual(['Abraham', 'Abram', 'Abraham'])
    expect(seg.h.tables).toEqual({ names: [1, true], coverage: [1, true], local: [1, false] })
  })
  test('a core with no local round-trips', () => {
    const small: TopicsCore = { ...tcore }
    delete small.local
    expect(topicsView(tfresh(small))).toEqual(small)
  })
  test('the writer rejects a model that does not hold together', () => {
    expect(() => topicsSegment({ ...tcore, names: { x: [] } })).toThrow()
    expect(() => topicsSegment({ ...tcore, names: { x: [['', 'list', 1, []]] } })).toThrow()
    expect(() => topicsSegment({ ...tcore, names: { x: [['a', 'nope' as any, 1, []]] } })).toThrow()
    expect(() => topicsSegment({ ...tcore, names: { x: [['a', 'list', 0, []]] } })).toThrow()
    expect(() => topicsSegment({ ...tcore, names: { x: [['a', 'list', 1, []], ['a', 'list', 2, []]] } })).toThrow()
  })
})

describe('writers never emit what the view rejects', () => {
  test('names are written count descending, ties by code point', () => {
    const m: TopicsCore = {
      ...tcore,
      names: { x: [['b', 'list', 1, []], ['z', 'obs', 3, []], ['a', 'list', 1, []], ['y', 'obs', 3, []]] },
    }
    const out = body(topicsSegment(m), 'names').x.map((n: any[]) => n[0])
    expect(out).toEqual(['y', 'z', 'a', 'b'])
    expect(() => topicsView(structuredClone(topicsSegment(m)))).not.toThrow()
  })
  test('strongs: empty list and repeated key throw', () => {
    expect(() => xtopicsSegment({ ...core, strongs: { 'per:abraham': [] } })).toThrow()
    expect(() => xtopicsSegment({ ...core, strongs: { 'per:abraham': ['H1', 'H1'] } })).toThrow()
  })
  test('ranges: empty, backwards and bad ids throw', () => {
    expect(() => xtopicsSegment({ ...core, ranges: { 'obs:10': [] } })).toThrow()
    expect(() => xtopicsSegment({ ...core, ranges: { 'obs:10': [[1_001_002, 1_001_001]] } })).toThrow()
    expect(() => xtopicsSegment({ ...core, ranges: { 'obs:10': [[5, 1_001_001]] } })).toThrow()
    expect(() => xtopicsSegment({ ...core, ranges: { 'obs:10': [[1_001_001, 67_000_000]] } })).toThrow()
  })
  test('local: empty names throw', () => {
    expect(() => topicsSegment({ ...tcore, local: { 'es-419:tema/x': { names: [] } } })).toThrow()
  })
})

describe('topicsView rejects', () => {
  const rejects = (mutate: (s: Segment) => void, m: TopicsCore | TopicsPart = tcore) => {
    const s = tfresh(m)
    mutate(s)
    try {
      topicsView(s)
    } catch (e) {
      expect(e).toBeInstanceOf(FormatError)
      expect((e as FormatError).code).toBe('E_BODY')
      return
    }
    throw new Error('did not throw')
  }

  test('a header with no lang', () => rejects((s) => (s.h.lang = undefined)))
  test('a header with no part', () => rejects((s) => (s.h.part = undefined)))
  test('a part whose res is not []', () => rejects((s) => (s.h.res = [['a', 'b']]), tpart))
  test('a book that differs from part', () => rejects((s) => (s.h.book = 'exo'), tpart))
  test('a core with a book', () => rejects((s) => (s.h.book = 'gen')))
  test('a core table in a part', () => rejects((s) => (s.t.coverage = {}), tpart))
  test('the part table shape in a core', () => rejects((s) => (s.t.names = { keys: [], verses: new Uint8Array() })))
  test('a topic with no name', () => rejects((s) => (body(s, 'names')['obs:10'] = [])))
  test('a source outside the four', () => rejects((s) => (body(s, 'names')['obs:10'][0][1] = 'guess')))
  test('a count of 0', () => rejects((s) => (body(s, 'names')['obs:10'][0][2] = 0)))
  test('books of another length than 9', () => rejects((s) => (body(s, 'names')['obs:10'][0][3] = new Uint8Array(8))))
  test('books with a bit 66 to 71 set', () => {
    const bits = encodeBookSet(['exo'])
    bits[8] |= 0b100
    rejects((s) => (body(s, 'names')['obs:10'][0][3] = bits))
  })
  test('an empty name', () => rejects((s) => (body(s, 'names')['obs:10'][0][0] = '')))
  test('a name that is not a four-item row', () => rejects((s) => (body(s, 'names')['obs:10'][0] = ['a', 'obs', 1])))
  test('names of a part with verse list defects', () => rejects((s) => (body(s, 'names').keys = ['b', 'a']), tpart))
  test('local that is not a map of rows', () => rejects((s) => (body(s, 'local')['es-419:tema/x'] = 3)))
  test('a coverage book set of another length', () => rejects((s) => (body(s, 'coverage')['aligned/es-419'] = [new Uint8Array(10)])))
})

describe('keys', () => {
  test('a key named __proto__ is kept in names and strongs', async () => {
    const m: TopicsCore = { ...tcore, names: JSON.parse('{"__proto__": [["a", "list", 1, []]]}') }
    const { bytes } = await writeSegment(topicsSegment(m))
    const view = topicsView((await readSegment(bytes, { known: TOPICS_TABLES })).seg) as TopicsCore
    expect(Object.keys(view.names)).toEqual(['__proto__'])
  })
})

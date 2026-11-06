import { describe, expect, test } from 'bun:test'
import { lexSegment } from '../build/lex'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { LexEntry } from '../model'
import { LEX_TABLES, lexView } from './lex'

const UGL = 'es-419_gl/es-419/ugl'

const model: LexEntry[] = [
  {
    res: UGL,
    strong: 'G5',
    lemma: 'α',
    brief: 'b',
    long: 'l',
    pos: ['sust., n.'],
    notes: ['una nota'],
    senses: [
      { code: '1.2', definition: 'd', glosses: ['g1', 'g2'], domain: 'dom', domainCode: '001', comments: 'c', etymology: 'e', lang: 'en', definitionLang: 'en', refs: [[43003016, 43003016], [43003001, 43003004]] },
      {},
    ],
  },
  { res: UGL, strong: 'G127a', lemma: 'β', aramaic: true, source: 'en_ugl', review: 'pending', senses: [] },
]

const fresh = (): Segment => structuredClone(lexSegment('es-419', 'G0', [[UGL, 'v1']], model))
const entries = (s: Segment) => s.t.entries as any[]

describe('lexView', () => {
  test('the untouched copy is fine, and is the model', () => {
    expect(lexView(fresh())).toEqual({ group: 'G0', entries: model })
  })

  test('gives copies: changing the model does not change the segment it came from', () => {
    const seg = fresh()
    const view = lexView(seg)
    view.entries[0].pos![0] = 'x'
    view.entries[0].senses[0].glosses![0] = 'x'
    view.entries[0].senses[0].refs![0][0] = 1
    expect(entries(seg)[0].pos).toEqual(['sust., n.'])
    expect(entries(seg)[0].senses[0].glosses).toEqual(['g1', 'g2'])
    expect(entries(seg)[0].senses[0].refs[0]).toEqual([43003016, 43003016])
  })

  test('keys it does not know are left alone, and so are tables it does not know', () => {
    const seg = fresh()
    entries(seg)[0].future = 1
    entries(seg)[0].senses[0].future = 'x'
    seg.t.future = []
    seg.h.tables.future = [1, false]
    expect(lexView(seg).entries).toEqual(model)
  })

  test('the known tables are the one table, version 1', () => {
    expect(LEX_TABLES).toEqual({ entries: [1] })
  })

  test('a segment that readSegment gave: write, read, view', async () => {
    const { bytes } = await writeSegment(fresh())
    const { seg } = await readSegment(bytes, { known: LEX_TABLES })
    expect(lexView(seg)).toEqual({ group: 'G0', entries: model })
  })

  test('an empty group is a group with no entries', () => {
    const seg = fresh()
    seg.t.entries = []
    expect(lexView(seg)).toEqual({ group: 'G0', entries: [] })
  })

  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'art')],
    ['no lang in the header', (s) => void delete s.h.lang],
    ['no group in the header', (s) => void delete s.h.group],
    ['a group that is not a letter and a number', (s) => void (s.h.group = 'X1')],
    ['a group in lowercase', (s) => void (s.h.group = 'g0')],
    ['no res in the header', (s) => void delete s.h.res],
    ['an empty res in the header', (s) => void (s.h.res = [])],
    ['entries that is not a list', (s) => void (s.t.entries = {} as never)],
    ['an entry that is not a map', (s) => void (entries(s)[0] = 'x')],
    ['an entry that is a list', (s) => void (entries(s)[0] = [])],
    ['res that is not a number', (s) => void (entries(s)[0].res = '0')],
    ['res outside the header', (s) => void (entries(s)[0].res = 1)],
    ['a negative res', (s) => void (entries(s)[0].res = -1)],
    ['no strong', (s) => void delete entries(s)[0].strong],
    ['a strong that is not text', (s) => void (entries(s)[0].strong = 5)],
    ['a strong that is not a number with a letter', (s) => void (entries(s)[0].strong = 'X5')],
    ['a strong of another group than the header', (s) => void (entries(s)[0].strong = 'G1000')],
    ['a strong of the other letter', (s) => void (entries(s)[0].strong = 'H0005')],
    ['no lemma', (s) => void delete entries(s)[0].lemma],
    ['a lemma that is not text', (s) => void (entries(s)[0].lemma = 1)],
    ['a brief that is not text', (s) => void (entries(s)[0].brief = 1)],
    ['a long that is not text', (s) => void (entries(s)[0].long = [])],
    ['a source that is not text', (s) => void (entries(s)[1].source = 1)],
    ['a review that is not text', (s) => void (entries(s)[1].review = true)],
    ['pos that is not a list of text', (s) => void (entries(s)[0].pos = 'sust.')],
    ['notes with a number', (s) => void (entries(s)[0].notes = [1])],
    ['aramaic that is not true or false', (s) => void (entries(s)[1].aramaic = 'yes')],
    ['no senses', (s) => void delete entries(s)[0].senses],
    ['senses that is not a list', (s) => void (entries(s)[0].senses = {})],
    ['a sense that is not a map', (s) => void (entries(s)[0].senses[0] = 3)],
    ['a code that is not text', (s) => void (entries(s)[0].senses[0].code = 1)],
    ['a definition that is not text', (s) => void (entries(s)[0].senses[0].definition = null)],
    ['glosses that is not a list of text', (s) => void (entries(s)[0].senses[0].glosses = [1])],
    ['an etymology that is not text', (s) => void (entries(s)[0].senses[0].etymology = 1)],
    ['refs that is not a list', (s) => void (entries(s)[0].senses[0].refs = {})],
    ['a ref that is not a pair', (s) => void (entries(s)[0].senses[0].refs[0] = [1])],
    ['a ref with a text', (s) => void (entries(s)[0].senses[0].refs[0] = [1, '2'])],
    ['a negative verse id', (s) => void (entries(s)[0].senses[0].refs[0] = [-1, 2])],
    ['a ref that runs backwards', (s) => void (entries(s)[0].senses[0].refs[0] = [5, 4])],
  ]
  for (const [name, change] of broken) {
    test(`rejects ${name} with E_BODY`, () => {
      const seg = fresh()
      change(seg)
      let error: unknown
      try {
        lexView(seg)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }
})

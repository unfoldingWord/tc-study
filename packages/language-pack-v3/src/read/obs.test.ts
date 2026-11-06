import { describe, expect, test } from 'bun:test'
import { obsSegment } from '../build/obs'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { ObsModel } from '../model'
import { OBS_TABLES, obsView } from './obs'

const OBS = 'unfoldingWord/en/obs'
const TN = 'unfoldingWord/en/obs-tn'
const SN = 'unfoldingWord/en/obs-sn'
const SQ = 'unfoldingWord/en/obs-sq'

const model: ObsModel = {
  lang: 'en',
  res: [[OBS, 'v12'], [SN, 'v1'], [SQ, 'v1'], [TN, 'v7']],
  stories: [
    { res: OBS, n: 1, title: '1. The Creation', frames: [{ n: 1, text: 'In the beginning.', image: 'u1' }] },
    {
      res: OBS,
      n: 10,
      title: '10. The plagues',
      reference: 'A Bible story from: Exodus 5-14',
      refs: [[2005001, 2014031]],
      frames: [{ n: 1, text: 'One.' }, { n: 2, text: 'Two.' }],
    },
  ],
  notes: {
    res: TN,
    rows: [
      { id: 'ab12', ref: '10:3', frame: 1003, concept: 'ta:translate/figs-metaphor', cols: { quote: 'hardened', note: 'A figure.\nMore.', isIntro: false } },
      { id: 'cd34', ref: '10:03', frame: 1003, cols: { quote: '', note: 'padded' } },
    ],
  },
  studyNotes: { res: SN, rows: [{ id: 'sn001', ref: '10:1', frame: 1001, cols: { note: 'A study note.' } }] },
  studyQuestions: { res: SQ, rows: [{ id: 'sq001', ref: '10:2', frame: 1002, cols: { question: 'Why?', response: 'Because.' } }] },
}

const fresh = (): Segment => structuredClone(obsSegment(model))
const stories = (s: Segment) => s.t.stories as any[]
const notes = (s: Segment) => s.t.notes as any

describe('obsView', () => {
  test('the untouched copy is fine, and is the model', () => {
    expect(obsView(fresh())).toEqual(model)
  })

  test('drops no table: notes, study notes and study questions all come back', () => {
    const view = obsView(fresh())
    expect(view.notes?.rows).toHaveLength(2)
    expect(view.studyNotes?.rows).toHaveLength(1)
    expect(view.studyQuestions?.rows).toHaveLength(1)
    expect(view.questions).toBeUndefined()
    expect(view.links).toBeUndefined()
  })

  test('gives copies: changing the model does not change the segment it came from', () => {
    const seg = fresh()
    const view = obsView(seg)
    view.stories[1].refs![0][0] = 1
    view.stories[0].frames[0].text = 'x'
    view.notes!.rows[0].cols.note = 'x'
    expect(stories(seg)[1].refs[0]).toEqual([2005001, 2014031])
    expect(stories(seg)[0].frames[0].text).toBe('In the beginning.')
  })

  test('keys it does not know are left alone, and so are tables it does not know', () => {
    const seg = fresh()
    stories(seg)[0].future = 1
    stories(seg)[0].frames[0].future = 'x'
    notes(seg).future = []
    seg.t.future = []
    seg.h.tables.future = [1, false]
    expect(obsView(seg)).toEqual(model)
  })

  test('the known tables', () => {
    expect(Object.keys(OBS_TABLES).sort()).toEqual(['links', 'notes', 'questions', 'stories', 'strings', 'study-notes', 'study-questions'])
    expect(Object.values(OBS_TABLES).every((versions) => versions.length === 1 && versions[0] === 1)).toBe(true)
  })

  test('a segment that readSegment gave: write, read, view', async () => {
    const { bytes } = await writeSegment(fresh())
    const { seg } = await readSegment(bytes, { known: OBS_TABLES })
    expect(obsView(seg)).toEqual(model)
  })

  test('a frame without a canonical text comes back with the text refText keeps; frame 0 is the intro', () => {
    const seg = fresh()
    notes(seg).frame = Uint8Array.of(0xe8, 0x07, 0xe8, 0x07)
    notes(seg).refText = [[1, 'see below']]
    const view = obsView(seg)
    expect(view.notes!.rows.map((r) => [r.ref, r.frame])).toEqual([['10:intro', 1000], ['see below', 1000]])
  })

  test('no stories is a segment with no stories', () => {
    const seg = fresh()
    seg.t.stories = []
    expect(obsView(seg).stories).toEqual([])
  })

  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'lex')],
    ['no lang in the header', (s) => void delete s.h.lang],
    ['no res in the header', (s) => void delete s.h.res],
    ['an empty res in the header', (s) => void (s.h.res = [])],
    ['strings that is not a list', (s) => void (s.t.strings = {} as never)],
    ['strings with a number', (s) => void (s.t.strings = [1] as never)],
    ['stories that is not a list', (s) => void (s.t.stories = {} as never)],
    ['no stories table', (s) => void delete s.t.stories],
    ['a story that is not a map', (s) => void (stories(s)[0] = 'x')],
    ['a story res outside the header', (s) => void (stories(s)[0].res = 9)],
    ['a negative story res', (s) => void (stories(s)[0].res = -1)],
    ['a story number 0', (s) => void (stories(s)[0].n = 0)],
    ['a story number that is not a number', (s) => void (stories(s)[0].n = '1')],
    ['a story number above 50', (s) => void (stories(s)[1].n = 51)],
    ['a frame number above 99', (s) => void (stories(s)[1].frames[1].n = 100)],
    ['a story number twice', (s) => void (stories(s)[1].n = 1)],
    ['no title', (s) => void delete stories(s)[0].title],
    ['a title that is not text', (s) => void (stories(s)[0].title = 1)],
    ['a reference that is not text', (s) => void (stories(s)[1].reference = 1)],
    ['refs that is not a list', (s) => void (stories(s)[1].refs = 1)],
    ['a story ref that runs backwards', (s) => void (stories(s)[1].refs[0] = [5, 4])],
    ['a story ref that is not a pair', (s) => void (stories(s)[1].refs[0] = [5])],
    ['no frames', (s) => void delete stories(s)[0].frames],
    ['empty frames', (s) => void (stories(s)[0].frames = [])],
    ['a frame that is not a map', (s) => void (stories(s)[0].frames[0] = 1)],
    ['a frame number that is not a number', (s) => void (stories(s)[0].frames[0].n = 'a')],
    ['a frame number twice', (s) => void (stories(s)[1].frames[1].n = 1)],
    ['a frame text that is not text', (s) => void (stories(s)[0].frames[0].text = 1)],
    ['no frame text', (s) => void delete stories(s)[0].frames[0].text],
    ['an image that is not text', (s) => void (stories(s)[0].frames[0].image = 1)],
    ['a table that is not a map', (s) => void (s.t.notes = [])],
    ['a table res outside the header', (s) => void (notes(s).res = 9)],
    ['a table n that is not a count', (s) => void (notes(s).n = -1)],
    ['a table n that is not the number of rows', (s) => void (notes(s).n = 3)],
    ['an id that is neither ascii4 nor strings', (s) => void (notes(s).id = {})],
    ['ascii4 of the wrong length', (s) => void (notes(s).id = { ascii4: new Uint8Array(3) })],
    ['ids with both ascii4 and strings', (s) => void (notes(s).id = { ...notes(s).id, strings: Uint8Array.of(0, 1) })],
    ['ascii4 with a byte above 127', (s) => void (notes(s).id = { ascii4: Uint8Array.of(0xff, 97, 97, 97, 97, 97, 97, 97) })],
    ['an id twice', (s) => void (notes(s).id = { ascii4: Uint8Array.of(97, 97, 97, 97, 97, 97, 97, 97) })],
    ['ids of strings outside the table', (s) => void (s.t['study-notes'] = { ...(s.t['study-notes'] as object), id: { strings: Uint8Array.of(99) } })],
    ['no frame column', (s) => void delete notes(s).frame],
    ['a frame column of the wrong length', (s) => void (notes(s).frame = Uint8Array.of(1))],
    ['a frame column that is not minimal', (s) => void (notes(s).frame = Uint8Array.of(0x80, 0x00, 1))],
    ['a refText that is not a list', (s) => void (notes(s).refText = 'x')],
    ['a refText of a row outside the table', (s) => void (notes(s).refText = [[5, 'x']])],
    ['a refText that is not text', (s) => void (notes(s).refText = [[0, 1]])],
    ['a refText row twice', (s) => void (notes(s).refText = [[0, 'x'], [0, 'y']])],
    ['a concept column with flags', (s) => void (notes(s).concept = { flags: Uint8Array.of(3) })],
    ['a concept column with two kinds', (s) => void (notes(s).concept = { ...notes(s).concept, flags: Uint8Array.of(1) })],
    ['a column with a has of the wrong size', (s) => void (notes(s).cols.quote = { has: Uint8Array.of(1, 2), strings: new Uint8Array(0) })],
    ['a column with too few values', (s) => void (notes(s).cols.quote = { strings: Uint8Array.of(0) })],
    ['a column with a string outside the table', (s) => void (notes(s).cols.quote = { strings: Uint8Array.of(99, 99) })],
    ['cols that is not a map', (s) => void (notes(s).cols = [])],
  ]
  for (const [name, change] of broken) {
    test(`rejects ${name} with E_BODY`, () => {
      const seg = fresh()
      change(seg)
      let error: unknown
      try {
        obsView(seg)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }
})

import { describe, expect, test } from 'bun:test'
import { bookSegment } from '../build/book'
import { encodeDeltas } from '../codec/columns'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { BookModel } from '../model'
import { BOOK_TABLES, bookView } from './book'

const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'

/** Two texts, three words in the first (with a footnote, a missing word and attributes), one in the second. */
const tiny: BookModel = {
  lang: 'es-419',
  book: 'tit',
  orig: ['unfoldingWord/el-x-koine/ugnt', 'g987ab2025a'],
  res: [
    [GLT, 'v42'],
    [GST, 'v7'],
  ],
  texts: [
    {
      res: GLT,
      pieces: [
        ['Pablo', true],
        [' ', false],
        ['siervo', true],
        [', ', false],
        ['de', true],
      ],
      events: [
        [0, 'chapter', '1'],
        [0, 'verse', '1-2'],
        [1, 'open', 'note:f'],
        [3, 'close', ''],
      ],
      attrs: { 2: { caller: '+' } },
      align: [[3], [], [1, 0]],
      alignMissing: [[1, 56_001_001, 'Ἰησοῦ', 1]],
    },
    { res: GST, pieces: [['Yo', true]], events: [[0, 'verse', '1']] },
  ],
}

const fresh = (): Segment => structuredClone(bookSegment(tiny))
const text = (s: Segment, i = 0) => (s.t.texts as any[])[i]
const align = (s: Segment, i = 0) => (s.t.align as any[])[i]
const bytes = (...numbers: number[]) => new Uint8Array(numbers)

describe('bookView', () => {
  test('the untouched copy is fine, and is the model', () => {
    expect(bookView(fresh())).toEqual(tiny)
  })

  test('gives copies: changing the model does not change the segment it came from', () => {
    const seg = fresh()
    const view = bookView(seg)
    view.orig[0] = 'x'
    view.res[0][1] = 'x'
    expect(seg.h.orig).toEqual(tiny.orig)
    expect(seg.h.res).toEqual(tiny.res)
  })

  test('tables it does not know are left alone', () => {
    const seg = fresh()
    seg.t.future = []
    seg.h.tables.future = [1, false]
    expect(bookView(seg)).toEqual(tiny)
  })

  test('a text with an attribute named __proto__ keeps it as any other', () => {
    const seg = fresh()
    text(seg).attrs = [[2, JSON.parse('{"__proto__": "x"}')]]
    expect(Object.keys(bookView(seg).texts[0].attrs![2])).toEqual(['__proto__'])
  })

  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'orig')],
    ['no lang in the header', (s) => void delete s.h.lang],
    ['no book in the header', (s) => void delete s.h.book],
    ['no original in the header', (s) => void delete s.h.orig],
    ['no resource in the header', (s) => void delete s.h.res],
    ['an empty list of resources', (s) => void (s.h.res = [])],
    ['no strings table', (s) => void delete s.t.strings],
    ['a strings table that has a number', (s) => void (s.t.strings = ['a', 1])],
    ['no texts table', (s) => void delete s.t.texts],
    ['a texts table that is not a list', (s) => void (s.t.texts = {})],
    ['a text that is not a map', (s) => void ((s.t.texts as unknown[])[0] = 'x')],
    ['a text with a resource the header does not have', (s) => void (text(s).res = 2)],
    ['a text with a resource that is not a number', (s) => void (text(s).res = '0')],
    ['a tok that is not bytes', (s) => void (text(s).tok = [0, 1])],
    ['a tok that names a string outside the table', (s) => void (text(s).tok = bytes(2 * (s.t.strings as string[]).length))],
    ['a tok that is cut short', (s) => void (text(s).tok = bytes(0x80))],
    ['a tok that is not minimal', (s) => void (text(s).tok = bytes(0x80, 0x00))],
    ['events that are not triples', (s) => void (text(s).ev = bytes(0, 0, 0, 0))],
    ['an event code that is not one of the four', (s) => void (text(s).ev = bytes(0, 4, 0))],
    ['a close with an argument', (s) => void (text(s).ev = bytes(0, 3, 1))],
    ['an argument outside the string table', (s) => void (text(s).ev = bytes(0, 0, 99))],
    ['an event after the last piece', (s) => void (text(s).ev = bytes(6, 3, 0))],
    ['an event after the last piece, in two steps', (s) => void (text(s).ev = bytes(3, 3, 0, 3, 3, 0))],
    ['an ev that is not bytes', (s) => void delete text(s).ev],
    ['attributes of an event the text does not have', (s) => void (text(s).attrs = [[4, { z: 'w' }]])],
    [
      'attributes of an event twice',
      (s) =>
        void (text(s).attrs = [
          [2, { z: 'w' }],
          [2, { z: 'v' }],
        ]),
    ],
    ['attributes that are not a list', (s) => void (text(s).attrs = {})],
    ['an attribute value that is not text', (s) => void (text(s).attrs = [[2, { z: 1 }]])],
    ['an align table that is not a list', (s) => void (s.t.align = {})],
    ['an align table with fewer entries than texts', (s) => void (s.t.align as unknown[]).pop()],
    ['an align table with more entries than texts', (s) => void (s.t.align as unknown[]).push(align(s, 1))],
    ['an align entry that is not a map', (s) => void ((s.t.align as unknown[])[0] = [])],
    ['an align entry without words', (s) => void delete align(s).words],
    ['align words that are not bytes', (s) => void (align(s).words = [1, 2])],
    // Word 0: k = 1, position 3 (zigzag 6). Word 1: k = 0. Word 2: k = 2, then 1 - 3 = -2 (3) and 0 - 1 = -1 (1).
    ['align words that stop before the last word', (s) => void (align(s).words = bytes(1, 6, 0))],
    ['align words that go on after the last word', (s) => void (align(s).words = bytes(1, 6, 0, 2, 3, 1, 0))],
    ['a word with more positions than the column has', (s) => void (align(s).words = bytes(1, 6, 0, 2, 3))],
    ['a word with a huge count', (s) => void (align(s).words = bytes(0xff, 0xff, 0xff, 0xff, 0x0f, 6))],
    ['a position below 0', (s) => void (align(s).words = bytes(1, 1, 0, 0))],
    ['align words that are cut short', (s) => void (align(s).words = bytes(1, 0x80))],
    ['a missing that is not a list', (s) => void (align(s).missing = {})],
    ['a missing entry that is not four items', (s) => void (align(s).missing = [[1, 56_001_001, 'x']])],
    ['a missing word outside the text', (s) => void (align(s).missing = [[3, 56_001_001, 'x', 1]])],
    ['a missing verse that is not a number', (s) => void (align(s).missing = [[1, 'x', 'x', 1]])],
    ['a missing original that is not text', (s) => void (align(s).missing = [[1, 56_001_001, 7, 1]])],
    ['a missing occurrence that is negative', (s) => void (align(s).missing = [[1, 56_001_001, 'x', -1]])],
  ]
  for (const [name, change] of broken) {
    test(name, () => {
      const seg = fresh()
      change(seg)
      let error: unknown
      try {
        bookView(seg)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }

  test('an empty missing list is read as no missing words', () => {
    const seg = fresh()
    align(seg).missing = []
    const view = bookView(seg)
    expect(view.texts[0].alignMissing).toBeUndefined()
    expect(view.texts[0].align).toEqual([[3], [], [1, 0]])
  })

  test('a text whose words all have k = 0, in a segment with align, has no alignment', () => {
    const seg = fresh()
    align(seg, 0).words = bytes(0, 0, 0)
    delete align(seg, 0).missing
    expect('align' in bookView(seg).texts[0]).toBe(false)
    expect('alignMissing' in bookView(seg).texts[0]).toBe(false)
  })
})

// Notes, questions, links and quotes

const TN = 'es-419_gl/es-419/tn'
const TQ = 'es-419_gl/es-419/tq'
const TWL = 'es-419_gl/es-419/twl'

/**
 * The tiny book with notes and links: ids by ascii4; a concept column some rows lack; columns of the three kinds, some of them
 * with `has`; a reference list (so a `refText`); a quote with an ellipsis, a missing word and a position; a row with no quote.
 */
const withHelps: BookModel = {
  ...tiny,
  res: [
    [GLT, 'v42'],
    [GST, 'v7'],
    [TN, 'v66'],
    [TWL, 'v18'],
  ],
  notes: {
    res: TN,
    rows: [
      { id: 'a1b2', ref: '1:1', from: 56_001_001, to: 56_001_001, concept: 'ta:translate/figs-metaphor', cols: { note: 'Hola\nmundo', quote: 'α', tags: '', isIntro: false }, quote: [3] },
      { id: 'c3d4', ref: '1:2-4', from: 56_001_002, to: 56_001_004, cols: { note: 'x', occurrence: '1', isIntro: true }, quote: [] },
      {
        id: 'e5f6',
        ref: '1:1,3',
        from: 56_001_001,
        to: 56_001_003,
        concept: 'ta:translate/figs-you',
        cols: { note: 'z', quote: 'α … β γ', tags: 'k' },
        quote: [-1, 5, -1],
        quoteKinds: [[0, 'ellipsis']],
        quoteMissing: [[2, 56_001_003, 'Ἰησοῦ', 1]],
      },
    ],
  },
  links: {
    res: TWL,
    rows: [
      { id: 'g7h8', ref: '1:1', from: 56_001_001, to: 56_001_001, concept: 'tw:kt/god', cols: { origWords: 'Θεοῦ' }, quote: [0, 1] },
      { id: 'i9j0', ref: '1:2', from: 56_001_002, to: 56_001_002, cols: { origWords: 'x', twLink: 'kt/grace' }, quote: [] },
    ],
  },
}

const fresh2 = (): Segment => structuredClone(bookSegment(withHelps))
const notesT = (s: Segment) => s.t.notes as any
const linksT = (s: Segment) => s.t.links as any
const quotesN = (s: Segment) => (s.t.quotes as any).notes
const quotesL = (s: Segment) => (s.t.quotes as any).links
const tableStrings = (s: Segment) => s.t.strings as string[]

describe('bookView: notes, questions, links and quotes', () => {
  test('the untouched copy is fine, and is the model', () => {
    expect(bookView(fresh2())).toEqual(withHelps)
  })

  test('the tables are as the model says: ids by ascii4, a concept column with has, a refText, quotes with kinds and missing', () => {
    const s = fresh2()
    expect(Object.keys(notesT(s)).sort()).toEqual(['cols', 'concept', 'id', 'n', 'ref', 'refText', 'res'])
    expect(notesT(s).res).toBe(2)
    expect(linksT(s).res).toBe(3)
    expect(notesT(s).refText).toEqual([[2, '1:1,3']])
    expect(Object.keys(notesT(s).concept).sort()).toEqual(['has', 'strings'])
    expect(Object.keys(notesT(s).cols).sort()).toEqual(['isIntro', 'note', 'occurrence', 'quote', 'tags'])
    expect(quotesN(s).kinds).toEqual([[2, 0, 'ellipsis']])
    expect(quotesN(s).missing).toEqual([[2, 2, 56_001_003, 'Ἰησοῦ', 1]])
    expect(quotesL(s).kinds).toBeUndefined()
    expect(Object.keys(s.h.tables).sort()).toEqual(['align', 'links', 'notes', 'quotes', 'strings', 'texts'])
  })

  test('a quote is on every row of a table that has quotes: [] for a row with no pieces', () => {
    const view = bookView(fresh2())
    expect(view.notes!.rows.map((row) => row.quote)).toEqual([[3], [], [-1, 5, -1]])
    expect(view.notes!.rows[1].quoteKinds).toBeUndefined()
    expect(view.links!.rows.map((row) => row.quote)).toEqual([[0, 1], []])
  })

  test('the file keeps all of it, and a reader that skips quotes (or the notes) gives what is left, not half of it', async () => {
    const { bytes } = await writeSegment(bookSegment(withHelps))
    const all = bookView((await readSegment(bytes, { known: BOOK_TABLES })).seg)
    expect(all).toEqual(withHelps)

    const noQuotes = { ...BOOK_TABLES }
    delete noQuotes.quotes
    const view = bookView((await readSegment(bytes, { known: noQuotes })).seg)
    expect(view.notes!.rows.every((row) => row.quote === undefined && row.quoteKinds === undefined && row.quoteMissing === undefined)).toBe(true)
    expect(view.notes!.rows.map((row) => row.id)).toEqual(['a1b2', 'c3d4', 'e5f6'])

    // Not knowing the notes: the links keep their quotes, and the quotes of the notes are dropped.
    const noNotes = { ...BOOK_TABLES }
    delete noNotes.notes
    const other = bookView((await readSegment(bytes, { known: noNotes })).seg)
    expect(other.notes).toBeUndefined()
    expect(other.links).toEqual(withHelps.links)
  })

  test('quotes of a table the segment does not have are dropped, not read', () => {
    const s = fresh2()
    delete s.t.notes
    expect(bookView(s).notes).toBeUndefined()
    expect(bookView(s).links).toEqual(withHelps.links)
    delete s.t.links
    expect(bookView(s).links).toBeUndefined()
    // even a malformed quotes table is not looked at when the table it depends on is gone
    quotesN(s).n = bytes(0xff)
    expect(bookView(s).notes).toBeUndefined()
  })

  test('a quotes table with neither notes nor links gives rows without quotes', () => {
    const s = fresh2()
    s.t.quotes = {}
    expect(bookView(s).notes!.rows.every((row) => row.quote === undefined)).toBe(true)
  })

  test('questions are read like the notes, without quotes', () => {
    const m: BookModel = {
      ...withHelps,
      res: [...withHelps.res, [TQ, 'v38']],
      questions: { res: TQ, rows: [{ id: 'q1q1', ref: 'front:intro', from: 56_000_000, to: 56_000_000, cols: { question: 'Q?', response: 'R.' } }] },
    }
    expect(bookView(bookSegment(m)).questions).toEqual(m.questions)
  })

  test('a uints column is read as the numbers in text', () => {
    const s = fresh2()
    notesT(s).cols.extra = { uints: bytes(7, 200, 1, 0) }
    expect(bookView(s).notes!.rows.map((row) => row.cols.extra)).toEqual(['7', '200', '0'])
  })

  test('ids by string numbers (a repeated id is not 4 characters)', () => {
    const m: BookModel = { ...withHelps, notes: { ...withHelps.notes!, rows: withHelps.notes!.rows.map((row, i) => (i === 0 ? { ...row, id: 'a1b2~2' } : row)) } }
    const s = structuredClone(bookSegment(m))
    expect(notesT(s).id.ascii4).toBeUndefined()
    expect(bookView(s)).toEqual(m)
  })

  const broken: [string, (s: Segment) => void][] = [
    ['a table of the notes that is not a map', (s) => void (s.t.notes = [])],
    ['notes with a resource the header does not have', (s) => void (notesT(s).res = 4)],
    ['notes with a resource that is not a number', (s) => void (notesT(s).res = '2')],
    ['notes with n that is not a count', (s) => void (notesT(s).n = 'x')],
    ['notes with n above the rows', (s) => void (notesT(s).n = 4)],
    ['notes with n below the rows', (s) => void (notesT(s).n = 2)],
    ['notes with no id', (s) => void delete notesT(s).id],
    ['ids with neither ascii4 nor strings', (s) => void (notesT(s).id = {})],
    ['ascii4 ids of the wrong length', (s) => void (notesT(s).id.ascii4 = bytes(97, 98, 99))],
    ['ascii4 ids that are not bytes', (s) => void (notesT(s).id.ascii4 = 'a1b2c3d4e5f6')],
    ['an ascii4 id with a byte above 127', (s) => void (notesT(s).id.ascii4[0] = 0x80)],
    ['notes with no ref', (s) => void delete notesT(s).ref],
    ['ref.from that is not bytes', (s) => void (notesT(s).ref.from = [1])],
    ['ref.from of the wrong length', (s) => void (notesT(s).ref.from = bytes(2, 2))],
    ['ref.span of the wrong length', (s) => void (notesT(s).ref.span = bytes(0, 0))],
    ['ref.span that is not bytes', (s) => void (notesT(s).ref.span = 'x')],
    ['a first verse below 0', (s) => void (notesT(s).ref.from = bytes(1, 0, 0))],
    ['a range that runs past 2^53 - 1', (s) => void (notesT(s).ref.span = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f, 0, 0))],
    ['a range of another book and no refText', (s) => void (notesT(s).ref.from = encodeDeltas([55_001_001, 56_001_002, 56_001_001]))],
    ['a range with an introduction inside and no refText', (s) => void ((notesT(s).ref.from = encodeDeltas([56_001_000, 56_001_002, 56_001_001])), (notesT(s).ref.span = bytes(5, 0, 2)))],
    ['refText that is not a list', (s) => void (notesT(s).refText = {})],
    ['a refText entry that is not a pair', (s) => void (notesT(s).refText = [[2]])],
    ['a refText row outside the table', (s) => void (notesT(s).refText = [[3, 'x']])],
    ['a refText that is not text', (s) => void (notesT(s).refText = [[2, 7]])],
    ['a refText row twice', (s) => void (notesT(s).refText = [[2, 'x'], [2, 'y']])],
    ['a concept that is not a map', (s) => void (notesT(s).concept = [])],
    ['a concept with flags', (s) => void (notesT(s).concept = { flags: bytes(1) })],
    ['a concept with no values', (s) => void (notesT(s).concept = { has: bytes(5) })],
    ['a concept with a has of the wrong length', (s) => void (notesT(s).concept.has = bytes(5, 0))],
    ['a concept with a has that has a bit past the rows', (s) => void (notesT(s).concept.has = bytes(0x0d))],
    ['a concept with fewer values than its has says', (s) => void (notesT(s).concept.strings = bytes(0))],
    ['a concept with a value outside the string table', (s) => void (notesT(s).concept.strings = bytes(tableStrings(s).length, 0))],
    ['cols that is not a map', (s) => void (notesT(s).cols = [])],
    ['no cols', (s) => void delete notesT(s).cols],
    ['a column that is not a map', (s) => void (notesT(s).cols.tags = [])],
    ['a column with no values', (s) => void (notesT(s).cols.tags = {})],
    ['a column with strings and texts', (s) => void (notesT(s).cols.tags.texts = notesT(s).cols.note.texts)],
    ['a column with a has that is not bytes', (s) => void (notesT(s).cols.tags.has = [1])],
    ['a strings column with a value outside the table', (s) => void (notesT(s).cols.tags.strings = bytes(99, 0))],
    ['a strings column with fewer values than rows that have one', (s) => void (notesT(s).cols.tags.strings = bytes(0))],
    ['a strings column that is cut short', (s) => void (notesT(s).cols.tags.strings = bytes(0, 0x80))],
    ['a strings column that is not bytes', (s) => void (notesT(s).cols.tags.strings = [0, 0])],
    ['a texts column that is not a map', (s) => void (notesT(s).cols.note.texts = [])],
    ['a texts column without utf8', (s) => void delete notesT(s).cols.note.texts.utf8],
    // the three notes are 10, 1 and 1 bytes: two lengths that add up to the same 12 are still two values for three rows
    ['a texts column with another number of lengths than rows', (s) => void (notesT(s).cols.note.texts.len = bytes(10, 2))],
    ['a texts column whose lengths run past utf8', (s) => void (notesT(s).cols.note.texts.len = bytes(99, 1, 1))],
    ['a texts column whose utf8 is longer than its lengths', (s) => void (notesT(s).cols.note.texts.utf8 = new Uint8Array([...notesT(s).cols.note.texts.utf8, 65]))],
    ['a texts column that is not valid UTF-8', (s) => void (notesT(s).cols.note.texts = { utf8: bytes(0xff), len: bytes(1, 0, 0) })],
    ['a flags column of the wrong length', (s) => void (notesT(s).cols.isIntro.flags = bytes(0, 0))],
    ['a flags column with a bit past its rows', (s) => void (notesT(s).cols.isIntro.flags = bytes(0x07))],
    ['a flags column that is not bytes', (s) => void (notesT(s).cols.isIntro.flags = [true])],
    ['a uints column with fewer values than rows', (s) => void (notesT(s).cols.extra = { uints: bytes(7) })],
    ['quotes that is not a map', (s) => void (s.t.quotes = [])],
    ['quotes for the notes that is not a map', (s) => void ((s.t.quotes as any).notes = [])],
    ['quote counts that are not bytes', (s) => void (quotesN(s).n = [1, 0, 3])],
    ['quote counts of another length than the rows', (s) => void (quotesN(s).n = bytes(1, 0))],
    ['quote positions that are not bytes', (s) => void (quotesN(s).pos = [4])],
    ['quote positions fewer than the pieces', (s) => void (quotesN(s).pos = bytes(8, 0, 0))],
    ['quote positions more than the pieces', (s) => void (quotesN(s).pos = bytes(8, 0, 0, 0, 0))],
    ['a quote position below 0', (s) => void (quotesN(s).pos = bytes(1, 0, 0, 0))],
    ['quote counts that run past the positions', (s) => void (quotesN(s).n = bytes(1, 0, 5))],
    ['kinds that is not a list', (s) => void (quotesN(s).kinds = {})],
    ['a kinds entry that is not a triple', (s) => void (quotesN(s).kinds = [[2, 0]])],
    ['a kinds row outside the table', (s) => void (quotesN(s).kinds = [[3, 0, 'x']])],
    ['a kinds piece outside the row', (s) => void (quotesN(s).kinds = [[2, 3, 'x']])],
    ['a kinds piece of a row with no piece', (s) => void (quotesN(s).kinds = [[1, 0, 'x']])],
    ['a kinds piece that has a position', (s) => void (quotesN(s).kinds = [[2, 1, 'x']])],
    ['a kinds piece twice', (s) => void (quotesN(s).kinds = [[2, 0, 'x'], [2, 0, 'y']])],
    ['a kind that is not text', (s) => void (quotesN(s).kinds = [[2, 0, 7]])],
    ['a kinds row that is not a number', (s) => void (quotesN(s).kinds = [['2', 0, 'x']])],
    ['missing that is not a list', (s) => void (quotesN(s).missing = {})],
    ['a missing entry that is not five items', (s) => void (quotesN(s).missing = [[2, 2, 56_001_003, 'x']])],
    ['a missing piece that has a position', (s) => void (quotesN(s).missing = [[2, 1, 56_001_003, 'x', 1]])],
    ['a missing piece that is also in kinds', (s) => void (quotesN(s).missing = [[2, 0, 56_001_003, 'x', 1]])],
    ['a missing verse that is not a number', (s) => void (quotesN(s).missing = [[2, 2, 'x', 'x', 1]])],
    ['a missing word that is not text', (s) => void (quotesN(s).missing = [[2, 2, 56_001_003, 7, 1]])],
    ['a missing occurrence below 0', (s) => void (quotesN(s).missing = [[2, 2, 56_001_003, 'x', -1]])],
    ['quotes of the links of the wrong length', (s) => void (quotesL(s).n = bytes(2, 0, 0))],
  ]
  for (const [name, change] of broken) {
    test(name, () => {
      const seg = fresh2()
      change(seg)
      let error: unknown
      try {
        bookView(seg)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }

  test('an empty refText, an empty kinds and an empty missing are read as having none', () => {
    const s = fresh2()
    notesT(s).refText = []
    quotesN(s).kinds = []
    quotesN(s).missing = []
    const view = bookView(s)
    // the rows without refText read their canonical text; the quote pieces without a listing are still -1
    expect(view.notes!.rows[2].ref).toBe('1:1-3')
    expect(view.notes!.rows[2].quoteKinds).toBeUndefined()
    expect(view.notes!.rows[2].quote).toEqual([-1, 5, -1])
  })

  test('a column some rows lack lists only the others, and a row gets the keys of the columns it has', () => {
    const view = bookView(fresh2())
    expect(view.notes!.rows.map((row) => Object.keys(row.cols).sort())).toEqual([
      ['isIntro', 'note', 'quote', 'tags'],
      ['isIntro', 'note', 'occurrence'],
      ['note', 'quote', 'tags'],
    ])
  })
})

import { describe, expect, test } from 'bun:test'
import { bookSegment } from '../build/book'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { BookModel } from '../model'
import { bookView } from './book'

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

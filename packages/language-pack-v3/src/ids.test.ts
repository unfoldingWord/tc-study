import { describe, expect, test } from 'bun:test'
import idsSpec from '../spec/ids.md' with { type: 'text' }
import {
  BOOKS,
  bookNumber,
  bookSet,
  conceptOfSupportReference,
  conceptOfTwLink,
  formatRef,
  parseRef,
  rewriteLinks,
  strongKey,
  unescapeTsv,
  verseId,
} from './ids'

const bit = (set: Uint8Array, n: number) => (set[n >> 3] >> (n & 7)) & 1

describe('books', () => {
  test('there are 66, in the order of the list in ids.md', () => {
    // The first code block of ids.md is the canonical list: "1 gen   2 exo ...".
    const block = /```\n([\s\S]*?)```/.exec(idsSpec)
    expect(block).not.toBeNull()
    const listed = [...(block as RegExpExecArray)[1].matchAll(/(\d+)\s+([0-9a-z]{3})/g)]
    expect(listed.length).toBe(66)
    listed.forEach((m, i) => {
      expect(Number(m[1])).toBe(i + 1)
      expect(BOOKS[i]).toBe(m[2])
    })
    expect(BOOKS.length).toBe(66)
    expect(new Set(BOOKS).size).toBe(66)
  })

  test('bookNumber', () => {
    expect(bookNumber('gen')).toBe(1)
    expect(bookNumber('rev')).toBe(66)
    expect(bookNumber('tit')).toBe(56)
    expect(bookNumber('mal')).toBe(39)
    expect(bookNumber('mat')).toBe(40)
  })

  test('an unknown code throws RangeError', () => {
    for (const code of ['', 'GEN', 'xyz', 'front', 'obs', 'constructor', 'gen ']) {
      expect(() => bookNumber(code)).toThrow(RangeError)
    }
  })
})

describe('verseId', () => {
  test('book, chapter and verse', () => {
    expect(verseId('tit', 2, 11)).toBe(56002011)
    expect(verseId('gen', 1, 1)).toBe(1001001)
    expect(verseId('rev', 22, 21)).toBe(66022021)
    expect(verseId('psa', 119, 176)).toBe(19119176)
  })

  test('chapter 0 and verse 0 are the introductions', () => {
    expect(verseId('tit', 0, 0)).toBe(56000000)
    expect(verseId('tit', 2, 0)).toBe(56002000)
  })

  test('the largest chapter and verse fit', () => {
    expect(verseId('rev', 999, 999)).toBe(66999999)
  })

  test('a chapter or verse outside 0-999 throws RangeError', () => {
    expect(() => verseId('tit', 1000, 1)).toThrow(RangeError)
    expect(() => verseId('tit', 1, 1000)).toThrow(RangeError)
    expect(() => verseId('tit', -1, 1)).toThrow(RangeError)
    expect(() => verseId('tit', 1, -1)).toThrow(RangeError)
    expect(() => verseId('tit', 1.5, 1)).toThrow(RangeError)
    expect(() => verseId('tit', 1, Number.NaN)).toThrow(RangeError)
  })

  test('an unknown book throws RangeError', () => {
    expect(() => verseId('xyz', 1, 1)).toThrow(RangeError)
  })
})

describe('parseRef', () => {
  const cases: Array<[string, [number, number]]> = [
    ['front:intro', [56000000, 56000000]],
    ['2:intro', [56002000, 56002000]],
    ['1:1', [56001001, 56001001]],
    ['2:11', [56002011, 56002011]],
    ['1:2-4', [56001002, 56001004]],
    ['1:12-2:3', [56001012, 56002003]],
  ]

  for (const [ref, expected] of cases) {
    test(`${ref} is ${expected.join('-')}`, () => {
      expect(parseRef('tit', ref)).toEqual(expected)
    })
  }

  test('anything it does not understand is null', () => {
    const bad = [
      '',
      ' ',
      '1:1,3', // a list
      '1:1, 3',
      '0:0',
      '0:1',
      '1:0',
      '0:intro',
      '1000:1',
      '1:1000',
      '1:4-2', // runs backwards
      '2:1-1:5', // second chapter before the first
      '1:5-1:2',
      '1',
      '1:',
      ':1',
      'a:b',
      '1:a',
      '1:1-',
      '1:-3',
      '1:1-2-3',
      '1:2-4:',
      'intro',
      'front',
      'front:1',
      'front:INTRO',
      '2:intro-3:intro',
      '01:02',
      ' 1:1',
      '1:1 ',
      '1:1\n',
      '+1:1',
      '1.5:1',
      '-1:1',
      '1:1–3', // en dash
      '１:１', // full-width digits
    ]
    for (const ref of bad) expect(parseRef('tit', ref)).toBeNull()
  })

  test('never throws, not even for an unknown book', () => {
    expect(parseRef('xyz', '1:1')).toBeNull()
    expect(parseRef('', 'front:intro')).toBeNull()
  })

  test('a chapter range inside one chapter is read like a verse range', () => {
    expect(parseRef('tit', '1:2-1:4')).toEqual([56001002, 56001004])
    expect(parseRef('tit', '1:3-3')).toEqual([56001003, 56001003])
  })

  test('the book decides the number', () => {
    expect(parseRef('gen', '1:1')).toEqual([1001001, 1001001])
    expect(parseRef('rev', '22:21')).toEqual([66022021, 66022021])
  })
})

describe('formatRef', () => {
  test('inverts each non-null case of parseRef', () => {
    for (const ref of ['front:intro', '2:intro', '1:1', '2:11', '1:2-4', '1:12-2:3']) {
      const range = parseRef('tit', ref)
      expect(range).not.toBeNull()
      const [from, to] = range as [number, number]
      expect(formatRef('tit', from, to)).toBe(ref)
    }
  })

  test('canonical text of a range', () => {
    expect(formatRef('tit', 56001001, 56001001)).toBe('1:1')
    expect(formatRef('psa', 19119001, 19119176)).toBe('119:1-176')
    expect(formatRef('gen', 1001031, 1002001)).toBe('1:31-2:1')
  })

  test('a range written with two equal chapters comes back in the short form', () => {
    const range = parseRef('tit', '1:2-1:4') as [number, number]
    expect(formatRef('tit', range[0], range[1])).toBe('1:2-4')
  })

  test('a range that is not expressible throws RangeError', () => {
    // different books
    expect(() => formatRef('tit', 56001001, 57001001)).toThrow(RangeError)
    // both ends in another book
    expect(() => formatRef('tit', 57001001, 57001002)).toThrow(RangeError)
    // backwards
    expect(() => formatRef('tit', 56001004, 56001002)).toThrow(RangeError)
    // an introduction inside a range of several verses
    expect(() => formatRef('tit', 56000000, 56001003)).toThrow(RangeError)
    expect(() => formatRef('tit', 56001000, 56001003)).toThrow(RangeError)
    expect(() => formatRef('tit', 56001003, 56002000)).toThrow(RangeError)
    // a verse in chapter 0
    expect(() => formatRef('tit', 56000005, 56000005)).toThrow(RangeError)
    // not an id
    expect(() => formatRef('tit', -1, 56001001)).toThrow(RangeError)
    expect(() => formatRef('tit', 56001001.5, 56001002)).toThrow(RangeError)
    expect(() => formatRef('xyz', 56001001, 56001001)).toThrow(RangeError)
  })
})

describe('bookSet', () => {
  test('9 bytes, bit n - 1 for the book number n, least significant bit first', () => {
    const set = bookSet(['gen', 'rev'])
    expect(set.length).toBe(9)
    expect(bit(set, 0)).toBe(1)
    expect(bit(set, 65)).toBe(1)
    for (let n = 1; n < 65; n++) expect(bit(set, n)).toBe(0)
    expect(Array.from(set)).toEqual([0x01, 0, 0, 0, 0, 0, 0, 0, 0x02])
  })

  test('tit is bit 55', () => {
    const set = bookSet(['tit'])
    expect(bit(set, 55)).toBe(1)
    expect(Array.from(set)).toEqual([0, 0, 0, 0, 0, 0, 0x80, 0, 0])
  })

  test('empty set, repeated codes and any iterable', () => {
    expect(Array.from(bookSet([]))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(Array.from(bookSet(['gen', 'gen']))).toEqual(Array.from(bookSet(['gen'])))
    expect(Array.from(bookSet(new Set(['gen', 'rev'])))).toEqual(Array.from(bookSet(['rev', 'gen'])))
  })

  test('all 66 books fill 66 bits', () => {
    const set = bookSet(BOOKS)
    expect(Array.from(set)).toEqual([255, 255, 255, 255, 255, 255, 255, 255, 3])
  })

  test('an unknown code throws RangeError', () => {
    expect(() => bookSet(['gen', 'xyz'])).toThrow(RangeError)
  })
})

describe('strongKey', () => {
  test('Hebrew keeps what follows the last colon', () => {
    expect(strongKey('b:H4999')).toBe('H4999')
    expect(strongKey('c:b:H4999')).toBe('H4999')
    expect(strongKey('H7462b')).toBe('H7462b')
    expect(strongKey('b:H7462b')).toBe('H7462b')
  })

  test('Greek stays as published', () => {
    expect(strongKey('G54850')).toBe('G54850')
  })
})

describe('concepts', () => {
  test('conceptOfSupportReference', () => {
    expect(conceptOfSupportReference('rc://*/ta/man/translate/figs-metaphor')).toBe('ta:translate/figs-metaphor')
    expect(conceptOfSupportReference('rc://*/ta/man/checking/headings')).toBe('ta:checking/headings')
  })

  test('conceptOfSupportReference gives null for any other form', () => {
    for (const s of [
      '',
      'translate/figs-metaphor',
      'rc://*/ta/man/translate',
      'rc://*/ta/man/translate/figs-metaphor/',
      'rc://*/ta/man/translate/figs-metaphor.md',
      '[[rc://*/ta/man/translate/figs-metaphor]]',
      ' rc://*/ta/man/translate/figs-metaphor',
      'rc://*/tw/dict/bible/kt/grace',
      'rc://es-419/ta/man/translate/figs-metaphor',
      'rc://*/ta/man/Translate/figs-metaphor',
    ]) {
      expect(conceptOfSupportReference(s)).toBeNull()
    }
  })

  test('conceptOfTwLink', () => {
    expect(conceptOfTwLink('rc://*/tw/dict/bible/kt/grace')).toBe('tw:kt/grace')
    expect(conceptOfTwLink('rc://*/tw/dict/bible/names/abraham')).toBe('tw:names/abraham')
    expect(conceptOfTwLink('rc://*/tw/dict/bible/other/shepherd')).toBe('tw:other/shepherd')
  })

  test('conceptOfTwLink gives null for any other form', () => {
    for (const s of [
      '',
      'kt/grace',
      'rc://*/tw/dict/bible/kt',
      'rc://*/tw/dict/bible/kt/grace/',
      'rc://*/tw/dict/bible/kt/grace.md',
      'rc://*/tw/dict/bible/other2/grace',
      'rc://*/tw/dict/kt/grace',
      '[[rc://*/tw/dict/bible/kt/grace]]',
      'rc://*/ta/man/translate/figs-metaphor',
    ]) {
      expect(conceptOfTwLink(s)).toBeNull()
    }
  })
})

describe('rewriteLinks', () => {
  test('[[rc://*/ta/man/...]] becomes [[ta:...]]', () => {
    expect(rewriteLinks('See [[rc://*/ta/man/translate/figs-metaphor]].', 'tit')).toBe(
      'See [[ta:translate/figs-metaphor]].',
    )
  })

  test('[[rc://*/tw/dict/bible/...]] becomes [[tw:...]]', () => {
    expect(rewriteLinks('See [[rc://*/tw/dict/bible/kt/grace]].', 'tit')).toBe('See [[tw:kt/grace]].')
  })

  test('[text](rc://*/tn/help/tit/02/03) becomes [text](ref:tit 2:3)', () => {
    expect(rewriteLinks('Read [Titus 2:3](rc://*/tn/help/tit/02/03).', 'tit')).toBe('Read [Titus 2:3](ref:tit 2:3).')
  })

  test('[text](../02/03.md) in a note of Tito becomes [text](ref:tit 2:3)', () => {
    expect(rewriteLinks('Read [Titus 2:3](../02/03.md).', 'tit')).toBe('Read [Titus 2:3](ref:tit 2:3).')
  })

  test('a tN address names its own book, not the book of the note', () => {
    expect(rewriteLinks('[x](rc://*/tn/help/gen/01/01)', 'tit')).toBe('[x](ref:gen 1:1)')
    expect(rewriteLinks('[x](rc://*/tn/help/gen/01/01)', null)).toBe('[x](ref:gen 1:1)')
  })

  test('three-digit chapters and verses', () => {
    expect(rewriteLinks('[x](rc://*/tn/help/psa/119/176)', 'psa')).toBe('[x](ref:psa 119:176)')
    expect(rewriteLinks('[x](../119/176.md)', 'psa')).toBe('[x](ref:psa 119:176)')
  })

  test('all four in one text, and the text around them is untouched', () => {
    const before =
      'A [[rc://*/ta/man/translate/figs-metaphor]] b [[rc://*/tw/dict/bible/names/paul]]\n' +
      'c [t1](rc://*/tn/help/tit/01/05) d [t2](../02/03.md) e.'
    const after =
      'A [[ta:translate/figs-metaphor]] b [[tw:names/paul]]\n' +
      'c [t1](ref:tit 1:5) d [t2](ref:tit 2:3) e.'
    expect(rewriteLinks(before, 'tit')).toBe(after)
  })

  test('a link in any other form is kept as it is', () => {
    for (const md of [
      '[[ta:translate/figs-metaphor]]',
      '[[something else]]',
      '[[rc://*/ta/man/translate]]',
      '[[rc://*/tw/dict/bible/other2/grace]]',
      '[[rc://*/ugnt/bible/tit/02/03]]',
      '[text](https://example.com/a)',
      '[text](rc://*/tw/dict/bible/kt/grace)',
      '[text](rc://*/tn/help/tit/front/intro)',
      '[text](rc://*/tn/help/tit/02/intro)',
      '[text](rc://*/tn/help/xyz/02/03)',
      '[text](rc://*/tn/help/tit/00/03)',
      '[text](rc://*/tn/help/tit/02/00)',
      '[text](rc://*/tn/help/tit/1000/03)',
      '[text](./02/03.md)',
      '[text](../02/03)',
      '[text](../02/intro.md)',
      '[text](../../02/03.md)',
      '[text](../00/03.md)',
      '[text](ref:tit 2:3)',
      '[text]',
      '[text] (../02/03.md)',
      '(../02/03.md)',
    ]) {
      expect(rewriteLinks(md, 'tit')).toBe(md)
    }
  })

  test('with no book, relative links are kept as they are', () => {
    expect(rewriteLinks('[Titus 2:3](../02/03.md)', null)).toBe('[Titus 2:3](../02/03.md)')
    // the other forms do not need a book
    expect(rewriteLinks('[[rc://*/tw/dict/bible/kt/grace]]', null)).toBe('[[tw:kt/grace]]')
  })

  test('rc:// outside a link form is untouched', () => {
    for (const md of [
      'The address rc://*/tn/help/tit/02/03 is a plain word.',
      'rc://*/ta/man/translate/figs-metaphor',
      '<rc://*/tw/dict/bible/kt/grace>',
      '[[ rc://*/tw/dict/bible/kt/grace ]]',
      'see rc://*/tw/dict/bible/kt/grace]] or [[rc://',
    ]) {
      expect(rewriteLinks(md, 'tit')).toBe(md)
    }
  })

  test('the rewrite is a single pass and does not rewrite its own output', () => {
    const md = '[[rc://*/ta/man/translate/figs-metaphor]] [t](rc://*/tn/help/tit/02/03) [u](../01/02.md)'
    const once = rewriteLinks(md, 'tit')
    expect(once).toBe('[[ta:translate/figs-metaphor]] [t](ref:tit 2:3) [u](ref:tit 1:2)')
    expect(rewriteLinks(once, 'tit')).toBe(once)
  })

  test('several links of the same kind in a row', () => {
    expect(
      rewriteLinks('[[rc://*/tw/dict/bible/kt/grace]][[rc://*/tw/dict/bible/kt/faith]]', 'tit'),
    ).toBe('[[tw:kt/grace]][[tw:kt/faith]]')
  })

  test('an unknown book throws RangeError, null does not', () => {
    expect(() => rewriteLinks('x', 'xyz')).toThrow(RangeError)
    expect(rewriteLinks('x', null)).toBe('x')
  })

  test('text is kept as published: no trimming, no normalization', () => {
    const md = '  é́ [[rc://*/tw/dict/bible/kt/grace]]  \n'
    expect(rewriteLinks(md, 'tit')).toBe('  é́ [[tw:kt/grace]]  \n')
  })
})

describe('unescapeTsv', () => {
  test('\\n and <br> become line breaks', () => {
    expect(unescapeTsv('a\\nb<br>c')).toBe('a\nb\nc')
  })

  test('text without escapes is returned as it is', () => {
    expect(unescapeTsv('')).toBe('')
    expect(unescapeTsv('plain text')).toBe('plain text')
    expect(unescapeTsv('  keep  spaces  ')).toBe('  keep  spaces  ')
  })

  test('several in a row, and nothing else changes', () => {
    expect(unescapeTsv('<br><br>\\n\\n')).toBe('\n\n\n\n')
    expect(unescapeTsv('a/n b<BR> c<br/>')).toBe('a/n b<BR> c<br/>')
    expect(unescapeTsv('é́\\n')).toBe('é́\n')
  })

  test('a real line break is kept', () => {
    expect(unescapeTsv('a\nb')).toBe('a\nb')
  })
})

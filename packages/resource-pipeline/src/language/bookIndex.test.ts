import { describe, expect, test } from 'bun:test'
import { decodeWords, indexStrongKey, indexVersesKey } from '@bt-synergy/language-pack'
import { buildBookIndex, HELPS_INDEX_VERSION, type BookIndexStrong, type BookIndexVerses } from './bookIndex'

const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const UHB = 'unfoldingWord/hbo/uhb'
const STAMP = 'v0.34#2023-09-27T02_19_31Z'

// USJ nodes in the shape the USJ processor writes them.
const c = (number: string) => ({ type: 'chapter', marker: 'c', number, sid: `X ${number}` })
const v = (number: string) => ({ type: 'verse', marker: 'v', number, sid: `X ${number}` })
const w = (text: string, strong?: string, lemma?: string) => ({
  type: 'char',
  marker: 'w',
  content: [text],
  ...(strong === undefined ? {} : { strong }),
  ...(lemma === undefined ? {} : { lemma }),
})
const p = (...content: unknown[]) => ({ type: 'para', marker: 'p', content })
const usj = (...content: unknown[]) => ({ type: 'USJ', version: '3.0', content })

const versesRow = (rows: ReturnType<typeof buildBookIndex>) => rows[0]!.value as BookIndexVerses
const strongRow = (rows: ReturnType<typeof buildBookIndex>, key: string) =>
  rows.find((r) => r.key === key)?.value as BookIndexStrong | undefined

/** Titus 1:1 (3 words) and 2:11 (4 words); χάρις is word 5. */
const titus = [
  {
    chapter: 1,
    usj: usj(c('1'), p(v('1'), w('Παῦλος', 'G39720', 'Παῦλος'), w('δοῦλος', 'G14010', 'δοῦλος'), w('Θεοῦ', 'G23160', 'θεός'))),
  },
  {
    chapter: 2,
    usj: usj(c('2'), p(v('11'), w('Ἐπεφάνη', 'G20140', 'ἐπιφαίνω'), w('γὰρ', 'G10630', 'γάρ'), w('χάρις', 'G54850', 'χάρις'), w('Θεοῦ', 'G23160', 'θεός'))),
  },
]

describe('buildBookIndex', () => {
  test('numbers every word of the book in order', () => {
    const rows = buildBookIndex(UGNT, 'tit', titus, STAMP)
    expect(rows[0]!.key).toBe(indexVersesKey(UGNT, 'tit'))
    const verses = versesRow(rows)
    expect(verses.v).toBe(HELPS_INDEX_VERSION)
    expect(verses.stamp).toBe(STAMP)
    expect(verses.words).toBe(7)
    expect(verses.verses).toBe('1:1 2:11')
    expect(decodeWords(verses.starts)).toEqual([0, 3])
  })

  test('lists the words of each Strong code', () => {
    const rows = buildBookIndex(UGNT, 'tit', titus, STAMP)
    const key = 'index:strong:unfoldingWord/el-x-koine/ugnt:G5485:tit'
    expect(key).toBe(indexStrongKey(UGNT, 'G5485', 'tit'))
    expect(strongRow(rows, key)).toEqual({ v: 1, stamp: STAMP, lemma: 'χάρις', words: expect.any(String) })
    expect(decodeWords(strongRow(rows, key)!.words)).toEqual([5])
    expect(decodeWords(strongRow(rows, indexStrongKey(UGNT, 'G2316', 'tit'))!.words)).toEqual([2, 6])
  })

  test('keeps both occurrences in one verse', () => {
    const rows = buildBookIndex(
      UHB,
      'rut',
      [
        {
          chapter: 1,
          usj: usj(
            c('1'),
            p(
              v('21'),
              w('אֲנִי', 'H0589', 'אֲנִי'),
              w('מְלֵאָה', 'H4392', 'מָלֵא'),
              w('הָלַכְתִּי', 'H1980', 'הָלַךְ'),
              w('וְ⁠רֵיקָם', 'c:H7387', 'רֵיקָם'),
              w('הֱשִׁיבַ⁠נִי', 'H7725', 'שׁוּב'),
              w('יְהוָה', 'H3068', 'יְהוָה'),
              w('וַֽ⁠יהוָה', 'c:H3068', 'יְהוָה')
            )
          ),
        },
      ],
      STAMP
    )
    expect(decodeWords(strongRow(rows, indexStrongKey(UHB, 'H3068', 'rut'))!.words)).toEqual([5, 6])
    expect(versesRow(rows).verses).toBe('1:21')
    expect(decodeWords(versesRow(rows).starts)).toEqual([0])
  })

  test('drops particle prefixes and words with no code', () => {
    const rows = buildBookIndex(
      UHB,
      'gen',
      [{ chapter: 1, usj: usj(c('1'), p(v('1'), w('וְ⁠אֵת', 'c:H0853', 'אֵת'), w('־'), w('הָ⁠אָרֶץ', 'd:H0776', 'אֶרֶץ'), w('בְּ', 'b'))) }],
      STAMP
    )
    expect(rows.map((r) => r.key)).toEqual([
      indexVersesKey(UHB, 'gen'),
      indexStrongKey(UHB, 'H0776', 'gen'),
      indexStrongKey(UHB, 'H0853', 'gen'),
    ])
    expect(decodeWords(strongRow(rows, indexStrongKey(UHB, 'H0853', 'gen'))!.words)).toEqual([0])
    // The word with no strong took number 1.
    expect(decodeWords(strongRow(rows, indexStrongKey(UHB, 'H0776', 'gen'))!.words)).toEqual([2])
    expect(versesRow(rows).words).toBe(4)
  })

  test('skips chapter 0 and takes chapters in order', () => {
    const rows = buildBookIndex(
      UGNT,
      'tit',
      [
        titus[1]!,
        { chapter: 0, usj: usj({ type: 'para', marker: 'mt', content: [w('ΠΡΟΣ', 'G43140', 'πρός'), w('ΤΙΤΟΝ', 'G51030', 'Τίτος')] }) },
        titus[0]!,
      ],
      STAMP
    )
    expect(versesRow(rows).words).toBe(7)
    expect(versesRow(rows).verses).toBe('1:1 2:11')
    expect(decodeWords(versesRow(rows).starts)).toEqual([0, 3])
    expect(strongRow(rows, indexStrongKey(UGNT, 'G4314', 'tit'))).toBeUndefined()
    expect(decodeWords(strongRow(rows, indexStrongKey(UGNT, 'G5485', 'tit'))!.words)).toEqual([5])
  })

  test('puts words before the first verse in {c}:0', () => {
    const rows = buildBookIndex(
      UHB,
      'psa',
      [
        {
          chapter: 3,
          usj: usj(
            c('3'),
            { type: 'para', marker: 'd', content: [w('מִזְמ֥וֹר', 'H4210', 'מִזְמוֹר'), w('לְ⁠דָוִ֑ד', 'l:H1732', 'דָּוִד')] },
            p(v('1'), w('יְ֭הוָה', 'H3068', 'יְהוָה'))
          ),
        },
      ],
      STAMP
    )
    expect(versesRow(rows).verses).toBe('3:0 3:1')
    expect(decodeWords(versesRow(rows).starts)).toEqual([0, 2])
  })

  test('a verse without words is not listed', () => {
    const rows = buildBookIndex(UGNT, '3jn', [{ chapter: 1, usj: usj(c('1'), p(v('1'), w('Ὁ', 'G35880', 'ὁ')), p(v('2')), p(v('3'), w('ἐχάρην', 'G54630', 'χαίρω'))) }], STAMP)
    expect(versesRow(rows).verses).toBe('1:1 1:3')
    expect(decodeWords(versesRow(rows).starts)).toEqual([0, 1])
  })

  test('keeps a verse bridge as written and takes a verse marked only by its marker', () => {
    const rows = buildBookIndex(UGNT, 'tit', [{ chapter: 1, usj: usj(c('1'), p(v('1-2'), w('Παῦλος', 'G39720'), { marker: 'v', number: '3' }, w('ἐφανέρωσεν', 'G53190'))) }], STAMP)
    expect(versesRow(rows).verses).toBe('1:1-2 1:3')
    expect(decodeWords(versesRow(rows).starts)).toEqual([0, 1])
  })

  test('takes a whole USJ or its content array', () => {
    const asArrays = titus.map(({ chapter, usj }) => ({ chapter, usj: usj.content }))
    expect(buildBookIndex(UGNT, 'tit', asArrays, STAMP)).toEqual(buildBookIndex(UGNT, 'tit', titus, STAMP))
  })

  test('picks the most frequent lemma, first seen on a tie', () => {
    const rows = buildBookIndex(
      UGNT,
      'tit',
      [
        {
          chapter: 1,
          usj: usj(
            c('1'),
            p(
              v('1'),
              w('a', 'G10', 'first'),
              w('b', 'G10', 'second'),
              w('c', 'G10', 'second'),
              w('d', 'G20', 'early'),
              w('e', 'G20', 'late'),
              w('f', 'G20', 'late'),
              w('g', 'G20', 'early')
            )
          ),
        },
      ],
      STAMP
    )
    expect(strongRow(rows, indexStrongKey(UGNT, 'G1', 'tit'))!.lemma).toBe('second')
    expect(strongRow(rows, indexStrongKey(UGNT, 'G2', 'tit'))!.lemma).toBe('early')
  })

  test('rows are the verses row, then Strong rows sorted by key', () => {
    const rows = buildBookIndex(
      UHB,
      'gen',
      [{ chapter: 1, usj: usj(c('1'), p(v('1'), w('a', 'H3068'), w('b', 'H853'), w('c', 'H1121a'), w('d', 'H1121'), w('e', 'H0853'))) }],
      STAMP
    )
    expect(rows.map((r) => r.key)).toEqual([
      indexVersesKey(UHB, 'gen'),
      indexStrongKey(UHB, 'H0853', 'gen'),
      indexStrongKey(UHB, 'H1121', 'gen'),
      indexStrongKey(UHB, 'H1121a', 'gen'),
      indexStrongKey(UHB, 'H3068', 'gen'),
    ])
    expect(decodeWords(strongRow(rows, indexStrongKey(UHB, 'H0853', 'gen'))!.words)).toEqual([1, 4])
    for (const row of rows) expect(row.value.v).toBe(HELPS_INDEX_VERSION)
  })
})

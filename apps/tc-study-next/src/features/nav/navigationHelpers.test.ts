import { describe, expect, test } from 'bun:test'
import type { PassageSetNode } from '@bt-synergy/passage-sets'
import {
  coerceReferenceToAvailableBooks,
  fallbackBookIfUnavailable,
  flattenPassageSetToBCV,
  isSameBCVReference,
  normalizeReferenceForNavigate,
} from './navigationHelpers'
import type { BookInfo } from '../../contexts/types'

describe('navigationHelpers', () => {
  test('flattenPassageSetToBCV walks groups and passages', () => {
    const root: PassageSetNode[] = [
      {
        type: 'group',
        children: [
          {
            type: 'passage',
            passages: [
              {
                bookCode: 'tit',
                ref: { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 4 },
              },
            ],
          } as PassageSetNode,
        ],
      } as PassageSetNode,
    ]
    expect(flattenPassageSetToBCV(root)).toEqual([
      { book: 'tit', chapter: 1, verse: 1, endChapter: 1, endVerse: 4 },
    ])
  })

  test('isSameBCVReference compares span fields', () => {
    expect(
      isSameBCVReference(
        { book: 'tit', chapter: 1, verse: 1 },
        { book: 'tit', chapter: 1, verse: 1 }
      )
    ).toBe(true)
    expect(
      isSameBCVReference(
        { book: 'tit', chapter: 1, verse: 1 },
        { book: 'tit', chapter: 1, verse: 2 }
      )
    ).toBe(false)
  })

  test('normalizeReferenceForNavigate expands chapter mode', () => {
    const books: BookInfo[] = [
      { code: 'tit', name: 'Titus', testament: 'NT', chapters: 3, verses: [16, 15, 15] },
    ]
    const getBookInfo = (code: string) => books.find((b) => b.code === code) ?? null
    expect(
      normalizeReferenceForNavigate(
        { book: 'tit', chapter: 2, verse: 5 },
        'chapter',
        getBookInfo
      )
    ).toEqual({ book: 'tit', chapter: 2, verse: 1, endVerse: 15 })
  })

  test('normalizeReferenceForNavigate clamps OBS defaults', () => {
    expect(
      normalizeReferenceForNavigate(
        { book: 'obs', chapter: 0 as unknown as number, verse: 0 as unknown as number },
        'verse',
        () => null
      )
    ).toEqual({ book: 'obs', chapter: 1, verse: 1 })
  })

  test('fallbackBookIfUnavailable snaps off books missing from partial GL catalog', () => {
    const esBooks = [{ code: 'rut' }, { code: 'jon' }, { code: 'tit' }, { code: '3jn' }]
    expect(fallbackBookIfUnavailable('gen', esBooks)).toBe('rut')
    expect(fallbackBookIfUnavailable('tit', esBooks)).toBeNull()
    expect(fallbackBookIfUnavailable('obs', esBooks)).toBeNull()
    expect(fallbackBookIfUnavailable('gen', [])).toBeNull()
  })

  test('coerceReferenceToAvailableBooks redirects Genesis deep-link onto first GL book', () => {
    const books: BookInfo[] = [
      { code: 'rut', name: 'Rut', chapters: 4, verses: [22, 23, 18, 22] },
      { code: 'tit', name: 'Tito', chapters: 3, verses: [16, 15, 15] },
    ]
    const getBookInfo = (code: string) => books.find((b) => b.code === code) ?? null
    expect(
      coerceReferenceToAvailableBooks(
        { book: 'gen', chapter: 1, verse: 1 },
        books,
        'scripture',
        'verse',
        getBookInfo
      )
    ).toEqual({ book: 'rut', chapter: 1, verse: 1 })
  })
})

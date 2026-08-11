import { describe, expect, test } from 'bun:test'
import {
  buildReadPath,
  buildReadRouteTailFromNavigation,
  formatBibleNavRef,
  formatObsFrameRangeNavRef,
  isBibleNavType,
  isKnownBibleBookCode,
  navigationModeFromReadNav,
  parseBibleBookOnlyNavRef,
  parseBibleNavRef,
  parseBibleSectionNavRef,
  parseObsFrameNavRef,
  parseObsFrameRangeNavRef,
  parseObsStoryNavRef,
  resolveDefaultStartForBook,
  resolveReadRouteFromParams,
  slugifyReadNavSegment,
} from './readRoutes'

describe('readRoutes', () => {
  test('slugifyReadNavSegment', () => {
    expect(slugifyReadNavSegment('The Creation!')).toBe('the-creation')
    expect(slugifyReadNavSegment('  hello  world  ')).toBe('hello-world')
  })

  test('buildReadPath encodes segments', () => {
    expect(
      buildReadPath('es-419', {
        resourceType: 'bible',
        navType: 'chapter',
        navRef: 'tit 2',
      })
    ).toBe('/read/es-419/bible/chapter/tit%202')
  })

  test('parseBibleNavRef ranges', () => {
    expect(parseBibleNavRef('tit 2:14-3:2')).toEqual({
      book: 'tit',
      ref: { book: 'tit', chapter: 2, verse: 14, endChapter: 3, endVerse: 2 },
    })
    expect(parseBibleNavRef('hi 1:1')).toEqual({
      book: 'hi',
      ref: { book: 'hi', chapter: 1, verse: 1 },
    })
    expect(parseBibleNavRef('tit 2:14-20')).toEqual({
      book: 'tit',
      ref: { book: 'tit', chapter: 2, verse: 14, endVerse: 20 },
    })
  })

  test('parseBibleNavRef chapter-only', () => {
    expect(parseBibleNavRef('tit 2')).toEqual({
      book: 'tit',
      ref: { book: 'tit', chapter: 2, verse: 1 },
    })
  })

  test('parseBibleSectionNavRef', () => {
    expect(parseBibleSectionNavRef('tit 3')).toEqual({ book: 'tit', section1Based: 3 })
  })

  test('formatBibleNavRef round-trip', () => {
    const p = parseBibleNavRef('tit 2:14-3:2')
    expect(p && formatBibleNavRef(p.ref)).toBe('tit 2:14-3:2')
  })

  test('obs story and frame refs', () => {
    expect(parseObsStoryNavRef('1')).toEqual({ book: 'obs', chapter: 1, verse: 1 })
    expect(parseObsFrameRangeNavRef('1.4-2.5')).toEqual({
      book: 'obs',
      chapter: 1,
      verse: 4,
      endChapter: 2,
      endVerse: 5,
    })
    expect(parseObsFrameNavRef('1.4')).toEqual({ book: 'obs', chapter: 1, verse: 4 })
    expect(formatObsFrameRangeNavRef({ book: 'obs', chapter: 1, verse: 4, endChapter: 2, endVerse: 5 })).toBe(
      '1.4-2.5'
    )
  })

  test('navigationModeFromReadNav', () => {
    expect(navigationModeFromReadNav('bible', 'ref')).toBe('verse')
    expect(navigationModeFromReadNav('bible', 'chapter')).toBe('chapter')
    expect(navigationModeFromReadNav('obs', 'story')).toBe('chapter')
    expect(navigationModeFromReadNav('obs', 'ref')).toBe('verse')
  })

  test('buildReadRouteTailFromNavigation OBS same-story frame range (endVerse only)', () => {
    expect(
      buildReadRouteTailFromNavigation({
        scope: 'obs',
        mode: 'verse',
        ref: { book: 'obs', chapter: 1, verse: 8, endVerse: 10 },
        passageSet: null,
        section1Based: null,
      })
    ).toEqual({ resourceType: 'obs', navType: 'ref', navRef: '1.8-1.10' })
  })

  test('isKnownBibleBookCode / parseBibleBookOnlyNavRef', () => {
    expect(isKnownBibleBookCode('3jn')).toBe(true)
    expect(isKnownBibleBookCode('GEN')).toBe(true)
    expect(isKnownBibleBookCode('ref')).toBe(false)
    expect(isKnownBibleBookCode('xyz')).toBe(false)
    expect(parseBibleBookOnlyNavRef('3JN')).toBe('3jn')
    expect(parseBibleBookOnlyNavRef('tit 1')).toBeNull()
    expect(parseBibleBookOnlyNavRef('chapter')).toBeNull()
    expect(isBibleNavType('ref')).toBe(true)
    expect(isBibleNavType('3jn')).toBe(false)
  })

  test('resolveDefaultStartForBook by nav mode', () => {
    expect(resolveDefaultStartForBook('3jn', 'ref')).toEqual({
      kind: 'ref',
      ref: { book: '3jn', chapter: 1, verse: 1 },
    })
    expect(resolveDefaultStartForBook('3jn', 'chapter')).toEqual({
      kind: 'ref',
      ref: { book: '3jn', chapter: 1, verse: 1 },
    })
    expect(resolveDefaultStartForBook('3jn', 'passage')).toEqual({
      kind: 'ref',
      ref: { book: '3jn', chapter: 1, verse: 1 },
    })
    expect(resolveDefaultStartForBook('3jn', 'section')).toEqual({
      kind: 'section',
      book: '3jn',
      section1Based: 1,
    })
    expect(resolveDefaultStartForBook('not-a-book', 'ref')).toBeNull()
  })

  test('resolveReadRouteFromParams book-only and OBS story shorthand', () => {
    expect(
      resolveReadRouteFromParams({
        languageCode: 'es-419',
        resourceType: 'bible',
        navType: '3jn',
      })
    ).toEqual({
      readRouteTail: { resourceType: 'bible', navRef: '3jn' },
      partialRouteHint: undefined,
    })

    expect(
      resolveReadRouteFromParams({
        languageCode: 'es-419',
        resourceType: 'bible',
        navType: 'section',
        navRef: '3jn',
      })
    ).toEqual({
      readRouteTail: { resourceType: 'bible', navType: 'section', navRef: '3jn' },
      partialRouteHint: undefined,
    })

    expect(
      resolveReadRouteFromParams({
        languageCode: 'es-419',
        resourceType: 'bible',
        navType: 'chapter',
      })
    ).toEqual({
      readRouteTail: null,
      partialRouteHint: { resourceType: 'bible', navType: 'chapter' },
    })

    expect(
      resolveReadRouteFromParams({
        languageCode: 'es-419',
        resourceType: 'obs',
        navType: '12',
      })
    ).toEqual({
      readRouteTail: { resourceType: 'obs', navType: 'story', navRef: '12' },
      partialRouteHint: undefined,
    })

    expect(
      resolveReadRouteFromParams({
        languageCode: 'es-419',
        resourceType: 'bible',
        navType: 'ref',
        navRef: '3jn%201%3A1',
      })
    ).toEqual({
      readRouteTail: { resourceType: 'bible', navType: 'ref', navRef: '3jn 1:1' },
      partialRouteHint: undefined,
    })
  })
})

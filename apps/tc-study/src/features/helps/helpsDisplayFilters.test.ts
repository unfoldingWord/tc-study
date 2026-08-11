import { describe, expect, test } from 'bun:test'
import {
  filterDisplayLinks,
  filterDisplayNotes,
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  resolveRangeEndVerse,
} from './helpsDisplayFilters'

describe('filterNotesByReferenceRange', () => {
  test('keeps notes overlapping chapter/verse range', () => {
    const notes = [
      { id: 'a', reference: '1:1' },
      { id: 'b', reference: '1:3-5' },
      { id: 'c', reference: '2:1' },
    ]
    expect(
      filterNotesByReferenceRange(notes, {
        startChapter: 1,
        startVerse: 3,
        endChapter: 1,
        endVerse: 4,
      }).map((n) => n.id)
    ).toEqual(['b'])
  })
})

describe('filterLinksByReferenceRange', () => {
  test('supports cross-chapter ranges', () => {
    const links = [
      { id: 'a', reference: '1:16' },
      { id: 'b', reference: '2:1' },
      { id: 'c', reference: '2:4' },
    ]
    expect(
      filterLinksByReferenceRange(links, {
        startChapter: 1,
        startVerse: 16,
        endChapter: 2,
        endVerse: 2,
      }).map((l) => l.id)
    ).toEqual(['a', 'b'])
  })
})

describe('filterDisplayNotes', () => {
  const notes = [
    {
      id: 'n1',
      reference: '1:1',
      quote: 'hello world',
      occurrence: '1',
      quoteTokens: [{ text: 'hello' }],
      semanticIds: ['gen-1-1-hello-1'],
    },
  ]

  test('token filter with fallbackWhenEmpty restores list when no match', () => {
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(notes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: {
        semanticId: 'x',
        content: 'zzzz',
        alignedSemanticIds: [],
        timestamp: 1,
      },
      bookCodeLower: 'gen',
      fallbackWhenEmpty: true,
    })
    expect(hasNoteMatches).toBe(false)
    expect(displayNotes).toHaveLength(1)
  })

  test('token filter without fallback returns empty when no match', () => {
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(notes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: {
        semanticId: 'x',
        content: 'zzzz',
        alignedSemanticIds: [],
        timestamp: 1,
      },
      bookCodeLower: 'gen',
    })
    expect(hasNoteMatches).toBe(false)
    expect(displayNotes).toHaveLength(0)
  })
})

describe('filterDisplayLinks', () => {
  test('OBS quote filter by sourceIds', () => {
    const links = [
      { id: 'l1', reference: '1:1', origWords: 'a' },
      { id: 'l2', reference: '1:1', origWords: 'b' },
    ]
    const { displayLinks, hasLinkMatches } = filterDisplayLinks(links, {
      helpsScope: 'obs',
      obsQuoteFilter: { sourceIds: ['l2'] },
      verseFilter: null,
      tokenFilter: null,
      bookCodeLower: 'obs',
    })
    expect(hasLinkMatches).toBe(true)
    expect(displayLinks.map((l) => l.id)).toEqual(['l2'])
  })
})

describe('resolveRangeEndVerse', () => {
  test('uses infinity in OBS story mode', () => {
    expect(resolveRangeEndVerse({ book: 'obs', verse: 1, endVerse: 3 }, 'chapter')).toBe(
      Number.POSITIVE_INFINITY
    )
  })
})

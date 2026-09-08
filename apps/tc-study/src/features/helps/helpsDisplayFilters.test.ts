import { describe, expect, test } from 'bun:test'
import {
  filterDisplayLinks,
  filterDisplayNotes,
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  flattenBookNotes,
  resolveRangeEndVerse,
  settleSupportRefDisplayNotes,
  supportReferenceKey,
  supportReferencesMatch,
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

  test('OBS verseFilter keeps notes for the clicked frame', () => {
    const frameNotes = [
      { id: 'n1', reference: '1:1', quote: 'first' },
      { id: 'n2', reference: '1:3', quote: 'third' },
    ]
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(frameNotes, {
      helpsScope: 'obs',
      obsQuoteFilter: null,
      verseFilter: { chapter: 1, verse: 3, timestamp: 1 },
      tokenFilter: null,
      bookCodeLower: 'obs',
    })
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['n2'])
  })

  test('verseFilter keeps English tN for the clicked verse (language-agnostic)', () => {
    const verseNotes = [
      ...notes,
      { id: 'n2', reference: '1:3', quote: 'another', occurrence: '1' },
    ]
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(verseNotes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: { chapter: 1, verse: 1, timestamp: 1 },
      tokenFilter: null,
      bookCodeLower: 'tit',
    })
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['n1'])
  })


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

  test('supportRefFilter keeps notes with the same TA support-reference', () => {
    const bookNotes = [
      {
        id: 'n1',
        reference: '1:1',
        supportReference: 'rc://*/ta/man/translate/figs-doublet',
      },
      {
        id: 'n2',
        reference: '2:4',
        supportReference: 'rc://*/ta/man/translate/figs-doublet/',
      },
      {
        id: 'n3',
        reference: '1:2',
        supportReference: 'rc://*/ta/man/translate/figs-metaphor',
      },
    ]
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(bookNotes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: null,
      supportRefFilter: {
        supportReference: 'rc://*/ta/man/translate/figs-doublet',
        title: 'Doublet',
        timestamp: 1,
      },
      bookCodeLower: 'tit',
    })
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['n1', 'n2'])
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

  test('supportRefFilter hides all TWL links', () => {
    const links = [
      { id: 'l1', reference: '1:1', origWords: 'a' },
      { id: 'l2', reference: '2:1', origWords: 'b' },
    ]
    const { displayLinks, hasLinkMatches } = filterDisplayLinks(links, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: null,
      supportRefFilter: {
        supportReference: 'rc://*/ta/man/translate/figs-doublet',
        title: 'Doublet',
        timestamp: 1,
      },
      bookCodeLower: 'tit',
    })
    expect(hasLinkMatches).toBe(false)
    expect(displayLinks).toEqual([])
  })
})

describe('supportReferenceKey', () => {
  test('normalizes rc paths and trailing slashes', () => {
    expect(supportReferenceKey('rc://*/ta/man/translate/figs-doublet')).toBe(
      'translate/figs-doublet'
    )
    expect(supportReferenceKey('rc://*/ta/man/translate/figs-doublet/')).toBe(
      'translate/figs-doublet'
    )
    expect(supportReferencesMatch(
      'rc://*/ta/man/translate/figs-doublet',
      'rc://en/ta/man/translate/figs-doublet'
    )).toBe(true)
  })
})

describe('flattenBookNotes', () => {
  test('prefers the longer flat notes array when chapter map is incomplete', () => {
    const byChapter = { '1': [{ id: 'a' }, { id: 'b' }] }
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    expect(flattenBookNotes(byChapter, all).map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('uses chapter map when it is the fuller source', () => {
    const byChapter = {
      '1': [{ id: 'a' }],
      '2': [{ id: 'b' }],
      '3': [{ id: 'c' }],
    }
    expect(flattenBookNotes(byChapter, [{ id: 'a' }]).map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('settleSupportRefDisplayNotes', () => {
  test('settles off-passage matches so excerpts are not stuck pending', () => {
    const book = [
      { id: 'n1', supportReference: 'rc://*/ta/man/translate/figs-doublet', quote: 'a and b' },
      { id: 'n2', supportReference: 'rc://*/ta/man/translate/figs-doublet', quote: '' },
      { id: 'n3', supportReference: 'rc://*/ta/man/translate/figs-metaphor', quote: 'x' },
    ]
    const aligned = new Map([
      [
        'n1',
        {
          id: 'n1',
          supportReference: 'rc://*/ta/man/translate/figs-doublet',
          quote: 'a and b',
          quoteStatus: 'aligned',
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      aligned
    )
    expect(settled.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(settled[0]!.quoteStatus).toBe('aligned')
    expect(settled[1]!.quoteStatus).toBe('none')
  })

  test('uses ol-fallback for quoted notes that are not in the passage align set', () => {
    const book = [
      {
        id: 'n2',
        supportReference: 'rc://*/ta/man/translate/figs-doublet',
        quote: 'submit and obey',
      },
    ]
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      new Map()
    )
    expect(settled[0]!.quoteStatus).toBe('ol-fallback')
  })

  test('merges IndexedDB / align enrichment when passage align is missing', () => {
    const book = [
      {
        id: 'n2',
        supportReference: 'rc://*/ta/man/translate/figs-doublet',
        quote: 'submit and obey',
      },
    ]
    const enrichment = new Map([
      [
        'n2',
        {
          quoteTokens: [{ id: 1, text: 'a', type: 'word', occurrence: 1, content: 'a' }],
          quoteStatus: 'aligned',
          alignedTokens: [{ position: 0, content: 'sensible' }],
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      new Map(),
      enrichment
    )
    expect(settled[0]!.quoteStatus).toBe('aligned')
    expect(settled[0]!.alignedTokens).toEqual([{ position: 0, content: 'sensible' }])
  })

  test('keeps enrichment align when passage row is empty mid-reload', () => {
    const book = [
      {
        id: 'n2',
        supportReference: 'rc://*/ta/man/translate/figs-doublet',
        quote: 'for all men',
      },
    ]
    const aligned = new Map([
      [
        'n2',
        {
          id: 'n2',
          supportReference: 'rc://*/ta/man/translate/figs-doublet',
          quote: 'for all men',
          quoteStatus: 'pending',
          semanticIds: [],
          alignedTokens: [],
        },
      ],
    ])
    const enrichment = new Map([
      [
        'n2',
        {
          semanticIds: ['tit 2:11:men:1'],
          alignedTokens: [{ position: 0, content: 'men' }],
          quoteStatus: 'aligned',
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      aligned,
      enrichment
    )
    expect(settled[0]!.semanticIds).toEqual(['tit 2:11:men:1'])
    expect(settled[0]!.quoteStatus).toBe('aligned')
  })
})

describe('resolveRangeEndVerse', () => {
  test('uses infinity in OBS story mode', () => {
    expect(resolveRangeEndVerse({ book: 'obs', verse: 1, endVerse: 3 }, 'chapter')).toBe(
      Number.POSITIVE_INFINITY
    )
  })
})

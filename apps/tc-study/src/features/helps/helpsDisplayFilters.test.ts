import { describe, expect, test } from 'bun:test'
import {
  filterDisplayLinks,
  filterDisplayNotes,
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  filterSupportRefFallbackChunk,
  flattenBookNotes,
  mergeFocusChapterBookMatches,
  planSupportRefStreamChapters,
  streamRowsForChapter,
  resolveHelpsTokenClickFilter,
  resolveRangeEndVerse,
  reuseUnchangedSupportRefNotes,
  settleSupportRefDisplayNotes,
  supportRefFirstPaintNotes,
  supportReferenceKey,
  supportReferencesMatch,
  supportRefNotesForChapter,
  settleTwlArticleDisplayLinks,
  twlArticleChipTitle,
  twlArticleFirstPaintLinks,
  twlArticleKey,
  twlArticleLinksForChapter,
  twlArticlesMatch,
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

  test('keeps discontinuous multi-verse notes on any listed verse', () => {
    const notes = [
      { id: 'sbh4', reference: '5:1,3,8,12' },
      { id: 'svyb', reference: '5:2-3' },
      { id: 'other', reference: '5:4' },
    ]
    expect(
      filterNotesByReferenceRange(notes, {
        startChapter: 5,
        startVerse: 3,
        endChapter: 5,
        endVerse: 3,
      }).map((n) => n.id)
    ).toEqual(['sbh4', 'svyb'])
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

  test('verseFilter keeps multi-verse notes on any listed verse, not only the first', () => {
    const multi = [
      { id: 'sbh4', reference: '5:1,3,8,12', quote: 'יְהוָה' },
      { id: 'svyb', reference: '5:2-3', quote: 'קול' },
    ]
    expect(
      filterDisplayNotes(multi, {
        helpsScope: 'scripture',
        obsQuoteFilter: null,
        verseFilter: { chapter: 5, verse: 8, timestamp: 1 },
        tokenFilter: null,
        bookCodeLower: 'psa',
      }).displayNotes.map((n) => n.id)
    ).toEqual(['sbh4'])
    expect(
      filterDisplayNotes(multi, {
        helpsScope: 'scripture',
        obsQuoteFilter: null,
        verseFilter: { chapter: 5, verse: 2, timestamp: 1 },
        tokenFilter: null,
        bookCodeLower: 'psa',
      }).displayNotes.map((n) => n.id)
    ).toEqual(['svyb'])
    expect(
      filterDisplayNotes(multi, {
        helpsScope: 'scripture',
        obsQuoteFilter: null,
        verseFilter: { chapter: 5, verse: 4, timestamp: 1 },
        tokenFilter: null,
        bookCodeLower: 'psa',
      }).displayNotes.map((n) => n.id)
    ).toEqual([])
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

  test('ULT English token matches Hebrew quote via folded aligned ids (Psalms)', () => {
    const pointed = 'יִדֳּפֶנּוּ'
    const unpointed = pointed.normalize('NFD').replace(/\p{M}/gu, '')
    const psaNotes = [
      {
        id: 'psa-1-4-chaff',
        reference: '1:4',
        quote: pointed,
        occurrence: '1',
        quoteTokens: [{ text: unpointed }],
        semanticIds: [`psa 1:4:${unpointed}:1`],
      },
      {
        id: 'psa-1-1-blessed',
        reference: '1:1',
        quote: 'אַשְׁרֵי',
        occurrence: '1',
        quoteTokens: [{ text: 'אַשְׁרֵי' }],
        semanticIds: ['psa 1:1:אשרי:1'],
      },
    ]
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(psaNotes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: {
        semanticId: 'psa 1:4:chasses:1',
        content: 'chasses',
        alignedSemanticIds: [`psa 1:4:${pointed}:1`],
        timestamp: 1,
      },
      bookCodeLower: 'psa',
    })
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['psa-1-4-chaff'])
  })

  test('token click ids match notes that only have cached semanticIds (no quoteTokens)', () => {
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(
      [
        {
          id: 'n-align',
          reference: '1:4',
          quote: 'כַּמֹּץ',
          occurrence: '1',
          semanticIds: ['psa 1:4:כמץ:1'],
          alignedTokens: [{ semanticId: 'psa 1:4:chasses:1', content: 'chasses' }],
        },
      ],
      {
        helpsScope: 'scripture',
        obsQuoteFilter: null,
        verseFilter: null,
        tokenFilter: {
          semanticId: 'psa 1:4:chasses:1',
          content: 'chasses',
          alignedSemanticIds: ['psa 1:4:כמץ:1'],
          timestamp: 1,
        },
        bookCodeLower: 'psa',
      }
    )
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['n-align'])
  })

  test('token filter matches clicked instance, not surface substring (the ≠ Therefore)', () => {
    const ephNotes = [
      {
        id: 'eph-5-1-therefore',
        reference: '5:1',
        quote: 'Therefore',
        occurrence: '1',
        quoteTokens: [{ text: 'Therefore' }],
        semanticIds: ['eph 5:1:Therefore:1'],
        alignedTokens: [{ semanticId: 'eph 5:1:Therefore:1', content: 'Therefore' }],
      },
      {
        id: 'eph-5-9-the',
        reference: '5:9',
        quote: 'the',
        occurrence: '1',
        quoteTokens: [{ text: 'the' }],
        semanticIds: ['eph 5:9:the:1'],
        alignedTokens: [{ semanticId: 'eph 5:9:the:1', content: 'the' }],
      },
      {
        id: 'eph-5-9-other-the',
        reference: '5:9',
        quote: 'the fruit',
        occurrence: '2',
        quoteTokens: [{ text: 'the' }, { text: 'fruit' }],
        semanticIds: ['eph 5:9:the:2', 'eph 5:9:fruit:1'],
        alignedTokens: [
          { semanticId: 'eph 5:9:the:2', content: 'the' },
          { semanticId: 'eph 5:9:fruit:1', content: 'fruit' },
        ],
      },
    ]
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(ephNotes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: {
        semanticId: 'eph 5:9:the:1',
        content: 'the',
        alignedSemanticIds: [],
        timestamp: 1,
      },
      bookCodeLower: 'eph',
    })
    expect(hasNoteMatches).toBe(true)
    expect(displayNotes.map((n) => n.id)).toEqual(['eph-5-9-the'])
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

  test('twlArticleFilter keeps links with the same articlePath / twLink', () => {
    const links = [
      {
        id: 'l1',
        reference: '1:1',
        articlePath: 'bible/kt/sin',
        twLink: 'rc://*/tw/dict/bible/kt/sin',
      },
      {
        id: 'l2',
        reference: '2:4',
        articlePath: 'bible/kt/sin/',
        twLink: 'rc://*/tw/dict/bible/kt/sin/',
      },
      {
        id: 'l3',
        reference: '1:2',
        articlePath: 'bible/kt/grace',
        twLink: 'rc://*/tw/dict/bible/kt/grace',
      },
    ]
    const { displayLinks, hasLinkMatches } = filterDisplayLinks(links, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: null,
      twlArticleFilter: {
        articlePath: 'bible/kt/sin',
        title: 'Sin',
        timestamp: 1,
      },
      bookCodeLower: 'tit',
    })
    expect(hasLinkMatches).toBe(true)
    expect(displayLinks.map((l) => l.id)).toEqual(['l1', 'l2'])
  })
})

describe('filterDisplayNotes twl article', () => {
  test('twlArticleFilter hides all TN notes', () => {
    const notes = [
      { id: 'n1', reference: '1:1', supportReference: 'rc://*/ta/man/translate/figs-metaphor' },
    ]
    const { displayNotes, hasNoteMatches } = filterDisplayNotes(notes, {
      helpsScope: 'scripture',
      obsQuoteFilter: null,
      verseFilter: null,
      tokenFilter: null,
      twlArticleFilter: {
        articlePath: 'bible/kt/sin',
        title: 'Sin',
        timestamp: 1,
      },
      bookCodeLower: 'tit',
    })
    expect(hasNoteMatches).toBe(false)
    expect(displayNotes).toEqual([])
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

describe('twlArticleKey', () => {
  test('normalizes articlePath and twLink to the same bible/cat/term key', () => {
    expect(twlArticleKey('bible/kt/sin')).toBe('bible/kt/sin')
    expect(twlArticleKey('bible/kt/sin/')).toBe('bible/kt/sin')
    expect(twlArticleKey(undefined, 'rc://*/tw/dict/bible/kt/sin')).toBe('bible/kt/sin')
    expect(twlArticleKey(undefined, 'rc://*/tw/dict/bible/kt/sin/')).toBe('bible/kt/sin')
    expect(twlArticlesMatch(
      { articlePath: 'bible/kt/sin' },
      { twLink: 'rc://*/tw/dict/bible/kt/sin' }
    )).toBe(true)
    expect(twlArticlesMatch('bible/kt/sin', 'rc://*/tw/dict/bible/kt/sin')).toBe(true)
    expect(twlArticlesMatch('bible/kt/sin', 'bible/kt/grace')).toBe(false)
  })

  test('chip title uses the first TW gloss, not the full synonym list', () => {
    expect(twlArticleChipTitle('sin, sinful, sinner, sinning', 'bible/kt/sin')).toBe('Sin')
    expect(twlArticleChipTitle('Yahweh, Yah', 'bible/kt/yahweh')).toBe('Yahweh')
    expect(twlArticleChipTitle('', 'bible/kt/sin')).toBe('Sin')
  })
})

describe('twlArticleFirstPaintLinks', () => {
  const sin = 'bible/kt/sin'
  const bookLinks = [
    { id: 'psa-1', reference: '1:3', articlePath: sin, twLink: 'rc://*/tw/dict/bible/kt/sin' },
    { id: 'psa-2', reference: '2:1', articlePath: sin, twLink: 'rc://*/tw/dict/bible/kt/sin' },
    { id: 'psa-150', reference: '150:1', twLink: 'rc://*/tw/dict/bible/kt/sin/' },
    { id: 'other', reference: '1:4', articlePath: 'bible/kt/grace', twLink: 'rc://*/tw/dict/bible/kt/grace' },
  ]

  test('first paint is current-chapter matches only — no book flatten', () => {
    const first = twlArticleFirstPaintLinks(bookLinks, sin, 3)
    expect(first.map((l) => l.id)).toEqual([])
    const focusPaint = twlArticleFirstPaintLinks(
      [
        { id: 'psa-3', reference: '3:1', articlePath: sin, twLink: 'rc://*/tw/dict/bible/kt/sin' },
        bookLinks[0]!,
      ],
      sin,
      3
    )
    expect(focusPaint.map((l) => l.id)).toEqual(['psa-3'])
    expect(twlArticleLinksForChapter([bookLinks[1]!, bookLinks[3]!], sin).map((l) => l.id)).toEqual([
      'psa-2',
    ])
  })

  test('idle plan includes chapters before the focus chapter', () => {
    expect(
      planSupportRefStreamChapters(
        { '3': [bookLinks[0]], '5': [bookLinks[2]] },
        3
      )
    ).toEqual([1, 2, 4, 5])
    expect(
      planSupportRefStreamChapters(
        { '3': [], '4': [] },
        3,
        [{ reference: '1:3' }, { reference: '2:1' }, { reference: '4:1' }]
      )
    ).toEqual([1, 2, 4])
    expect(streamRowsForChapter(
      { '3': [bookLinks[0]] },
      bookLinks,
      2
    ).map((l) => l.id)).toEqual(['psa-2'])
  })
})

describe('settleTwlArticleDisplayLinks', () => {
  test('quoted off-chapter links without enrichment show OL fallback with warm-pending', () => {
    const book = [
      {
        id: 'twl-18',
        reference: '18:1',
        articlePath: 'bible/kt/yahweh',
        origWords: 'יְהוָה',
      },
    ]
    const settled = settleTwlArticleDisplayLinks(book, 'bible/kt/yahweh', new Map())
    expect(settled[0]!.quoteStatus).toBe('ol-fallback')
    expect(settled[0]!.quoteWarmPending).toBe(true)
  })

  test('merges lane-2 quote/align enrichment when passage align is missing', () => {
    const book = [
      {
        id: 'twl-18',
        reference: '18:1',
        articlePath: 'bible/kt/yahweh',
        origWords: 'יְהוָה',
      },
    ]
    const enrichment = new Map([
      [
        'twl-18',
        {
          quoteTokens: [{ id: 1, text: 'יְהוָה', type: 'word', occurrence: 1, content: 'יְהוָה' }],
          quoteStatus: 'aligned',
          alignedTokens: [{ position: 0, content: 'Yahweh' }],
          semanticIds: ['psa 18:1:yahweh:1'],
        },
      ],
    ])
    const settled = settleTwlArticleDisplayLinks(
      book,
      'bible/kt/yahweh',
      new Map(),
      enrichment
    )
    expect(settled[0]!.quoteStatus).toBe('aligned')
    expect(settled[0]!.alignedTokens).toEqual([{ position: 0, content: 'Yahweh' }])
  })
})

describe('supportRefFirstPaintNotes', () => {
  const metaphor = 'rc://*/ta/man/translate/figs-metaphor'
  const bookNotes = [
    { id: 'psa-1', reference: '1:3', supportReference: metaphor, quote: 'like a tree' },
    { id: 'psa-2', reference: '2:1', supportReference: metaphor, quote: 'why rage' },
    { id: 'psa-150', reference: '150:1', supportReference: metaphor, quote: 'praise' },
    { id: 'other', reference: '1:4', supportReference: 'rc://*/ta/man/translate/figs-doublet' },
  ]

  test('first paint is current-chapter matches only — no book flatten', () => {
    const first = supportRefFirstPaintNotes(bookNotes, metaphor, 1)
    expect(first.map((n) => n.id)).toEqual(['psa-1'])
    expect(planSupportRefStreamChapters({ '1': [bookNotes[0]], '2': [bookNotes[1]], '4': [bookNotes[2]] }, 1)).toEqual([
      2, 3, 4,
    ])
  })

  test('idle plan walks preceding chapters, not only current→end', () => {
    expect(
      planSupportRefStreamChapters(
        { '3': [bookNotes[0]], '4': [bookNotes[2]] },
        3
      )
    ).toEqual([1, 2, 4])
    const passageOnly = supportRefFirstPaintNotes(
      [{ id: 'psa-3b', reference: '3:8', supportReference: metaphor }],
      metaphor,
      3
    )
    const chapterRows = [
      { id: 'psa-3a', reference: '3:1', supportReference: metaphor },
      { id: 'psa-3b', reference: '3:8', supportReference: metaphor },
    ]
    expect(mergeFocusChapterBookMatches(passageOnly, chapterRows).map((n) => n.id)).toEqual([
      'psa-3b',
      'psa-3a',
    ])
  })

  test('cross-chapter filter click: firstPaint + streamed destination chapter dedupes by id', () => {
    // Filter applied on ch.1 → stream includes tit 1:3. User clicks that card →
    // nav to ch.1 makes firstPaint include the same note. Concat without dedupe
    // rendered two helps-row-tn-* cards (bug). Prefer firstPaint (aligned).
    const metaphor = 'rc://*/ta/man/translate/figs-metaphor'
    const alignedFocus = {
      id: 'swi9',
      reference: '1:3',
      supportReference: metaphor,
      quote: 'he revealed his word',
      quoteStatus: 'aligned',
      alignedTokens: [{ position: 0 }],
    }
    const streamedFromPriorFocus = [
      {
        id: 'swi9',
        reference: '1:3',
        supportReference: metaphor,
        quote: 'he revealed his word',
      },
      {
        id: 'tit2',
        reference: '2:1',
        supportReference: metaphor,
        quote: 'speak what fits',
      },
    ]
    const firstPaint = mergeFocusChapterBookMatches(
      supportRefFirstPaintNotes([alignedFocus], metaphor, 1),
      supportRefNotesForChapter([alignedFocus], metaphor)
    )
    const book = mergeFocusChapterBookMatches(firstPaint, streamedFromPriorFocus)
    const settled = settleSupportRefDisplayNotes(
      book,
      metaphor,
      new Map([['swi9', alignedFocus]])
    )
    expect(settled.map((n) => n.id)).toEqual(['swi9', 'tit2'])
    expect(settled[0]).toBe(alignedFocus)
  })

  test('cross-chapter TWL article click: firstPaint + streamed destination dedupes by id', () => {
    const path = 'bible/kt/god'
    const alignedFocus = {
      id: 'l-tit-1',
      reference: '1:1',
      articlePath: path,
      origWords: 'θεοῦ',
      quoteStatus: 'aligned',
      alignedTokens: [{ position: 0 }],
    }
    const streamedFromPriorFocus = [
      { id: 'l-tit-1', reference: '1:1', articlePath: path, origWords: 'θεοῦ' },
      { id: 'l-tit-2', reference: '2:13', articlePath: path, origWords: 'θεοῦ' },
    ]
    const firstPaint = mergeFocusChapterBookMatches(
      twlArticleFirstPaintLinks([alignedFocus], path, 1),
      twlArticleLinksForChapter([alignedFocus], path)
    )
    const book = mergeFocusChapterBookMatches(firstPaint, streamedFromPriorFocus)
    const settled = settleTwlArticleDisplayLinks(
      book,
      path,
      new Map([['l-tit-1', alignedFocus]])
    )
    expect(settled.map((l) => l.id)).toEqual(['l-tit-1', 'l-tit-2'])
    expect(settled[0]).toBe(alignedFocus)
  })

  test('current-chapter notes settle from passage align without book quotes', () => {
    const first = supportRefFirstPaintNotes(bookNotes, metaphor, 1)
    const aligned = new Map([
      [
        'psa-1',
        {
          ...first[0]!,
          quoteTokens: [{ text: 'like', id: 1 }],
          quoteStatus: 'aligned',
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(first, metaphor, aligned)
    expect(settled).toHaveLength(1)
    expect(settled[0]!.quoteStatus).toBe('aligned')
    expect(settled[0]!.quoteTokens).toEqual([{ text: 'like', id: 1 }])
  })

  test('chapter notes filter does not require other chapters', () => {
    expect(
      supportRefNotesForChapter([{ id: 'a', supportReference: metaphor }], metaphor).map((n) => n.id)
    ).toEqual(['a'])
    expect(
      filterSupportRefFallbackChunk(bookNotes, metaphor, 1, new Set(['psa-1'])).map((n) => n.id)
    ).toEqual(['psa-2', 'psa-150'])
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

  test('quoted notes without enrichment show OL fallback with warm-pending icon', () => {
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
    expect(settled[0]!.quoteWarmPending).toBe(true)
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

  test('chapter remount pending demotes to OL + warm when enrichment is only fallback', () => {
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
        },
      ],
    ])
    const enrichment = new Map([
      [
        'n2',
        {
          quoteStatus: 'ol-fallback',
          quoteWarmPending: true,
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      aligned,
      enrichment
    )
    expect(settled[0]!.quoteStatus).toBe('ol-fallback')
    expect(settled[0]!.quoteWarmPending).toBe(true)
  })

  test('settled enrichment over pending does not force warm-pending spinner', () => {
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
        },
      ],
    ])
    const enrichment = new Map([
      [
        'n2',
        {
          quoteStatus: 'ol-fallback',
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      aligned,
      enrichment
    )
    expect(settled[0]!.quoteStatus).toBe('ol-fallback')
    expect(settled[0]!.quoteWarmPending).toBeUndefined()
  })

  test('chapter remount pending without enrichment still paints OL without eternal spinner', () => {
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
        },
      ],
    ])
    const settled = settleSupportRefDisplayNotes(
      book,
      'rc://*/ta/man/translate/figs-doublet',
      aligned
    )
    expect(settled[0]!.quoteStatus).toBe('ol-fallback')
    expect(settled[0]!.quoteWarmPending).toBeUndefined()
  })
})

describe('reuseUnchangedSupportRefNotes', () => {
  test('keeps object identity when quote fields are unchanged', () => {
    const first = {
      id: 'n1',
      supportReference: 'rc://*/ta/man/translate/figs-metaphor',
      quote: 'a',
      quoteStatus: 'ol-fallback',
    }
    const next = [{ ...first }, { id: 'n2', quote: 'b', quoteStatus: 'ol-fallback' }]
    const reused = reuseUnchangedSupportRefNotes(next, [first])
    expect(reused[0]).toBe(first)
    expect(reused[1]).toBe(next[1])
  })
})

describe('resolveHelpsTokenClickFilter', () => {
  test('covered scripture click sets semantic + aligned filter ids', () => {
    const filter = resolveHelpsTokenClickFilter(
      {
        semanticId: 'psa 1:4:chasses:1',
        content: 'chasses',
        alignedSemanticIds: ['psa 1:4:יִדֳּפֶנּוּ:1'],
        hasHelpsCoverage: true,
      },
      42
    )
    expect(filter).toEqual({
      semanticId: 'psa 1:4:chasses:1',
      content: 'chasses',
      alignedSemanticIds: ['psa 1:4:יִדֳּפֶנּוּ:1'],
      timestamp: 42,
    })
  })

  test('uncovered click does not set a token filter', () => {
    expect(
      resolveHelpsTokenClickFilter(
        {
          semanticId: 'psa 1:1:the:1',
          content: 'the',
          alignedSemanticIds: [],
          hasHelpsCoverage: false,
        },
        1
      )
    ).toBeUndefined()
  })

  test('null token clears the filter', () => {
    expect(resolveHelpsTokenClickFilter(null, 1)).toBeNull()
  })
})

describe('resolveRangeEndVerse', () => {
  test('uses infinity in OBS story mode', () => {
    expect(resolveRangeEndVerse({ book: 'obs', verse: 1, endVerse: 3 }, 'chapter')).toBe(
      Number.POSITIVE_INFINITY
    )
  })
})

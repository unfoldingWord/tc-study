/**
 * Deterministic TN / scripture / catalog fixtures for Journey 4–8 highlight.
 * - Θεοῦ ↔ God via alignedOriginalWordIds (TN quote / underline)
 * - Παῦλος ↔ Paul via alignedOriginalWordIds (cross-panel token-click)
 */

export const E2E_TN_KEY = 'unfoldingWord/e2e/tn'
export const E2E_TWL_KEY = 'unfoldingWord/e2e/twl'
export const E2E_TW_KEY = 'unfoldingWord/e2e/tw'
export const E2E_ULT_KEY = 'unfoldingWord/e2e/ult'
export const E2E_UGNT_KEY = 'unfoldingWord/el-x-koine/ugnt'
export const E2E_UHB_KEY = 'unfoldingWord/hbo/uhb'

export const E2E_BOOK = 'tit'
export const E2E_QUOTE_GREEK = 'Θεοῦ'
export const E2E_QUOTE_EN = 'God'
export const E2E_PAUL_GREEK = 'Παῦλος'
export const E2E_PAUL_EN = 'Paul'
export const E2E_OL_SEMANTIC_ID = `${E2E_BOOK} 1:1:${E2E_QUOTE_GREEK}:1`
export const E2E_PAUL_OL_SEMANTIC_ID = `${E2E_BOOK} 1:1:${E2E_PAUL_GREEK}:1`
export const E2E_NOTE_ID = 'e2e-note-1'
export const E2E_NOTE_TEXT = 'E2E note about God.'

function titIngredient(path: string) {
  return {
    identifier: E2E_BOOK,
    path,
    title: 'Titus',
  }
}

function scriptureMeta(opts: {
  key: string
  owner: string
  language: string
  resourceId: string
  title: string
  subject?: string
}) {
  return {
    resourceKey: opts.key,
    id: opts.key,
    key: opts.key,
    server: 'git.door43.org',
    owner: opts.owner,
    language: opts.language,
    languageCode: opts.language,
    resourceId: opts.resourceId,
    title: opts.title,
    type: 'scripture',
    subject: opts.subject || 'Aligned Bible',
    languageDirection: 'ltr' as const,
    availability: { offline: true },
    release: { tag_name: 'v1' },
    contentMetadata: {
      ingredients: [titIngredient(`./${E2E_BOOK}.usfm`)],
    },
  }
}

export function buildE2ECatalogEntries() {
  return [
    scriptureMeta({
      key: E2E_ULT_KEY,
      owner: 'unfoldingWord',
      language: 'e2e',
      resourceId: 'ult',
      title: 'E2E ULT',
    }),
    scriptureMeta({
      key: E2E_UGNT_KEY,
      owner: 'unfoldingWord',
      language: 'el-x-koine',
      resourceId: 'ugnt',
      title: 'E2E UGNT',
      subject: 'Greek New Testament',
    }),
    scriptureMeta({
      key: E2E_UHB_KEY,
      owner: 'unfoldingWord',
      language: 'hbo',
      resourceId: 'uhb',
      title: 'E2E UHB',
      subject: 'Hebrew Bible',
    }),
    {
      resourceKey: E2E_TN_KEY,
      id: E2E_TN_KEY,
      key: E2E_TN_KEY,
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'e2e',
      languageCode: 'e2e',
      resourceId: 'tn',
      title: 'E2E Translation Notes',
      type: 'notes',
      subject: 'TSV Translation Notes',
      languageDirection: 'ltr' as const,
      availability: { offline: true },
      release: { tag_name: 'v1' },
      contentMetadata: {
        ingredients: [titIngredient(`./tn_${E2E_BOOK.toUpperCase()}.tsv`)],
      },
    },
    {
      resourceKey: E2E_TWL_KEY,
      id: E2E_TWL_KEY,
      key: E2E_TWL_KEY,
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'e2e',
      languageCode: 'e2e',
      resourceId: 'twl',
      title: 'E2E Words Links',
      type: 'words-links',
      subject: 'TSV Translation Words Links',
      languageDirection: 'ltr' as const,
      availability: { offline: true },
      release: { tag_name: 'v1' },
      contentMetadata: {
        ingredients: [titIngredient(`./twl_${E2E_BOOK.toUpperCase()}.tsv`)],
      },
    },
    {
      resourceKey: E2E_TW_KEY,
      id: E2E_TW_KEY,
      key: E2E_TW_KEY,
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'e2e',
      languageCode: 'e2e',
      resourceId: 'tw',
      title: 'E2E Translation Words',
      type: 'words',
      subject: 'TSV Translation Words',
      languageDirection: 'ltr' as const,
      availability: { offline: true },
      release: { tag_name: 'v1' },
      contentMetadata: {
        ingredients: [{ identifier: 'bible', path: './bible', title: 'Bible' }],
      },
    },
  ]
}

function wordToken(opts: {
  content: string
  occurrence?: number
  verseRef: string
  alignedOriginalWordIds?: string[]
  alignment?: {
    strong: string
    lemma: string
    morph: string
    occurrence: string
    occurrences: string
    content: string
  }
}) {
  const occurrence = opts.occurrence ?? 1
  return {
    uniqueId: `${opts.verseRef}:${opts.content}:${occurrence}`,
    content: opts.content,
    occurrence,
    totalOccurrences: 1,
    verseRef: opts.verseRef,
    position: { start: 0, end: opts.content.length },
    type: 'word' as const,
    isHighlightable: true,
    alignedOriginalWordIds: opts.alignedOriginalWordIds,
    alignment: opts.alignment,
  }
}

function processedScripture(opts: {
  bookCode: string
  language: string
  verseText: string
  tokens: ReturnType<typeof wordToken>[]
}) {
  const verseRef = `${opts.bookCode} 1:1`
  return {
    book: 'Titus',
    bookCode: opts.bookCode,
    metadata: {
      bookCode: opts.bookCode,
      bookName: 'Titus',
      processingDate: new Date().toISOString(),
      processingDuration: 0,
      version: 'e2e-1',
      hasAlignments: true,
      hasSections: false,
      totalChapters: 1,
      totalVerses: 1,
      totalParagraphs: 1,
      chapterVerseMap: { '1': 1 },
      statistics: {
        totalChapters: 1,
        totalVerses: 1,
        totalParagraphs: 1,
        totalSections: 0,
        totalAlignments: opts.tokens.length,
      },
    },
    chapters: [
      {
        number: 1,
        verseCount: 1,
        paragraphCount: 1,
        verses: [
          {
            number: 1,
            text: opts.verseText,
            reference: verseRef,
            wordTokens: opts.tokens,
          },
        ],
        paragraphs: [
          {
            id: 'p1',
            type: 'paragraph' as const,
            style: 'p' as const,
            indentLevel: 0,
            startVerse: 1,
            endVerse: 1,
            verseCount: 1,
            verseNumbers: [1],
            combinedText: opts.verseText,
            verses: [],
          },
        ],
      },
    ],
  }
}

export function buildE2ECacheEntries() {
  const note = {
    reference: '1:1',
    id: E2E_NOTE_ID,
    tags: '',
    supportReference: '',
    quote: E2E_QUOTE_GREEK,
    occurrence: '1',
    note: E2E_NOTE_TEXT,
  }

  const tnProcessed = {
    bookCode: E2E_BOOK,
    bookName: 'Titus',
    notes: [note],
    notesByChapter: { '1': [note] },
    metadata: {
      bookCode: E2E_BOOK,
      bookName: 'Titus',
      processingDate: new Date().toISOString(),
      totalNotes: 1,
      chaptersWithNotes: [1],
      statistics: {
        totalNotes: 1,
        notesPerChapter: { '1': 1 },
      },
    },
  }

  const twlLink = {
    reference: '1:1',
    id: 'e2e-twl-1',
    tags: 'kt',
    origWords: E2E_QUOTE_GREEK,
    occurrence: '1',
    twLink: 'rc://*/tw/dict/bible/kt/god',
  }

  const twlProcessed = {
    bookCode: E2E_BOOK,
    bookName: 'Titus',
    links: [twlLink],
    linksByChapter: { '1': [twlLink] },
    metadata: {
      bookCode: E2E_BOOK,
      bookName: 'Titus',
      processingDate: new Date().toISOString(),
      totalLinks: 1,
      chaptersWithLinks: [1],
      statistics: {
        totalLinks: 1,
        linksPerChapter: { '1': 1 },
        linksByCategory: { kt: 1 },
      },
    },
  }

  const ugnt = processedScripture({
    bookCode: E2E_BOOK,
    language: 'el-x-koine',
    verseText: `${E2E_PAUL_GREEK} ${E2E_QUOTE_GREEK}`,
    tokens: [
      wordToken({
        content: E2E_PAUL_GREEK,
        verseRef: `${E2E_BOOK} 1:1`,
        alignment: {
          strong: 'G3972',
          lemma: 'Παῦλος',
          morph: 'N-NMS',
          occurrence: '1',
          occurrences: '1',
          content: E2E_PAUL_GREEK,
        },
      }),
      wordToken({
        content: E2E_QUOTE_GREEK,
        verseRef: `${E2E_BOOK} 1:1`,
        alignment: {
          strong: 'G2316',
          lemma: 'θεός',
          morph: 'N-GSM',
          occurrence: '1',
          occurrences: '1',
          content: E2E_QUOTE_GREEK,
        },
      }),
    ],
  })

  const ult = processedScripture({
    bookCode: E2E_BOOK,
    language: 'e2e',
    verseText: `${E2E_PAUL_EN} ${E2E_QUOTE_EN}`,
    tokens: [
      wordToken({
        content: E2E_PAUL_EN,
        verseRef: `${E2E_BOOK} 1:1`,
        alignedOriginalWordIds: [E2E_PAUL_OL_SEMANTIC_ID],
      }),
      wordToken({
        content: E2E_QUOTE_EN,
        verseRef: `${E2E_BOOK} 1:1`,
        alignedOriginalWordIds: [E2E_OL_SEMANTIC_ID],
      }),
    ],
  })

  // Seed legacy `scripture:` keys — USJ dual-read falls back here for offline e2e.
  // Do not put ProcessedScripture under `scripture-usj:` (loader expects USJ SoT shape).
  return [
    { key: `tn:${E2E_TN_KEY}:${E2E_BOOK}`, entry: tnProcessed },
    { key: `twl:${E2E_TWL_KEY}:${E2E_BOOK}`, entry: twlProcessed },
    {
      key: `scripture:${E2E_UGNT_KEY}:${E2E_BOOK}`,
      entry: { content: ugnt, timestamp: Date.now(), resourceKey: E2E_UGNT_KEY, bookId: E2E_BOOK },
    },
    {
      key: `scripture:${E2E_ULT_KEY}:${E2E_BOOK}`,
      entry: { content: ult, timestamp: Date.now(), resourceKey: E2E_ULT_KEY, bookId: E2E_BOOK },
    },
  ]
}

function scriptureResourceEntry(opts: {
  key: string
  title: string
  language: string
  resourceId: string
  subject: string
}) {
  return {
    id: opts.key,
    key: opts.key,
    resourceKey: opts.key,
    title: opts.title,
    type: 'scripture',
    subject: opts.subject,
    owner: 'unfoldingWord',
    language: opts.language,
    languageCode: opts.language,
    resourceId: opts.resourceId,
    server: 'git.door43.org',
  }
}

export function buildE2EHelpsWorkspace() {
  return {
    id: 'e2e-helps',
    name: 'E2E Helps Workspace',
    version: '1.0.0',
    description: 'Playwright seed',
    resources: [
      [
        E2E_ULT_KEY,
        scriptureResourceEntry({
          key: E2E_ULT_KEY,
          title: 'E2E ULT',
          language: 'e2e',
          resourceId: 'ult',
          subject: 'Aligned Bible',
        }),
      ],
      [
        E2E_TN_KEY,
        {
          id: E2E_TN_KEY,
          key: E2E_TN_KEY,
          resourceKey: E2E_TN_KEY,
          title: 'E2E Translation Notes',
          type: 'notes',
          subject: 'TSV Translation Notes',
          owner: 'unfoldingWord',
          language: 'e2e',
          languageCode: 'e2e',
          resourceId: 'tn',
          server: 'git.door43.org',
        },
      ],
      [
        E2E_TWL_KEY,
        {
          id: E2E_TWL_KEY,
          key: E2E_TWL_KEY,
          resourceKey: E2E_TWL_KEY,
          title: 'E2E Words Links',
          type: 'words-links',
          subject: 'TSV Translation Words Links',
          owner: 'unfoldingWord',
          language: 'e2e',
          languageCode: 'e2e',
          resourceId: 'twl',
          server: 'git.door43.org',
        },
      ],
    ],
    panels: [
      {
        id: 'panel-1',
        name: 'Panel 1',
        resourceKeys: [E2E_ULT_KEY],
        activeIndex: 0,
        position: 0,
      },
      {
        id: 'panel-2',
        name: 'Panel 2',
        resourceKeys: [E2E_TN_KEY, E2E_TWL_KEY],
        activeIndex: 0,
        position: 1,
      },
    ],
  }
}

/** Two linked scripture panels for Paul ↔ Παῦλος cross-resource highlight. */
export function buildE2EAlignmentWorkspace() {
  return {
    id: 'e2e-alignment',
    name: 'E2E Alignment Workspace',
    version: '1.0.0',
    description: 'Playwright OL↔ULT seed',
    resources: [
      [
        E2E_ULT_KEY,
        scriptureResourceEntry({
          key: E2E_ULT_KEY,
          title: 'E2E ULT',
          language: 'e2e',
          resourceId: 'ult',
          subject: 'Aligned Bible',
        }),
      ],
      [
        E2E_UGNT_KEY,
        scriptureResourceEntry({
          key: E2E_UGNT_KEY,
          title: 'E2E UGNT',
          language: 'el-x-koine',
          resourceId: 'ugnt',
          subject: 'Greek New Testament',
        }),
      ],
    ],
    panels: [
      {
        id: 'panel-1',
        name: 'Panel 1',
        resourceKeys: [E2E_ULT_KEY],
        activeIndex: 0,
        position: 0,
      },
      {
        id: 'panel-2',
        name: 'Panel 2',
        resourceKeys: [E2E_UGNT_KEY],
        activeIndex: 0,
        position: 1,
      },
    ],
  }
}

export function buildE2ENavigationState() {
  return {
    currentReference: {
      book: E2E_BOOK,
      chapter: 1,
      verse: 1,
      endChapter: 1,
      endVerse: 1,
    },
    navigationHistory: [],
    historyIndex: -1,
    navigationMode: 'verse',
    navigationScope: 'scripture',
    obsFrameCountByStory: {},
  }
}

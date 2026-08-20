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

/** Must match `@bt-synergy/usj-processor` USJ_PROCESSING_VERSION / USJ_TOOL_VERSIONS. */
const E2E_USJ_PROCESSING_VERSION = '2.0.0-usj'
const E2E_USJ_TOOL_VERSIONS = { parser: '0.1.1', usjCore: '0.1.1' } as const

function usjWord(content: string) {
  return { type: 'char', marker: 'w', content: [content] }
}

/** Minimal USJ SoT for scripture-usj: cache (loader ignores legacy scripture:). */
function usjScriptureCacheContent(opts: {
  bookCode: string
  words: string[]
  alignmentMap?: Record<
    string,
    Array<{
      sources: Array<{
        strong: string
        lemma: string
        morph: string
        content: string
        occurrence: number
        occurrences: number
      }>
      targets: Array<{ word: string; occurrence: number; occurrences: number }>
    }>
  >
}) {
  const sid = `TIT 1:1`
  const usj = {
    type: 'USJ',
    version: '3.0',
    content: [
      {
        type: 'para',
        marker: 'p',
        content: [{ type: 'verse', sid, number: '1' }, ...opts.words.map(usjWord)],
      },
    ],
  }
  return {
    book: 'Titus',
    bookCode: opts.bookCode,
    metadata: {
      version: E2E_USJ_PROCESSING_VERSION,
      toolVersions: { ...E2E_USJ_TOOL_VERSIONS },
      processingDate: new Date().toISOString(),
      bookCode: opts.bookCode,
      bookName: 'Titus',
    },
    usj,
    alignmentMap: opts.alignmentMap ?? {},
    chapters: [{ number: 1, content: usj.content }],
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

  const ugnt = usjScriptureCacheContent({
    bookCode: E2E_BOOK,
    words: [E2E_PAUL_GREEK, E2E_QUOTE_GREEK],
  })

  // Gateway ULT: AlignmentMap attaches alignedOriginalWordIds (Paul↔Παῦλος, God↔Θεοῦ).
  const ult = usjScriptureCacheContent({
    bookCode: E2E_BOOK,
    words: [E2E_PAUL_EN, E2E_QUOTE_EN],
    alignmentMap: {
      'TIT 1:1': [
        {
          sources: [
            {
              strong: 'G3972',
              lemma: 'Παῦλος',
              morph: 'N-NMS',
              content: E2E_PAUL_GREEK,
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: E2E_PAUL_EN, occurrence: 1, occurrences: 1 }],
        },
        {
          sources: [
            {
              strong: 'G2316',
              lemma: 'θεός',
              morph: 'N-GSM',
              content: E2E_QUOTE_GREEK,
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: E2E_QUOTE_EN, occurrence: 1, occurrences: 1 }],
        },
      ],
    },
  })

  // scripture-usj: only — legacy scripture: is ignored by ScriptureLoader (c0f101f).
  return [
    { key: `tn:${E2E_TN_KEY}:${E2E_BOOK}`, entry: tnProcessed },
    { key: `twl:${E2E_TWL_KEY}:${E2E_BOOK}`, entry: twlProcessed },
    {
      key: `scripture-usj:${E2E_UGNT_KEY}:${E2E_BOOK}`,
      entry: { content: ugnt, timestamp: Date.now(), resourceKey: E2E_UGNT_KEY, bookId: E2E_BOOK },
    },
    {
      key: `scripture-usj:${E2E_ULT_KEY}:${E2E_BOOK}`,
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

/**
 * Documentation registry for studio signals (discovery / docs only).
 * Not used at runtime by viewers — see `studioEventSignals` + `studioStateSignals`.
 */

export const STUDIO_SIGNAL_REGISTRY = {
  'verse-navigation': {
    description: 'Navigate to a specific verse in scripture',
    typicalSenders: ['words-links', 'notes', 'questions'],
    typicalReceivers: ['scripture'],
    example: {
      type: 'verse-navigation',
      verse: { book: 'JHN', chapter: 3, verse: 16 },
    },
  },
  'book-navigation': {
    description: 'Navigate to a book/chapter',
    typicalSenders: ['toc', 'navigation-ui'],
    typicalReceivers: ['scripture', 'notes', 'questions'],
    example: {
      type: 'book-navigation',
      location: { book: 'GEN', chapter: 1 },
    },
  },
  'token-click': {
    description:
      'Word/token clicked in scripture; token=null clears the active highlight and helps token filter',
    typicalSenders: ['scripture'],
    typicalReceivers: ['words-links', 'original-language', 'combined-helps', 'notes'],
    example: {
      type: 'token-click',
      token: {
        id: 'token-1',
        content: 'λόγος',
        semanticId: 'G3056',
        verseRef: 'JHN 1:1',
        position: 1,
      },
    },
  },
  'verse-filter': {
    description:
      'Filter entries by verse or chapter click in scripture; filter=null clears a prior verse filter',
    typicalSenders: ['scripture'],
    typicalReceivers: ['notes', 'words-links', 'combined-helps'],
    example: {
      type: 'verse-filter',
      filter: { chapter: 3, verse: 5 },
    },
  },
  'entry-link-click': {
    description: 'Resource entry link clicked',
    typicalSenders: ['words-links', 'notes'],
    typicalReceivers: ['words', 'academy'],
    example: {
      type: 'entry-link-click',
      link: {
        resourceType: 'words',
        resourceId: 'unfoldingWord/en_tw',
        entryId: 'bible/kt/grace',
        text: 'grace',
      },
    },
  },
  'text-selection': {
    description: 'Text selected/highlighted',
    typicalSenders: ['scripture', 'any-text-viewer'],
    typicalReceivers: ['notes', 'translation-draft'],
    example: {
      type: 'text-selection',
      selection: {
        text: 'In the beginning',
        verseRef: 'GEN 1:1',
        startOffset: 0,
        endOffset: 16,
        book: 'GEN',
        chapter: 1,
        verse: 1,
      },
    },
  },
  'scroll-sync': {
    description: 'Synchronize scrolling between panels',
    typicalSenders: ['scripture-anchor'],
    typicalReceivers: ['scripture', 'notes'],
    example: {
      type: 'scroll-sync',
      scroll: {
        verseRef: 'JHN 3:16',
        percentage: 0.5,
        book: 'JHN',
        chapter: 3,
        verse: 16,
      },
    },
  },
  'scripture-tokens-broadcast': {
    description: 'Broadcast current scripture tokens (state message)',
    typicalSenders: ['scripture'],
    typicalReceivers: ['words-links', 'notes'],
    example: {
      type: 'scripture-tokens-broadcast',
      lifecycle: 'state',
      stateKey: 'current-scripture-tokens',
      sourceResourceId: 'panel-1',
      reference: { book: 'JHN', chapter: 3, verse: 16 },
      tokens: [],
      resourceMetadata: { id: 'ult', language: 'en', type: 'scripture' },
      timestamp: Date.now(),
    },
  },
  'notes-token-groups': {
    description: 'Broadcast all TN/TWL quote token semantic IDs for passive scripture underlining',
    typicalSenders: ['notes', 'words-links'],
    typicalReceivers: ['scripture'],
    example: {
      type: 'notes-token-groups',
      lifecycle: 'state',
      stateKey: 'current-notes-token-groups-tn',
      sourceResourceId: 'panel-tn-1',
      tokenGroups: [{ sourceId: 'note-1', semanticIds: ['tit 1:1:Θεός:1'] }],
      resourceMetadata: { id: 'en_tn', language: 'en', type: 'tn' },
      timestamp: Date.now(),
    },
  },
  'scripture-content-request': {
    description: 'Request scripture content from active panels (DEPRECATED)',
    typicalSenders: ['words-links', 'notes'],
    typicalReceivers: ['scripture'],
    deprecated: true,
    example: {
      type: 'scripture-content-request',
      request: {
        book: 'JHN',
        chapter: 3,
        verse: 16,
        resourceType: 'scripture',
      },
    },
  },
  'scripture-content-response': {
    description: 'Response to scripture content request (DEPRECATED)',
    typicalSenders: ['scripture'],
    typicalReceivers: ['words-links', 'notes'],
    deprecated: true,
    example: {
      type: 'scripture-content-response',
      response: {
        requestId: '12345',
        resourceId: 'panel-1',
        resourceKey: 'unfoldingWord/en/ult',
        book: 'JHN',
        chapter: 3,
        hasContent: true,
        content: {},
      },
    },
  },
  'obs-frame-quotes': {
    description: 'Broadcast OBS TN/TWL quote slices for current story/frame',
    typicalSenders: ['combined-helps'],
    typicalReceivers: ['obs'],
    example: {
      type: 'obs-frame-quotes',
      lifecycle: 'state',
      stateKey: 'current-obs-frame-quotes-tn',
      sourceResourceId: 'panel-2',
      storyNumber: 1,
      frameNumber: 1,
      quotes: [{ sourceId: 'r1', kind: 'tn', quote: 'the beginning', occurrence: 1 }],
      timestamp: Date.now(),
    },
  },
  'obs-frame-highlight': {
    description: 'Select or clear OBS frame substring highlight (bidirectional)',
    typicalSenders: ['combined-helps', 'obs'],
    typicalReceivers: ['combined-helps', 'obs'],
    example: {
      type: 'obs-frame-highlight',
      lifecycle: 'event',
      sourceResourceId: 'panel-1',
      highlight: { storyNumber: 1, frameNumber: 1, quote: 'the beginning', occurrence: 1 },
      timestamp: Date.now(),
    },
  },
} as const

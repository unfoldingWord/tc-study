import { describe, expect, test } from 'bun:test'
import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import { ensurePreparersRegistered } from '../prepare/registerPreparers'
import { runWarmAlignChapter, runWarmPrepareUnit, runWarmQuoteChapter } from './warmJobs'
import type { WarmAlignChapterJob, WarmQuoteChapterJob } from './warmTypes'

const TN_KEY = 'unfoldingWord/en/tn'
const OL_KEY = 'unfoldingWord/el-x-koine/ugnt'
const ULT_KEY = 'unfoldingWord/en/ult'

const notesWithQuote: ProcessedNotes = {
  bookCode: 'tit',
  bookName: 'Titus',
  notes: [
    {
      reference: '1:1',
      id: 'n1',
      tags: '',
      supportReference: '',
      quote: 'Παῦλος',
      occurrence: '1',
      note: 'Paul',
    },
  ],
  notesByChapter: {
    '1': [
      {
        reference: '1:1',
        id: 'n1',
        tags: '',
        supportReference: '',
        quote: 'Παῦλος',
        occurrence: '1',
        note: 'Paul',
      },
    ],
  },
  metadata: {
    bookCode: 'tit',
    bookName: 'Titus',
    processingDate: new Date().toISOString(),
    totalNotes: 1,
    chaptersWithNotes: [1],
    statistics: { totalNotes: 1, notesPerChapter: { '1': 1 } },
  },
}

const emptyNotes: ProcessedNotes = {
  ...notesWithQuote,
  notes: [],
  notesByChapter: { '1': [] },
  metadata: {
    ...notesWithQuote.metadata!,
    totalNotes: 0,
    statistics: { totalNotes: 0, notesPerChapter: { '1': 0 } },
  },
}

function createFakeAdapter(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
  }
}

const quoteJob: WarmQuoteChapterJob = {
  jobKey: 'quote:tn:tit:1',
  lane: 2,
  kind: 'quote-chapter',
  resourceKey: TN_KEY,
  bookId: 'tit',
  chapter: 1,
  helpsStamp: 'tn1',
  olKey: OL_KEY,
  olStamp: 'ol1',
  helpsType: 'notes',
}

const alignJob: WarmAlignChapterJob = {
  jobKey: 'align:tn:ult:tit:1',
  lane: 2,
  kind: 'align-chapter',
  resourceKey: TN_KEY,
  bookId: 'tit',
  chapter: 1,
  helpsStamp: 'tn1',
  olKey: OL_KEY,
  olStamp: 'ol1',
  targetKey: ULT_KEY,
  targetStamp: 'ult1',
  helpsType: 'notes',
}

describe('warm quote/align outcomes', () => {
  test('empty chapter is cached; missing OL USFM is blocked', async () => {
    ensurePreparersRegistered()
    const emptyCache = createFakeAdapter({
      [`tn:${TN_KEY}:tit`]: emptyNotes,
    })
    expect(await runWarmQuoteChapter(emptyCache, quoteJob, () => false)).toBe('cached')

    const missingOl = createFakeAdapter({
      [`tn:${TN_KEY}:tit`]: notesWithQuote,
    })
    expect(await runWarmQuoteChapter(missingOl, quoteJob, () => false)).toBe('blocked')
    expect(await runWarmAlignChapter(missingOl, alignJob, () => false)).toBe('blocked')
  })

  test('missing local SoT is blocked (no DCS crawl)', async () => {
    ensurePreparersRegistered()
    const empty = createFakeAdapter()
    expect(await runWarmQuoteChapter(empty, quoteJob, () => false)).toBe('blocked')
    expect(await runWarmAlignChapter(empty, alignJob, () => false)).toBe('blocked')
    expect(
      await runWarmPrepareUnit(
        empty,
        {
          jobKey: 'prep:notes:tit:1',
          lane: 3,
          kind: 'prepare-unit',
          resourceKey: TN_KEY,
          bookId: 'tit',
          typeId: 'notes',
          unit: 1,
          tier: 'both',
        },
        () => false
      )
    ).toBe('blocked')
  })
})

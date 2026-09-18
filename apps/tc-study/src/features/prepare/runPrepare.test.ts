import { describe, expect, test } from 'bun:test'
import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import { NOTES_PREPARE_VERSION } from '../notes/notesPreparer'
import { ensurePreparersRegistered } from './registerPreparers'
import { preparedUnitKey } from './prepareKeys'
import { readPreparedUnit } from './prepareCache'
import { prepareBookWithPreparer } from './runPrepare'

const sampleNotes: ProcessedNotes = {
  bookCode: 'tit',
  bookName: 'Titus',
  notes: [
    {
      reference: '1:1',
      id: 'abc1',
      tags: '',
      supportReference: '',
      quote: 'Παῦλος',
      occurrence: '1',
      note: 'Paul is an apostle.',
    },
  ],
  notesByChapter: {
    '1': [
      {
        reference: '1:1',
        id: 'abc1',
        tags: '',
        supportReference: '',
        quote: 'Παῦλος',
        occurrence: '1',
        note: 'Paul is an apostle.',
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

function createFakeAdapter() {
  const store = new Map<string, unknown>()
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

describe('prepareBookWithPreparer skip existing', () => {
  test('skips rewrite when versioned light+full already exist', async () => {
    ensurePreparersRegistered()
    const cache = createFakeAdapter()
    const args = {
      typeId: 'notes',
      resourceKey: 'unfoldingWord/en/tn',
      bookId: 'tit',
      cacheAdapter: cache,
      source: {
        resourceKey: 'unfoldingWord/en/tn',
        bookId: 'tit',
        notes: sampleNotes,
      },
    }

    const first = await prepareBookWithPreparer(args)
    expect(first.unitsWritten).toBe(1)
    const lightKey = preparedUnitKey('notes', args.resourceKey, 'tit', 1, 'light')
    const firstLight = cache.store.get(lightKey)
    expect(firstLight).toBeTruthy()

    const second = await prepareBookWithPreparer(args)
    expect(second.unitsWritten).toBe(0)
    expect(cache.store.get(lightKey)).toBe(firstLight)

    const existing = await readPreparedUnit(
      cache,
      'notes',
      args.resourceKey,
      'tit',
      1,
      'full',
      NOTES_PREPARE_VERSION
    )
    expect(existing).toBeTruthy()
  })
})

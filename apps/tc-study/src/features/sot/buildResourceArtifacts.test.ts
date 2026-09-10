import { describe, expect, test } from 'bun:test'
import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { helpsQuoteKey } from '../helps/helpsQuoteCache'
import { NOTES_PREPARE_VERSION } from '../notes/notesPreparer'
import { preparedUnitKey } from '../prepare/prepareKeys'
import { readPreparedUnit } from '../prepare/prepareCache'
import { ensurePreparersRegistered } from '../prepare/registerPreparers'
import { buildResourceArtifacts } from './buildResourceArtifacts'

const notes: ProcessedNotes = {
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

const quoteArgs = {
  helpsStamp: 'tn1',
  olKey: 'unfoldingWord/el-x-koine/ugnt',
  olStamp: 'ol1',
  tokensByLinkId: {
    n1: [{ id: 1, text: 'Παῦλος', type: 'word', occurrence: 1, content: 'Παῦλος' }],
  },
}

describe('buildResourceArtifacts', () => {
  test('writes the same prepared + helps-quote keys from IDB SoT or DCS fixture', async () => {
    ensurePreparersRegistered()
    const fromIdb = createFakeAdapter()
    const fromDcs = createFakeAdapter()
    const shared = {
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      resourceKey: 'unfoldingWord/en/tn',
      book: 'tit',
      chapter: 1,
      quote: quoteArgs,
    }

    const a = await buildResourceArtifacts({ ...shared, sot: notes, cache: fromIdb })
    const b = await buildResourceArtifacts({
      ...shared,
      sot: notes,
      cache: fromDcs,
    })

    const preparedFull = preparedUnitKey(
      RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      shared.resourceKey,
      'tit',
      1,
      'full'
    )
    const quoteKey = helpsQuoteKey({
      helpsKey: shared.resourceKey,
      helpsStamp: quoteArgs.helpsStamp,
      olKey: quoteArgs.olKey,
      olStamp: quoteArgs.olStamp,
      book: 'tit',
      chapter: 1,
    })

    expect(a.preparedKeys).toContain(preparedFull)
    expect(b.preparedKeys).toEqual(a.preparedKeys)
    expect(a.quoteKey).toBe(quoteKey)
    expect(b.quoteKey).toBe(quoteKey)
    expect(fromIdb.store.has(preparedFull)).toBe(true)
    expect(fromDcs.store.has(preparedFull)).toBe(true)
    expect(fromIdb.store.has(quoteKey)).toBe(true)
    expect(fromDcs.store.has(quoteKey)).toBe(true)

    const idbFull = await readPreparedUnit(
      fromIdb,
      RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      shared.resourceKey,
      'tit',
      1,
      'full',
      NOTES_PREPARE_VERSION
    )
    const dcsFull = await readPreparedUnit(
      fromDcs,
      RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      shared.resourceKey,
      'tit',
      1,
      'full',
      NOTES_PREPARE_VERSION
    )
    expect(idbFull).toBeTruthy()
    expect(dcsFull).toBeTruthy()
  })
})

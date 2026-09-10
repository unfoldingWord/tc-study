import { describe, expect, test } from 'bun:test'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { usjScriptureKey } from '@bt-synergy/scripture-loader'
import { getLocalSoT, getSoT } from './getSoT'
import { isUsjViewModel } from './sotDebug'
import { sotCacheKey } from './sotCacheKey'

function createFakeCache(initial: Record<string, unknown> = {}) {
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

describe('isUsjViewModel', () => {
  test('rejects processed scripture-usj rows (chapters.content, no verses)', () => {
    expect(
      isUsjViewModel({
        usj: { type: 'USJ', content: [] },
        chapters: [{ number: 1, content: [] }],
      })
    ).toBe(false)
  })

  test('accepts loader viewModel with verses', () => {
    expect(isUsjViewModel({ chapters: [{ number: 1, verses: [] }] })).toBe(true)
  })
})

describe('getSoT', () => {
  test('IDB hit does not call DCS', async () => {
    const key = sotCacheKey({
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
    })
    expect(key).toBe(usjScriptureKey('unfoldingWord/en/ult', 'tit'))
    const cache = createFakeCache({ [key]: { usj: true } })
    let dcsCalls = 0
    const result = await getSoT({
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
      chapter: 1,
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      cache,
      allowDcs: true,
      fetchDcs: async () => {
        dcsCalls += 1
        return { from: 'dcs' }
      },
    })
    expect(result.status).toBe('hit')
    if (result.status === 'hit') {
      expect(result.source).toBe('idb')
      expect(result.payload).toEqual({ usj: true })
    }
    expect(dcsCalls).toBe(0)
  })

  test('IDB miss calls DCS once for that book/chapter and writes SoT key', async () => {
    const cache = createFakeCache()
    const seen: Array<{ book: string; chapter?: number }> = []
    const result = await getSoT({
      resourceKey: 'unfoldingWord/en/tn',
      book: 'tit',
      chapter: 1,
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      cache,
      allowDcs: true,
      fetchDcs: async ({ book, chapter }) => {
        seen.push({ book, chapter })
        return { notes: [{ id: 'n1' }] }
      },
    })
    expect(seen).toEqual([{ book: 'tit', chapter: 1 }])
    expect(result.status).toBe('hit')
    if (result.status === 'hit') expect(result.source).toBe('dcs')
    const stored = await cache.get(
      sotCacheKey({
        typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
        resourceKey: 'unfoldingWord/en/tn',
        book: 'tit',
      })
    )
    expect(stored).toEqual({ notes: [{ id: 'n1' }] })
  })

  test('warm/local resolve never calls DCS when SoT is missing', async () => {
    const cache = createFakeCache()
    let dcsCalls = 0
    const result = await getLocalSoT({
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
      chapter: 1,
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      cache,
    })
    expect(result.status).toBe('missing')
    expect(dcsCalls).toBe(0)
    const withFetchIgnored = await getSoT({
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      cache,
      allowDcs: false,
      fetchDcs: async () => {
        dcsCalls += 1
        return { leaked: true }
      },
    })
    expect(withFetchIgnored.status).toBe('missing')
    expect(dcsCalls).toBe(0)
  })

  test('DCS scripture viewModel is not written to scripture-usj', async () => {
    const cache = createFakeCache()
    const viewModel = { chapters: [{ number: 1, verses: [{ number: 1 }] }] }
    const result = await getSoT({
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
      chapter: 1,
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      cache,
      allowDcs: true,
      fetchDcs: async () => viewModel,
    })
    expect(result.status).toBe('hit')
    if (result.status === 'hit') expect(result.source).toBe('dcs')
    const stored = await cache.get(
      sotCacheKey({
        typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
        resourceKey: 'unfoldingWord/en/ult',
        book: 'tit',
      })
    )
    expect(stored).toBeNull()
  })
})

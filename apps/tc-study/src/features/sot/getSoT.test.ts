import { describe, expect, test } from 'bun:test'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { usjScriptureChapterKey, usjScriptureKey } from '@bt-synergy/scripture-loader'
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
  test('IDB hit for ult:tit:1 uses the chapter key and does not call DCS', async () => {
    const key = sotCacheKey({
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
      chapter: 1,
    })
    expect(key).toBe(usjScriptureChapterKey('unfoldingWord/en/ult', 'tit', 1))
    expect(key).not.toBe(usjScriptureKey('unfoldingWord/en/ult', 'tit'))
    const chapterContent = {
      book: 'Titus',
      bookCode: 'tit',
      metadata: {
        version: '2.1.0-usj',
        toolVersions: { parser: '0.1.1', usjCore: '0.1.1' },
        processingDate: '2026-01-01T00:00:00.000Z',
        bookCode: 'tit',
        bookName: 'Titus',
      },
      usj: { type: 'USJ', version: '3.0', content: [{ c: 1 }] },
      chapters: [{ number: 1, content: [{ c: 1 }] }],
    }
    const cache = createFakeCache({ [key]: { content: chapterContent } })
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
      expect(result.key).toBe(key)
      expect(result.payload).toEqual({ content: chapterContent })
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
        chapter: 1,
      })
    )
    expect(stored).toBeNull()
    expect(await cache.get(usjScriptureKey('unfoldingWord/en/ult', 'tit'))).toBeNull()
  })

  test('DCS UsjScriptureCacheContent persists chapter keys with prioritize', async () => {
    const cache = createFakeCache()
    const cacheContent = {
      book: 'Titus',
      bookCode: 'tit',
      metadata: {
        version: '2.1.0-usj',
        toolVersions: { parser: '0.1.1', usjCore: '0.1.1' },
        processingDate: '2026-01-01T00:00:00.000Z',
        bookCode: 'tit',
        bookName: 'Titus',
      },
      usj: { type: 'USJ', version: '3.0', content: [{ c: 1 }, { c: 2 }] },
      alignmentMap: { 'TIT 1:1': [], 'TIT 2:1': [] },
      chapters: [
        { number: 1, content: [{ c: 1 }] },
        { number: 2, content: [{ c: 2 }] },
      ],
    }
    const viewModel = { chapters: [{ number: 1, verses: [{ number: 1 }] }] }
    const result = await getSoT({
      resourceKey: 'unfoldingWord/en/ult',
      book: 'tit',
      chapter: 1,
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      cache,
      allowDcs: true,
      fetchDcs: async () => cacheContent,
    })
    expect(result.status).toBe('hit')
    if (result.status === 'hit') expect(result.source).toBe('dcs')

    const chapter1 = await cache.get(usjScriptureChapterKey('unfoldingWord/en/ult', 'tit', 1))
    expect(chapter1).toBeTruthy()
    const chapter1Content = (chapter1 as { content: { chapters?: Array<{ verses?: unknown }> } })
      .content
    expect(chapter1Content.chapters?.[0]?.verses).toBeUndefined()

    const index = await cache.get(usjScriptureKey('unfoldingWord/en/ult', 'tit'))
    expect(index).toBeTruthy()
    const indexContent = (index as { content: { chapterNumbers?: number[]; usj?: unknown } }).content
    expect(indexContent.chapterNumbers).toEqual([1, 2])
    expect(indexContent.usj).toBeUndefined()

    expect(isUsjViewModel(indexContent)).toBe(false)
    expect(isUsjViewModel(chapter1Content)).toBe(false)
    expect(isUsjViewModel(viewModel)).toBe(true)
  })
})

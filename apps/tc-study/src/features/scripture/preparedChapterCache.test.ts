import { beforeEach, describe, expect, test } from 'bun:test'
import { preparedUnitKey } from '../prepare/prepareKeys'
import type { PrepareCacheAdapter } from '../prepare/prepareRegistry'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  clearPreparedChapterCache,
  getBookLightChapterCount,
  peekPreparedChapter,
  prefetchPreparedBookLight,
  seedPreparedChapter,
} from './preparedChapterCache'
import {
  SCRIPTURE_PREPARE_VERSION,
  type ScriptureLightChapter,
} from './scripturePreparer'

function lightChapter(unit: number): ScriptureLightChapter {
  return {
    version: SCRIPTURE_PREPARE_VERSION,
    unit,
    blocks: [
      {
        marker: 'p',
        role: 'para',
        indentLevel: 0,
        chapterNumber: unit,
        verseNumbers: [1],
        inline: [
          { kind: 'verse', chapterNumber: unit, verseNumber: 1 },
          { kind: 'text', text: ` Chapter ${unit} text` },
        ],
      },
    ],
  }
}

function memoryCache(seed: Record<string, unknown>): PrepareCacheAdapter {
  const store = new Map(Object.entries(seed))
  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, value: unknown) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
    async clear() {
      store.clear()
    },
    async keys() {
      return [...store.keys()]
    },
  } as PrepareCacheAdapter
}

function lightKey(resourceKey: string, bookId: string, chapter: number): string {
  return preparedUnitKey(
    RESOURCE_TYPE_IDS.SCRIPTURE,
    resourceKey,
    bookId,
    chapter,
    'light'
  )
}

describe('preparedChapterCache book light preload', () => {
  beforeEach(() => {
    clearPreparedChapterCache()
  })

  test('prefetchPreparedBookLight fills book map; peek returns light without full', async () => {
    const resourceKey = 'u/en/ult'
    const bookId = 'tit'
    const cache = memoryCache({
      [lightKey(resourceKey, bookId, 1)]: {
        content: lightChapter(1),
        version: SCRIPTURE_PREPARE_VERSION,
        timestamp: 1,
      },
      [lightKey(resourceKey, bookId, 2)]: {
        content: lightChapter(2),
        version: SCRIPTURE_PREPARE_VERSION,
        timestamp: 1,
      },
      [lightKey(resourceKey, bookId, 3)]: {
        content: lightChapter(3),
        version: SCRIPTURE_PREPARE_VERSION,
        timestamp: 1,
      },
    })

    const loaded = await prefetchPreparedBookLight(cache, resourceKey, bookId, [1, 2, 3])
    expect(loaded).toBe(3)
    expect(getBookLightChapterCount(resourceKey, bookId)).toBe(3)

    const peeked = peekPreparedChapter(resourceKey, bookId, 2)
    expect(peeked?.light?.unit).toBe(2)
    expect(peeked?.full).toBeNull()
    expect(peeked?.light?.blocks[0]?.inline.some((i) => i.kind === 'verse')).toBe(true)
  })

  test('switching book drops previous book light map', async () => {
    const cacheTit = memoryCache({
      [lightKey('u/en/ult', 'tit', 1)]: {
        content: lightChapter(1),
        version: SCRIPTURE_PREPARE_VERSION,
        timestamp: 1,
      },
    })
    await prefetchPreparedBookLight(cacheTit, 'u/en/ult', 'tit', [1])
    expect(getBookLightChapterCount('u/en/ult', 'tit')).toBe(1)

    const cacheJon = memoryCache({
      [lightKey('u/en/ult', 'jon', 1)]: {
        content: lightChapter(1),
        version: SCRIPTURE_PREPARE_VERSION,
        timestamp: 1,
      },
      [lightKey('u/en/ult', 'jon', 2)]: {
        content: lightChapter(2),
        version: SCRIPTURE_PREPARE_VERSION,
        timestamp: 1,
      },
    })
    await prefetchPreparedBookLight(cacheJon, 'u/en/ult', 'jon', [1, 2])
    expect(getBookLightChapterCount('u/en/ult', 'tit')).toBe(0)
    expect(getBookLightChapterCount('u/en/ult', 'jon')).toBe(2)
    expect(peekPreparedChapter('u/en/ult', 'tit', 1)?.light).toBeFalsy()
    expect(peekPreparedChapter('u/en/ult', 'jon', 2)?.light?.unit).toBe(2)
  })

  test('seedPreparedChapter also writes book light map', () => {
    seedPreparedChapter('u/en/ult', 'tit', 1, { light: lightChapter(1) })
    expect(getBookLightChapterCount('u/en/ult', 'tit')).toBe(1)
    expect(peekPreparedChapter('u/en/ult', 'tit', 1)?.light?.unit).toBe(1)
  })
})

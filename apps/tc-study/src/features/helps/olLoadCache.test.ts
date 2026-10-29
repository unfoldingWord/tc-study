import { describe, expect, test } from 'bun:test'
import {
  clearOlLoadCacheForTests,
  loadOriginalLanguageChapters,
  olLoadCacheKey,
  resolveOriginalLanguageKey,
} from './olLoadCache'

describe('olLoadCache', () => {
  test('olLoadCacheKey is stable', () => {
    expect(olLoadCacheKey('uw/ugnt', 'TIT', 1, 2)).toBe('uw/ugnt|tit|1|2')
  })

  test('resolveOriginalLanguageKey picks UGNT for NT', () => {
    expect(resolveOriginalLanguageKey('tit')?.resourceKey).toContain('ugnt')
    expect(resolveOriginalLanguageKey('gen')?.resourceKey).toContain('uhb')
    expect(resolveOriginalLanguageKey('psa')?.resourceKey).toBe('unfoldingWord/hbo/uhb')
    expect(resolveOriginalLanguageKey('obs')).toBeNull()
  })

  test('concurrent loads share one promise', async () => {
    clearOlLoadCacheForTests()
    let calls = 0
    const loader = {
      loadViewModel: async () => {
        calls += 1
        await new Promise((r) => setTimeout(r, 5))
        return {
          bookCode: 'tit',
          chapters: [] as Array<{ number: number }>,
        }
      },
    }

    const a = loadOriginalLanguageChapters({
      loader: loader as never,
      olKey: 'uw/ugnt',
      bookId: 'tit',
      startChapter: 1,
      endChapter: 1,
    })
    const b = loadOriginalLanguageChapters({
      loader: loader as never,
      olKey: 'uw/ugnt',
      bookId: 'tit',
      startChapter: 1,
      endChapter: 1,
    })
    await Promise.all([a, b])
    expect(calls).toBe(1)
  })
})

describe('olLoadCache failures', () => {
  test('a load that fails rejects for its callers only: no second, unhandled rejection', async () => {
    clearOlLoadCacheForTests()
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const loader = {
        loadViewModel: async () => {
          throw new Error('Resource metadata not found for unfoldingWord/hbo/uhb')
        },
      }
      await expect(
        loadOriginalLanguageChapters({ loader: loader as never, olKey: 'unfoldingWord/hbo/uhb', bookId: 'rut', startChapter: 1, endChapter: 1 })
      ).rejects.toThrow('Resource metadata not found')
      await new Promise((r) => setTimeout(r, 20))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

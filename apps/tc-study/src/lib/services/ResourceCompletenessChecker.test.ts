import { describe, expect, test } from 'bun:test'
import {
  hasIngredientPayload,
  ingredientCacheKeyFor,
  isScriptureBookComplete,
  ResourceCompletenessChecker,
  scriptureChapterNumbers,
} from './ResourceCompletenessChecker'

const usjChapter = {
  content: {
    usj: { type: 'USJ', content: [{ c: 1 }] },
    chapters: [{ number: 1, content: [{ c: 1 }] }],
  },
}

describe('hasIngredientPayload', () => {
  test('does not treat a thin chapterNumbers index as a downloaded book', () => {
    expect(
      hasIngredientPayload({ content: { chapterNumbers: [1, 2, 3] } }, 'scripture')
    ).toBe(false)
    expect(hasIngredientPayload({ chapterNumbers: [1] }, 'scripture')).toBe(false)
  })

  test('treats chapter usj/chapters payload as usable scripture', () => {
    expect(hasIngredientPayload(usjChapter, 'scripture')).toBe(true)
  })

  test('rejects empty or missing scripture payloads', () => {
    expect(hasIngredientPayload(null, 'scripture')).toBe(false)
    expect(hasIngredientPayload(undefined, 'scripture')).toBe(false)
    expect(hasIngredientPayload({}, 'scripture')).toBe(false)
    expect(hasIngredientPayload({ content: {} }, 'scripture')).toBe(false)
    expect(hasIngredientPayload({ content: { chapterNumbers: [] } }, 'scripture')).toBe(
      false
    )
  })
})

describe('isScriptureBookComplete', () => {
  test('thin index without chapter payloads is incomplete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [1, 119] } },
        firstChapter: null,
        lastChapter: null,
      })
    ).toBe(false)
  })

  test('thin index plus first and last chapter payloads is complete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [1, 119] } },
        firstChapter: usjChapter,
        lastChapter: {
          content: {
            usj: { type: 'USJ', content: [{ c: 119 }] },
            chapters: [{ number: 119, content: [{ c: 119 }] }],
          },
        },
      })
    ).toBe(true)
  })

  test('chapter-1 alone without an index does not credit the book', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: null,
        firstChapter: usjChapter,
        lastChapter: usjChapter,
      })
    ).toBe(false)
  })

  test('thin one-chapter Psalms index is not complete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [1] } },
        firstChapter: usjChapter,
        lastChapter: usjChapter,
        bookId: 'psa',
      })
    ).toBe(false)
  })

  test('legacy full-book usj blob is complete without chapter keys', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: usjChapter,
        firstChapter: null,
        lastChapter: null,
      })
    ).toBe(true)
  })
})

describe('ingredientCacheKeyFor', () => {
  test('scripture book ids are lowercased to match chapter SoT keys', () => {
    expect(ingredientCacheKeyFor('scripture', 'unfoldingWord/en/ult', 'PSA')).toBe(
      'scripture-usj:unfoldingWord/en/ult:psa'
    )
  })
})

describe('scriptureChapterNumbers', () => {
  test('reads wrapped and raw indexes', () => {
    expect(scriptureChapterNumbers({ content: { chapterNumbers: [1, 2] } })).toEqual([
      1, 2,
    ])
    expect(scriptureChapterNumbers({ chapterNumbers: [119] })).toEqual([119])
    expect(scriptureChapterNumbers(null)).toEqual([])
  })
})

describe('checkResource failFast', () => {
  test('stops walking ingredients after the first miss', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'notes',
          contentMetadata: {
            ingredients: [{ identifier: 'tit' }, { identifier: 'gen' }, { identifier: 'mat' }],
          },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          return null
        },
      } as never,
    })
    const status = await checker.checkResource('unfoldingWord/en/tn', { failFast: true })
    expect(status.isComplete).toBe(false)
    expect(gets.filter((k) => k.startsWith('tn:'))).toEqual(['tn:unfoldingWord/en/tn:tit'])
  })

  test('full check walks every ingredient when failFast is off', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'notes',
          contentMetadata: {
            ingredients: [{ identifier: 'tit' }, { identifier: 'gen' }],
          },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          return null
        },
      } as never,
    })
    await checker.checkResource('unfoldingWord/en/tn')
    expect(gets.filter((k) => k.startsWith('tn:'))).toEqual([
      'tn:unfoldingWord/en/tn:tit',
      'tn:unfoldingWord/en/tn:gen',
    ])
  })
})

describe('markCompleteIfVerified', () => {
  function makeChecker(store: Map<string, unknown>, ingredients = [{ identifier: 'psa' }]) {
    return new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'scripture',
          contentMetadata: { ingredients },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, entry: unknown) => {
          store.set(key, entry)
        },
      } as never,
    })
  }

  test('does not markComplete when checkResource is incomplete', async () => {
    const store = new Map<string, unknown>()
    const checker = makeChecker(store)
    const marked = await checker.markCompleteIfVerified('unfoldingWord/en/ult', {
      downloadMethod: 'zip',
    })
    expect(marked).toBe(false)
    expect(store.has('resource:unfoldingWord/en/ult')).toBe(false)
  })
})

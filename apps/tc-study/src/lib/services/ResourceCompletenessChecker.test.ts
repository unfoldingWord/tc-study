import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hasIngredientPayload,
  ingredientCacheKeyFor,
  ingredientsForCompletenessCheck,
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

  test('obs story ids are padded to match ObsLoader keys', () => {
    expect(ingredientCacheKeyFor('obs', 'unfoldingWord/en/obs', '1')).toBe(
      'obs:unfoldingWord/en/obs:01'
    )
  })

  test('obs-notes / obs-twl / obs-tq map to tn/twl/tq prefixes', () => {
    expect(ingredientCacheKeyFor('obs-notes', 'uw/en/obs-tn', 'obs')).toBe(
      'tn:uw/en/obs-tn:obs'
    )
    expect(ingredientCacheKeyFor('obs-words-links', 'uw/en/obs-twl', 'obs')).toBe(
      'twl:uw/en/obs-twl:obs'
    )
    expect(ingredientCacheKeyFor('obs-questions', 'uw/en/obs-tq', 'obs')).toBe(
      'tq:uw/en/obs-tq:obs'
    )
  })
})

describe('ingredientsForCompletenessCheck', () => {
  test('expands directory-only OBS ingredient to 50 stories', () => {
    const ids = ingredientsForCompletenessCheck('obs', [{ identifier: 'obs' }])
    expect(ids).toHaveLength(50)
    expect(ids?.[0]?.identifier).toBe('01')
    expect(ids?.[49]?.identifier).toBe('50')
  })

  test('passes through non-OBS ingredients', () => {
    const ings = [{ identifier: 'tit' }]
    expect(ingredientsForCompletenessCheck('notes', ings)).toBe(ings)
  })
})

describe('hasIngredientPayload obs', () => {
  test('treats parsed story content as usable', () => {
    expect(
      hasIngredientPayload(
        {
          content: {
            storyNumber: 1,
            title: 'Creation',
            frames: [{ frameNumber: 1, imageUrl: 'a.jpg', text: 'hi' }],
          },
        },
        'obs'
      )
    ).toBe(true)
  })

  test('rejects empty OBS stubs', () => {
    expect(hasIngredientPayload({ content: {} }, 'obs')).toBe(false)
    expect(hasIngredientPayload(null, 'obs')).toBe(false)
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

  test('failFast does not yield between complete books', () => {
    const src = readFileSync(join(import.meta.dir, 'ResourceCompletenessChecker.ts'), 'utf8')
    expect(src).toContain('if (!failFast && i + 1 < ingredients.length)')
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

describe('checkResource stamped ingest receipt', () => {
  const stamp = 'v45#2024-01-01T00_00_00Z'
  const catalogMeta = {
    type: 'notes',
    version: 'v45',
    release: { tag_name: 'v45', published_at: '2024-01-01T00:00:00Z' },
    contentMetadata: {
      ingredients: [{ identifier: 'tit' }, { identifier: 'gen' }, { identifier: 'mat' }],
    },
  }

  test('matching stamped receipt skips the ingredient walk', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => catalogMeta,
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key === 'resource:unfoldingWord/en/tn') {
            return {
              metadata: {
                downloadComplete: true,
                releaseStamp: stamp,
                ingestSchema: 'helps:1',
                ingredientCount: 3,
              },
            }
          }
          return null
        },
      } as never,
    })
    const status = await checker.checkResource('unfoldingWord/en/tn', { failFast: true })
    expect(status.isComplete).toBe(true)
    expect(gets).toEqual(['resource:unfoldingWord/en/tn'])
    expect(gets.some((k) => k.startsWith('tn:'))).toBe(false)
  })

  test('release stamp mismatch walks ingredients and is incomplete on miss', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => catalogMeta,
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key === 'resource:unfoldingWord/en/tn') {
            return {
              metadata: {
                downloadComplete: true,
                releaseStamp: 'v1#old',
                ingestSchema: 'helps:1',
              },
            }
          }
          return null
        },
      } as never,
    })
    const status = await checker.checkResource('unfoldingWord/en/tn', { failFast: true })
    expect(status.isComplete).toBe(false)
    expect(gets.filter((k) => k.startsWith('tn:'))).toEqual(['tn:unfoldingWord/en/tn:tit'])
  })

  test('legacy unstamped downloadComplete still walks ingredients', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => catalogMeta,
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key === 'resource:unfoldingWord/en/tn') {
            return { metadata: { downloadComplete: true } }
          }
          return null
        },
      } as never,
    })
    await checker.checkResource('unfoldingWord/en/tn', { failFast: true })
    expect(gets.filter((k) => k.startsWith('tn:')).length).toBeGreaterThan(0)
  })

  test('markComplete writes releaseStamp and ingestSchema from catalog', async () => {
    const store = new Map<string, unknown>()
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => catalogMeta,
      } as never,
      cacheAdapter: {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, entry: unknown) => {
          store.set(key, entry)
        },
      } as never,
    })
    await checker.markComplete('unfoldingWord/en/tn', { downloadMethod: 'zip' })
    const entry = store.get('resource:unfoldingWord/en/tn') as {
      metadata: Record<string, unknown>
    }
    expect(entry.metadata.downloadComplete).toBe(true)
    expect(entry.metadata.releaseStamp).toBe(stamp)
    expect(entry.metadata.ingestSchema).toBe('helps:1')
    expect(entry.metadata.ingredientCount).toBe(3)
  })

  test('clearCompletionStatus clears stamp fields', async () => {
    const store = new Map<string, unknown>([
      [
        'resource:unfoldingWord/en/tn',
        {
          metadata: {
            downloadComplete: true,
            releaseStamp: stamp,
            ingestSchema: 'helps:1',
            ingredientCount: 3,
          },
        },
      ],
    ])
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => catalogMeta,
      } as never,
      cacheAdapter: {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, entry: unknown) => {
          store.set(key, entry)
        },
      } as never,
    })
    await checker.clearCompletionStatus('unfoldingWord/en/tn')
    const entry = store.get('resource:unfoldingWord/en/tn') as {
      metadata: Record<string, unknown>
    }
    expect(entry.metadata.downloadComplete).toBeUndefined()
    expect(entry.metadata.releaseStamp).toBeUndefined()
    expect(entry.metadata.ingestSchema).toBeUndefined()
    expect(entry.metadata.ingredientCount).toBeUndefined()
  })

  test('absentFromRelease ingredients are excluded from the completeness walk', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'scripture',
          version: 'v90',
          release: { tag_name: 'v90', published_at: '2026-08-17T17:05:27Z' },
          contentMetadata: {
            ingredients: [{ identifier: 'psa' }, { identifier: 'num' }],
          },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key === 'resource:unfoldingWord/en/ust') {
            return {
              metadata: {
                downloadComplete: false,
                entryCount: 1,
                expectedEntryCount: 2,
                absentFromRelease: ['num'],
              },
            }
          }
          if (key === 'scripture-usj:unfoldingWord/en/ust:psa') {
            return {
              content: {
                usj: { type: 'USJ', content: [{ c: 1 }] },
                chapters: [{ number: 1, content: [{ c: 1 }] }],
              },
            }
          }
          return null
        },
      } as never,
    })
    const status = await checker.checkResource('unfoldingWord/en/ust')
    expect(status.isComplete).toBe(true)
    expect(gets.some((k) => k.includes(':num'))).toBe(false)
  })

  test('absentFromRelease excludes TWL phantoms from words-links completeness', async () => {
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'words-links',
          version: 'v85',
          release: { tag_name: 'v85', published_at: '2026-01-01T00:00:00Z' },
          contentMetadata: {
            ingredients: [{ identifier: 'tit' }, { identifier: 'frt' }],
          },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key === 'resource:unfoldingWord/en/twl') {
            return {
              metadata: {
                downloadComplete: false,
                entryCount: 1,
                expectedEntryCount: 2,
                absentFromRelease: ['frt'],
              },
            }
          }
          if (key === 'twl:unfoldingWord/en/twl:tit') {
            return { links: [{ Reference: '1:1' }] }
          }
          return null
        },
      } as never,
    })
    const status = await checker.checkResource('unfoldingWord/en/twl')
    expect(status.isComplete).toBe(true)
    expect(gets.some((k) => k.includes(':frt'))).toBe(false)
  })

  test('OBS directory ingredient is complete when all 50 story blobs exist', async () => {
    const storyPayload = {
      content: {
        storyNumber: 1,
        title: 'Story',
        frames: [{ frameNumber: 1, imageUrl: 'x.jpg', text: 't' }],
      },
    }
    const gets: string[] = []
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'obs',
          version: 'v9',
          release: { tag_name: 'v9', published_at: '2024-01-01T00:00:00Z' },
          contentMetadata: {
            ingredients: [{ identifier: 'obs', path: './content' }],
          },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => {
          gets.push(key)
          if (key === 'resource:unfoldingWord/en/obs') return null
          if (key.startsWith('obs:unfoldingWord/en/obs:')) return storyPayload
          return null
        },
      } as never,
    })
    const status = await checker.checkResource('unfoldingWord/en/obs')
    expect(status.isComplete).toBe(true)
    expect(gets.filter((k) => k.startsWith('obs:')).length).toBe(50)
  })

  test('OBS with cached stories can markCompleteIfVerified (ends redownload loop)', async () => {
    const storyPayload = {
      content: {
        storyNumber: 1,
        title: 'Story',
        frames: [{ frameNumber: 1, imageUrl: 'x.jpg', text: 't' }],
      },
    }
    const store = new Map<string, unknown>()
    for (let i = 1; i <= 50; i++) {
      const id = String(i).padStart(2, '0')
      store.set(`obs:unfoldingWord/en/obs:${id}`, storyPayload)
    }
    const checker = new ResourceCompletenessChecker({
      catalogManager: {
        getResourceMetadata: async () => ({
          type: 'obs',
          version: 'v9',
          release: { tag_name: 'v9', published_at: '2024-01-01T00:00:00Z' },
          contentMetadata: {
            ingredients: [{ identifier: 'obs', path: './content' }],
          },
        }),
      } as never,
      cacheAdapter: {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, entry: unknown) => {
          store.set(key, entry)
        },
      } as never,
    })
    const marked = await checker.markCompleteIfVerified('unfoldingWord/en/obs', {
      downloadMethod: 'individual',
    })
    expect(marked).toBe(true)
    const receipt = store.get('resource:unfoldingWord/en/obs') as {
      metadata: Record<string, unknown>
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
    expect(receipt.metadata.releaseStamp).toBe('v9#2024-01-01T00_00_00Z')
    expect(typeof receipt.metadata.ingestSchema).toBe('string')
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

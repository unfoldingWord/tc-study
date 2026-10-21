import { describe, expect, test } from 'bun:test'
import type { UsjScriptureCacheContent } from '@bt-synergy/usj-processor'

import {
  usjScriptureChapterKey,
  usjScriptureKey,
} from '../src/scriptureCacheKeys'
import {
  buildUsjChapterContent,
  readUsjBook,
  readUsjChapter,
  writeUsjChapters,
} from '../src/usjChapterStore'

function chapterPayload(chapter: number, marker: string): UsjScriptureCacheContent {
  return {
    book: 'Psalms',
    bookCode: 'psa',
    metadata: {
      version: '2.1.0-usj',
      toolVersions: { parser: '0.1.1', usjCore: '0.1.1' },
      processingDate: '2026-01-01T00:00:00.000Z',
      bookCode: 'psa',
      bookName: 'Psalms',
    },
    usj: { type: 'USJ', version: '3.0', content: [{ marker, chapter }] },
    alignmentMap: { [`PSA ${chapter}:1`]: [] },
    chapters: [{ number: chapter, content: [{ marker, chapter }] }],
  }
}

function bookBlob(): UsjScriptureCacheContent {
  const ch1 = chapterPayload(1, 'psa-1')
  const ch119 = chapterPayload(119, 'psa-119')
  return {
    ...ch1,
    usj: {
      type: 'USJ',
      version: '3.0',
      content: [...(ch1.usj?.content ?? []), ...(ch119.usj?.content ?? [])],
    },
    alignmentMap: { ...ch1.alignmentMap, ...ch119.alignmentMap },
    chapters: [...(ch1.chapters ?? []), ...(ch119.chapters ?? [])],
  }
}

function createTrackingCache(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  const gets: string[] = []
  return {
    store,
    gets,
    async get(key: string) {
      gets.push(key)
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
  }
}

describe('usj chapter store', () => {
  test('write chapter 1 and 119 independently; get(119) does not load chapter 1', async () => {
    const cache = createTrackingCache()
    const resourceKey = 'unfoldingWord/en/ult'
    await cache.set(
      usjScriptureChapterKey(resourceKey, 'psa', 1),
      { content: chapterPayload(1, 'psa-1') }
    )
    await cache.set(
      usjScriptureChapterKey(resourceKey, 'psa', 119),
      { content: chapterPayload(119, 'psa-119') }
    )

    cache.gets.length = 0
    const hit = await readUsjChapter(cache, resourceKey, 'psa', 119)
    expect(hit?.chapters?.[0]?.number).toBe(119)
    expect(hit?.usj?.content).toEqual([{ marker: 'psa-119', chapter: 119 }])
    expect(cache.gets).toEqual([usjScriptureChapterKey(resourceKey, 'psa', 119)])
    expect(cache.gets).not.toContain(usjScriptureChapterKey(resourceKey, 'psa', 1))
    expect(cache.gets).not.toContain(usjScriptureKey(resourceKey, 'psa'))
  })

  test('legacy book blob migrates to chapter keys', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const blob = bookBlob()
    const cache = createTrackingCache({
      [usjScriptureKey(resourceKey, 'psa')]: { content: blob },
    })

    const hit = await readUsjChapter(cache, resourceKey, 'psa', 119)
    expect(hit?.chapters?.[0]?.number).toBe(119)
    expect(hit?.alignmentMap).toEqual({ 'PSA 119:1': [] })

    const written119 = cache.store.get(usjScriptureChapterKey(resourceKey, 'psa', 119)) as {
      content: UsjScriptureCacheContent
    }
    const written1 = cache.store.get(usjScriptureChapterKey(resourceKey, 'psa', 1)) as {
      content: UsjScriptureCacheContent
    }
    expect(written119.content.chapters?.[0]?.number).toBe(119)
    expect(written1.content.chapters?.[0]?.number).toBe(1)
    expect(buildUsjChapterContent(blob, 1)?.usj?.content).toEqual([{ marker: 'psa-1', chapter: 1 }])

    cache.gets.length = 0
    const again = await readUsjChapter(cache, resourceKey, 'psa', 119)
    expect(again?.chapters?.[0]?.number).toBe(119)
    expect(cache.gets).toEqual([usjScriptureChapterKey(resourceKey, 'psa', 119)])
  })

  test('writeUsjChapters writes each chapter key plus a thin book index', async () => {
    const cache = createTrackingCache()
    const resourceKey = 'unfoldingWord/en/ult'
    await writeUsjChapters(cache, resourceKey, 'psa', bookBlob(), { prioritize: [119] })

    expect(cache.store.has(usjScriptureChapterKey(resourceKey, 'psa', 1))).toBe(true)
    expect(cache.store.has(usjScriptureChapterKey(resourceKey, 'psa', 119))).toBe(true)
    const index = cache.store.get(usjScriptureKey(resourceKey, 'psa')) as {
      content: { chapterNumbers: number[] }
    }
    expect(index.content.chapterNumbers).toEqual([1, 119])
    expect((index.content as { usj?: unknown }).usj).toBeUndefined()
  })

  test('writeUsjChapters skipExisting writes only missing chapters', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const existingKey = usjScriptureChapterKey(resourceKey, 'psa', 1)
    const store = new Map<string, unknown>([
      [existingKey, { content: chapterPayload(1, 'keep-ch1') }],
    ])
    const written: string[] = []
    const cache = {
      async get(key: string) {
        return store.get(key) ?? null
      },
      async getMany(keys: string[]) {
        const out = new Map<string, unknown>()
        for (const key of keys) {
          if (store.has(key)) out.set(key, store.get(key))
        }
        return out
      },
      async setMany(items: Array<{ key: string; entry: unknown }>) {
        written.push(...items.map((item) => item.key))
        for (const item of items) store.set(item.key, item.entry)
      },
    }

    await writeUsjChapters(cache, resourceKey, 'psa', bookBlob(), { skipExisting: true })

    expect(written).toEqual([
      usjScriptureChapterKey(resourceKey, 'psa', 119),
      usjScriptureKey(resourceKey, 'psa'),
    ])
    const kept = store.get(existingKey) as { content: UsjScriptureCacheContent }
    expect(kept.content.usj?.content).toEqual([{ marker: 'keep-ch1', chapter: 1 }])
  })

  test('writeUsjChapters batches chapter puts into one setMany (plus index)', async () => {
    const store = new Map<string, unknown>()
    const setCalls: string[] = []
    const setManyCalls: string[][] = []
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = {
      async get(key: string) {
        return store.get(key) ?? null
      },
      async set(key: string, entry: unknown) {
        setCalls.push(key)
        store.set(key, entry)
      },
      async setMany(items: Array<{ key: string; entry: unknown }>) {
        setManyCalls.push(items.map((item) => item.key))
        for (const item of items) store.set(item.key, item.entry)
      },
    }

    await writeUsjChapters(cache, resourceKey, 'psa', bookBlob())

    expect(setCalls).toEqual([])
    expect(setManyCalls).toHaveLength(1)
    expect(setManyCalls[0]).toEqual([
      usjScriptureChapterKey(resourceKey, 'psa', 1),
      usjScriptureChapterKey(resourceKey, 'psa', 119),
      usjScriptureKey(resourceKey, 'psa'),
    ])
  })

  test('writeUsjChapters prioritize+deferRest writes priority batch then rest', async () => {
    const setManyCalls: string[][] = []
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = {
      async get() {
        return null
      },
      async setMany(items: Array<{ key: string; entry: unknown }>) {
        setManyCalls.push(items.map((item) => item.key))
      },
    }

    await writeUsjChapters(cache, resourceKey, 'psa', bookBlob(), {
      prioritize: [119],
      deferRest: true,
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(setManyCalls[0]).toEqual([usjScriptureChapterKey(resourceKey, 'psa', 119)])
    expect(setManyCalls[1]).toEqual([
      usjScriptureChapterKey(resourceKey, 'psa', 1),
      usjScriptureKey(resourceKey, 'psa'),
    ])
  })

  test('readUsjBook assembles a full book from thin index + chapter keys', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createTrackingCache()
    await writeUsjChapters(cache, resourceKey, 'psa', bookBlob())

    const bookKey = usjScriptureKey(resourceKey, 'psa')
    const index = cache.store.get(bookKey) as { content: { chapterNumbers: number[]; usj?: unknown } }
    expect(index.content.chapterNumbers).toEqual([1, 119])
    expect(index.content.usj).toBeUndefined()
    expect(cache.store.has(usjScriptureKey(resourceKey, 'psa'))).toBe(true)

    cache.gets.length = 0
    const assembled = await readUsjBook(cache, resourceKey, 'psa')
    expect(assembled?.chapters?.map((ch) => ch.number)).toEqual([1, 119])
    expect(assembled?.alignmentMap).toEqual({
      'PSA 1:1': [],
      'PSA 119:1': [],
    })
    expect(assembled?.usj?.content).toEqual([
      { marker: 'psa-1', chapter: 1 },
      { marker: 'psa-119', chapter: 119 },
    ])
    expect(cache.gets).toContain(bookKey)
    expect(cache.gets).toContain(usjScriptureChapterKey(resourceKey, 'psa', 1))
    expect(cache.gets).toContain(usjScriptureChapterKey(resourceKey, 'psa', 119))
    expect((cache.store.get(bookKey) as { content: { usj?: unknown } }).content.usj).toBeUndefined()
  })
})

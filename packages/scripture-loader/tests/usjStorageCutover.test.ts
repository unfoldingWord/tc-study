/**
 * scripture-usj SoT — USJ-only cache, version refuse, no legacy migrate-read.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS, USJProcessor } from '@bt-synergy/usj-processor'

import { ScriptureLoader } from '../src/ScriptureLoader'
import { legacyScriptureKey, usjScriptureKey } from '../src/scriptureCacheKeys'
import { isUsjScriptureCacheContent } from '../src/usjCache'
import {
  canSplitUsjScripture,
  reassembleUsjScripture,
  splitUsjScriptureEntry,
} from '../../cache-adapter-indexeddb/src/bookChunkedStorage'

const FIXTURES = join(import.meta.dir, '../../usj-processor/fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')

class MemoryCacheAdapter {
  store = new Map<string, { content: unknown; timestamp?: number; metadata?: unknown }>()

  async get(key: string) {
    const hit = this.store.get(key)
    if (!hit) return null
    const meta = hit.metadata as Record<string, unknown> | undefined
    const content = hit.content as Record<string, unknown> | undefined
    const chunked =
      meta?._chunkedBook === true ||
      content?._chunkedBook === true
    if (!chunked) return hit
    const chapterRecords = [...this.store.entries()]
      .filter(([k]) => k.startsWith(key + ':'))
      .map(([k, entry]) => ({ key: k, entry: entry as any }))
    return reassembleUsjScripture(hit as any, chapterRecords)
  }

  async set(key: string, entry: { content: unknown; timestamp?: number }) {
    if (canSplitUsjScripture(key, entry as any)) {
      const { manifestEntry, chapterEntries, alignmentEntries } = splitUsjScriptureEntry(
        key,
        entry as any
      )
      this.store.set(key, manifestEntry as any)
      for (const { key: chKey, entry: chEntry } of chapterEntries) {
        this.store.set(chKey, chEntry as any)
      }
      for (const { key: aKey, entry: aEntry } of alignmentEntries ?? []) {
        this.store.set(aKey, aEntry as any)
      }
      return
    }
    this.store.set(key, entry)
  }

  async delete(key: string) {
    this.store.delete(key)
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(key + ':')) this.store.delete(k)
    }
  }
}

function chapterRecordsFor(adapter: MemoryCacheAdapter, key: string) {
  return [...adapter.store.entries()]
    .filter(([k]) => k.startsWith(key + ':'))
    .map(([k, entry]) => ({ key: k, entry: entry as any }))
}

function stubDoor43Loader(cache: MemoryCacheAdapter, bookId = 'tit') {
  return new ScriptureLoader({
    cacheAdapter: cache,
    catalogAdapter: {
      get: async () => ({
        contentMetadata: { ingredients: [{ identifier: bookId, path: './tit.usfm' }] },
      }),
    },
    door43Client: {
      findRepository: async () => ({ default_branch: 'master' }),
      fetchTextContent: async () => ULT_USFM,
    },
  })
}

describe('USJ storage cutover (scripture-usj only)', () => {
  test('writes scripture-usj SoT with 2.0.0-usj + tool versions', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ULT_USFM, bookId, 'TIT')
    const content = usjProcessor.toUsjCacheContent(result, bookId, 'TIT')
    await cache.set(usjScriptureKey(resourceKey, bookId), { content, timestamp: Date.now() })

    expect(content.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(content.metadata.toolVersions).toEqual({ ...USJ_TOOL_VERSIONS })
    expect(cache.store.has(usjScriptureKey(resourceKey, bookId))).toBe(true)
    expect(result.scripture.metadata.version).toBe(USJ_PROCESSING_VERSION)

    const loader = stubDoor43Loader(cache)
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
      chapters: unknown[]
    }
    expect(loaded.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(loaded.chapters.length).toBeGreaterThan(0)
    expect((loaded.chapters[0] as { verses?: unknown[] }).verses).toBeDefined()
  })

  test('reads scripture-usj even when legacy scripture: is present', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ULT_USFM, bookId, 'TIT')

    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: {
        ...result.scripture,
        metadata: { ...result.scripture.metadata, version: '1.0.0-legacy-marker' },
      },
    })
    await cache.set(usjScriptureKey(resourceKey, bookId), {
      content: usjProcessor.toUsjCacheContent(result, bookId, 'TIT'),
    })

    const loader = stubDoor43Loader(cache)
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
    }
    expect(loaded.metadata.version).toBe(USJ_PROCESSING_VERSION)
  })

  test('ignores legacy scripture: when USJ missing and re-processes from USFM', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ULT_USFM, bookId, 'TIT')
    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: {
        ...result.scripture,
        metadata: { ...result.scripture.metadata, version: '1.0.0-legacy-marker' },
      },
    })

    const loader = stubDoor43Loader(cache)
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
    }
    expect(loaded.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(cache.store.has(usjScriptureKey(resourceKey, bookId))).toBe(true)
  })

  test('refuses mismatched USJ version, ignores legacy, reprocesses from USFM', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ULT_USFM, bookId, 'TIT')
    const bad = usjProcessor.toUsjCacheContent(result, bookId, 'TIT')
    bad.metadata.version = '0.0.0-usj-spike'
    await cache.set(usjScriptureKey(resourceKey, bookId), { content: bad })

    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: {
        ...result.scripture,
        metadata: { ...result.scripture.metadata, version: '1.0.0-legacy-marker' },
      },
    })

    const loader = stubDoor43Loader(cache)
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
    }
    expect(loaded.metadata.version).toBe(USJ_PROCESSING_VERSION)
    // Bad USJ deleted then rewritten with good content
    const rewritten = cache.store.get(usjScriptureKey(resourceKey, bookId))
    expect(rewritten).toBeTruthy()
    expect(
      (rewritten!.content as { metadata?: { version?: string } }).metadata?.version
    ).toBe(USJ_PROCESSING_VERSION)
  })

  test('legacy-only miss without Door43 surfaces clear stale-cache hint', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ULT_USFM, bookId, 'TIT')
    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: result.scripture,
    })

    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async () => ({
          contentMetadata: { ingredients: [{ identifier: bookId, path: './tit.usfm' }] },
        }),
      },
      door43Client: {
        findRepository: async () => {
          throw new Error('network down')
        },
      },
    })

    await expect(loader.loadScriptureResult(resourceKey, bookId)).rejects.toThrow(
      /Clear IndexedDB keys starting with/
    )
  })

  test('USJ chapter split/rejoin preserves alignment map entries', async () => {
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ULT_USFM, 'tit', 'TIT')
    const content = usjProcessor.toUsjCacheContent(result, 'tit', 'TIT')
    expect(content.chapters?.length).toBeGreaterThan(0)

    const key = usjScriptureKey('unfoldingWord/en/ult', 'tit')
    const entry = { content } as any
    expect(canSplitUsjScripture(key, entry)).toBe(true)
    const split = splitUsjScriptureEntry(key, entry)
    expect(split.chapterEntries.length).toBe(content.chapters!.length)
    expect(split.alignmentEntries.length).toBe(content.chapters!.length)

    const cache = new MemoryCacheAdapter()
    await cache.set(key, entry)
    const chapterRecords = chapterRecordsFor(cache, key)
    const reassembled = reassembleUsjScripture(split.manifestEntry, chapterRecords)
    const reassembledContent = reassembled.content as typeof content
    expect(reassembledContent.usj?.content?.length).toBeGreaterThan(0)
    expect(Object.keys(reassembledContent.alignmentMap ?? {}).length).toBe(
      Object.keys(content.alignmentMap ?? {}).length
    )

    const adapted = usjProcessor.fromUsjCacheContent(reassembledContent, 'tit', 'TIT')
    expect(adapted.chapters[0]?.verses[0]?.wordTokens?.[0]?.alignedOriginalWordIds?.length).toBeGreaterThan(
      0
    )
  })

  test('processUsfmToUsjResult is the only write path (no legacy scripture: writes)', async () => {
    const { processUsfmToUsjResult } = await import('../src/processUsfm')
    const result = await processUsfmToUsjResult({ usfmText: ULT_USFM, bookId: 'tit' })
    expect(result.cacheContent.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(isUsjScriptureCacheContent(result.cacheContent)).toBe(true)
  })
})

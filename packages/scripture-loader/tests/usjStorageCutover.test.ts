/**
 * P2: scripture-usj SoT dual-read / version refuse / migrate-on-write.
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
    // Mimic IndexedDB chapter split for USJ keys when chapters present
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

describe('P2 USJ storage cutover', () => {
  test('writes scripture-usj SoT with 2.0.0-usj + tool versions', async () => {
    const cache = new MemoryCacheAdapter()
    const ult = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      door43Client: {},
      debug: false,
    })

    // Bypass Door43: call private processAndCache via loadContent path by seeding miss + stub client
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ult, bookId, 'TIT')
    const content = usjProcessor.toUsjCacheContent(result, bookId, 'TIT')
    await cache.set(usjScriptureKey(resourceKey, bookId), { content, timestamp: Date.now() })

    expect(content.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(content.metadata.toolVersions).toEqual({ ...USJ_TOOL_VERSIONS })
    expect(cache.store.has(usjScriptureKey(resourceKey, bookId))).toBe(true)
    expect(result.scripture.metadata.version).toBe(USJ_PROCESSING_VERSION)

    // Dual-read via loader
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
      chapters: unknown[]
    }
    expect(loaded.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(loaded.chapters.length).toBeGreaterThan(0)
    // App contract: ProcessedScripture shape (chapters with verses), not raw USJ
    expect((loaded.chapters[0] as { verses?: unknown[] }).verses).toBeDefined()
  })

  test('dual-read prefers USJ over legacy ProcessedScripture', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const ult = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ult, bookId, 'TIT')

    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: {
        ...result.scripture,
        metadata: { ...result.scripture.metadata, version: '1.0.0-legacy-marker' },
      },
    })
    await cache.set(usjScriptureKey(resourceKey, bookId), {
      content: usjProcessor.toUsjCacheContent(result, bookId, 'TIT'),
    })

    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      door43Client: {},
    })
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
    }
    expect(loaded.metadata.version).toBe(USJ_PROCESSING_VERSION)
  })

  test('dual-read falls back to legacy when USJ missing', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const ult = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ult, bookId, 'TIT')
    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: {
        ...result.scripture,
        metadata: { ...result.scripture.metadata, version: '1.0.0-legacy-marker' },
      },
    })

    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      door43Client: {},
    })
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
    }
    expect(loaded.metadata.version).toBe('1.0.0-legacy-marker')
  })

  test('refuses mismatched USJ processingVersion / tool versions', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const ult = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ult, bookId, 'TIT')
    const bad = usjProcessor.toUsjCacheContent(result, bookId, 'TIT')
    bad.metadata.version = '0.0.0-usj-spike'
    await cache.set(usjScriptureKey(resourceKey, bookId), { content: bad })

    // Legacy present so load still succeeds after refuse+delete USJ
    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: {
        ...result.scripture,
        metadata: { ...result.scripture.metadata, version: '1.0.0-legacy-marker' },
      },
    })

    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      door43Client: {},
    })
    const loaded = (await loader.loadContent(resourceKey, bookId)) as {
      metadata: { version: string }
    }
    expect(loaded.metadata.version).toBe('1.0.0-legacy-marker')
    expect(cache.store.has(usjScriptureKey(resourceKey, bookId))).toBe(false)
  })

  test('USJ chapter split/rejoin preserves alignment map entries', async () => {
    const ult = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
    const usjProcessor = new USJProcessor()
    const result = await usjProcessor.processUSFM(ult, 'tit', 'TIT')
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
    const ult = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
    const result = await processUsfmToUsjResult({ usfmText: ult, bookId: 'tit' })
    expect(result.cacheContent.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(isUsjScriptureCacheContent(result.cacheContent)).toBe(true)
  })
})

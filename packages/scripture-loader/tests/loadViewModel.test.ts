/**
 * ScriptureLoader.loadViewModel / loadScriptureResult — primary USJ path.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { USJProcessor, USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'

import { ScriptureLoader } from '../src/ScriptureLoader'
import { usjScriptureKey, legacyScriptureKey } from '../src/scriptureCacheKeys'
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
    const chunked = meta?._chunkedBook === true || content?._chunkedBook === true
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
  }
}

describe('ScriptureLoader.loadViewModel', () => {
  test('returns UsjScriptureViewModel from scripture-usj cache with fromUsjCache', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const proc = new USJProcessor()
    const processed = await proc.processUSFM(ULT_USFM, bookId, 'Titus')
    await cache.set(usjScriptureKey(resourceKey, bookId), {
      content: proc.toUsjCacheContent(processed, bookId, 'Titus'),
      timestamp: Date.now(),
    })

    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      door43Client: {},
    })

    const viewModel = await loader.loadViewModel(resourceKey, bookId)
    expect(viewModel.bookCode).toBe(bookId)
    expect(viewModel.processingVersion).toBe(USJ_PROCESSING_VERSION)
    expect(viewModel.chapters.length).toBeGreaterThan(0)
    const t0 = viewModel.chapters[0]?.verses[0]?.tokens[0]
    expect(t0?.semanticId).toBeTruthy()
    expect(t0?.semanticId.includes(':')).toBe(true)

    const bundle = await loader.loadScriptureResult(resourceKey, bookId)
    expect(bundle.fromUsjCache).toBe(true)
    expect(bundle.viewModel.chapters.length).toBe(viewModel.chapters.length)
    expect(bundle.scripture.chapters.length).toBe(viewModel.chapters.length)
    expect(bundle.scripture.metadata.version).toBe(USJ_PROCESSING_VERSION)

    // ResourceLoader projection path
    const content = await loader.loadContent(resourceKey, bookId)
    expect((content as { metadata: { version: string } }).metadata.version).toBe(
      USJ_PROCESSING_VERSION
    )
  })

  test('ignores legacy scripture: and re-processes USFM into scripture-usj', async () => {
    const cache = new MemoryCacheAdapter()
    const resourceKey = 'unfoldingWord/en/ult'
    const bookId = 'tit'
    const proc = new USJProcessor()
    const { scripture } = await proc.processUSFM(ULT_USFM, bookId, 'Titus')
    await cache.set(legacyScriptureKey(resourceKey, bookId), {
      content: scripture,
      timestamp: Date.now(),
    })

    const loader = new ScriptureLoader({
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

    const bundle = await loader.loadScriptureResult(resourceKey, bookId)
    expect(bundle.fromUsjCache).toBe(false)
    expect(bundle.viewModel.chapters[0]?.verses[0]?.tokens.length).toBeGreaterThan(0)
    expect(bundle.scripture.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(cache.store.has(usjScriptureKey(resourceKey, bookId))).toBe(true)
  })
})

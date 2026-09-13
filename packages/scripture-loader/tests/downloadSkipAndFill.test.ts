import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from '@bt-synergy/usj-processor'

import { ScriptureLoader } from '../src/ScriptureLoader'
import {
  usjScriptureChapterKey,
  usjScriptureKey,
} from '../src/scriptureCacheKeys'

const PSA_USFM = `\\id PSA
\\h Psalms
\\c 1
\\p
\\v 1 Blessed is the man
\\c 2
\\p
\\v 1 Why do the nations rage
`

function stampedChapter(chapter: number, marker: string) {
  return {
    content: {
      metadata: {
        version: USJ_PROCESSING_VERSION,
        toolVersions: { ...USJ_TOOL_VERSIONS },
        bookCode: 'psa',
        bookName: 'Psalms',
      },
      usj: { type: 'USJ', version: '3.0', content: [{ marker, chapter }] },
      chapters: [{ number: chapter, content: [{ marker, chapter }] }],
    },
    timestamp: Date.now(),
  }
}

function createCache(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  const sets: string[] = []
  return {
    store,
    sets,
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
    async set(key: string, entry: unknown) {
      sets.push(key)
      store.set(key, entry)
    },
    async setMany(items: Array<{ key: string; entry: unknown }>) {
      for (const item of items) {
        sets.push(item.key)
        store.set(item.key, item.entry)
      }
    },
    async delete() {},
  }
}

function metadata() {
  return {
    resourceKey: 'unfoldingWord/en/ult',
    subject: 'Bible',
    type: 'scripture',
    language: 'en',
    resourceId: 'ult',
    release: { zipball_url: 'https://example.test/ult.zip', tag_name: 'v1' },
    contentMetadata: {
      ingredients: [{ identifier: 'psa', path: './19-PSA.usfm' }],
    },
  }
}

async function zipWithPsalms(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('en_ult/19-PSA.usfm', PSA_USFM)
  return zip.generateAsync({ type: 'arraybuffer' })
}

function createLoader(
  cache: ReturnType<typeof createCache>,
  door43: { downloadZipball: (...args: unknown[]) => Promise<ArrayBuffer> }
) {
  return new ScriptureLoader({
    cacheAdapter: cache,
    catalogAdapter: { get: async () => metadata() },
    door43Client: door43,
    debug: false,
  })
}

describe('ScriptureLoader zip skip vs fill', () => {
  test('ch1-only Psalms is not skipped; missing chapter is written', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createCache({
      [usjScriptureKey(resourceKey, 'psa')]: {
        content: { chapterNumbers: [1, 2], bookCode: 'psa' },
      },
      [usjScriptureChapterKey(resourceKey, 'psa', 1)]: stampedChapter(1, 'keep-ch1'),
    })
    let zipCalls = 0
    const loader = createLoader(cache, {
      async downloadZipball() {
        zipCalls += 1
        return zipWithPsalms()
      },
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(1)
    const ch1 = cache.store.get(usjScriptureChapterKey(resourceKey, 'psa', 1)) as {
      content: { usj: { content: Array<{ marker?: string }> } }
    }
    expect(ch1.content.usj.content[0]?.marker).toBe('keep-ch1')
    expect(cache.store.has(usjScriptureChapterKey(resourceKey, 'psa', 2))).toBe(true)
    expect(cache.sets).not.toContain(usjScriptureChapterKey(resourceKey, 'psa', 1))
  })

  test('complete book is skipped without rewriting chapters', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createCache({
      [usjScriptureKey(resourceKey, 'psa')]: {
        content: { chapterNumbers: [1, 2], bookCode: 'psa' },
      },
      [usjScriptureChapterKey(resourceKey, 'psa', 1)]: stampedChapter(1, 'keep-ch1'),
      [usjScriptureChapterKey(resourceKey, 'psa', 2)]: stampedChapter(2, 'keep-ch2'),
    })
    let zipCalls = 0
    const loader = createLoader(cache, {
      async downloadZipball() {
        zipCalls += 1
        return zipWithPsalms()
      },
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(0)
    const ch2 = cache.store.get(usjScriptureChapterKey(resourceKey, 'psa', 2)) as {
      content: { usj: { content: Array<{ marker?: string }> } }
    }
    expect(ch2.content.usj.content[0]?.marker).toBe('keep-ch2')
  })

  test('resource already complete does not fetch the zip', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createCache({
      [usjScriptureKey(resourceKey, 'psa')]: {
        content: { chapterNumbers: [1, 2], bookCode: 'psa' },
      },
      [usjScriptureChapterKey(resourceKey, 'psa', 1)]: stampedChapter(1, 'a'),
      [usjScriptureChapterKey(resourceKey, 'psa', 2)]: stampedChapter(2, 'b'),
    })
    const door43 = {
      downloadZipball: async () => {
        throw new Error('downloadZipball should not run')
      },
    }
    const loader = createLoader(cache, door43)
    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })
  })
})

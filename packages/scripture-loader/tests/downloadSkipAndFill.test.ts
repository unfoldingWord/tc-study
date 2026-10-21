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

  test('phantom catalog books absent from release skip zip and mark complete', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createCache({
      [usjScriptureKey(resourceKey, 'psa')]: {
        content: { chapterNumbers: [1, 2], bookCode: 'psa' },
      },
      [usjScriptureChapterKey(resourceKey, 'psa', 1)]: stampedChapter(1, 'a'),
      [usjScriptureChapterKey(resourceKey, 'psa', 2)]: stampedChapter(2, 'b'),
    })
    let zipCalls = 0
    const catalogStore = new Map<string, unknown>([
      [
        resourceKey,
        {
          ...metadata(),
          contentMetadata: {
            ingredients: [
              { identifier: 'psa', path: './19-PSA.usfm' },
              { identifier: 'num', path: './04-NUM.usfm' },
            ],
          },
        },
      ],
    ])
    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async (key: string) => catalogStore.get(key) ?? null,
        set: async (key: string, entry: unknown) => {
          catalogStore.set(key, entry)
        },
      },
      door43Client: {
        async downloadZipball() {
          zipCalls += 1
          return zipWithPsalms()
        },
        async fetchRepoTreePaths() {
          return new Set(['19-PSA.usfm'])
        },
      },
      debug: false,
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(0)
    const receipt = cache.store.get(`resource:${resourceKey}`) as {
      metadata: Record<string, unknown>
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
    expect(receipt.metadata.absentFromRelease).toEqual(['num'])
    const pruned = catalogStore.get(resourceKey) as {
      contentMetadata: { ingredients: Array<{ identifier: string }> }
    }
    expect(pruned.contentMetadata.ingredients.map((i) => i.identifier)).toEqual(['psa'])
  })

  test('zip extract does not treat missing-from-zip books as failedBooks', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createCache()
    const catalogMeta = {
      ...metadata(),
      contentMetadata: {
        ingredients: [
          { identifier: 'psa', path: './19-PSA.usfm' },
          { identifier: 'num', path: './04-NUM.usfm' },
        ],
      },
    }
    let zipCalls = 0
    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async () => catalogMeta,
        set: async () => {},
      },
      door43Client: {
        async downloadZipball() {
          zipCalls += 1
          return zipWithPsalms()
        },
        // No tree API — force zip path
      },
      debug: false,
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(1)
    const receipt = cache.store.get(`resource:${resourceKey}`) as {
      metadata: Record<string, unknown>
      content: { downloaded?: boolean; failedBooks?: string[] }
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
    expect(receipt.content.failedBooks).toBeUndefined()
    expect(receipt.metadata.absentFromRelease).toEqual(['num'])
    expect(cache.store.has(usjScriptureKey(resourceKey, 'psa'))).toBe(true)
  })

  test('partial cache fills remaining books individually without zip', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const cache = createCache({
      [usjScriptureKey(resourceKey, 'psa')]: {
        content: { chapterNumbers: [1, 2], bookCode: 'psa' },
      },
      [usjScriptureChapterKey(resourceKey, 'psa', 1)]: stampedChapter(1, 'a'),
      [usjScriptureChapterKey(resourceKey, 'psa', 2)]: stampedChapter(2, 'b'),
    })
    const catalogMeta = {
      ...metadata(),
      contentMetadata: {
        ingredients: [
          { identifier: 'psa', path: './19-PSA.usfm' },
          { identifier: 'tit', path: './57-TIT.usfm' },
        ],
      },
    }
    let zipCalls = 0
    let fetchTextCalls = 0
    const loader = new ScriptureLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async () => catalogMeta,
        set: async () => {},
      },
      door43Client: {
        async downloadZipball() {
          zipCalls += 1
          return zipWithPsalms()
        },
        async fetchRepoTreePaths() {
          return new Set(['19-PSA.usfm', '57-TIT.usfm'])
        },
        async findRepository() {
          return { release: { tag_name: 'v1' }, default_branch: 'master' }
        },
        async fetchTextContent(_owner: string, _repo: string, bookPath: string) {
          fetchTextCalls += 1
          if (bookPath.includes('TIT') || bookPath.includes('tit')) {
            return `\\id TIT\n\\h Titus\n\\c 1\n\\p\n\\v 1 Paul\n\\c 2\n\\p\n\\v 1 Speak\n`
          }
          throw new Error(`unexpected path ${bookPath}`)
        },
      },
      debug: false,
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(0)
    expect(fetchTextCalls).toBe(1)
    expect(cache.store.has(usjScriptureKey(resourceKey, 'tit'))).toBe(true)
    const receipt = cache.store.get(`resource:${resourceKey}`) as {
      metadata: Record<string, unknown>
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
  })
})

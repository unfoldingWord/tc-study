import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'

import { TranslationWordsLoader } from '../src/TranslationWordsLoader'

async function twZip(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('en_tw/bible/kt/god.md', '# God\n\n## Definition\n\nGod cached-new')
  zip.file('en_tw/bible/kt/grace.md', '# Grace\n\n## Definition\n\nGrace new')
  return zip.generateAsync({ type: 'arraybuffer' })
}

function createLoader(store: Map<string, unknown>) {
  const sets: string[] = []
  return {
    sets,
    loader: new TranslationWordsLoader({
      cacheAdapter: {
        async get(key: string) {
          return store.get(key) ?? null
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
      },
      catalogAdapter: {
        async get() {
          return {
            release: { zipball_url: 'https://example.test/tw.zip', tag_name: 'v1' },
            contentMetadata: {
              ingredients: Array.from({ length: 12 }, (_, i) => ({
                identifier: `bible/kt/w${i}`,
              })),
            },
            availability: { offline: false },
          }
        },
        async set() {},
      },
      door43Client: {
        async downloadZipball() {
          return twZip()
        },
      },
      debug: false,
    }),
  }
}

describe('TranslationWordsLoader downloadViaZip skipExisting', () => {
  test('skips a cached article and writes the missing one', async () => {
    const resourceKey = 'unfoldingWord/en/tw'
    const store = new Map<string, unknown>([
      [`${resourceKey}/bible/kt/god`, '# God\n\nold'],
    ])
    const { loader, sets } = createLoader(store)

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(store.get(`${resourceKey}/bible/kt/god`)).toBe('# God\n\nold')
    expect(store.get(`${resourceKey}/bible/kt/grace`)).toBe(
      '# Grace\n\n## Definition\n\nGrace new'
    )
    expect(sets).toContain(`${resourceKey}/bible/kt/grace`)
    expect(sets).not.toContain(`${resourceKey}/bible/kt/god`)
  })
})

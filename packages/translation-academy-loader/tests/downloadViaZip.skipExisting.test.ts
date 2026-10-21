import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'

import { TranslationAcademyLoader } from '../src/TranslationAcademyLoader'

async function taZip(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('en_ta/translate/figs-metaphor/title.md', 'Metaphor')
  zip.file('en_ta/translate/figs-metaphor/sub-title.md', 'What is a metaphor?')
  zip.file('en_ta/translate/figs-metaphor/01.md', 'Metaphor body new')
  zip.file('en_ta/translate/figs-simile/title.md', 'Simile')
  zip.file('en_ta/translate/figs-simile/sub-title.md', 'What is a simile?')
  zip.file('en_ta/translate/figs-simile/01.md', 'Simile body new')
  return zip.generateAsync({ type: 'arraybuffer' })
}

function createLoader(store: Map<string, unknown>) {
  const sets: string[] = []
  return {
    sets,
    loader: new TranslationAcademyLoader({
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
            release: { zipball_url: 'https://example.test/ta.zip', tag_name: 'v1' },
            contentMetadata: { ingredients: new Array(12).fill({ identifier: 'x' }) },
            availability: { offline: false },
          }
        },
        async set() {},
      },
      door43Client: {
        async downloadZipball() {
          return taZip()
        },
      },
      debug: false,
    }),
  }
}

describe('TranslationAcademyLoader downloadViaZip skipExisting', () => {
  test('skips a cached article and writes the missing one', async () => {
    const resourceKey = 'unfoldingWord/en/ta'
    const store = new Map<string, unknown>([
      [`${resourceKey}/translate/figs-metaphor`, '# Metaphor\n\nold'],
    ])
    const { loader, sets } = createLoader(store)

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(store.get(`${resourceKey}/translate/figs-metaphor`)).toBe('# Metaphor\n\nold')
    expect(String(store.get(`${resourceKey}/translate/figs-simile`))).toContain('Simile body new')
    expect(sets).toContain(`${resourceKey}/translate/figs-simile`)
    expect(sets).not.toContain(`${resourceKey}/translate/figs-metaphor`)
  })
})

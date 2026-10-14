import { describe, expect, test } from 'bun:test'
import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { discoverLanguage } from './discoverLanguage'
import { createHeadlessResourceTypeRegistry } from './resourceTypeRegistry'

function memoryStore() {
  const rows = new Map<string, unknown>()
  return {
    rows,
    async get(key: string) {
      return rows.get(key) ?? null
    },
    async set(key: string, value: unknown) {
      rows.set(key, value)
    },
    async delete(key: string) {
      rows.delete(key)
    },
    async has(key: string) {
      return rows.has(key)
    },
    async getAll() {
      return [...rows.keys()]
    },
    async clear() {
      rows.clear()
    },
  }
}

const release = (tag: string) => ({ tag_name: tag, zipball_url: `https://example.org/${tag}.zip`, published_at: '2026-01-01T00:00:00Z' })

function hit(owner: string, lang: string, name: string, subject: string, tag = 'v1') {
  return { owner, name, language: lang, subject, title: name, release: release(tag), ingredients: [] }
}

/** Door43 catalog search, answering only what the Read page asks for. */
function fakeDoor43(byQuery: (params: Record<string, unknown>) => unknown[]) {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    async searchCatalog(params: Record<string, unknown>) {
      calls.push(params)
      return byQuery(params)
    },
  }
}

describe('discoverLanguage', () => {
  test('pone en el catálogo lo de tc-ready, las ayudas de OBS y los dos originales', async () => {
    const door43 = fakeDoor43((p) => {
      if (p.topic === 'tc-ready' && p.language === 'es-419') {
        return [
          hit('es-419_gl', 'es-419', 'es-419_glt', 'Aligned Bible'),
          hit('es-419_gl', 'es-419', 'es-419_tn', 'TSV Translation Notes'),
          hit('es-419_gl', 'es-419', 'es-419_raro', 'Algo que tc-study no conoce'),
          { ...hit('es-419_gl', 'es-419', 'es-419_tq', 'TSV Translation Questions'), release: undefined },
        ]
      }
      if (p.owner === 'unfoldingWord' && p.lang === 'hbo') return [{ ...hit('unfoldingWord', 'hbo', 'hbo_uhb', 'Hebrew Old Testament'), lang: 'hbo' }]
      if (p.owner === 'unfoldingWord' && p.lang === 'el-x-koine') return [{ ...hit('unfoldingWord', 'el-x-koine', 'el-x-koine_ugnt', 'Greek New Testament'), lang: 'el-x-koine' }]
      return []
    })
    const catalogAdapter = memoryStore()
    const catalogManager = new CatalogManager({
      catalogAdapter: catalogAdapter as never,
      cacheAdapter: memoryStore() as never,
      door43Client: door43 as never,
    } as never)
    const registry = createHeadlessResourceTypeRegistry(catalogManager)

    const found = await discoverLanguage({
      language: 'es-419',
      door43Client: door43 as never,
      catalogManager,
      resourceTypeRegistry: registry,
    })

    expect(found.resources.map((r) => r.resourceKey).sort()).toEqual(['es-419_gl/es-419/glt', 'es-419_gl/es-419/tn'])
    expect(found.originals.sort()).toEqual(['unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb'])
    expect(found.skipped).toEqual([
      { resourceKey: 'es-419_gl/es-419/raro', subject: 'Algo que tc-study no conoce', reason: 'unknown-subject' },
      { resourceKey: 'es-419_gl/es-419/tq', subject: 'TSV Translation Questions', reason: 'no-release' },
    ])
    for (const key of ['es-419_gl/es-419/glt', 'es-419_gl/es-419/tn', 'unfoldingWord/hbo/uhb', 'unfoldingWord/el-x-koine/ugnt']) {
      expect(await catalogAdapter.get(key)).toBeTruthy()
    }
    // The same searches as the Read page: tc-ready for the language, then OBS helps one subject at a time.
    expect(door43.calls[0]).toEqual({ language: 'es-419', topic: 'tc-ready', stage: 'prod', limit: 500 })
    const obsSubjects = door43.calls.filter((c) => c.subject && !c.owner).map((c) => c.subject)
    expect(obsSubjects.length).toBeGreaterThan(0)
    expect(door43.calls.filter((c) => c.subject && !c.owner).every((c) => c.topic === undefined)).toBe(true)
  })
})

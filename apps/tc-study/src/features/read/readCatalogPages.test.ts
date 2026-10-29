import { describe, expect, test } from 'bun:test'
import type { LocalCatalogRow } from '@bt-synergy/resource-pipeline/discover/localCatalogHits'
import type { CatalogEntry } from '@bt-synergy/resource-pipeline/discover/readCatalogIdentity'
import { deviceMetadataPromises, readCatalogPagesOrDevice, type ReadCatalogPage } from './readCatalogPages'

const request = { languageCode: 'es-419', target: 'both' as const, navigationScope: 'bible' }

const glt: LocalCatalogRow = {
  resourceKey: 'es-419_gl/es-419/glt',
  owner: 'es-419_gl',
  language: 'es-419',
  resourceId: 'glt',
  subject: 'Aligned Bible',
  title: 'Texto Puente Literal',
  version: 'v42',
}
const tn: LocalCatalogRow = { ...glt, resourceKey: 'es-419_gl/es-419/tn', resourceId: 'tn', subject: 'TSV Translation Notes' }

const door43Hit: CatalogEntry = { owner: 'es-419_gl', name: 'es-419_glt', subject: 'Aligned Bible', release: { tag_name: 'v42' } }
const door43Page: ReadCatalogPage = { hydrateTarget: 'both', catalogResults: [door43Hit] }

describe('readCatalogPagesOrDevice', () => {
  test('Door43 answers: its hits, and the device catalog is not read', async () => {
    let read = 0
    const got = await readCatalogPagesOrDevice({
      request,
      searchDoor43: async () => [door43Page],
      deviceRows: async () => {
        read++
        return [glt, tn]
      },
    })
    expect(got).toEqual({ pages: [door43Page], fromDevice: false })
    expect(read).toBe(0)
  })

  test('no network: the language comes from the device catalog', async () => {
    const got = await readCatalogPagesOrDevice({
      request,
      searchDoor43: async () => {
        throw new TypeError('Failed to fetch')
      },
      deviceRows: async () => [glt, tn],
    })
    expect(got.fromDevice).toBe(true)
    expect(got.pages.flatMap((page) => page.catalogResults.map((hit) => hit.identifier))).toEqual(['glt', 'tn'])
  })

  test('Door43 finds nothing: the device catalog is used', async () => {
    const got = await readCatalogPagesOrDevice({
      request,
      searchDoor43: async () => [{ hydrateTarget: 'both', catalogResults: [] }],
      deviceRows: async () => [glt],
    })
    expect(got.fromDevice).toBe(true)
  })

  test('no network and nothing on the device: the search error is not hidden', async () => {
    const error = new TypeError('Failed to fetch')
    await expect(
      readCatalogPagesOrDevice({
        request,
        searchDoor43: async () => {
          throw error
        },
        deviceRows: async () => [],
      })
    ).rejects.toBe(error)
  })

  test('Door43 finds nothing and the device has nothing: the empty pages, as today', async () => {
    const empty: ReadCatalogPage[] = [{ hydrateTarget: 'both', catalogResults: [] }]
    const got = await readCatalogPagesOrDevice({ request, searchDoor43: async () => empty, deviceRows: async () => [] })
    expect(got).toEqual({ pages: empty, fromDevice: false })
  })
})

describe('deviceMetadataPromises', () => {
  test('loaded resources get the catalog row the device holds, and nothing is written', async () => {
    const stored = { ...glt, availability: { online: false, offline: true, bundled: false, partial: false } }
    const asked: string[] = []
    const promises = deviceMetadataPromises({
      catalogResults: [{ owner: 'es-419_gl', name: 'es-419_glt', identifier: 'glt', language: 'es-419' }],
      languageCode: 'es-419',
      getResourceMetadata: async (key) => {
        asked.push(key)
        return stored
      },
      loadedResources: () => ({
        'es-419_gl/es-419/glt': { id: 'es-419_gl/es-419/glt', key: 'es-419_gl/es-419/glt', toc: ['tit'] } as never,
        'es-419_gl/es-419/glt#2': { id: 'es-419_gl/es-419/glt#2', key: 'es-419_gl/es-419/glt#2' } as never,
      }),
    })
    const [merged] = await Promise.all(promises)
    expect(asked).toEqual(['es-419_gl/es-419/glt'])
    expect(merged.map((r) => r.id)).toEqual(['es-419_gl/es-419/glt', 'es-419_gl/es-419/glt#2'])
    expect(merged[0]).toMatchObject({ title: 'Texto Puente Literal', toc: ['tit'] })
    expect((merged[0] as { availability?: { offline?: boolean } }).availability?.offline).toBe(true)
  })

  test('a row the catalog no longer has gives nothing', async () => {
    const [merged] = await Promise.all(
      deviceMetadataPromises({
        catalogResults: [{ owner: 'es-419_gl', name: 'es-419_glt', identifier: 'glt' }],
        languageCode: 'es-419',
        getResourceMetadata: async () => null,
        loadedResources: () => ({}),
      })
    )
    expect(merged).toEqual([])
  })
})

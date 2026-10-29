import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('hydrateOriginalLanguageResources', () => {
  test('an original already in the catalog (e.g. from the originals pack) gets its catalog row merged', () => {
    const src = readFileSync(join(import.meta.dir, 'hydrateOriginalLanguageResources.ts'), 'utf8')
    const body = src.slice(src.indexOf('function metadataForSpec'), src.indexOf('export function hydrateOriginalLanguageResources'))
    expect(body).toMatch(/ensureOriginalLanguageInCatalog\([^)]*\)\)\s*\?\?\s*\(await catalogManager\.getResourceMetadata\(resourceKey\)\)/)
    expect(body).toContain('mergeCatalogMetadataOntoLoaded')
  })
})

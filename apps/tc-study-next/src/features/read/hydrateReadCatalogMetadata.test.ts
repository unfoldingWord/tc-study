import { describe, expect, test } from 'bun:test'
import type { ResourceInfo } from '../../contexts/types'
import {
  loadedResourcesForCatalogKey,
  mergeCatalogMetadataOntoLoaded,
} from './hydrateReadCatalogMetadata'

const BASE = 'es-419_gl/es-419/glt'

function stub(id: string): ResourceInfo {
  return {
    id,
    key: BASE,
    resourceKey: BASE,
    title: 'TPL',
    type: 'scripture',
  } as ResourceInfo
}

describe('loadedResourcesForCatalogKey', () => {
  test('finds instance ids when catalog key is the base', () => {
    const loaded = {
      [`${BASE}#2`]: stub(`${BASE}#2`),
      'unfoldingWord/en/ult': stub('unfoldingWord/en/ult'),
    }
    const found = loadedResourcesForCatalogKey(loaded, BASE)
    expect(found.map((r) => r.id)).toEqual([`${BASE}#2`])
  })

  test('merge keeps instance id so patchLoadedResources can write', () => {
    const existing = stub(`${BASE}#2`)
    const patched = mergeCatalogMetadataOntoLoaded(existing, {
      ...stub(BASE),
      title: 'Translation for Translators',
      contentMetadata: { ingredients: [{ identifier: 'tit' }] },
    } as ResourceInfo)
    expect(patched.id).toBe(`${BASE}#2`)
    expect(patched.key).toBe(BASE)
    expect(patched.contentMetadata).toEqual({ ingredients: [{ identifier: 'tit' }] })
  })
})

import { describe, expect, test } from 'bun:test'
import { filterLibraryResources, getLibraryResourceKey } from './libraryResourceKey'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

const meta = (partial: Partial<ResourceMetadata> & Pick<ResourceMetadata, 'owner' | 'language' | 'resourceId'>): ResourceMetadata =>
  ({
    title: 'Title',
    subject: 'Bible',
    ...partial,
  }) as ResourceMetadata

describe('libraryResourceKey', () => {
  test('getLibraryResourceKey joins owner/language/resourceId', () => {
    expect(getLibraryResourceKey(meta({ owner: 'unfoldingWord', language: 'en', resourceId: 'ult' }))).toBe(
      'unfoldingWord/en/ult'
    )
  })

  test('filterLibraryResources matches title/owner/language', () => {
    const items = [
      meta({ owner: 'uw', language: 'en', resourceId: 'ult', title: 'Unlocked Literal' }),
      meta({ owner: 'door43', language: 'es', resourceId: 'glt', title: 'Español' }),
    ]
    expect(filterLibraryResources(items, 'literal')).toHaveLength(1)
    expect(filterLibraryResources(items, 'door43')).toHaveLength(1)
    expect(filterLibraryResources(items, 'es')).toHaveLength(1)
    expect(filterLibraryResources(items, '')).toHaveLength(2)
  })
})

import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import {
  minimalResourceInfoFallback,
  resourceInfoFromCatalogMetadata,
} from './studioResourceInfo'

describe('studioResourceInfo', () => {
  test('minimalResourceInfoFallback fills identity fields', () => {
    const info = minimalResourceInfoFallback('unfoldingWord/en/ult')
    expect(info.id).toBe('unfoldingWord/en/ult')
    expect(info.owner).toBe('unfoldingWord')
    expect(info.type).toBe(ResourceType.UNKNOWN)
    expect(info.format).toBe(ResourceFormat.MARKDOWN)
  })

  test('resourceInfoFromCatalogMetadata maps bible subject to scripture', () => {
    const info = resourceInfoFromCatalogMetadata('u/en/ult', {
      resourceKey: 'u/en/ult',
      subject: 'Aligned Bible',
      type: ResourceType.SCRIPTURE,
      contentMetadata: { ingredients: [{ identifier: 'gen' }] },
      locations: [{ type: 'network' }],
    } as any)
    expect(info.category).toBe('scripture')
    expect(info.ingredients).toEqual([{ identifier: 'gen' }])
  })
})

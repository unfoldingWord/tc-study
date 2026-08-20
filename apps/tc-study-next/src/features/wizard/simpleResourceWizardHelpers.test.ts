import { describe, expect, test } from 'bun:test'
import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import {
  buildWizardCollections,
  getResourceIcon,
  metadataToCatalogRow,
} from './simpleResourceWizardHelpers'

describe('simpleResourceWizardHelpers', () => {
  test('getResourceIcon maps known types', () => {
    expect(getResourceIcon('scripture').displayName || getResourceIcon('scripture').name).toBeTruthy()
    expect(getResourceIcon('unknown')).toBe(getResourceIcon('other'))
  })

  test('metadataToCatalogRow maps fields', () => {
    const row = metadataToCatalogRow({
      resourceKey: 'uw/en/ult',
      title: 'ULT',
      owner: 'uw',
      language: 'en',
      type: 'scripture',
      subject: 'Bible',
    } as ResourceMetadata)
    expect(row).toEqual({
      id: 'uw/en/ult',
      name: 'ULT',
      owner: 'uw',
      language: 'en',
      type: 'scripture',
      subject: 'Bible',
      downloaded: true,
    })
  })

  test('buildWizardCollections matches loose ids', () => {
    const collections = buildWizardCollections(
      [
        {
          id: 'c1',
          title: 'Demo',
          resources: [{ owner: 'uw', language: 'en', resourceId: 'ult' }],
        },
      ],
      [
        {
          id: 'uw/en/ult',
          name: 'ULT',
          owner: 'uw',
          language: 'en',
          type: 'scripture',
          subject: 'Bible',
          downloaded: true,
        },
      ]
    )
    expect(collections).toHaveLength(1)
    expect(collections[0].resources).toHaveLength(1)
    expect(collections[0].resources[0].id).toBe('uw/en/ult')
  })
})

import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import {
  destPanelsForCatalogLoad,
  hasNonOriginalMembership,
  isPanelCatalogSpinner,
  isReadPanelCatalogSettled,
} from './panelCatalogLoading'
import { UGNT_RESOURCE_KEY } from './originalLanguageForBook'
import { resolveLoadedPanelResource } from './resolveLoadedPanelResource'

function ult(id: string): ResourceInfo {
  return {
    id,
    key: 'unfoldingWord/en/ult',
    resourceKey: 'unfoldingWord/en/ult',
    resourceId: 'ult',
    server: 'git.door43.org',
    owner: 'unfoldingWord',
    language: 'en',
    languageCode: 'en',
    title: 'ULT',
    subject: 'Aligned Bible',
    version: '1.0.0',
    type: ResourceType.SCRIPTURE,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    category: 'scripture',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
  }
}

describe('panel catalog spinner + instance lookup', () => {
  test('hung catalog flag cannot stay true when membership is already present', () => {
    expect(
      isPanelCatalogSpinner({ catalogLoading: true, hasMembership: true })
    ).toBe(false)
    expect(
      isPanelCatalogSpinner({ catalogLoading: true, hasMembership: false })
    ).toBe(true)
    expect(
      isPanelCatalogSpinner({ catalogLoading: false, hasMembership: false })
    ).toBe(false)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: false,
        hasMembership: false,
        catalogSettled: false,
      })
    ).toBe(true)
    expect(hasNonOriginalMembership([UGNT_RESOURCE_KEY])).toBe(false)
    expect(hasNonOriginalMembership([UGNT_RESOURCE_KEY, 'unfoldingWord/en/ult'])).toBe(true)
  })

  test('Bible mode + OBS-only language with no TN/TWL settles helps, not a spinner', () => {
    expect(
      isReadPanelCatalogSettled({
        languageCode: 'fr',
        catalogSettled: false,
        hasKnownNoHelps: true,
      })
    ).toBe(true)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: false,
        hasMembership: false,
        catalogSettled: isReadPanelCatalogSettled({
          languageCode: 'fr',
          catalogSettled: false,
          hasKnownNoHelps: true,
        }),
      })
    ).toBe(false)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: true,
        hasMembership: false,
        catalogSettled: isReadPanelCatalogSettled({
          languageCode: 'en',
          catalogSettled: false,
          hasKnownNoHelps: false,
        }),
      })
    ).toBe(true)
  })

  test('OBS-only Bible mode is settled empty, not a pending catalog spinner', () => {
    expect(
      isReadPanelCatalogSettled({
        languageCode: 'fr',
        catalogSettled: false,
        hasKnownMismatch: true,
      })
    ).toBe(true)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: false,
        hasMembership: false,
        catalogSettled: isReadPanelCatalogSettled({
          languageCode: 'fr',
          catalogSettled: false,
          hasKnownMismatch: true,
        }),
      })
    ).toBe(false)
    expect(
      isReadPanelCatalogSettled({
        languageCode: 'en',
        catalogSettled: false,
      })
    ).toBe(false)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: true,
        hasMembership: false,
        catalogSettled: isReadPanelCatalogSettled({
          languageCode: 'en',
          catalogSettled: false,
        }),
      })
    ).toBe(true)
  })

  test('dest panel-2 scripture load only marks panel-2', () => {
    expect(
      destPanelsForCatalogLoad({ loadTarget: 'text', destPanelId: 'panel-2' })
    ).toEqual(['panel-2'])
    expect(destPanelsForCatalogLoad({ loadTarget: 'both' })).toEqual([
      'panel-1',
      'panel-2',
    ])
  })

  test('ult#2 resolves to base ULT content when instance was not projected', () => {
    const loaded = { 'unfoldingWord/en/ult': ult('unfoldingWord/en/ult') }
    const resolved = resolveLoadedPanelResource(loaded, 'unfoldingWord/en/ult#2')
    expect(resolved?.id).toBe('unfoldingWord/en/ult#2')
    expect(resolved?.key).toBe('unfoldingWord/en/ult')
    expect(resolved?.title).toBe('ULT')
  })
})

import { describe, expect, test } from 'bun:test'
import { hydrateReadCatalogHits } from './hydrateReadCatalogHits'
import type { CatalogEntry } from './readCatalogIdentity'

const FROZEN_HITS: CatalogEntry[] = [
  {
    name: 'bho_obs',
    owner: 'unfoldingWord',
    language: 'bho',
    identifier: 'obs',
    title: 'Bhojpuri OBS',
    subject: 'Open Bible Stories',
    release: { tag_name: 'v1' },
  },
  {
    name: 'en_tn',
    owner: 'unfoldingWord',
    language: 'en',
    identifier: 'tn',
    title: 'English TN',
    subject: 'TSV Translation Notes',
    release: { tag_name: 'v1' },
  },
  {
    name: 'en_twl',
    owner: 'unfoldingWord',
    language: 'en',
    identifier: 'twl',
    title: 'English TWL',
    subject: 'TSV Translation Words Links',
    release: { tag_name: 'v1' },
  },
]

function registry() {
  return {
    getTypeForSubject: (subject: string) => {
      if (subject === 'Open Bible Stories') return 'obs'
      if (subject === 'TSV Translation Notes') return 'notes'
      if (subject === 'TSV Translation Words Links') return 'words-links'
      if (subject === 'Aligned Bible' || subject === 'Bible') return 'scripture'
      return undefined
    },
    get: (typeId: string) => ({
      contentRole: typeId === 'obs' || typeId === 'scripture' ? 'primary' : 'companion',
    }),
    getScopeForType: (typeId: string) =>
      typeId === 'obs' ? 'obs' : typeId === 'scripture' ? 'scripture' : 'shared',
  }
}

function viewer() {
  return { hasViewer: () => true }
}

describe('hydrateReadCatalogHits', () => {
  test('text target assigns primary to panel-1 and skips companions', () => {
    const added: Array<{ key: string; panelId?: string }> = []
    const result = hydrateReadCatalogHits({
      catalogResults: FROZEN_HITS,
      languageCode: 'bho',
      target: 'text',
      resourceTypeRegistry: registry(),
      viewerRegistry: viewer(),
      getPanel: () => ({ resourceKeys: [] }),
      addResource: (resource, options) => {
        added.push({ key: resource.key, panelId: options?.panelId })
      },
      setActiveResourceInPanel: () => undefined,
    })

    expect(result.expectedTextKeys).toEqual(['unfoldingWord/bho/obs'])
    expect(result.expectedHelpsKeys).toEqual([])
    expect(added).toEqual([{ key: 'unfoldingWord/bho/obs', panelId: 'panel-1' }])
  })

  test('helps target assigns companions to panel-2 and skips primary', () => {
    const added: Array<{ key: string; panelId?: string }> = []
    const result = hydrateReadCatalogHits({
      catalogResults: FROZEN_HITS,
      languageCode: 'en',
      target: 'helps',
      resourceTypeRegistry: registry(),
      viewerRegistry: viewer(),
      getPanel: () => ({ resourceKeys: [] }),
      addResource: (resource, options) => {
        added.push({ key: resource.key, panelId: options?.panelId })
      },
      setActiveResourceInPanel: () => undefined,
    })

    expect(result.expectedTextKeys).toEqual([])
    expect(result.expectedHelpsKeys).toEqual([
      'unfoldingWord/en/tn',
      'unfoldingWord/en/twl',
    ])
    expect(added).toEqual([
      { key: 'unfoldingWord/en/tn', panelId: 'panel-2' },
      { key: 'unfoldingWord/en/twl', panelId: 'panel-2' },
    ])
  })

  test('same-language both assigns primary and companions', () => {
    const enHits: CatalogEntry[] = [
      {
        name: 'en_ult',
        owner: 'unfoldingWord',
        language: 'en',
        identifier: 'ult',
        title: 'ULT',
        subject: 'Aligned Bible',
        release: { tag_name: 'v1' },
      },
      FROZEN_HITS[1]!,
      FROZEN_HITS[2]!,
    ]
    const added: Array<{ key: string; panelId?: string }> = []
    const result = hydrateReadCatalogHits({
      catalogResults: enHits,
      languageCode: 'en',
      target: 'both',
      resourceTypeRegistry: registry(),
      viewerRegistry: viewer(),
      getPanel: () => ({ resourceKeys: [] }),
      addResource: (resource, options) => {
        added.push({ key: resource.key, panelId: options?.panelId })
      },
      setActiveResourceInPanel: () => undefined,
    })

    expect(result.expectedTextKeys).toEqual(['unfoldingWord/en/ult'])
    expect(result.expectedHelpsKeys).toEqual([
      'unfoldingWord/en/tn',
      'unfoldingWord/en/twl',
    ])
    expect(added).toEqual([
      { key: 'unfoldingWord/en/ult', panelId: 'panel-1' },
      { key: 'unfoldingWord/en/tn', panelId: 'panel-2' },
      { key: 'unfoldingWord/en/twl', panelId: 'panel-2' },
    ])
  })

  test('same-language dest panel-2 requests a new instance so LinkedPanels ids stay unique', () => {
    const enUlt: CatalogEntry[] = [
      {
        name: 'en_ult',
        owner: 'unfoldingWord',
        language: 'en',
        identifier: 'ult',
        title: 'ULT',
        subject: 'Aligned Bible',
        release: { tag_name: 'v1' },
      },
    ]
    const added: Array<{ key: string; panelId?: string; allowMultipleInstances?: boolean }> = []
    hydrateReadCatalogHits({
      catalogResults: enUlt,
      languageCode: 'en',
      target: 'text',
      destPanelId: 'panel-2',
      resourceTypeRegistry: registry(),
      viewerRegistry: viewer(),
      getPanel: (id) =>
        id === 'panel-1'
          ? { resourceKeys: ['unfoldingWord/en/ult'] }
          : { resourceKeys: [] },
      addResource: (resource, options) => {
        added.push({
          key: resource.key,
          panelId: options?.panelId,
          allowMultipleInstances: options?.allowMultipleInstances,
        })
      },
      setActiveResourceInPanel: () => undefined,
    })

    expect(added).toEqual([
      { key: 'unfoldingWord/en/ult', panelId: 'panel-2', allowMultipleInstances: true },
    ])
  })
})

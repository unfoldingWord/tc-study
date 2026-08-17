/**
 * Dual English scripture panes share book-scoped original-language tabs.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { addResource, getBaseResourceKey } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { hydrateOriginalLanguageResources } from './hydrateOriginalLanguageResources'
import { UHB_RESOURCE_KEY, UGNT_RESOURCE_KEY } from './originalLanguageForBook'
import { syncOriginalLanguageOnScripturePanels } from './originalLanguagePanelMembership'

enableMapSet()

const g = globalThis as typeof globalThis & { localStorage?: Storage }
if (!g.localStorage) {
  const mem = new Map<string, string>()
  g.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
}

function res(partial: Partial<ResourceInfo> & { key: string }): ResourceInfo {
  return {
    id: partial.key,
    key: partial.key,
    resourceKey: partial.key,
    resourceId: partial.key.split('/')[2] || 'x',
    server: 'git.door43.org',
    owner: partial.key.split('/')[0] || 'u',
    language: partial.languageCode || 'en',
    languageCode: partial.languageCode || 'en',
    title: partial.title || partial.key,
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
    ...partial,
  } as ResourceInfo
}

function resetStores() {
  useAppStore.setState({
    loadedResources: {},
    anchorResourceId: null,
    lastActiveScriptureResourceId: null,
    isInitialized: false,
  })
  useWorkspaceStore.setState({
    currentPackage: {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      resources: new Map(),
      panels: [
        { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
        { id: 'panel-2', name: 'P2', resourceKeys: [], activeIndex: 0, position: 1 },
      ],
    },
    isPackageModified: false,
  })
}

const dummyCatalog = {
  catalogAdapter: { get: async () => ({}) },
  door43Client: { searchCatalog: async () => [] },
  addResourceToCatalog: async () => undefined,
} as any

const dummyRegistry = {} as any

function panelKeys(id: 'panel-1' | 'panel-2'): string[] {
  return useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === id)!.resourceKeys
}

function baseTabKeys(keys: string[]): string[] {
  return keys.map(getBaseResourceKey)
}

function hydrateOrig(destPanelId: 'panel-1' | 'panel-2', currentBook: string) {
  return hydrateOriginalLanguageResources({
    catalogManager: dummyCatalog,
    resourceTypeRegistry: dummyRegistry,
    destPanelId,
    currentBook,
  })
}

function seedEnglishScripture(panelId: 'panel-1' | 'panel-2') {
  for (const id of ['ult', 'ust', 'bsb', 't4t']) {
    addResource(res({ key: `unfoldingWord/en/${id}` }), {
      panelId,
      allowMultipleInstances: true,
    })
  }
}

describe('original-language tabs (book-scoped, dual scripture)', () => {
  beforeEach(() => {
    resetStores()
  })

  test('two English scripture panels on Titus have the same tabs and no UHB', () => {
    seedEnglishScripture('panel-1')
    seedEnglishScripture('panel-2')
    hydrateOrig('panel-1', 'tit')
    hydrateOrig('panel-2', 'tit')

    const p1 = panelKeys('panel-1')
    const p2 = panelKeys('panel-2')
    expect(p1.some((k) => getBaseResourceKey(k) === UHB_RESOURCE_KEY)).toBe(false)
    expect(p2.some((k) => getBaseResourceKey(k) === UHB_RESOURCE_KEY)).toBe(false)
    expect(p1).toContain(UGNT_RESOURCE_KEY)
    expect(p2).toContain(`${UGNT_RESOURCE_KEY}#2`)
    expect(p1.at(-1)).toBe(UGNT_RESOURCE_KEY)
    expect(p2.at(-1)).toBe(`${UGNT_RESOURCE_KEY}#2`)
    expect(p1[0]).not.toBe(UGNT_RESOURCE_KEY)
    expect(baseTabKeys(p1).sort()).toEqual(baseTabKeys(p2).sort())
    expect(p1.filter((k) => p2.includes(k))).toEqual([])
    expect(p1).not.toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(p2).not.toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('empty scripture panel does not get UGNT as the only tab', () => {
    syncOriginalLanguageOnScripturePanels({
      bookCode: 'tit',
      scripturePanelIds: ['panel-1'],
    })
    expect(panelKeys('panel-1')).toEqual([])
  })

  test('Titus hydrate+sync appends UGNT (does not start with it)', () => {
    seedEnglishScripture('panel-1')
    hydrateOrig('panel-1', 'tit')
    syncOriginalLanguageOnScripturePanels({
      bookCode: 'tit',
      scripturePanelIds: ['panel-1'],
    })

    const p1 = panelKeys('panel-1')
    expect(p1).toEqual([
      'unfoldingWord/en/ult',
      'unfoldingWord/en/ust',
      'unfoldingWord/en/bsb',
      'unfoldingWord/en/t4t',
      UGNT_RESOURCE_KEY,
    ])
  })

  test('sync moves a leading UGNT to the end of the scripture panel', () => {
    addResource(res({ key: UGNT_RESOURCE_KEY }), { panelId: 'panel-1' })
    seedEnglishScripture('panel-1')
    expect(panelKeys('panel-1')[0]).toBe(UGNT_RESOURCE_KEY)

    syncOriginalLanguageOnScripturePanels({
      bookCode: 'tit',
      scripturePanelIds: ['panel-1'],
    })

    const p1 = panelKeys('panel-1')
    expect(p1.at(-1)).toBe(UGNT_RESOURCE_KEY)
    expect(p1[0]).not.toBe(UGNT_RESOURCE_KEY)
    expect(p1.filter((k) => getBaseResourceKey(k) === UGNT_RESOURCE_KEY)).toHaveLength(1)
  })

  test('switching Titus → Ruth drops UGNT and shows UHB on both scripture panels', () => {
    seedEnglishScripture('panel-1')
    seedEnglishScripture('panel-2')
    hydrateOrig('panel-1', 'tit')
    hydrateOrig('panel-2', 'tit')

    syncOriginalLanguageOnScripturePanels({
      bookCode: 'rut',
      scripturePanelIds: ['panel-1', 'panel-2'],
    })

    const p1 = panelKeys('panel-1')
    const p2 = panelKeys('panel-2')
    expect(p1.some((k) => getBaseResourceKey(k) === UGNT_RESOURCE_KEY)).toBe(false)
    expect(p2.some((k) => getBaseResourceKey(k) === UGNT_RESOURCE_KEY)).toBe(false)
    expect(p1).toContain(UHB_RESOURCE_KEY)
    expect(p2).toContain(`${UHB_RESOURCE_KEY}#2`)
    expect(p1.at(-1)).toBe(UHB_RESOURCE_KEY)
    expect(p2.at(-1)).toBe(`${UHB_RESOURCE_KEY}#2`)
    expect(baseTabKeys(p1).sort()).toEqual(baseTabKeys(p2).sort())
  })

  test('second sync is a no-op (no workspace or AppStore rewrite)', () => {
    seedEnglishScripture('panel-1')
    seedEnglishScripture('panel-2')
    hydrateOrig('panel-1', 'tit')
    hydrateOrig('panel-2', 'tit')
    syncOriginalLanguageOnScripturePanels({
      bookCode: 'tit',
      scripturePanelIds: ['panel-1', 'panel-2'],
    })

    const beforeKeys1 = [...panelKeys('panel-1')]
    const beforeKeys2 = [...panelKeys('panel-2')]
    const beforeLoaded = useAppStore.getState().loadedResources

    let workspaceWrites = 0
    let appWrites = 0
    const unsubWs = useWorkspaceStore.subscribe(() => {
      workspaceWrites++
    })
    const unsubApp = useAppStore.subscribe(() => {
      appWrites++
    })
    try {
      syncOriginalLanguageOnScripturePanels({
        bookCode: 'tit',
        scripturePanelIds: ['panel-1', 'panel-2'],
      })
      syncOriginalLanguageOnScripturePanels({
        bookCode: 'tit',
        scripturePanelIds: ['panel-1', 'panel-2'],
      })
    } finally {
      unsubWs()
      unsubApp()
    }

    expect(workspaceWrites).toBe(0)
    expect(appWrites).toBe(0)
    expect(panelKeys('panel-1')).toEqual(beforeKeys1)
    expect(panelKeys('panel-2')).toEqual(beforeKeys2)
    expect(useAppStore.getState().loadedResources).toBe(beforeLoaded)
  })

  test('leftover UHB from Ruth is removed when hydrating Titus on panel-1', () => {
    seedEnglishScripture('panel-1')
    hydrateOrig('panel-1', 'rut')
    expect(panelKeys('panel-1')).toContain(UHB_RESOURCE_KEY)

    hydrateOrig('panel-1', 'tit')
    const p1 = panelKeys('panel-1')
    expect(p1).not.toContain(UHB_RESOURCE_KEY)
    expect(p1.at(-1)).toBe(UGNT_RESOURCE_KEY)
  })

  test('ES vs EN scripture panels keep different gateway tabs while sharing UGNT on Titus', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', languageCode: 'en' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/es-419/glt', languageCode: 'es-419' }), {
      panelId: 'panel-2',
    })
    hydrateOrig('panel-1', 'tit')
    hydrateOrig('panel-2', 'tit')

    const p1 = panelKeys('panel-1')
    const p2 = panelKeys('panel-2')
    expect(p1).toContain('unfoldingWord/en/ult')
    expect(p2).toContain('unfoldingWord/es-419/glt')
    expect(p1).not.toContain('unfoldingWord/es-419/glt')
    expect(p2).not.toContain('unfoldingWord/en/ult')
    expect(p1).toContain(UGNT_RESOURCE_KEY)
    expect(p2).toContain(`${UGNT_RESOURCE_KEY}#2`)
    expect(p1.some((k) => getBaseResourceKey(k) === UHB_RESOURCE_KEY)).toBe(false)
    expect(p2.some((k) => getBaseResourceKey(k) === UHB_RESOURCE_KEY)).toBe(false)
  })
})

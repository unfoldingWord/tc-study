/**
 * Same-language dual scripture must not clone-sync or loop.
 * Mode switch p2 helps→scripture while both panels share languageCode.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { bindCombinedHelpsCompositionsForTest } from '../helps/testCompositionRegistry'
import {
  addResource,
  getBaseResourceKey,
  projectCurrentWorkspacePanels,
} from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  applyPanelMode,
  catalogTargetsForPanelModels,
  type ReadPanelModels,
} from './readPanelModel'
import {
  clearReadPanelsForLanguageSwitch,
  shouldReconcileHelpsOnPanelClear,
} from './clearReadPanelsForLanguageSwitch'
import { isPanelCatalogSpinner } from './panelCatalogLoading'
import { hydrateReadCatalogHits } from './hydrateReadCatalogHits'
import { resolveLoadedPanelResource } from './resolveLoadedPanelResource'
import type { CatalogEntry } from './readCatalogIdentity'
import { catalogLoadForSinglePanel } from './runReadPanelCatalog'

enableMapSet()

const unbindCompositions = bindCombinedHelpsCompositionsForTest()
afterAll(() => unbindCompositions())

const WRITE_CAP = 80

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

function res(partial: Partial<ResourceInfo> & { key: string; type?: string }): ResourceInfo {
  return {
    id: partial.key,
    key: partial.key,
    resourceKey: partial.key,
    resourceId: partial.key.split('/')[2] || 'x',
    server: 'git.door43.org',
    owner: partial.key.split('/')[0] || 'u',
    language: 'en',
    languageCode: 'en',
    title: partial.title || partial.key,
    subject: 'Aligned Bible',
    version: '1.0.0',
    type: (partial.type || 'scripture') as ResourceType,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    category: partial.type || 'scripture',
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

const EN_ULT_HIT: CatalogEntry = {
  name: 'en_ult',
  owner: 'unfoldingWord',
  language: 'en',
  identifier: 'ult',
  title: 'ULT',
  subject: 'Aligned Bible',
  release: { tag_name: 'v1' },
}

function registry() {
  return {
    getTypeForSubject: (subject: string) =>
      subject === 'Aligned Bible' || subject === 'Bible' ? 'scripture' : undefined,
    get: (typeId: string) => ({
      contentRole: typeId === 'scripture' ? 'primary' : 'companion',
    }),
    getScopeForType: (typeId: string) => (typeId === 'scripture' ? 'scripture' : null),
  }
}

describe('same-language dual scripture (no infinite loop)', () => {
  beforeEach(() => {
    resetStores()
  })

  test('mode switch to dual EN scripture does not unbounded-write or share LinkedPanels ids', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }), { panelId: 'panel-2' })
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }), { panelId: 'panel-2' })
    applyCombinedHelpsEnsure('en')

    const panels: ReadPanelModels = applyPanelMode(
      {
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      },
      'panel-2',
      'scripture'
    )
    expect(catalogTargetsForPanelModels(panels)).toEqual([
      { languageCode: 'en', target: 'text', destPanelId: 'panel-1' },
      { languageCode: 'en', target: 'text', destPanelId: 'panel-2' },
    ])
    const load = catalogLoadForSinglePanel(panels, 'panel-2')
    expect(load).toEqual({
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      loadTarget: 'text',
      destPanelId: 'panel-2',
    })
    expect(shouldReconcileHelpsOnPanelClear('text', 'panel-2')).toBe(false)

    let writes = 0
    const unsub = useWorkspaceStore.subscribe(() => {
      writes++
      if (writes > WRITE_CAP) throw new Error('unbounded workspace setState')
    })

    try {
      clearReadPanelsForLanguageSwitch('en', 'panel-2', { reconcileHelps: false })
      hydrateReadCatalogHits({
        catalogResults: [EN_ULT_HIT],
        languageCode: 'en',
        target: 'text',
        destPanelId: 'panel-2',
        resourceTypeRegistry: registry(),
        viewerRegistry: { hasViewer: () => true },
        getPanel: (id) => useWorkspaceStore.getState().getPanel(id),
        addResource,
        setActiveResourceInPanel: (panelId, index) => {
          useWorkspaceStore.getState().setActiveResourceInPanel(panelId, index)
        },
      })
      projectCurrentWorkspacePanels()
    } finally {
      unsub()
    }

    expect(writes).toBeGreaterThan(0)
    expect(writes).toBeLessThanOrEqual(WRITE_CAP)

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    expect(p1.resourceKeys).toContain('unfoldingWord/en/ult')
    expect(p2.resourceKeys).toContain('unfoldingWord/en/ult#2')
    expect(p1.resourceKeys.filter((k) => p2.resourceKeys.includes(k))).toEqual([])
    expect(p2.resourceKeys).not.toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(p1.resourceKeys).not.toContain(COMBINED_HELPS_RESOURCE_ID)

    const loaded = useAppStore.getState().loadedResources
    expect(loaded['unfoldingWord/en/ult#2']?.id).toBe('unfoldingWord/en/ult#2')
    expect(loaded['unfoldingWord/en/ult#2']?.key).toBe('unfoldingWord/en/ult')
    expect(
      isPanelCatalogSpinner({
        catalogLoading: true,
        hasMembership: p2.resourceKeys.includes('unfoldingWord/en/ult#2'),
      })
    ).toBe(false)
  })

  test('panel-2 scripture membership stops spinner even if instance was not projected', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), {
      panelId: 'panel-2',
      allowMultipleInstances: true,
    })
    const hung = { ...useAppStore.getState().loadedResources }
    delete hung['unfoldingWord/en/ult#2']
    const resolved = resolveLoadedPanelResource(hung, 'unfoldingWord/en/ult#2')
    expect(resolved?.id).toBe('unfoldingWord/en/ult#2')
    expect(resolved?.key).toBe('unfoldingWord/en/ult')
    expect(
      isPanelCatalogSpinner({
        catalogLoading: true,
        hasMembership: true,
      })
    ).toBe(false)
  })

  test('hydrate / mode switch never lists the same base resource twice on one panel', () => {
    function uniqueBases(keys: string[]) {
      const bases = keys.map(getBaseResourceKey)
      expect(bases).toEqual([...new Set(bases)])
    }

    function hydrateUlt(destPanelId: 'panel-1' | 'panel-2') {
      hydrateReadCatalogHits({
        catalogResults: [EN_ULT_HIT, { ...EN_ULT_HIT, title: 'ULT dup' }],
        languageCode: 'en',
        target: 'text',
        destPanelId,
        resourceTypeRegistry: registry(),
        viewerRegistry: { hasViewer: () => true },
        getPanel: (id) => useWorkspaceStore.getState().getPanel(id),
        addResource,
        setActiveResourceInPanel: (panelId, index) => {
          useWorkspaceStore.getState().setActiveResourceInPanel(panelId, index)
        },
      })
    }

    hydrateUlt('panel-1')
    hydrateUlt('panel-1')
    let pkg = useWorkspaceStore.getState().currentPackage!
    let p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    expect(p1.resourceKeys).toEqual(['unfoldingWord/en/ult'])
    uniqueBases(p1.resourceKeys)

    const panels: ReadPanelModels = applyPanelMode(
      {
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      },
      'panel-2',
      'scripture'
    )
    expect(catalogTargetsForPanelModels(panels)).toEqual([
      { languageCode: 'en', target: 'text', destPanelId: 'panel-1' },
      { languageCode: 'en', target: 'text', destPanelId: 'panel-2' },
    ])

    clearReadPanelsForLanguageSwitch('en', 'panel-2', { reconcileHelps: false })
    hydrateUlt('panel-2')
    hydrateUlt('panel-2')

    pkg = useWorkspaceStore.getState().currentPackage!
    p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    expect(p1.resourceKeys).toEqual(['unfoldingWord/en/ult'])
    expect(p2.resourceKeys).toEqual(['unfoldingWord/en/ult#2'])
    uniqueBases(p1.resourceKeys)
    uniqueBases(p2.resourceKeys)
    expect(p1.resourceKeys.filter((k) => p2.resourceKeys.includes(k))).toEqual([])
  })
})

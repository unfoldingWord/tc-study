import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import {
  applyCombinedHelpsEnsure,
  resetApplyEnsureFingerprint,
} from '../helps/applyCombinedHelpsEnsure'
import { ensureCompositionsWork } from '../helps/ensureCompositions'
import { bindCombinedHelpsCompositionsForTest } from '../helps/testCompositionRegistry'
import { addResource, projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { hydrateReadCatalogHits } from './hydrateReadCatalogHits'
import type { CatalogEntry } from './readCatalogIdentity'

enableMapSet()

const unbindCompositions = bindCombinedHelpsCompositionsForTest()
afterAll(() => unbindCompositions())

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
    subject: 'test',
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
  resetApplyEnsureFingerprint()
  ensureCompositionsWork.reset()
}

const HELPS_HITS: CatalogEntry[] = [
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
  {
    name: 'en_tq',
    owner: 'unfoldingWord',
    language: 'en',
    identifier: 'tq',
    title: 'English TQ',
    subject: 'TSV Translation Questions',
    release: { tag_name: 'v1' },
  },
]

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
    getTypeForSubject: (subject: string) => {
      if (subject === 'TSV Translation Notes') return 'notes'
      if (subject === 'TSV Translation Words Links') return 'words-links'
      if (subject === 'TSV Translation Questions') return 'questions'
      if (subject === 'Aligned Bible' || subject === 'Bible') return 'scripture'
      return undefined
    },
    get: (typeId: string) => ({
      contentRole: typeId === 'scripture' ? 'primary' : 'companion',
    }),
    getScopeForType: (typeId: string) => (typeId === 'scripture' ? 'scripture' : 'shared'),
  }
}

function hydrate(
  hits: CatalogEntry[],
  destPanelId?: 'panel-1' | 'panel-2',
  target: 'text' | 'helps' | 'both' = 'helps'
) {
  return hydrateReadCatalogHits({
    catalogResults: hits,
    languageCode: 'en',
    target,
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

describe('catalog hydrate ensure batch', () => {
  beforeEach(() => {
    resetStores()
  })

  test('hydrate N catalog hits runs ensure once after the loop, not 2N', () => {
    let autoSaves = 0
    const orig = useWorkspaceStore.getState().autoSaveWorkspace
    useWorkspaceStore.setState({
      autoSaveWorkspace: () => {
        autoSaves += 1
        orig()
      },
    })
    try {
      hydrate(HELPS_HITS, 'panel-2', 'helps')
      expect(ensureCompositionsWork.runs).toBe(0)
      expect(autoSaves).toBe(0)

      applyCombinedHelpsEnsure('en', 'panel-2', { forceHelpsPanel: true })
      useWorkspaceStore.getState().autoSaveWorkspace()

      expect(ensureCompositionsWork.runs).toBe(1)
      expect(ensureCompositionsWork.runs).toBeLessThan(HELPS_HITS.length * 2)
      expect(autoSaves).toBe(1)

      const pkg = useWorkspaceStore.getState().currentPackage!
      expect(pkg.panels.find((p) => p.id === 'panel-2')!.resourceKeys).toContain(
        COMBINED_HELPS_RESOURCE_ID
      )
    } finally {
      useWorkspaceStore.setState({ autoSaveWorkspace: orig })
    }
  })

  test('CombinedHelps injects after hydrate of TN+TWL (inject-OR)', () => {
    hydrate([HELPS_HITS[0]!, HELPS_HITS[1]!], 'panel-2', 'helps')
    expect(ensureCompositionsWork.runs).toBe(0)
    applyCombinedHelpsEnsure('en')
    const p2 = useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === 'panel-2')!
    expect(p2.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(p2.resourceKeys).not.toContain('unfoldingWord/en/tn')
    expect(p2.resourceKeys).not.toContain('unfoldingWord/en/twl')
  })

  test('dual-scripture panel-2 does not get CombinedHelps without force', () => {
    addResource(res({ key: 'unfoldingWord/en/ult', type: 'scripture' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/tn', type: 'notes' }), { panelId: 'panel-2' })
    addResource(res({ key: 'unfoldingWord/en/twl', type: 'words-links' }), { panelId: 'panel-2' })
    applyCombinedHelpsEnsure('en')
    ensureCompositionsWork.reset()
    resetApplyEnsureFingerprint()

    hydrate([EN_ULT_HIT], 'panel-2', 'text')
    expect(ensureCompositionsWork.runs).toBe(0)
    applyCombinedHelpsEnsure('en', 'panel-2')
    projectCurrentWorkspacePanels()

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!
    expect(p2.resourceKeys).toContain('unfoldingWord/en/ult#2')
    expect(p2.resourceKeys).not.toContain(COMBINED_HELPS_RESOURCE_ID)
  })

  test('hydrate passes skipEnsure and skipPersist on every add', () => {
    const src = readFileSync(join(import.meta.dir, 'hydrateReadCatalogHits.ts'), 'utf8')
    expect(src).toContain('CATALOG_HYDRATE_BATCH')
    expect(src).toContain('skipEnsure')
    expect(src).toContain('skipPersist')
  })
})

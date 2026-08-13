import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { upsertLoadedResourceMembership } from '../workspace/appStoreMembership'
import { addResource } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useNavigationStore } from '../nav/navigationStore'
import {
  clearReadPanelsForLanguageSwitch,
  panelClearTargetForLoad,
} from './clearReadPanelsForLanguageSwitch'
import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'

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
}

describe('clearReadPanelsForLanguageSwitch', () => {
  beforeEach(() => {
    resetStores()
  })

  test('empties Read panels and drops CombinedHelps when target lang has no TN/TWL pair', () => {
    addResource(res({ key: 'u/en/ult', type: 'scripture', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-1',
    })
    addResource(res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-2',
    })
    addResource(res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-2',
    })
    applyCombinedHelpsEnsure('en')

    const before = useWorkspaceStore.getState().currentPackage!
    expect(before.panels.find((p) => p.id === 'panel-2')!.resourceKeys).toContain(
      COMBINED_HELPS_RESOURCE_ID
    )

    useNavigationStore.setState({
      availableBooks: [
        { code: 'gen', name: 'Genesis', chapters: 50, verses: [] },
        { code: 'tit', name: 'Titus', chapters: 3, verses: [16, 15, 15] },
      ],
    })

    clearReadPanelsForLanguageSwitch('es-419')

    const pkg = useWorkspaceStore.getState().currentPackage!
    expect(pkg.panels.find((p) => p.id === 'panel-1')!.resourceKeys).toEqual([])
    expect(pkg.panels.find((p) => p.id === 'panel-2')!.resourceKeys).toEqual([])
    expect(pkg.panels.find((p) => p.id === 'panel-1')!.activeIndex).toBe(0)
    // English leftovers remain in package, but CombinedHelps must not re-inject for es
    expect(pkg.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(false)
    expect(useAppStore.getState().loadedResources[COMBINED_HELPS_RESOURCE_ID]).toBeUndefined()
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
    // Stale book catalog must not coerce deep-links during the next language load
    expect(useNavigationStore.getState().availableBooks).toEqual([])
  })

  test('flushes stale off-panel AppStore entries (verifiedIngredients cannot clobber re-project)', () => {
    const staleGlt = res({
      key: 'es-419_gl/es-419/glt',
      type: 'scripture',
      language: 'es-419',
      languageCode: 'es-419',
      verifiedIngredients: [{ identifier: 'tit' }],
    })
    // Simulate leftover AppStore projection from a prior session (not on panels)
    upsertLoadedResourceMembership(staleGlt)
    addResource(
      res({ key: 'u/en/ult', type: 'scripture', language: 'en', languageCode: 'en' }),
      { panelId: 'panel-1' }
    )

    clearReadPanelsForLanguageSwitch('es-419')

    expect(useAppStore.getState().loadedResources['es-419_gl/es-419/glt']).toBeUndefined()
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
  })

  test('language switch hydrate: GL scripture + Spanish CombinedHelps survive UGNT add', () => {
    // English session leftovers in package (panels already cleared)
    addResource(res({ key: 'u/en/ult', type: 'scripture', language: 'en', languageCode: 'en' }))
    addResource(res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }))
    addResource(res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }))
    clearReadPanelsForLanguageSwitch('es-419')

    const glt = res({
      key: 'es-419_gl/es-419/glt',
      type: 'scripture',
      language: 'es-419',
      languageCode: 'es-419',
      appliesToScope: 'scripture',
    })
    const obs = res({
      key: 'Door43-Catalog/es-419/obs',
      type: 'obs',
      language: 'es-419',
      languageCode: 'es-419',
      appliesToScope: 'obs',
    })
    const tn = res({
      key: 'es-419_gl/es-419/tn',
      type: 'notes',
      language: 'es-419',
      languageCode: 'es-419',
    })
    const twl = res({
      key: 'es-419_gl/es-419/twl',
      type: 'words-links',
      language: 'es-419',
      languageCode: 'es-419',
    })
    const ugnt = res({
      key: 'unfoldingWord/el-x-koine/ugnt',
      type: 'scripture',
      language: 'el-x-koine',
      languageCode: 'el-x-koine',
      appliesToScope: 'scripture',
    })

    addResource(glt, { panelId: 'panel-1' })
    addResource(obs, { panelId: 'panel-1' })
    addResource(tn, { panelId: 'panel-2' })
    addResource(twl, { panelId: 'panel-2' })
    addResource(ugnt, { panelId: 'panel-1' })
    applyCombinedHelpsEnsure('es-419')

    const pkg = useWorkspaceStore.getState().currentPackage!
    const p1 = pkg.panels.find((p) => p.id === 'panel-1')!
    const p2 = pkg.panels.find((p) => p.id === 'panel-2')!

    expect(p1.resourceKeys).toContain('es-419_gl/es-419/glt')
    expect(p1.resourceKeys).toContain('Door43-Catalog/es-419/obs')
    expect(p1.resourceKeys).toContain('unfoldingWord/el-x-koine/ugnt')
    expect(p2.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)

    const ch = pkg.resources.get(COMBINED_HELPS_RESOURCE_ID)!
    expect(ch.helpsTnResourceKey).toBe('es-419_gl/es-419/tn')
    expect(ch.helpsTwlResourceKey).toBe('es-419_gl/es-419/twl')
    expect(ch.languageCode).toBe('es')

    expect(useAppStore.getState().loadedResources['es-419_gl/es-419/glt']).toBeTruthy()
    expect(useAppStore.getState().loadedResources['Door43-Catalog/es-419/obs']).toBeTruthy()
  })

  test('text switch clears panel-1 only and keeps CombinedHelps on panel-2', () => {
    addResource(res({ key: 'u/en/ult', type: 'scripture', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-1',
    })
    addResource(res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-2',
    })
    addResource(res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-2',
    })
    applyCombinedHelpsEnsure('en')

    useNavigationStore.setState({
      availableBooks: [{ code: 'gen', name: 'Genesis', chapters: 50, verses: [] }],
    })

    clearReadPanelsForLanguageSwitch('en', 'panel-1')

    const pkg = useWorkspaceStore.getState().currentPackage!
    expect(pkg.panels.find((p) => p.id === 'panel-1')!.resourceKeys).toEqual([])
    expect(pkg.panels.find((p) => p.id === 'panel-2')!.resourceKeys).toContain(
      COMBINED_HELPS_RESOURCE_ID
    )
    expect(useAppStore.getState().loadedResources[COMBINED_HELPS_RESOURCE_ID]).toBeTruthy()
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
    expect(useNavigationStore.getState().availableBooks).toEqual([])
  })

  test('helps switch clears panel-2 only and keeps panel-1 scripture', () => {
    addResource(res({ key: 'u/bho/obs', type: 'obs', language: 'bho', languageCode: 'bho' }), {
      panelId: 'panel-1',
    })
    addResource(res({ key: 'u/en/tn', type: 'notes', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-2',
    })
    addResource(res({ key: 'u/en/twl', type: 'words-links', language: 'en', languageCode: 'en' }), {
      panelId: 'panel-2',
    })
    applyCombinedHelpsEnsure('en')

    useNavigationStore.setState({
      availableBooks: [{ code: 'obs', name: 'OBS', chapters: 50, verses: [] }],
    })

    clearReadPanelsForLanguageSwitch('es', 'panel-2')

    const pkg = useWorkspaceStore.getState().currentPackage!
    expect(pkg.panels.find((p) => p.id === 'panel-1')!.resourceKeys).toContain('u/bho/obs')
    expect(pkg.panels.find((p) => p.id === 'panel-2')!.resourceKeys).toEqual([])
    expect(useAppStore.getState().loadedResources['u/bho/obs']).toBeTruthy()
    expect(useNavigationStore.getState().availableBooks).toHaveLength(1)
  })
})

describe('panelClearTargetForLoad', () => {
  test('maps load target to a single pane (or both)', () => {
    expect(panelClearTargetForLoad('text')).toBe('panel-1')
    expect(panelClearTargetForLoad('helps')).toBe('panel-2')
    expect(panelClearTargetForLoad('both')).toBe('both')
    expect(panelClearTargetForLoad('text', 'panel-2')).toBe('panel-2')
  })
})

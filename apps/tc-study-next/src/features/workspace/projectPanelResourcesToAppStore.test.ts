import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { upsertLoadedResourceMembership } from './appStoreMembership'
import {
  collectPanelResourceKeys,
  existingPanelInstanceId,
  generateInstanceId,
  getBaseResourceKey,
  projectPanelResourcesToAppStore,
} from './projectPanelResourcesToAppStore'
import {
  addResource,
  assignResourceToPanel,
  removeResourceFromPanel,
} from './resourceMutations'

enableMapSet()

// Node/bun test env may lack browser storage used by workspace auto-save
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

describe('projectPanelResourcesToAppStore', () => {
  beforeEach(() => {
    resetStores()
  })

  test('getBaseResourceKey and generateInstanceId follow #N rules', () => {
    expect(getBaseResourceKey('u/en/ult')).toBe('u/en/ult')
    expect(getBaseResourceKey('u/en/ult#2')).toBe('u/en/ult')
    expect(generateInstanceId('u/en/ult', [])).toBe('u/en/ult')
    expect(generateInstanceId('u/en/ult', ['u/en/ult'])).toBe('u/en/ult#2')
    expect(generateInstanceId('u/en/ult', ['u/en/ult', 'u/en/ult#2'])).toBe('u/en/ult#3')
    expect(existingPanelInstanceId(['u/en/ult', 'u/en/tn'], 'u/en/ult#2')).toBe('u/en/ult')
    expect(existingPanelInstanceId(['u/en/ult#2'], 'u/en/ult')).toBe('u/en/ult#2')
    expect(existingPanelInstanceId(['u/en/tn'], 'u/en/ult')).toBeUndefined()
  })

  test('projector upserts every panel resourceKey into AppStore', () => {
    const ult = res({ key: 'u/en/ult' })
    const tn = res({ key: 'u/en/tn', type: 'notes' })
    const resources = new Map([
      [ult.key, ult],
      [tn.key, tn],
    ])
    const panels = [
      { resourceKeys: ['u/en/ult', 'u/en/ult#2'] },
      { resourceKeys: ['u/en/tn'] },
    ]

    const result = projectPanelResourcesToAppStore({ panels, resources })
    expect(result.projected.sort()).toEqual(['u/en/tn', 'u/en/ult', 'u/en/ult#2'].sort())
    expect(result.missing).toEqual([])

    const loaded = useAppStore.getState().loadedResources
    expect(loaded['u/en/ult']?.key).toBe('u/en/ult')
    expect(loaded['u/en/ult#2']?.id).toBe('u/en/ult#2')
    expect(loaded['u/en/ult#2']?.key).toBe('u/en/ult')
    expect(loaded['u/en/tn']?.id).toBe('u/en/tn')
  })

  test('mutations: assign projects; remove prunes unused runtime entry', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })

    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
    expect(
      collectPanelResourceKeys(useWorkspaceStore.getState().currentPackage!.panels).has(
        'u/en/ult'
      )
    ).toBe(true)

    const tq = res({ key: 'u/en/tq', type: 'questions' })
    // Package-only until assign — projector owns AppStore membership
    addResource(tq)
    expect(useAppStore.getState().loadedResources['u/en/tq']).toBeUndefined()
    assignResourceToPanel('u/en/tq', 'panel-2')
    expect(useAppStore.getState().loadedResources['u/en/tq']).toBeTruthy()

    removeResourceFromPanel('u/en/tq', 'panel-2')
    expect(useAppStore.getState().loadedResources['u/en/tq']).toBeUndefined()
    // Still on panel-1
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
  })

  test('remove does not prune when key remains on another panel', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })
    assignResourceToPanel('u/en/ult', 'panel-2')

    removeResourceFromPanel('u/en/ult', 'panel-1')
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
  })

  test('second projection does not rewrite unchanged loadedResources', () => {
    const ult = res({ key: 'u/en/ult' })
    const resources = new Map([[ult.key, ult]])
    const panels = [{ resourceKeys: ['u/en/ult', 'u/en/ult#2'] }]

    projectPanelResourcesToAppStore({ panels, resources })
    const first = useAppStore.getState().loadedResources
    const firstUlt = first['u/en/ult']
    const firstUlt2 = first['u/en/ult#2']

    let writes = 0
    const unsub = useAppStore.subscribe(() => {
      writes++
    })
    try {
      projectPanelResourcesToAppStore({ panels, resources })
    } finally {
      unsub()
    }

    expect(writes).toBe(0)
    const second = useAppStore.getState().loadedResources
    expect(second['u/en/ult']).toBe(firstUlt)
    expect(second['u/en/ult#2']).toBe(firstUlt2)
  })

  test('projector preserves runtime toc on upsert', () => {
    const ult = res({ key: 'u/en/ult' })
    upsertLoadedResourceMembership({
      ...ult,
      toc: { books: [{ code: 'GEN', name: 'Genesis' }], resourceId: 'ult', resourceType: 'scripture' },
    })

    const result = projectPanelResourcesToAppStore({
      panels: [{ resourceKeys: ['u/en/ult'] }],
      resources: new Map([[ult.key, ult]]),
    })
    expect(result.projected).toEqual(['u/en/ult'])
    expect(useAppStore.getState().loadedResources['u/en/ult']?.toc?.books?.[0]?.code).toBe('GEN')
  })
})

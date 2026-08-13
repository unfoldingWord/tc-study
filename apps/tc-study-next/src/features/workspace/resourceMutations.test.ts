/**
 * Public resourceMutations: panel assign projects; modal-only stays package-only.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  addResource,
  assignResourceToPanel,
  removeResourceFromPanel,
} from './resourceMutations'

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

describe('resourceMutations', () => {
  beforeEach(() => {
    resetStores()
  })

  test('modal-only addResource(info) is package-only — no AppStore membership / no panel key', () => {
    const tw = res({ key: 'u/en/tw', type: 'words' })
    const id = addResource(tw)
    expect(id).toBe('u/en/tw')

    const pkg = useWorkspaceStore.getState().currentPackage!
    expect(pkg.resources.has('u/en/tw')).toBe(true)
    expect(pkg.panels.every((p) => !p.resourceKeys.includes('u/en/tw'))).toBe(true)
    expect(useAppStore.getState().loadedResources['u/en/tw']).toBeUndefined()
  })

  test('addResource with panelId projects membership via projector', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
    expect(
      useWorkspaceStore.getState().currentPackage!.panels[0].resourceKeys
    ).toContain('u/en/ult')
  })

  test('allowMultipleInstances does not put ult and ult#2 on the same panel', () => {
    const ult = res({ key: 'u/en/ult' })
    const first = addResource(ult, { panelId: 'panel-1' })
    const second = addResource(ult, { panelId: 'panel-1', allowMultipleInstances: true })
    const third = addResource(ult, { panelId: 'panel-2', allowMultipleInstances: true })

    expect(first).toBe('u/en/ult')
    expect(second).toBe('u/en/ult')
    expect(third).toBe('u/en/ult#2')

    const pkg = useWorkspaceStore.getState().currentPackage!
    expect(pkg.panels[0]!.resourceKeys).toEqual(['u/en/ult'])
    expect(pkg.panels[1]!.resourceKeys).toEqual(['u/en/ult#2'])
  })

  test('assign after modal-only add creates membership; remove prunes', () => {
    const tn = res({ key: 'u/en/tn', type: 'notes' })
    addResource(tn)
    expect(useAppStore.getState().loadedResources['u/en/tn']).toBeUndefined()

    assignResourceToPanel('u/en/tn', 'panel-2')
    expect(useAppStore.getState().loadedResources['u/en/tn']).toBeTruthy()

    removeResourceFromPanel('u/en/tn', 'panel-2')
    expect(useAppStore.getState().loadedResources['u/en/tn']).toBeUndefined()
  })
})

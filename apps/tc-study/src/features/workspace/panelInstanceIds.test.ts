import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { addResource } from './resourceMutations'
import {
  ensureUniqueCrossPanelInstanceIds,
  matchResourceForInstanceKey,
  panelKeysOverlap,
  stampResourceInstanceId,
} from './panelInstanceIds'

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
    language: 'en',
    languageCode: 'en',
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

function panelKeys(id: 'panel-1' | 'panel-2'): string[] {
  return useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === id)!.resourceKeys
}

describe('panelInstanceIds', () => {
  beforeEach(() => {
    resetStores()
  })

  test('stamp and match keep instance id for tab selection', () => {
    const base = res({ key: 'unfoldingWord/en/ust' })
    const stamped = stampResourceInstanceId(base, 'unfoldingWord/en/ust#2')
    expect(stamped.id).toBe('unfoldingWord/en/ust#2')
    expect(stamped.key).toBe('unfoldingWord/en/ust')

    const matched = matchResourceForInstanceKey(
      'unfoldingWord/en/ust#2',
      ['unfoldingWord/en/ust#2'],
      [base]
    )
    expect(matched?.id).toBe('unfoldingWord/en/ust#2')
    expect(matched?.key).toBe('unfoldingWord/en/ust')
  })

  test('colliding dual-scripture keys remint panel-2 so LinkedPanels ids stay unique', () => {
    addResource(res({ key: 'unfoldingWord/en/ult' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/ust' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/bsb' }), { panelId: 'panel-1' })
    useWorkspaceStore.setState((state) => {
      const p2 = state.currentPackage?.panels.find((p) => p.id === 'panel-2')
      if (!p2) return
      p2.resourceKeys = ['unfoldingWord/en/ult', 'unfoldingWord/en/ust', 'unfoldingWord/en/bsb']
      p2.activeIndex = 0
    })

    expect(panelKeysOverlap(panelKeys('panel-1'), panelKeys('panel-2')).length).toBeGreaterThan(0)

    const reminted = ensureUniqueCrossPanelInstanceIds()
    expect(reminted).toContain('unfoldingWord/en/ult#2')
    expect(reminted).toContain('unfoldingWord/en/ust#2')
    expect(panelKeys('panel-1')).toEqual([
      'unfoldingWord/en/ult',
      'unfoldingWord/en/ust',
      'unfoldingWord/en/bsb',
    ])
    expect(panelKeys('panel-2')).toEqual([
      'unfoldingWord/en/ult#2',
      'unfoldingWord/en/ust#2',
      'unfoldingWord/en/bsb#2',
    ])
    expect(panelKeysOverlap(panelKeys('panel-1'), panelKeys('panel-2'))).toEqual([])
    expect(useAppStore.getState().loadedResources['unfoldingWord/en/ust#2']?.id).toBe(
      'unfoldingWord/en/ust#2'
    )
  })

  test('second ensure is a no-op when ids are already unique', () => {
    addResource(res({ key: 'unfoldingWord/en/ult' }), { panelId: 'panel-1' })
    addResource(res({ key: 'unfoldingWord/en/ult' }), {
      panelId: 'panel-2',
      allowMultipleInstances: true,
    })
    expect(panelKeys('panel-2')).toEqual(['unfoldingWord/en/ult#2'])

    let writes = 0
    const unsub = useWorkspaceStore.subscribe(() => {
      writes++
    })
    try {
      expect(ensureUniqueCrossPanelInstanceIds()).toEqual([])
      expect(ensureUniqueCrossPanelInstanceIds()).toEqual([])
    } finally {
      unsub()
    }
    expect(writes).toBe(0)
  })
})

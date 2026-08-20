import { afterEach, describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { setActiveResourceTypeRegistry } from '../../resourceTypes/activeRegistry'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { bindCombinedHelpsCompositionsForTest } from '../helps/testCompositionRegistry'
import {
  loadPersistedWorkspacePackage,
  persistWorkspacePackage,
  WORKSPACE_STORAGE_KEY,
} from './workspacePersistence'
import type { WorkspacePackage } from './workspaceTypes'

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.TSV,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

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

describe('workspace persist ensure waits for compositions', () => {
  afterEach(() => {
    setActiveResourceTypeRegistry(null)
    g.localStorage?.removeItem(WORKSPACE_STORAGE_KEY)
  })

  test('load is a no-op before registry bind, then injects after compositions register', () => {
    setActiveResourceTypeRegistry(null)
    const pkg: WorkspacePackage = {
      id: 'p',
      name: 'P',
      version: '1.0.0',
      resources: new Map([
        ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
        ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ]),
      panels: [
        { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
        { id: 'panel-2', name: 'P2', resourceKeys: ['u/en/tn', 'u/en/twl'], activeIndex: 0, position: 1 },
      ],
    }
    persistWorkspacePackage(pkg)

    const early = loadPersistedWorkspacePackage()
    expect(early).toBeTruthy()
    expect(early!.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(false)
    expect(early!.panels[1]!.resourceKeys).toEqual(['u/en/tn', 'u/en/twl'])

    const unbind = bindCombinedHelpsCompositionsForTest()
    try {
      const later = loadPersistedWorkspacePackage()
      expect(later!.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(true)
      expect(later!.panels[1]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
      expect(later!.resources.has('u/en/twl')).toBe(true)
    } finally {
      unbind()
    }
  })
})

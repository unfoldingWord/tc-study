/**
 * Persist may load while the composition registry is empty (ensure no-ops).
 * After bind, reensure must inject CombinedHelps and strip painted TN/TWL.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { setActiveResourceTypeRegistry } from '../../resourceTypes/activeRegistry'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { bindCombinedHelpsCompositionsForTest } from '../helps/testCompositionRegistry'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reensureCurrentWorkspaceCompositions } from './reensureWorkspaceCompositions'
import { useWorkspaceStore } from './workspaceStore'

enableMapSet()

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

function seedPersistedHelpsWithoutComposition(): void {
  useWorkspaceStore.setState({
    currentPackage: {
      id: 'p',
      name: 'P',
      version: '1.0.0',
      resources: new Map([
        ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
        ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ]),
      panels: [
        { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
        {
          id: 'panel-2',
          name: 'P2',
          resourceKeys: ['u/en/tn', 'u/en/twl'],
          activeIndex: 0,
          position: 1,
        },
      ],
    },
    isPackageModified: false,
  })
}

describe('reensureCurrentWorkspaceCompositions', () => {
  test('store hydrates persist at init so re-ensure after bind has panel keys', () => {
    const store = readFileSync(join(import.meta.dir, 'workspaceStore.ts'), 'utf8')
    expect(store).toContain('loadPersistedWorkspacePackage')
    expect(store).toContain('initialPackage')
    const init = readFileSync(
      join(import.meta.dir, '../../components/ResourceTypeInitializer.tsx'),
      'utf8'
    )
    expect(init).toContain('setActiveRegistries')
    expect(init).toContain('reensureCurrentWorkspaceCompositions()')
    const bindAt = init.lastIndexOf('setActiveRegistries')
    const reensureAt = init.indexOf('reensureCurrentWorkspaceCompositions()')
    expect(bindAt).toBeGreaterThan(-1)
    expect(reensureAt).toBeGreaterThan(bindAt)
    const reensure = readFileSync(join(import.meta.dir, 'reensureWorkspaceCompositions.ts'), 'utf8')
    expect(reensure).toContain('defaultHelpsPanelId()')
    expect(reensure).toContain('forceHelpsPanel: true')
  })

  afterEach(() => {
    setActiveResourceTypeRegistry(null)
    useWorkspaceStore.setState({
      currentPackage: {
        id: 'default',
        name: 'My Workspace',
        version: '1.0.0',
        resources: new Map(),
        panels: [
          { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
          { id: 'panel-2', name: 'P2', resourceKeys: [], activeIndex: 0, position: 1 },
        ],
      },
      isPackageModified: false,
    })
  })

  test('registry empty at persist → later register → CombinedHelps injected, TWL unpainted', () => {
    setActiveResourceTypeRegistry(null)
    seedPersistedHelpsWithoutComposition()

    expect(reensureCurrentWorkspaceCompositions()).toEqual([])
    const early = useWorkspaceStore.getState().currentPackage!
    expect(early.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(false)
    expect(early.panels[1]!.resourceKeys).toEqual(['u/en/tn', 'u/en/twl'])

    const unbind = bindCombinedHelpsCompositionsForTest()
    try {
      const injected = reensureCurrentWorkspaceCompositions()
      expect(injected).toContain(COMBINED_HELPS_RESOURCE_ID)

      const later = useWorkspaceStore.getState().currentPackage!
      expect(later.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(true)
      expect(later.resources.has('u/en/tn')).toBe(true)
      expect(later.resources.has('u/en/twl')).toBe(true)
      expect(later.panels[1]!.resourceKeys).toEqual([COMBINED_HELPS_RESOURCE_ID])
      expect(later.panels[1]!.resourceKeys).not.toContain('u/en/twl')
      expect(later.panels[1]!.resourceKeys).not.toContain('u/en/tn')
    } finally {
      unbind()
    }
  })

  test('reensure force-injects CombinedHelps when panel-2 still has leftover scripture keys', () => {
    useWorkspaceStore.setState({
      currentPackage: {
        id: 'p',
        name: 'P',
        version: '1.0.0',
        resources: new Map([
          ['u/en/ult', res({ key: 'u/en/ult', type: 'scripture' })],
          ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
          ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
        ]),
        panels: [
          { id: 'panel-1', name: 'P1', resourceKeys: ['u/en/ult'], activeIndex: 0, position: 0 },
          {
            id: 'panel-2',
            name: 'P2',
            resourceKeys: ['u/en/ult#2', 'u/en/tn', 'u/en/twl'],
            activeIndex: 0,
            position: 1,
          },
        ],
      },
      isPackageModified: false,
    })

    const unbind = bindCombinedHelpsCompositionsForTest()
    try {
      expect(reensureCurrentWorkspaceCompositions()).toContain(COMBINED_HELPS_RESOURCE_ID)
      const later = useWorkspaceStore.getState().currentPackage!
      expect(later.panels[1]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
      expect(later.panels[1]!.resourceKeys).not.toContain('u/en/tn')
      expect(later.panels[1]!.resourceKeys).not.toContain('u/en/twl')
      expect(later.resources.has('u/en/tn')).toBe(true)
      expect(later.resources.has('u/en/twl')).toBe(true)
    } finally {
      unbind()
    }
  })
})

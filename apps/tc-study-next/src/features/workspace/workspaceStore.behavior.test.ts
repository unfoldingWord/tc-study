/**
 * Behavioral suite: workspace panel CRUD, persistence round-trip,
 * and resource mutations ↔ AppStore projection.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  addResource,
  moveResourceBetweenPanels,
  removeResourceFromPanel,
} from './resourceMutations'
import {
  loadPersistedWorkspacePackage,
  persistWorkspacePackage,
  serializeWorkspacePackage,
  WORKSPACE_STORAGE_KEY,
} from './workspacePersistence'
import { useWizardStore } from '../wizard/wizardStore'
import { useWorkspaceStore } from './workspaceStore'
import type { WorkspacePackage } from './workspaceTypes'

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
  useWizardStore.setState({
    wizardMode: null,
    wizardStep: null,
    selectedLanguages: new Set(),
    selectedOrganizations: new Set(),
    selectedResourceKeys: new Set(),
    availableLanguages: [],
    availableOrganizations: [],
    availableResources: new Map(),
  })
  g.localStorage?.removeItem(WORKSPACE_STORAGE_KEY)
}

describe('workspaceStore behavior', () => {
  beforeEach(() => {
    resetStores()
  })

  test('panel CRUD: add / rename / reorder / remove', () => {
    const ws = useWorkspaceStore.getState()
    const id = ws.addPanel('Extra')
    expect(id).toBeTruthy()
    expect(useWorkspaceStore.getState().currentPackage!.panels).toHaveLength(3)

    useWorkspaceStore.getState().renamePanel(id, 'Renamed')
    expect(
      useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === id)?.name
    ).toBe('Renamed')

    const panels = useWorkspaceStore.getState().currentPackage!.panels
    const reordered = [panels[2].id, panels[0].id, panels[1].id]
    useWorkspaceStore.getState().reorderPanels(reordered)
    expect(useWorkspaceStore.getState().currentPackage!.panels.map((p) => p.id)).toEqual(
      reordered
    )
    expect(useWorkspaceStore.getState().currentPackage!.panels[0].position).toBe(0)

    useWorkspaceStore.getState().removePanel(id)
    expect(useWorkspaceStore.getState().currentPackage!.panels).toHaveLength(2)
    expect(
      useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === id)
    ).toBeUndefined()
  })

  test('persistence round-trip keeps panel keys (wizard excluded)', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })
    useWizardStore.getState().startWizard('edit-workspace')
    useWizardStore.getState().toggleLanguage('en')
    expect(useWizardStore.getState().wizardMode).toBe('edit-workspace')
    expect(useWizardStore.getState().selectedLanguages.has('en')).toBe(true)

    const pkg = useWorkspaceStore.getState().currentPackage!
    persistWorkspacePackage(pkg)

    const raw = JSON.parse(g.localStorage!.getItem(WORKSPACE_STORAGE_KEY)!)
    expect(raw.wizardMode).toBeUndefined()
    expect(raw.wizardStep).toBeUndefined()
    expect(raw.selectedLanguages).toBeUndefined()

    useWizardStore.getState().closeWizard()
    useWorkspaceStore.setState({
      currentPackage: {
        id: 'empty',
        name: 'Empty',
        version: '1.0.0',
        resources: new Map(),
        panels: [
          { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
          { id: 'panel-2', name: 'P2', resourceKeys: [], activeIndex: 0, position: 1 },
        ],
      },
    })

    const loaded = loadPersistedWorkspacePackage()
    expect(loaded).toBeTruthy()
    expect(loaded!.resources.has('u/en/ult')).toBe(true)
    expect(loaded!.panels[0].resourceKeys).toContain('u/en/ult')

    useWorkspaceStore.getState().loadPackage(loaded!)
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
    expect(useWizardStore.getState().wizardMode).toBeNull()
    expect((useWorkspaceStore.getState() as Record<string, unknown>).wizardMode).toBeUndefined()
  })

  test('serializeWorkspacePackage uses resource entries', () => {
    const pkg: WorkspacePackage = {
      id: 's',
      name: 'S',
      version: '1',
      resources: new Map([['u/en/ult', res({ key: 'u/en/ult' })]]),
      panels: [{ id: 'panel-1', name: 'P1', resourceKeys: ['u/en/ult'], activeIndex: 0, position: 0 }],
    }
    const serialized = serializeWorkspacePackage(pkg)
    expect(Array.isArray(serialized.resources)).toBe(true)
    expect(serialized.resources[0][0]).toBe('u/en/ult')
  })

  test('move between panels projects once; remove prunes AppStore', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })
    moveResourceBetweenPanels('u/en/ult', 'panel-1', 'panel-2')

    const panels = useWorkspaceStore.getState().currentPackage!.panels
    expect(panels.find((p) => p.id === 'panel-1')!.resourceKeys).not.toContain('u/en/ult')
    expect(panels.find((p) => p.id === 'panel-2')!.resourceKeys).toContain('u/en/ult')
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()

    removeResourceFromPanel('u/en/ult', 'panel-2')
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
  })

  test('loadPackage projects panel membership to AppStore', () => {
    const ult = res({ key: 'u/en/ult' })
    const tn = res({ key: 'u/en/tn', type: 'notes' })
    useWorkspaceStore.getState().loadPackage({
      id: 'loaded',
      name: 'Loaded',
      version: '1.0.0',
      resources: new Map([
        [ult.key, ult],
        [tn.key, tn],
      ]),
      panels: [
        { id: 'panel-1', name: 'P1', resourceKeys: ['u/en/ult'], activeIndex: 0, position: 0 },
        { id: 'panel-2', name: 'P2', resourceKeys: ['u/en/tn'], activeIndex: 0, position: 1 },
      ],
    })

    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
    expect(useAppStore.getState().loadedResources['u/en/tn']).toBeTruthy()
  })

  test('removePanel projects and prunes AppStore for removed panel keys', () => {
    const ult = res({ key: 'u/en/ult' })
    const tn = res({ key: 'u/en/tn', type: 'notes' })
    addResource(ult, { panelId: 'panel-1' })
    addResource(tn, { panelId: 'panel-2' })

    useWorkspaceStore.getState().removePanel('panel-2')
    expect(useAppStore.getState().loadedResources['u/en/tn']).toBeUndefined()
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()
    expect(
      useWorkspaceStore.getState().currentPackage!.panels.find((p) => p.id === 'panel-2')
    ).toBeUndefined()
  })

  test('removeResourceFromPackage prunes panel membership and AppStore', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })
    useWorkspaceStore.getState().removeResourceFromPackage('u/en/ult')
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
    expect(
      useWorkspaceStore.getState().currentPackage!.panels[0].resourceKeys
    ).not.toContain('u/en/ult')
    expect(useWorkspaceStore.getState().currentPackage!.resources.has('u/en/ult')).toBe(false)
  })

  test('createNewPackage clears prior panel projection', () => {
    const ult = res({ key: 'u/en/ult' })
    addResource(ult, { panelId: 'panel-1' })
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeTruthy()

    useWorkspaceStore.getState().createNewPackage('Fresh')
    expect(useAppStore.getState().loadedResources['u/en/ult']).toBeUndefined()
    expect(useWorkspaceStore.getState().currentPackage!.name).toBe('Fresh')
    expect(
      useWorkspaceStore.getState().currentPackage!.panels.every((p) => p.resourceKeys.length === 0)
    ).toBe(true)
  })
})

/**
 * Shared Workspace store state/action contracts.
 * Slices under features/workspace compose into useWorkspaceStore.
 *
 * Wizard UI lives in features/wizard/wizardStore (ephemeral; not persisted here).
 */

import type { ResourceInfo } from '../../contexts/types'

export interface PanelConfig {
  id: string // Unique panel ID (e.g., 'panel-1', 'panel-2', 'panel-3')
  name: string // Display name (e.g., 'Panel 1', 'Left Panel')
  resourceKeys: string[] // Array of resourceKeys in this panel
  activeIndex: number // Which resource is currently active
  position: number // For ordering panels (0 = leftmost)
}

/**
 * Live workspace package layout (panel SoT).
 * UI/persistence may say "collection"; in-memory type name is WorkspacePackage.
 * See `lib/stores/stateOwnership.ts` (package vs collection vocabulary).
 */
export interface WorkspacePackage {
  id: string
  name: string
  version: string
  description?: string
  resources: Map<string, ResourceInfo>
  panels: PanelConfig[]
}

export interface WorkspaceState {
  currentPackage: WorkspacePackage | null
  isPackageModified: boolean
}

export interface WorkspaceActions {
  loadPackage: (pkg: WorkspacePackage) => void
  createNewPackage: (name: string) => void
  updatePackageInfo: (
    updates: Partial<Pick<WorkspacePackage, 'name' | 'version' | 'description'>>
  ) => void
  savePackage: () => Promise<void>
  saveAsCollection: (name?: string, description?: string) => Promise<string>
  loadFromCollection: (packageId: string) => Promise<void>
  autoSaveWorkspace: () => void
  loadSavedWorkspace: () => Promise<boolean>

  addPanel: (name?: string) => string
  removePanel: (panelId: string) => void
  reorderPanels: (panelIds: string[]) => void
  renamePanel: (panelId: string, name: string) => void

  addResourceToPackage: (resource: ResourceInfo) => void
  removeResourceFromPackage: (resourceKey: string) => void
  assignResourceToPanel: (resourceKey: string, panelId: string, index?: number) => void
  removeResourceFromPanel: (resourceKey: string, panelId: string) => void
  moveResourceBetweenPanels: (
    resourceKey: string,
    fromPanelId: string,
    toPanelId: string,
    insertIndex?: number
  ) => void
  reorderResourceInPanel: (resourceKey: string, panelId: string, newIndex: number) => void
  setActiveResourceInPanel: (panelId: string, index: number) => void

  hasResourceInPackage: (resourceKey: string) => boolean
  getPanel: (panelId: string) => PanelConfig | undefined
  getPanels: () => PanelConfig[]
  getResourcesForPanel: (panelId: string) => ResourceInfo[]
  getActiveResourceForPanel: (panelId: string) => ResourceInfo | null
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions

/** Immer-friendly set used by workspace slices (matches zustand/immer recipe usage). */
export type WorkspaceSet = (fn: (state: WorkspaceStore) => void) => void
export type WorkspaceGet = () => WorkspaceStore

export const DEFAULT_PACKAGE: WorkspacePackage = {
  id: 'default',
  name: 'My Workspace',
  version: '1.0.0',
  description: 'Default workspace package',
  resources: new Map(),
  panels: [
    {
      id: 'panel-1',
      name: 'Panel 1',
      resourceKeys: [],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'panel-2',
      name: 'Panel 2',
      resourceKeys: [],
      activeIndex: 0,
      position: 1,
    },
  ],
}

export function createEmptyPanels(): PanelConfig[] {
  return [
    {
      id: 'panel-1',
      name: 'Panel 1',
      resourceKeys: [],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'panel-2',
      name: 'Panel 2',
      resourceKeys: [],
      activeIndex: 0,
      position: 1,
    },
  ]
}

/** @deprecated Import from features/wizard — kept for transitional call sites */
export type { WizardMode, WizardStep } from '../wizard/wizardTypes'

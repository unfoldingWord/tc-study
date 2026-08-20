/** Shared Workspace store contracts. Wizard UI is features/wizard/wizardStore. */
import type { PanelEntryInstance } from '@bt-synergy/resource-types'
import type { ResourceInfo } from '../../contexts/types'
import type { ResourceWriteOptions } from './resourceWriteOptions'

/**
 * Workspace persist identity version. Do not bump package.version `"1.0.0"`.
 * v2 = panel.entries is membership SoT; resourceKeys is a painted projection.
 */
export const WORKSPACE_PERSIST_VERSION = 2

export interface PanelConfig {
  id: string // Unique panel ID (e.g., 'panel-1', 'panel-2', 'panel-3')
  name: string // Display name (e.g., 'Panel 1', 'Left Panel')
  /** Painted instance ids (derived from `entries` after ensure). Dual-read on load. */
  resourceKeys: string[]
  /** Pane membership SoT. Absent on pre-v2 persist → migrate from resourceKeys. */
  entries?: PanelEntryInstance[]
  /** Index into painted entries (`resourceKeys`). */
  activeIndex: number
  position: number
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
  /** Identity split version. Independent of package.version. */
  persistVersion?: number
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

  addResourceToPackage: (resource: ResourceInfo, options?: ResourceWriteOptions) => void
  removeResourceFromPackage: (resourceKey: string) => void
  assignResourceToPanel: (resourceKey: string, panelId: string, index?: number, options?: ResourceWriteOptions) => void
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
  persistVersion: WORKSPACE_PERSIST_VERSION,
  description: 'Default workspace package',
  resources: new Map(),
  panels: [
    {
      id: 'panel-1',
      name: 'Panel 1',
      resourceKeys: [],
      entries: [],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'panel-2',
      name: 'Panel 2',
      resourceKeys: [],
      entries: [],
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
      entries: [],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'panel-2',
      name: 'Panel 2',
      resourceKeys: [],
      entries: [],
      activeIndex: 0,
      position: 1,
    },
  ]
}

/** @deprecated Import from features/wizard — kept for transitional call sites */
export type { WizardMode, WizardStep } from '../wizard/wizardTypes'

/**
 * Workspace Zustand store facade — composes domain slices.
 * Persistence: workspacePersistence.ts (package only).
 * Wizard UI: features/wizard/wizardStore.ts (ephemeral, not composed here).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createPackageSlice } from './workspacePackageSlice'
import { createPanelSlice } from './workspacePanelSlice'
import { createResourceSlice } from './workspaceResourceSlice'
import {
  DEFAULT_PACKAGE,
  type WorkspaceGet,
  type WorkspaceSet,
  type WorkspaceStore,
} from './workspaceTypes'

export type {
  PanelConfig,
  WorkspacePackage,
  WorkspaceStore,
} from './workspaceTypes'

export const useWorkspaceStore = create<WorkspaceStore>()(
  immer((set, get) => {
    const wsSet = set as unknown as WorkspaceSet
    const wsGet = get as WorkspaceGet

    return {
      currentPackage: {
        ...DEFAULT_PACKAGE,
        resources: new Map(),
        panels: DEFAULT_PACKAGE.panels.map((p) => ({ ...p, resourceKeys: [...p.resourceKeys] })),
      },
      isPackageModified: false,

      ...createPackageSlice(wsSet, wsGet),
      ...createPanelSlice(wsSet, wsGet),
      ...createResourceSlice(wsSet, wsGet),
    }
  })
)

export {
  projectPanelResourcesToAppStore,
  collectPanelResourceKeys,
  generateInstanceId,
  getBaseResourceKey,
  buildProjectedResourceInstance,
} from './projectPanelResourcesToAppStore'
export type {
  PanelLike,
  ProjectPanelResourcesResult,
} from './projectPanelResourcesToAppStore'

export {
  projectCurrentWorkspacePanels,
  addResource,
  addResourceToPackage,
  assignResourceToPanel,
  removeResourceFromPanel,
  moveResourceBetweenPanels,
  reorderResourceInPanel,
  removeResourceFromPackage,
} from './resourceMutations'

export {
  useWorkspaceStore,
  type PanelConfig,
  type WorkspacePackage,
  type WorkspaceStore,
} from './workspaceStore'

export {
  useWizardStore,
  type WizardLanguage,
  type WizardMode,
  type WizardOrganization,
  type WizardStep,
  type WizardStore,
} from '../wizard'

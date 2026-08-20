// Base types (to prevent circular dependencies)
export type {
  ResourceLoader,
  ResourceViewerProps,
  ProgressCallback,
} from './base-types'

/** Catalog SoT — re-exported for loader consumers */
export type { ResourceMetadata } from '@bt-synergy/resource-catalog'

export { ResourceTypeRegistry } from './ResourceTypeRegistry'
export type { ResourceTypeRegistryConfig } from './ResourceTypeRegistry'
export { PanelEntryRegistry, entryTypeOf } from './PanelEntryRegistry'
export type { PanelEntryRegistryConfig } from './PanelEntryRegistry'
export { PanelModeRegistry } from './PanelModeRegistry'
export { PanelGroupRegistry } from './PanelGroupRegistry'
export {
  catalogLanguageListSubjects,
  paneTypeIdsForHelpsCatalogLoad,
  panelModesForType,
  subjectsForHelpsCatalogLoad,
  subjectsForLanguageList,
  typeIdsForHelpsCatalogLoad,
  typeMatchesHelpsCatalogLoad,
} from './subjectsForLanguageList'
export type {
  HelpsCatalogScope,
  HelpsCatalogTypeFields,
  LanguageListKind,
  LanguageListTypeFields,
  ResourcePanelMode,
} from './subjectsForLanguageList'
export { definePanelEntry, matchesEntryPersistId } from './panelEntry'
export type {
  PanelEntryDefinition,
  PanelEntryInstance,
  PanelEntryInjectWhen,
  PanelEntryKind,
  PanelEntryScope,
  PanelEntryType,
} from './panelEntry'
export { definePanelMode } from './panelMode'
export type { PanelModeDefinition } from './panelMode'
export { definePanelGroup } from './panelGroup'
export type { PanelGroupDefinition } from './panelGroup'
export {
  entryMatchesAvailabilityScope,
  subjectsForCompositionAvailability,
} from './subjectsForCompositionAvailability'
export type { CompositionAvailabilityEntry } from './subjectsForCompositionAvailability'
export { defineResourceType } from './types'
export type {
  ResourceTypeDefinition,
  ResourceTypeFeatures,
  ResourceTypeSettings,
  ResourceTypeSetting,
  SettingOption,
  LoaderConfig,
  APIFilters,
  PlatformViewers,
  SignalHandlerConfig,
  CommunicationConfig,
  ResourceDependency,
  PanelResourceDescriptor,
  ResourceSignal,
} from './types'
export { getPlatformViewer } from './platformViewer'
export type { EnhancedViewerProps } from './platformViewer'

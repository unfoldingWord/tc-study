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

// Base types (to prevent circular dependencies)
export type {
  ResourceLoader,
  ResourceViewerProps,
  ProgressCallback,
} from './base-types'

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
} from './types'
export { enhanceViewer, getPlatformViewer } from './enhanceViewer'
export type { EnhancedViewerProps } from './enhanceViewer'

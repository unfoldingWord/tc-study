// Core types - the foundation for all signals
export type {
  BaseSignal,
  BaseStateSignal,
  SignalType,
  ResourceType,
  /** Narrow panel filter metadata (not catalog SoT) */
  PanelResourceMetadata,
  /** @deprecated Use PanelResourceMetadata */
  ResourceMetadata,
  ResourceFilter
} from './core/types'

// Core hooks - for sending and receiving EVENT + STATE signals
export * from './hooks'

// STATE keys + contract types (scripture tokens, notes groups, OBS quotes)
export * from './state'

// Filtering utilities
export { matchesFilter, normalizeMetadata, normalizeFilter } from './utils/filterMatching'
export {
  toPanelResourceMetadata,
  type CatalogMetadataLike,
} from './utils/toPanelResourceMetadata'

// Backward compatibility - re-export from signals (which now just re-exports core/examples)
// @deprecated - Import from core or examples instead
export * from './signals'

// Shell container + plugin APIs — single public surface for apps (containers AND
// STATE). npm `linked-panels` is implementation under this package only; app
// code must not import `linked-panels` directly (DEV harness may allowlist).
export {
  LinkedPanel,
  LinkedPanelsContainer,
  createDefaultPluginRegistry,
  createPlugin,
} from 'linked-panels'

export type {
  BaseMessageContent,
  LinkedPanelsConfig,
  MessageTypePlugin,
  PanelConfig,
} from 'linked-panels'


// Core types - the foundation for all signals
export type {
  BaseSignal,
  SignalType,
  ResourceType,
  ResourceMetadata,
  ResourceFilter
} from './core/types'

// Core hooks - for sending and receiving signals
export * from './hooks'

// Filtering utilities
export { matchesFilter, normalizeMetadata, normalizeFilter } from './utils/filterMatching'

// Backward compatibility - re-export from signals (which now just re-exports core/examples)
// @deprecated - Import from core or examples instead
export * from './signals'

// Re-export commonly used types from linked-panels
export type { LinkedPanelsConfig, PanelConfig } from 'linked-panels'


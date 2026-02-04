/**
 * @deprecated Import from core or examples instead
 * 
 * Core types: import { BaseSignal, ResourceType, ResourceMetadata, ResourceFilter } from '@bt-synergy/resource-panels'
 * Example signals: import { TokenClickSignal, ... } from '@bt-synergy/resource-panels/examples'
 * 
 * This file is kept for backward compatibility only.
 */

// Re-export core types
export type {
  BaseSignal,
  SignalType,
  ResourceType,
  ResourceMetadata,
  ResourceFilter
} from '../core/types'

// Re-export example signals for backward compatibility
export type {
  TokenClickSignal,
  LinkClickSignal,
  VerseNavigationSignal,
  ResourceLoadRequestSignal,
  SelectionChangeSignal,
  CommonSignal
} from '../examples/commonSignals'

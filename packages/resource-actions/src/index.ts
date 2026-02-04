/**
 * @bt-synergy/resource-actions
 * 
 * Cross-platform resource action interfaces and hooks for BT Synergy apps.
 * Works with both React (web) and React Native.
 * 
 * @packageDocumentation
 */

// Types
export type {
  ResourceActionsProvider,
  PartialResourceActionsProvider,
  ExportFormat,
  DownloadProgress,
  DownloadOptions,
  ResourceUpdate,
  ShareOptions,
  ExportOptions,
  CollectionRef,
} from './types';

// Context
export { ResourceActionsContext } from './context';

// Hooks
export {
  useResourceActions,
  useHasResourceActions,
  useResourceManagement,
  useResourceCollections,
  useResourceSharing,
} from './hooks';

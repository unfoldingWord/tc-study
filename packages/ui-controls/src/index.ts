/**
 * @bt-synergy/ui-controls
 * 
 * Cross-platform UI control interfaces and hooks for BT Synergy apps.
 * Works with both React (web) and React Native.
 * 
 * @packageDocumentation
 */

// Types
export type {
  UIControlsProvider,
  PartialUIControlsProvider,
  ToastType,
  ToastPosition,
  ToastConfig,
  NotificationConfig,
  ModalSize,
  ModalConfig,
  ConfirmOptions,
  PromptOptions,
  LoadingOptions,
} from './types';

// Context
export { UIControlsContext } from './context';

// Hooks
export {
  useUIControls,
  useHasUIControls,
  useToast,
  useNotification,
  useModal,
  useDialog,
  useLoading,
} from './hooks';

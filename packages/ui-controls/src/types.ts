/**
 * Cross-platform UI control types for BT Synergy apps
 * 
 * These interfaces work with both React (web) and React Native.
 * Apps provide platform-specific implementations.
 */

import { type ReactNode } from 'react';

/**
 * Toast/notification severity levels
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error';

/**
 * Toast position (web primarily, mobile typically center)
 */
export type ToastPosition = 
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/**
 * Toast configuration
 */
export interface ToastConfig {
  /** Toast message */
  message: string;
  /** Toast type/severity */
  type?: ToastType;
  /** Duration in ms (0 = persist until dismissed) */
  duration?: number;
  /** Position on screen */
  position?: ToastPosition;
  /** Action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Unique ID for programmatic dismissal */
  id?: string;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  /** Notification title */
  title: string;
  /** Notification message/body */
  message: string;
  /** Notification type */
  type?: ToastType;
  /** Icon (component or string identifier) */
  icon?: ReactNode | string;
  /** Action buttons */
  actions?: Array<{
    label: string;
    onClick: () => void;
    primary?: boolean;
  }>;
  /** Auto-dismiss duration (0 = persist) */
  duration?: number;
  /** Unique ID */
  id?: string;
}

/**
 * Modal size options
 */
export type ModalSize = 'small' | 'medium' | 'large' | 'full';

/**
 * Modal configuration
 */
export interface ModalConfig {
  /** Modal title */
  title?: string;
  /** Modal content (React component) */
  content: ReactNode;
  /** Modal size */
  size?: ModalSize;
  /** Can close with backdrop/escape */
  dismissible?: boolean;
  /** Show close button */
  showCloseButton?: boolean;
  /** Footer buttons */
  actions?: Array<{
    label: string;
    onClick: (close: () => void) => void | Promise<void>;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
  }>;
  /** Unique ID */
  id?: string;
  /** Callback when closed */
  onClose?: () => void;
}

/**
 * Confirm dialog options
 */
export interface ConfirmOptions {
  /** Dialog title */
  title?: string;
  /** Confirmation message */
  message: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Variant (affects styling) */
  variant?: 'info' | 'warning' | 'danger';
  /** Icon */
  icon?: ReactNode | string;
}

/**
 * Prompt dialog options
 */
export interface PromptOptions {
  /** Dialog title */
  title?: string;
  /** Prompt message/question */
  message: string;
  /** Default input value */
  defaultValue?: string;
  /** Input placeholder */
  placeholder?: string;
  /** Input type */
  inputType?: 'text' | 'email' | 'password' | 'number' | 'textarea';
  /** Validation function */
  validate?: (value: string) => boolean | string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
}

/**
 * Loading indicator options
 */
export interface LoadingOptions {
  /** Loading message */
  message?: string;
  /** Show as overlay (blocks interaction) */
  overlay?: boolean;
  /** Unique ID for programmatic dismissal */
  id?: string;
}

/**
 * Cross-platform UI controls provider interface
 * 
 * Apps implement this interface to provide platform-specific UI controls.
 * Resource viewers use this interface through hooks.
 * 
 * @example Web implementation
 * ```ts
 * const controls: UIControlsProvider = {
 *   showToast: ({ message, type }) => {
 *     toast[type || 'info'](message);
 *   },
 *   openModal: async (config) => {
 *     return new Promise((resolve) => {
 *       // Show modal and resolve when closed
 *     });
 *   },
 *   // ...
 * }
 * ```
 * 
 * @example React Native implementation
 * ```ts
 * const controls: UIControlsProvider = {
 *   showToast: ({ message, type }) => {
 *     Toast.show({ text: message, type });
 *   },
 *   openModal: async (config) => {
 *     navigation.navigate('Modal', { config });
 *   },
 *   // ...
 * }
 * ```
 */
export interface UIControlsProvider {
  // ===== TOASTS =====
  
  /**
   * Show a toast notification (brief message)
   * @param config Toast configuration
   * @returns Toast ID for programmatic dismissal
   */
  showToast(config: ToastConfig): string;
  
  /**
   * Show a success toast (shorthand)
   * @param message Toast message
   * @returns Toast ID
   */
  showSuccess(message: string): string;
  
  /**
   * Show an error toast (shorthand)
   * @param message Toast message
   * @returns Toast ID
   */
  showError(message: string): string;
  
  /**
   * Show an info toast (shorthand)
   * @param message Toast message
   * @returns Toast ID
   */
  showInfo(message: string): string;
  
  /**
   * Show a warning toast (shorthand)
   * @param message Toast message
   * @returns Toast ID
   */
  showWarning(message: string): string;
  
  /**
   * Dismiss a specific toast
   * @param toastId Toast identifier
   */
  dismissToast(toastId: string): void;
  
  /**
   * Dismiss all toasts
   */
  dismissAllToasts(): void;
  
  // ===== NOTIFICATIONS =====
  
  /**
   * Show a notification (persistent message with actions)
   * @param config Notification configuration
   * @returns Notification ID
   */
  showNotification(config: NotificationConfig): string;
  
  /**
   * Dismiss a specific notification
   * @param notificationId Notification identifier
   */
  dismissNotification(notificationId: string): void;
  
  // ===== MODALS =====
  
  /**
   * Open a modal dialog
   * @param config Modal configuration
   * @returns Promise that resolves with modal result when closed
   */
  openModal<T = any>(config: ModalConfig): Promise<T | undefined>;
  
  /**
   * Close a specific modal
   * @param modalId Modal identifier
   */
  closeModal(modalId: string): void;
  
  /**
   * Close all modals
   */
  closeAllModals(): void;
  
  // ===== DIALOGS =====
  
  /**
   * Show a confirmation dialog
   * @param options Confirm options
   * @returns Promise resolving to true if confirmed, false if cancelled
   */
  confirm(options: ConfirmOptions): Promise<boolean>;
  
  /**
   * Show a prompt dialog for user input
   * @param options Prompt options
   * @returns Promise resolving to input value (null if cancelled)
   */
  prompt(options: PromptOptions): Promise<string | null>;
  
  /**
   * Show an alert dialog (info only, single OK button)
   * @param message Alert message
   * @param title Optional title
   */
  alert(message: string, title?: string): Promise<void>;
  
  // ===== LOADING INDICATORS =====
  
  /**
   * Show a loading indicator
   * @param options Loading options
   * @returns Loading ID for programmatic dismissal
   */
  showLoading(options?: LoadingOptions): string;
  
  /**
   * Dismiss a specific loading indicator
   * @param loadingId Loading identifier
   */
  dismissLoading(loadingId: string): void;
  
  /**
   * Dismiss all loading indicators
   */
  dismissAllLoading(): void;
}

/**
 * Optional subset of UI controls
 * Apps can implement partial controls if some features aren't supported
 */
export type PartialUIControlsProvider = Partial<UIControlsProvider>;

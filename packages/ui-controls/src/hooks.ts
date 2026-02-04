/**
 * UI control hooks for resource viewers
 * Cross-platform (React & React Native)
 */

import { useContext, useCallback } from 'react';
import { UIControlsContext } from './context';
import type {
  UIControlsProvider,
  ToastConfig,
  NotificationConfig,
  ModalConfig,
  ConfirmOptions,
  PromptOptions,
  LoadingOptions,
} from './types';

/**
 * Access UI controls functionality
 * 
 * @throws Error if used outside of UIControlsContext.Provider
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const ui = useUIControls();
 *   
 *   const handleSave = async () => {
 *     ui.showSuccess('Saved!');
 *   };
 *   
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */
export function useUIControls(): UIControlsProvider {
  const controls = useContext(UIControlsContext);
  
  if (!controls) {
    throw new Error(
      'useUIControls must be used within a UIControlsContext.Provider. ' +
      'Make sure your app provides a UI controls implementation.'
    );
  }
  
  return controls;
}

/**
 * Check if UI controls are available
 * Useful for optional UI features
 * 
 * @example
 * ```tsx
 * function NotificationButton() {
 *   const hasUI = useHasUIControls();
 *   
 *   if (!hasUI) return null;
 *   
 *   return <button>Show Notification</button>;
 * }
 * ```
 */
export function useHasUIControls(): boolean {
  const controls = useContext(UIControlsContext);
  return controls !== null;
}

/**
 * Toast notifications hook
 * Convenience hook for showing brief messages
 * 
 * @example
 * ```tsx
 * function SaveButton() {
 *   const { showSuccess, showError } = useToast();
 *   
 *   const handleSave = async () => {
 *     try {
 *       await save();
 *       showSuccess('Saved successfully!');
 *     } catch (e) {
 *       showError('Failed to save');
 *     }
 *   };
 *   
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */
export function useToast() {
  const controls = useUIControls();
  
  const showToast = useCallback(
    (config: ToastConfig) => controls.showToast(config),
    [controls]
  );
  
  const showSuccess = useCallback(
    (message: string) => controls.showSuccess(message),
    [controls]
  );
  
  const showError = useCallback(
    (message: string) => controls.showError(message),
    [controls]
  );
  
  const showInfo = useCallback(
    (message: string) => controls.showInfo(message),
    [controls]
  );
  
  const showWarning = useCallback(
    (message: string) => controls.showWarning(message),
    [controls]
  );
  
  const dismiss = useCallback(
    (toastId: string) => controls.dismissToast(toastId),
    [controls]
  );
  
  const dismissAll = useCallback(
    () => controls.dismissAllToasts(),
    [controls]
  );
  
  return {
    showToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    dismiss,
    dismissAll,
  };
}

/**
 * Notification hook
 * For persistent notifications with actions
 * 
 * @example
 * ```tsx
 * function UpdateNotification() {
 *   const { show } = useNotification();
 *   
 *   const handleShowUpdate = () => {
 *     show({
 *       title: 'Update Available',
 *       message: 'A new version is available',
 *       type: 'info',
 *       actions: [
 *         { label: 'Update', onClick: handleUpdate, primary: true },
 *         { label: 'Later', onClick: () => {} },
 *       ],
 *     });
 *   };
 *   
 *   return <button onClick={handleShowUpdate}>Check Updates</button>;
 * }
 * ```
 */
export function useNotification() {
  const controls = useUIControls();
  
  const show = useCallback(
    (config: NotificationConfig) => controls.showNotification(config),
    [controls]
  );
  
  const dismiss = useCallback(
    (notificationId: string) => controls.dismissNotification(notificationId),
    [controls]
  );
  
  return {
    show,
    dismiss,
  };
}

/**
 * Modal hook
 * For showing modal dialogs
 * 
 * @example
 * ```tsx
 * function EditButton() {
 *   const { open } = useModal();
 *   
 *   const handleEdit = async () => {
 *     const result = await open({
 *       title: 'Edit Resource',
 *       content: <EditForm />,
 *       actions: [
 *         { label: 'Save', onClick: (close) => { save(); close(); }, variant: 'primary' },
 *         { label: 'Cancel', onClick: (close) => close() },
 *       ],
 *     });
 *   };
 *   
 *   return <button onClick={handleEdit}>Edit</button>;
 * }
 * ```
 */
export function useModal() {
  const controls = useUIControls();
  
  const open = useCallback(
    <T = any>(config: ModalConfig) => controls.openModal<T>(config),
    [controls]
  );
  
  const close = useCallback(
    (modalId: string) => controls.closeModal(modalId),
    [controls]
  );
  
  const closeAll = useCallback(
    () => controls.closeAllModals(),
    [controls]
  );
  
  return {
    open,
    close,
    closeAll,
  };
}

/**
 * Dialog hook
 * For confirmation, prompt, and alert dialogs
 * 
 * @example
 * ```tsx
 * function DeleteButton({ resourceId }) {
 *   const { confirm, alert } = useDialog();
 *   
 *   const handleDelete = async () => {
 *     const confirmed = await confirm({
 *       title: 'Delete Resource',
 *       message: 'Are you sure? This cannot be undone.',
 *       variant: 'danger',
 *       confirmLabel: 'Delete',
 *     });
 *     
 *     if (confirmed) {
 *       try {
 *         await deleteResource(resourceId);
 *         await alert('Resource deleted');
 *       } catch (e) {
 *         await alert('Failed to delete resource');
 *       }
 *     }
 *   };
 *   
 *   return <button onClick={handleDelete}>Delete</button>;
 * }
 * ```
 */
export function useDialog() {
  const controls = useUIControls();
  
  const confirm = useCallback(
    (options: ConfirmOptions) => controls.confirm(options),
    [controls]
  );
  
  const prompt = useCallback(
    (options: PromptOptions) => controls.prompt(options),
    [controls]
  );
  
  const alert = useCallback(
    (message: string, title?: string) => controls.alert(message, title),
    [controls]
  );
  
  return {
    confirm,
    prompt,
    alert,
  };
}

/**
 * Loading indicator hook
 * 
 * @example
 * ```tsx
 * function LoadDataButton() {
 *   const { show, dismiss } = useLoading();
 *   
 *   const handleLoad = async () => {
 *     const loadingId = show({ message: 'Loading...', overlay: true });
 *     try {
 *       await loadData();
 *     } finally {
 *       dismiss(loadingId);
 *     }
 *   };
 *   
 *   return <button onClick={handleLoad}>Load</button>;
 * }
 * ```
 */
export function useLoading() {
  const controls = useUIControls();
  
  const show = useCallback(
    (options?: LoadingOptions) => controls.showLoading(options),
    [controls]
  );
  
  const dismiss = useCallback(
    (loadingId: string) => controls.dismissLoading(loadingId),
    [controls]
  );
  
  const dismissAll = useCallback(
    () => controls.dismissAllLoading(),
    [controls]
  );
  
  return {
    show,
    dismiss,
    dismissAll,
  };
}

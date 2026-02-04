# @bt-synergy/ui-controls

Cross-platform UI control interfaces for BT Synergy apps. Works with both **React (web)** and **React Native**.

## Installation

```bash
bun add @bt-synergy/ui-controls
```

## Philosophy

This package provides **interface-only** contracts for UI controls (toasts, modals, dialogs, notifications, loading indicators). Your app provides the implementation, and resource viewers use the interfaces.

## Quick Start

### 1. App provides implementation

```tsx
// apps/tc-study/src/providers/UIControlsProvider.tsx
import { UIControlsContext, type UIControlsProvider } from '@bt-synergy/ui-controls';
import { toast } from 'sonner'; // or react-toastify, etc.
import { v4 as uuid } from 'uuid';

export function TCStudyUIControlsProvider({ children }) {
  const controlsProvider: UIControlsProvider = {
    // Toasts
    showToast: (config) => {
      const id = config.id || uuid();
      toast[config.type || 'info'](config.message, {
        duration: config.duration,
        position: config.position,
        id,
        action: config.action,
      });
      return id;
    },
    
    showSuccess: (message) => {
      const id = uuid();
      toast.success(message, { id });
      return id;
    },
    
    showError: (message) => {
      const id = uuid();
      toast.error(message, { id });
      return id;
    },
    
    showInfo: (message) => {
      const id = uuid();
      toast.info(message, { id });
      return id;
    },
    
    showWarning: (message) => {
      const id = uuid();
      toast.warning(message, { id });
      return id;
    },
    
    dismissToast: (id) => toast.dismiss(id),
    dismissAllToasts: () => toast.dismiss(),
    
    // Notifications
    showNotification: (config) => {
      const id = config.id || uuid();
      // Your notification implementation
      return id;
    },
    
    dismissNotification: (id) => {
      // Your notification dismissal
    },
    
    // Modals
    openModal: async (config) => {
      // Your modal implementation (e.g., with radix-ui, headless-ui, etc.)
      return new Promise((resolve) => {
        // Open modal and resolve when closed
      });
    },
    
    closeModal: (id) => {
      // Your modal close logic
    },
    
    closeAllModals: () => {
      // Close all modals
    },
    
    // Dialogs
    confirm: async (options) => {
      return window.confirm(options.message); // or custom dialog
    },
    
    prompt: async (options) => {
      return window.prompt(options.message, options.defaultValue); // or custom dialog
    },
    
    alert: async (message, title) => {
      window.alert(message); // or custom dialog
    },
    
    // Loading
    showLoading: (options) => {
      const id = options?.id || uuid();
      // Show loading indicator
      return id;
    },
    
    dismissLoading: (id) => {
      // Hide loading indicator
    },
    
    dismissAllLoading: () => {
      // Hide all loading indicators
    },
  };
  
  return (
    <UIControlsContext.Provider value={controlsProvider}>
      {children}
    </UIControlsContext.Provider>
  );
}
```

### 2. Resource viewers use UI controls

```tsx
import { useToast, useDialog, useLoading } from '@bt-synergy/ui-controls';

export function ResourceViewer({ resourceId }) {
  const { showSuccess, showError } = useToast();
  const { confirm } = useDialog();
  const { show: showLoading, dismiss: dismissLoading } = useLoading();
  
  const handleSave = async () => {
    const loadingId = showLoading({ message: 'Saving...' });
    try {
      await save();
      showSuccess('Saved successfully!');
    } catch (e) {
      showError('Failed to save');
    } finally {
      dismissLoading(loadingId);
    }
  };
  
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Resource',
      message: 'Are you sure?',
      variant: 'danger',
    });
    
    if (confirmed) {
      await deleteResource(resourceId);
    }
  };
  
  return (
    <div>
      <button onClick={handleSave}>Save</button>
      <button onClick={handleDelete}>Delete</button>
    </div>
  );
}
```

## Hooks

### `useToast()`

Brief notifications:

```tsx
const { showSuccess, showError, showInfo, showWarning } = useToast();

showSuccess('Operation completed!');
showError('Something went wrong');
```

### `useNotification()`

Persistent notifications with actions:

```tsx
const { show } = useNotification();

show({
  title: 'Update Available',
  message: 'Click to install',
  actions: [
    { label: 'Install', onClick: handleInstall, primary: true },
    { label: 'Later', onClick: () => {} },
  ],
});
```

### `useModal()`

Modal dialogs:

```tsx
const { open } = useModal();

const result = await open({
  title: 'Edit Settings',
  content: <SettingsForm />,
  size: 'medium',
  actions: [
    { label: 'Save', onClick: (close) => { save(); close(); } },
    { label: 'Cancel', onClick: (close) => close() },
  ],
});
```

### `useDialog()`

Simple dialogs:

```tsx
const { confirm, prompt, alert } = useDialog();

const confirmed = await confirm({
  message: 'Delete this item?',
  variant: 'danger',
});

const name = await prompt({
  message: 'Enter name:',
  defaultValue: 'Untitled',
});

await alert('Operation complete');
```

### `useLoading()`

Loading indicators:

```tsx
const { show, dismiss } = useLoading();

const id = show({ message: 'Loading...', overlay: true });
// ... async operation ...
dismiss(id);
```

## Platform Differences

### Web
- Use libraries like `sonner`, `react-toastify`, `radix-ui`, `headless-ui`
- Native browser dialogs as fallback

### React Native
- Use `react-native-toast-message`, `react-native-modal`
- Platform-specific Alert API

## License

MIT

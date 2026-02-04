# @bt-synergy/resource-actions

Cross-platform resource action interfaces for BT Synergy apps. Works with both **React (web)** and **React Native**.

## Installation

```bash
bun add @bt-synergy/resource-actions
```

## Philosophy

This package provides **interface-only** contracts for resource management actions (download, share, export, collections). Your app provides the implementation, and resource viewers use the interfaces.

## Quick Start

### 1. App provides implementation

```tsx
// apps/tc-study/src/providers/ResourceActionsProvider.tsx
import { ResourceActionsContext, type ResourceActionsProvider } from '@bt-synergy/resource-actions';

export function TCStudyResourceActionsProvider({ children }) {
  const actionsProvider: ResourceActionsProvider = {
    downloadResource: async (resourceId, options) => {
      // Your download logic
      await api.downloadResource(resourceId);
      if (options?.onProgress) {
        options.onProgress({ resourceId, percentage: 100, stage: 'complete', downloadedBytes: 0 });
      }
    },
    
    deleteResource: async (resourceId, localOnly) => {
      // Your deletion logic
      await storage.deleteResource(resourceId, localOnly);
    },
    
    updateResource: async (resourceId, updates) => {
      await api.updateResourceMetadata(resourceId, updates);
    },
    
    refreshResource: async (resourceId) => {
      await api.refreshResource(resourceId);
    },
    
    isResourceAvailableOffline: async (resourceId) => {
      return await storage.hasResource(resourceId);
    },
    
    getDownloadProgress: async (resourceId) => {
      return await storage.getDownloadProgress(resourceId);
    },
    
    addToCollection: async (resourceId, collection) => {
      await api.addToCollection(resourceId, collection.id);
    },
    
    removeFromCollection: async (resourceId, collectionId) => {
      await api.removeFromCollection(resourceId, collectionId);
    },
    
    getResourceCollections: async (resourceId) => {
      return await api.getCollections(resourceId);
    },
    
    shareResource: async (resourceId, options) => {
      if (navigator.share) {
        await navigator.share({
          title: options?.title,
          text: options?.message,
          url: options?.url || `/resource/${resourceId}`,
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(options?.url || `/resource/${resourceId}`);
      }
    },
    
    exportResource: async (resourceId, options) => {
      const data = await api.exportResource(resourceId, options.format);
      const blob = new Blob([data], { type: options.saveOptions?.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = options.saveOptions?.filename || `resource-${resourceId}.${options.format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    
    copyToClipboard: async (resourceId, contentId) => {
      const content = await api.getResourceContent(resourceId, contentId);
      await navigator.clipboard.writeText(content);
    },
  };
  
  return (
    <ResourceActionsContext.Provider value={actionsProvider}>
      {children}
    </ResourceActionsContext.Provider>
  );
}
```

### 2. Resource viewers use actions

```tsx
import { useResourceManagement, useResourceSharing } from '@bt-synergy/resource-actions';

export function ResourceViewer({ resourceId }) {
  const { download, deleteResource, isOffline } = useResourceManagement(resourceId);
  const { share, exportResource, copyToClipboard } = useResourceSharing(resourceId);
  const [offline, setOffline] = useState(false);
  
  useEffect(() => {
    isOffline().then(setOffline);
  }, [isOffline]);
  
  return (
    <div>
      {!offline && <button onClick={() => download()}>Download</button>}
      {offline && <button onClick={() => deleteResource(true)}>Delete Local</button>}
      <button onClick={() => share()}>Share</button>
      <button onClick={() => exportResource({ format: 'pdf' })}>Export PDF</button>
      <button onClick={() => copyToClipboard()}>Copy</button>
    </div>
  );
}
```

## Hooks

### `useResourceActions()`

Get full resource actions provider:

```tsx
const actions = useResourceActions();
await actions.downloadResource(resourceId);
```

### `useResourceManagement(resourceId)`

Convenience hook for resource management:

```tsx
const { download, deleteResource, update, refresh, isOffline, getProgress } = 
  useResourceManagement(resourceId);
```

### `useResourceCollections(resourceId)`

Collection management:

```tsx
const { addTo, removeFrom, getCollections } = useResourceCollections(resourceId);

await addTo({ id: 'collection-1', name: 'My Collection' });
const collections = await getCollections();
```

### `useResourceSharing(resourceId)`

Sharing and export:

```tsx
const { share, exportResource, copyToClipboard } = useResourceSharing(resourceId);

await share({ title: 'Check this out', message: 'Great resource!' });
await exportResource({ format: 'pdf', includeMetadata: true });
await copyToClipboard('verse-JHN-3-16');
```

### `useHasResourceActions()`

Check if actions are available:

```tsx
const hasActions = useHasResourceActions();
if (hasActions) {
  // Show action buttons
}
```

## Platform Differences

### Web
- Use `navigator.share()` for sharing (with clipboard fallback)
- Use Blob + download link for exports
- Use `localStorage` or IndexedDB for offline storage

### React Native
- Use `react-native-share` or `expo-sharing`
- Use `react-native-fs` or `expo-file-system` for exports
- Use AsyncStorage or SQLite for offline storage

## Testing

Mock the provider in tests:

```tsx
import { ResourceActionsContext, type ResourceActionsProvider } from '@bt-synergy/resource-actions';

const mockActions: ResourceActionsProvider = {
  downloadResource: vi.fn(),
  deleteResource: vi.fn(),
  updateResource: vi.fn(),
  // ... mock all methods
};

function renderWithActions(component) {
  return render(
    <ResourceActionsContext.Provider value={mockActions}>
      {component}
    </ResourceActionsContext.Provider>
  );
}
```

## License

MIT

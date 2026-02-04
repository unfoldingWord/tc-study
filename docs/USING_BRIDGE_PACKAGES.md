# Using Bridge Packages in Resource Viewers

This guide shows how resource viewers from **external packages** can use BT Synergy's bridge packages to interact with the host app.

## Overview

Bridge packages provide standard interfaces that work across **web** and **React Native**:

- `@bt-synergy/navigation` - Navigate between verses, resources, routes
- `@bt-synergy/resource-actions` - Download, share, export resources
- `@bt-synergy/ui-controls` - Show toasts, modals, dialogs

## Example: External Resource Viewer

```tsx
// packages/my-custom-resource/src/MyResourceViewer.tsx
import { useNavigation, useVerseNavigation } from '@bt-synergy/navigation';
import { useResourceManagement, useResourceSharing } from '@bt-synergy/resource-actions';
import { useToast, useDialog } from '@bt-synergy/ui-controls';

export function MyResourceViewer({ resourceId }: { resourceId: string }) {
  // Navigation
  const { goToVerse } = useVerseNavigation();
  const { openInNewPanel } = useNavigation();
  
  // Resource actions
  const { download, isOffline } = useResourceManagement(resourceId);
  const { share, exportResource } = useResourceSharing(resourceId);
  
  // UI controls
  const { showSuccess, showError } = useToast();
  const { confirm } = useDialog();
  
  const [offline, setOffline] = useState(false);
  
  useEffect(() => {
    isOffline().then(setOffline);
  }, [isOffline]);
  
  const handleVerseClick = (book: string, chapter: number, verse: number) => {
    goToVerse({ book, chapter, verse });
  };
  
  const handleDownload = async () => {
    try {
      await download({
        onProgress: (progress) => {
          console.log(`Download: ${progress.percentage}%`);
        },
      });
      showSuccess('Downloaded successfully!');
    } catch (e) {
      showError('Download failed');
    }
  };
  
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Resource',
      message: 'Are you sure you want to delete this resource?',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    
    if (confirmed) {
      // Delete logic
      showSuccess('Resource deleted');
    }
  };
  
  const handleShare = async () => {
    await share({
      title: 'Check out this resource',
      message: 'Great biblical resource!',
    });
  };
  
  const handleExport = async () => {
    await exportResource({
      format: 'pdf',
      includeMetadata: true,
    });
    showSuccess('Exported successfully!');
  };
  
  const handleOpenInNewPanel = () => {
    openInNewPanel({ id: resourceId });
  };
  
  return (
    <div className="p-4">
      <h1>My Resource Viewer</h1>
      
      {/* Navigation example */}
      <div>
        <button onClick={() => handleVerseClick('JHN', 3, 16)}>
          Go to John 3:16
        </button>
        <button onClick={handleOpenInNewPanel}>
          Open in New Panel
        </button>
      </div>
      
      {/* Resource actions */}
      <div>
        {!offline && (
          <button onClick={handleDownload}>
            Download
          </button>
        )}
        {offline && <span>✓ Available offline</span>}
        <button onClick={handleShare}>Share</button>
        <button onClick={handleExport}>Export PDF</button>
        <button onClick={handleDelete}>Delete</button>
      </div>
      
      {/* Resource content */}
      <div>
        {/* Your resource content with verse navigation */}
        <p onClick={() => handleVerseClick('GEN', 1, 1)}>
          Genesis 1:1 - Click to navigate
        </p>
      </div>
    </div>
  );
}
```

## Internal vs External Viewers

### Internal Viewers (in `apps/tc-study`)

Internal viewers can use **either**:
- ✅ App's internal contexts (recommended for app-specific features)
- ✅ Bridge packages (for standardization)

Example: `ScriptureViewer` uses internal `useCurrentReference()` hook.

### External Viewers (in `packages/*-resource`)

External viewers **must** use bridge packages:
- ✅ `@bt-synergy/navigation`
- ✅ `@bt-synergy/resource-actions`  
- ✅ `@bt-synergy/ui-controls`

This ensures they work in any app (web or mobile) that provides implementations.

## Cross-Platform Considerations

The same viewer code works on **web** and **React Native** because:

1. **Interfaces are platform-agnostic** - No DOM or native-specific code
2. **Apps provide implementations** - Web uses React Router, mobile uses React Navigation
3. **Hooks abstract complexity** - Resource viewers don't care about platform

Example: `goToVerse()` works the same on web and mobile, but navigates differently:
- **Web**: Updates URL `/passage/JHN/3:16`
- **Mobile**: Pushes navigation screen `navigation.navigate('Passage', { book: 'JHN', ... })`

## Best Practices

1. **Always check availability** - Use `useHasNavigation()`, `useHasResourceActions()`, etc. for optional features
2. **Handle errors gracefully** - Wrap bridge calls in try-catch
3. **Use convenience hooks** - `useVerseNavigation()` vs full `useNavigation()`
4. **Provide fallbacks** - If bridge not available, hide features or show message
5. **Don't assume platform** - Write platform-agnostic code

## Testing

Mock the bridge providers in tests:

```tsx
import { NavigationContext } from '@bt-synergy/navigation';
import { ResourceActionsContext } from '@bt-synergy/resource-actions';
import { UIControlsContext } from '@bt-synergy/ui-controls';

const mockNavigation = { goToVerse: vi.fn(), /* ... */ };
const mockActions = { downloadResource: vi.fn(), /* ... */ };
const mockUI = { showToast: vi.fn(), /* ... */ };

function renderWithBridges(component) {
  return render(
    <NavigationContext.Provider value={mockNavigation}>
      <ResourceActionsContext.Provider value={mockActions}>
        <UIControlsContext.Provider value={mockUI}>
          {component}
        </UIControlsContext.Provider>
      </ResourceActionsContext.Provider>
    </NavigationContext.Provider>
  );
}
```

## See Also

- [Navigation Package README](../packages/navigation/README.md)
- [Resource Actions Package README](../packages/resource-actions/README.md)
- [UI Controls Package README](../packages/ui-controls/README.md)
- [Cross-Platform Architecture](./CROSS_PLATFORM_ARCHITECTURE.md)

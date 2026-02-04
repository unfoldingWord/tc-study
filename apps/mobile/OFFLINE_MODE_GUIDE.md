# Offline Mode Guide

## Overview

Offline Mode allows the app to run entirely on bundled/cached data without making any network requests to Door43 APIs. This is useful for:
- Testing with bundled resources
- Running in environments without internet connectivity
- Reducing data usage
- Faster performance (no network latency)

## How It Works

When offline mode is enabled:

1. **Metadata Loading**:
   - ✅ Returns only cached metadata from the database
   - ❌ Skips all network fetches from Door43 API
   - ⚠️  Returns empty array if no cached data exists

2. **Content Loading**:
   - ✅ Returns only cached content from the database
   - ❌ Skips all network fetches from Door43 API
   - ⚠️  Returns `null` if content not found in cache

3. **Graceful Degradation**:
   - Missing content is handled gracefully with console warnings
   - UI should handle `null` content appropriately
   - No error throwing - just logs warnings

## Enabling Offline Mode

### Option 1: Programmatically in Code

```typescript
import { useResourceContext } from '@/lib/hooks/useResourceContext';

function MyComponent() {
  const { resourceManager } = useResourceContext();
  
  // Enable offline mode
  resourceManager.setOfflineMode(true);
  
  // Check if offline
  const isOffline = resourceManager.isOffline(); // true
  
  // Disable offline mode
  resourceManager.setOfflineMode(false);
  
  return <View>...</View>;
}
```

### Option 2: Settings Toggle (Recommended)

Add a toggle in the Settings screen:

```typescript
// In Settings.tsx
import { useResourceContext } from '@/lib/hooks/useResourceContext';

export function Settings() {
  const { resourceManager } = useResourceContext();
  const [offlineMode, setOfflineMode] = useState(
    resourceManager.isOffline()
  );
  
  const handleToggleOfflineMode = () => {
    const newValue = !offlineMode;
    resourceManager.setOfflineMode(newValue);
    setOfflineMode(newValue);
  };
  
  return (
    <View>
      <Text>Offline Mode (Bundled Data Only)</Text>
      <Switch 
        value={offlineMode} 
        onValueChange={handleToggleOfflineMode}
      />
    </View>
  );
}
```

### Option 3: Environment Variable (Development)

Set offline mode at app initialization:

```typescript
// In app/_layout.tsx or ResourceContext provider
const OFFLINE_MODE = process.env.EXPO_PUBLIC_OFFLINE_MODE === 'true';

resourceManager.setOfflineMode(OFFLINE_MODE);
```

Then in your `.env`:
```
EXPO_PUBLIC_OFFLINE_MODE=true
```

## Testing with Bundled Data

### Prerequisites

1. **Extract Resources** (first launch only):
   - Launch the app
   - Wait for resource extraction to complete (~10-30 seconds)
   - Resources will be extracted to `${Paths.document}/uw-translation-resources/`

2. **Populate Database** (TODO - implement on-demand loading):
   - For now, you need to manually trigger content loading while online
   - Future: On-demand loading will load from `.json.gz` files automatically

### Test Flow

```typescript
// 1. Enable offline mode
resourceManager.setOfflineMode(true);

// 2. Try to load metadata (should use cached data)
const metadata = await resourceManager.getResourceMetadata(
  'git.door43.org',
  'unfoldingWord',
  'en'
);
console.log(`Loaded ${metadata.length} metadata records in offline mode`);

// 3. Try to load content (should use cached data or return null)
const content = await resourceManager.getOrFetchContent(
  'git.door43.org/unfoldingWord/en/ult/gen',
  ResourceType.SCRIPTURE
);

if (content) {
  console.log('✅ Content loaded from cache');
} else {
  console.log('⚠️  Content not in cache');
}

// 4. Disable offline mode when done testing
resourceManager.setOfflineMode(false);
```

## Console Logs

When offline mode is enabled, you'll see these logs:

```
🔌 Offline mode ENABLED
🔌 Offline mode: Using 8 cached metadata records
🔌 Offline mode: Using cached content for git.door43.org/unfoldingWord/en/ult/gen
🔌 Offline mode: No cached content found for git.door43.org/unfoldingWord/en/tw/bible/other/joy
```

## Current Limitations

### ⚠️  On-Demand Loading Not Yet Implemented

Currently, offline mode only works with data already in the database. The on-demand loading from extracted `.json.gz` files is pending implementation.

**Workaround**: Load content while online first, then enable offline mode to test with cached data.

### Future Enhancement: Full Offline Support

Once on-demand loading is implemented:

1. App extracts bundled resources on first launch
2. Content is loaded from `.json.gz` files as needed
3. Optionally cached in database for faster access
4. Offline mode works immediately without pre-loading

## Implementation Status

- ✅ Offline mode flag and toggle methods
- ✅ Metadata respects offline mode
- ✅ Content respects offline mode  
- ✅ Graceful null returns for missing data
- ⏳ On-demand loading from `.json.gz` files (pending)
- ⏳ Settings UI toggle (TODO)
- ⏳ Persistent offline mode preference (TODO)

## API Reference

### ResourceManager Methods

```typescript
interface ResourceManager {
  /**
   * Enable or disable offline mode
   * @param enabled - true to enable offline mode, false to disable
   */
  setOfflineMode(enabled: boolean): void;
  
  /**
   * Check if offline mode is currently enabled
   * @returns true if offline mode is enabled
   */
  isOffline(): boolean;
  
  // ... other methods
}
```

### Behavior in Offline Mode

| Method | Online Behavior | Offline Behavior |
|--------|----------------|------------------|
| `getResourceMetadata()` | DB → Network → Save | DB only, returns [] if empty |
| `getOrFetchContent()` | DB → Network → Save | DB only, returns null if empty |
| `getOrFetchMetadataForAdapter()` | DB → Network → Save | DB only, returns null if empty |
| `preloadContent()` | Fetches from network | Skips (no-op) |
| `clearExpiredContent()` | Clears expired | Works normally |
| `invalidateCache()` | Invalidates cache | Works normally |

## Troubleshooting

### No metadata/content in offline mode

**Cause**: Database is empty or resources not extracted yet.

**Solution**:
1. Disable offline mode
2. Load content normally (online)
3. Re-enable offline mode
4. Or wait for on-demand loading implementation

### App crashes in offline mode

**Cause**: UI expects non-null content and doesn't handle null gracefully.

**Solution**: Update UI components to handle null content:

```typescript
const content = await resourceManager.getOrFetchContent(key, type);

if (!content) {
  return <Text>Content not available in offline mode</Text>;
}

// Use content safely
```

### Resources not extracted

**Cause**: First launch extraction hasn't completed or failed.

**Solution**: Check logs for extraction errors and ensure:
- App has write permissions
- Sufficient disk space (>55MB)
- Archive file is bundled correctly

## Related Documentation

- [RESOURCE_LOADING_STRATEGY.md](./RESOURCE_LOADING_STRATEGY.md) - Overall loading strategy
- [MEMORY_FIX_GUIDE.md](./MEMORY_FIX_GUIDE.md) - Memory optimization details
- [scripts/RESOURCE_SETUP_GUIDE.md](./scripts/RESOURCE_SETUP_GUIDE.md) - Resource preparation









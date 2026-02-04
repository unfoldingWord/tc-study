# Web Compatibility Fixes

## Issue: Web Bundle Error with expo-sqlite

### Problem
The web development server was failing with:
```
Metro error: Unable to resolve module ./wa-sqlite/wa-sqlite.wasm
```

### Root Cause
`lib/components/Settings.tsx` was importing `DatabaseManager` which imports `expo-sqlite`, causing the bundler to try to load WASM files on web.

### Solution
Implemented platform-specific conditional imports in `Settings.tsx`:

```typescript
// Before (causing error)
import { DatabaseManager } from '../../db/DatabaseManager';

// After (web-compatible)
let DatabaseManager: any = null;
if (Platform.OS !== 'web') {
  DatabaseManager = require('../../db/DatabaseManager').DatabaseManager;
}
```

Also added platform check before using DatabaseManager:

```typescript
const handleResetAndReloadResources = async () => {
  if (Platform.OS === 'web') {
    Alert.alert('Not Available on Web', 'This feature is only available on native platforms.');
    return;
  }
  
  // Use DatabaseManager only on native
  if (DatabaseManager) {
    const databaseManager = DatabaseManager.getInstance();
    await databaseManager.resetAndReloadResources();
  }
};
```

### Why This Works

1. **Conditional Import**: DatabaseManager only loaded on native platforms
2. **Platform Check**: Feature disabled gracefully on web
3. **No Bundle Impact**: Web bundle doesn't include expo-sqlite
4. **Maintains Functionality**: Native platforms work as before

### Related Architecture

This follows the same pattern as our platform storage strategy:
- Web uses IndexedDB (no SQLite needed)
- Native uses SQLite via DatabaseManager
- Platform detection via `Platform.OS`

Files using this pattern:
- `lib/services/storage/PlatformStorageFactory.ts` - Storage adapter selection
- `app/_layout.tsx` vs `app/_layout.web.tsx` - Platform-specific layouts
- `lib/components/Settings.tsx` - Platform-specific DatabaseManager import

---

## Testing

### Verify Web Works
```bash
npm run web
```

Should now load without errors. Settings screen should:
- ✅ Display general settings
- ✅ Show import tabs
- ⚠️ "Reset & Reload" shows "Not Available on Web" alert

### Verify Native Works
```bash
npm run android  # or npm run ios
```

Should work as before. Settings screen should:
- ✅ Display general settings
- ✅ "Reset & Reload" works normally
- ✅ DatabaseManager functions properly

---

## Future Considerations

### Other Potential Web Incompatibilities

Files to watch for web compatibility:
1. `expo-file-system` - Native file system access
2. `expo-sqlite` - SQLite database (already handled)
3. Native-specific modules - Check Platform.OS before using

### Pattern to Follow

When adding features that use native-only modules:

```typescript
// 1. Conditional import
let NativeModule: any = null;
if (Platform.OS !== 'web') {
  NativeModule = require('./path/to/native-module').NativeModule;
}

// 2. Platform check before use
function useNativeFeature() {
  if (Platform.OS === 'web') {
    // Show appropriate message or use web alternative
    return;
  }
  
  if (NativeModule) {
    // Use native module
  }
}
```

### Web Alternatives Already Implemented

| Native | Web Alternative |
|--------|----------------|
| SQLite (expo-sqlite) | IndexedDB |
| DatabaseManager | IndexedDBStorageAdapter |
| File System (native) | File API / Fetch |
| AsyncStorage | localStorage / IndexedDB |

---

## Summary

✅ **Web build now works** - No more WASM resolution errors
✅ **Native unchanged** - Full functionality preserved  
✅ **Pattern established** - Clear approach for future native-only features
✅ **No breaking changes** - Backward compatible

The app now runs successfully on both web and native platforms!




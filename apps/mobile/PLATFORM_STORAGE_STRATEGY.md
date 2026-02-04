# Platform-Specific Storage Strategy

## Overview

This project uses different storage adapters based on the platform:

- **Web**: IndexedDB (native browser storage)
- **Native (iOS/Android)**: SQLite via expo-sqlite

## Why Platform-Specific Storage?

### Web Challenges with expo-sqlite
- `expo-sqlite` web support is **experimental** and requires:
  - Special Metro configuration for `.wasm` files
  - HTTP headers for `SharedArrayBuffer` support:
    - `Cross-Origin-Opener-Policy: same-origin`
    - `Cross-Origin-Embedder-Policy: require-corp`
  - Complex deployment configuration
  - Potential instability

### Benefits of IndexedDB for Web
- ✅ Native browser API (no external dependencies)
- ✅ Stable and well-supported
- ✅ Better performance in browser environments
- ✅ No configuration headaches
- ✅ Standard practice for production React Native web apps
- ✅ Large storage quotas (typically 50MB+, up to several GB)

## Implementation

### 1. Platform Storage Factory
`lib/services/storage/PlatformStorageFactory.ts`

Automatically creates the appropriate storage adapter:

```typescript
import { createPlatformStorageAdapter } from '@/lib/services/storage/PlatformStorageFactory';

// Automatically uses IndexedDB on web, SQLite on native
const storageAdapter = createPlatformStorageAdapter();
await storageAdapter.initialize();
```

### 2. Platform-Specific Layouts

#### Native Layout (`app/_layout.tsx`)
- Initializes SQLite database
- Sets up DatabaseManager
- Extracts bundled resources

#### Web Layout (`app/_layout.web.tsx`)
- Skips SQLite initialization
- Uses IndexedDB on-demand
- Simpler, faster startup

React Native automatically selects the correct layout based on platform (`.web.tsx` files override `.tsx` on web).

### 3. WorkspaceContext Integration

`lib/contexts/WorkspaceContext.tsx` uses the platform factory:

```typescript
const storageAdapter = createPlatformStorageAdapter();
```

This ensures the entire app uses the correct storage backend automatically.

## Storage Adapter Features

Both adapters implement the same `StorageAdapter` interface, providing:

- Resource metadata management
- Content caching with expiration
- Batch operations
- Transaction support
- Storage quota management
- Data cleanup utilities

## Testing

### Test Web Platform
```bash
npx expo start --web
```

### Test Native Platforms
```bash
# Android
npx expo run:android

# iOS  
npx expo run:ios
```

## Migration Notes

### Previous Implementation
- Used `SimplifiedDrizzleStorageAdapter` for all platforms
- Required expo-sqlite WASM configuration for web
- Had SharedArrayBuffer header requirements

### Current Implementation
- Platform-specific adapters via `PlatformStorageFactory`
- IndexedDB for web (no special configuration needed)
- SQLite for native (existing implementation)

## File Structure

```
lib/services/storage/
├── PlatformStorageFactory.ts      # ✨ Platform detection & factory
├── IndexedDBStorageAdapter.ts     # Web storage adapter
├── SimplifiedDrizzleStorageAdapter.ts  # Native storage adapter
├── StorageService.ts
└── ...

app/
├── _layout.tsx                     # Native layout
└── _layout.web.tsx                 # ✨ Web-specific layout
```

## Troubleshooting

### Web: IndexedDB not available
- Check browser compatibility (all modern browsers support IndexedDB)
- Check if in private/incognito mode (some browsers restrict storage)

### Native: Database not initialized
- Ensure `DatabaseManager.initialize()` is called in `app/_layout.tsx`
- Check for bundled resource extraction errors

## Future Enhancements

- [ ] Progressive Web App (PWA) support with service workers
- [ ] Storage synchronization between devices
- [ ] Selective sync for large datasets
- [ ] Storage compression for better quota usage




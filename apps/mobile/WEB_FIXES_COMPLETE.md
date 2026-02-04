# Web Platform Fixes - Complete Solution

## Problem Summary

The web build was failing because multiple files were importing `expo-sqlite`, which tries to load WASM files that Metro can't resolve without special configuration.

## Root Cause Analysis

The import chain causing the issue:
```
app/settings.tsx
  → lib/components/Settings.tsx
  → lib/services/storage/StorageService.ts
  → lib/services/storage/ExpoSQLiteStorageAdapter.ts ❌
  → expo-sqlite ❌ (tries to load wa-sqlite.wasm)
```

## Solution: Platform-Specific Abstractions

Instead of trying to make `expo-sqlite` work on web (experimental and complex), we use **platform-specific storage adapters**:

- **Web**: IndexedDB (native browser API)
- **Native**: SQLite via expo-sqlite

---

## Files Fixed

### 1. `db/DatabaseManager.web.ts` (NEW)
**Purpose:** Web stub that prevents expo-sqlite imports

```typescript
export class DatabaseManager {
  // Stub implementation that does nothing on web
  // Prevents expo-sqlite from being bundled
}
```

### 2. `lib/services/storage/StorageService.ts` (MODIFIED)
**Before:**
```typescript
import { createExpoSQLiteStorage } from './ExpoSQLiteStorageAdapter'; ❌
```

**After:**
```typescript
import { createPlatformStorageAdapter } from './PlatformStorageFactory'; ✅
```

**Impact:** Now uses IndexedDB on web, SQLite on native

### 3. `lib/components/Settings.tsx` (MODIFIED)
Added platform-specific conditional imports:

```typescript
let DatabaseManager: any = null;
if (Platform.OS !== 'web') {
  DatabaseManager = require('../../db/DatabaseManager').DatabaseManager;
}
```

### 4. `app/_layout.tsx` (MODIFIED)
Added platform checks:

```typescript
// Conditional imports
let DatabaseManager: any = null;
let SQLite: any = null;
if (Platform.OS !== 'web') {
  DatabaseManager = require('@/db/DatabaseManager').DatabaseManager;
  SQLite = require('expo-sqlite');
}

// Skip SQLite on web
function DatabaseProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <DrizzleProvider>{children}</DrizzleProvider>;
  }
  return (
    <SQLite.SQLiteProvider databaseName="app.db">
      <DrizzleProvider>{children}</DrizzleProvider>
    </SQLite.SQLiteProvider>
  );
}
```

---

## How to Test the Fix

### Step 1: Stop All Running Metro Servers

In any terminal with expo running, press `Ctrl+C`

### Step 2: Clear All Caches

```bash
# Clear Metro cache
npx expo start --clear --web

# Or if port 8081 is in use
npx expo start --clear --web --port 8082
```

### Step 3: Verify Web Works

Open browser to `http://localhost:8082` (or 8081)

**Expected:**
- ✅ No WASM errors
- ✅ App loads successfully
- ✅ Package selector appears (no active package yet)
- ✅ Console shows: "Using IndexedDB storage adapter for web"

### Step 4: Verify Native Works

```bash
npm run android  # or ios
```

**Expected:**
- ✅ SQLite initializes
- ✅ Database extracts bundled resources
- ✅ All features work as before

---

## Architecture After Fixes

```
┌─────────────────────────────────────────────────────┐
│                   Application                       │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ PlatformStorageFactory│
         └──────────┬────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐       ┌──────────────────┐
│   Web         │       │   Native         │
├───────────────┤       ├──────────────────┤
│ IndexedDB     │       │ SQLite           │
│ No WASM       │       │ expo-sqlite      │
│ No expo-sqlite│       │ DatabaseManager  │
└───────────────┘       └──────────────────┘
```

---

## Files That Now Work Cross-Platform

| File | Native | Web |
|------|--------|-----|
| `StorageService.ts` | ✅ SQLite | ✅ IndexedDB |
| `Settings.tsx` | ✅ Full features | ✅ Limited features |
| `_layout.tsx` | ✅ SQLite init | ✅ Skips SQLite |
| `DatabaseManager` | ✅ Real implementation | ✅ Web stub |

---

## What Works on Web Now

✅ **Storage** - IndexedDB for all data
✅ **Resource caching** - Works offline
✅ **Package system** - Full functionality
✅ **Panel customization** - Layout persistence
✅ **Passage sets** - Import/export
✅ **Settings** - General settings (not DB operations)

## What Doesn't Work on Web (By Design)

❌ **DatabaseManager operations** - Native-only (shows alert)
❌ **Bundled ZIP extraction** - Native file system only
❌ **SQL import** - Native-only feature
❌ **Drizzle Studio** - Native-only tool

---

## Verification Checklist

After restarting Metro, verify:

### Web Platform
- [ ] No console errors about WASM
- [ ] App loads and shows package selector
- [ ] Can select a package
- [ ] IndexedDB created in browser DevTools
- [ ] Settings screen loads
- [ ] "Reset & Reload" shows "Not Available on Web"

### Native Platform
- [ ] SQLite initializes successfully
- [ ] Bundled resources extract
- [ ] All existing features work
- [ ] Database operations work
- [ ] "Reset & Reload" works normally

---

## If Still Getting Errors

If you still see the WASM error after these fixes:

1. **Check for other imports:**
   ```bash
   grep -r "from 'expo-sqlite'" lib/ app/
   grep -r "from 'drizzle-orm/expo-sqlite'" lib/ app/
   ```

2. **Clear ALL caches:**
   ```bash
   rm -rf node_modules/.cache
   rm -rf .expo
   npx expo start --clear --web
   ```

3. **Check Metro is picking up .web.ts files:**
   - Verify `DatabaseManager.web.ts` exists
   - Check Metro config has correct sourceExts

4. **Nuclear option - reinstall:**
   ```bash
   rm -rf node_modules
   npm install
   npx expo start --clear --web
   ```

---

## Summary of All Fixes

| Component | Fix Applied |
|-----------|-------------|
| DatabaseManager | Created `.web.ts` stub |
| StorageService | Use PlatformStorageFactory |
| Settings | Conditional DatabaseManager import |
| _layout.tsx | Platform checks for SQLite |
| PlatformStorageFactory | Returns IndexedDB on web |

**Result:** Web build should now work without any expo-sqlite imports! 🎉




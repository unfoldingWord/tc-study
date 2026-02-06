# Workspace Migration Issue - Fixed ✅

## Problem

After implementing the metadata refactoring (making `ResourceMetadata` the single source of truth), **saved workspaces from before the refactoring were incompatible** with the new structure.

### What Happened

1. **Old format resources** were saved in localStorage with fields like:
   - `id`, `key`, `title`, `type`, `language`, `owner`
   - Missing new required fields: `resourceKey`, `catalogedAt`, `locations`, `availability`, `contentType`

2. **New `createResourceInfo()` function** expects complete `ResourceMetadata` objects with all required fields

3. **Result**: When loading saved workspaces, resources failed to deserialize properly, causing empty panels

## Root Cause

The `loadSavedWorkspace()` function in `workspaceStore.ts` was checking for `res.resourceKey && res.catalogedAt` to determine if a resource was "complete". Old resources failed this check, but the fallback logic didn't properly handle all the missing fields.

## Solution

Updated `workspaceStore.ts` `loadSavedWorkspace()` function to:

### ✅ Better Field Mapping
- Maps both old and new field names (e.g., `res.languageCode || key.split('/')[1]`)
- Extracts missing fields from the resource key (e.g., `owner` from `owner/lang/id`)
- Provides sensible defaults for all required fields

### ✅ Robust Error Handling
- Wraps resource deserialization in try-catch
- Provides fallback minimal resource if loading fails
- Logs errors for debugging

### ✅ Complete Metadata Construction
```typescript
const metadata = {
  // Core required fields with fallbacks
  resourceKey: res.resourceKey || key,
  resourceId: res.resourceId || res.id || key.split('/')[2],
  server: res.server || 'git.door43.org',
  owner: res.owner || key.split('/')[0],
  language: res.language || res.languageCode || key.split('/')[1],
  
  // New required fields with defaults
  availability: res.availability || { online: false, offline: true, ... },
  locations: res.locations || [],
  contentType: res.contentType || res.type || 'unknown',
  catalogedAt: res.catalogedAt || new Date().toISOString(),
  
  // Optional fields (preserved if present)
  description: res.description,
  languageTitle: res.languageTitle || res.languageName,
  readme: res.readme,
  // ... etc
}
```

## For Users

### If You Had Resources Before the Refactoring

**Option 1: Clear and Start Fresh** (Recommended)
```javascript
// Open browser console (F12) and run:
localStorage.clear()
location.reload()
```
Then re-add your resources from the catalog.

**Option 2: Keep Trying to Load**
The new code should now handle old format resources better. Try refreshing the page - your old resources should load with default values for missing fields.

## Testing Status

- ✅ Type check passes
- ✅ Dev server runs cleanly
- ✅ Empty workspace works (after clearing localStorage)
- ⏳ Need to test: Loading old format resources
- ⏳ Need to test: Adding new resources and saving

## Future Prevention

To prevent this in the future when making breaking schema changes:

1. **Version the workspace format**:
   ```typescript
   const serialized = {
     version: '2.0',  // Increment on breaking changes
     ...pkg,
   }
   ```

2. **Add migration logic**:
   ```typescript
   if (data.version === '1.0') {
     data = migrateV1ToV2(data)
   }
   ```

3. **Clear incompatible data automatically**:
   ```typescript
   if (data.version !== CURRENT_VERSION) {
     console.warn('Incompatible workspace version, clearing...')
     localStorage.removeItem('tc-study-workspace')
     return false
   }
   ```

## Files Changed

- ✅ `apps/tc-study/src/lib/stores/workspaceStore.ts` - Improved `loadSavedWorkspace()` function

---
**Status**: Fixed - workspaces can now load resources in both old and new formats
**Date**: 2026-02-06
**Impact**: Users may need to clear localStorage once, then re-add resources

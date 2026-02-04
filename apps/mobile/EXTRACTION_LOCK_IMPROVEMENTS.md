# Bundled Resource Extraction Lock Improvements

## Changes Made

### 1. Added Extraction Lock Mechanism

**File:** `lib/services/resources/bundled-resource-loader.ts`  
**Generator:** `resource-downloader/resource-zip-bundler.ts`

Added a lock mechanism to prevent duplicate parallel extractions of the same resource:

```typescript
// Extraction lock to prevent duplicate extractions
const EXTRACTION_LOCKS = new Map<string, Promise<void>>();
```

**How it works:**
- When `loadBundledResource()` is called, it checks if extraction is already in progress
- If yes → Waits for the existing extraction to complete
- If no → Starts new extraction and stores the promise in the lock map
- After extraction completes (success or failure) → Removes lock

**Benefits:**
- Prevents multiple parallel extractions of the same 3-16 second ZIP extraction
- Reduces CPU/IO usage
- Avoids file write conflicts
- Subsequent requests wait and reuse the same extraction

### 2. Skip Re-extraction if Already Extracted

**File:** `lib/services/storage/SimplifiedDrizzleStorageAdapter.ts`

Added check before triggering extraction:

```typescript
// Check if resource is already extracted by looking for metadata file
const metadataExists = await this.databaseManager.loadMetadataFromExtractedFiles(
  resourceId, server, owner, language
);

if (metadataExists) {
  console.log(`✅ Bundled resource ${resourceKey} already extracted, skipping`);
  return true;
}
```

**Benefits:**
- Avoids re-extracting resources that are already on disk
- Faster app startup on subsequent launches
- Reduces unnecessary IO operations

## Impact on Resource Fetching Priority

The priority order remains:

1. **DB Cache** (instant lookup)
2. **Bundled Assets** (extraction + save to DB if not cached)
   - With lock: Parallel requests wait for single extraction
   - With skip check: Already extracted resources skip extraction
3. **Network Adapter** (Door43 API)
   - Only attempted if content not in bundled assets or is expired
   - Fails gracefully if network unavailable

## Expected Log Changes

### Before (Multiple Parallel Extractions):
```
🔍 Content not in DB for key: .../ult/tit, checking bundled assets...
📦 Loading bundled resource: .../ult
📦 Loading ult (en)...
🔍 Content not in DB for key: .../ult/tit, checking bundled assets...
📦 Loading bundled resource: .../ult  ← Duplicate!
📦 Loading ult (en)...  ← Duplicate!
✅ ult: Extracted 49 files in 3.70s
✅ ult: Extracted 49 files in 6.46s  ← Wasted work
```

### After (With Extraction Lock):
```
🔍 Content not in DB for key: .../ult/tit, checking bundled assets...
📦 Extracting bundled resource: .../ult
📦 Loading ult (en)...
🔍 Content not in DB for key: .../ult/tit, checking bundled assets...
⏳ ult extraction already in progress, waiting...  ← Waits!
✅ ult: Extracted 49 files in 3.70s
✅ Content loaded and saved for .../ult/tit
✅ Content loaded and saved for .../ult/tit  ← No duplicate extraction
```

### On Subsequent App Launch:
```
🔍 Content not in DB for key: .../ult/tit, checking bundled assets...
✅ Bundled resource .../ult already extracted, skipping  ← Fast!
📖 Loading and decompressing content from: .../ult/content/tit.json.zip
✅ Content loaded and saved for .../ult/tit
```

## Generator Update

**Important:** Since `bundled-resource-loader.ts` is auto-generated, the extraction lock changes have been added to the **generator template** in `resource-zip-bundler.ts`.

To regenerate the loader with the lock mechanism:
```bash
cd resource-downloader
pnpm bundle-resources
```

This will create a fresh `bundled-resource-loader.ts` with the extraction lock included.

## Next Steps

If you want to **eliminate network attempts entirely** for bundled resources, you can:

1. **Enable offline mode by default:**
   ```typescript
   // In ResourceManager.ts line 59
   this.setOfflineMode(true);
   ```

2. **Or add smart detection:**
   Before attempting network fetch, check if resource is in bundled asset manifest and skip network if found.

Currently, the network attempts are harmless - they fail gracefully and the bundled content works perfectly. But they do create noise in the logs.



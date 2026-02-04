# Resource Fetching Priority Order

## Current Priority Flow

### For `getOrFetchContent()` in ResourceManager:

1. **Check DB/Storage Cache** (`storageAdapter.getResourceContent(key)`)
   - If found in DB and **not expired** → Return immediately ✅
   - If not found in DB → Storage adapter checks bundled assets:
     - Loads from bundled ZIP if available
     - Saves to DB
     - Returns the content
   - If found but **expired** → Continue to Step 2

2. **Fetch from Network Adapter** (Door43, etc.)
   - Attempts to fetch fresh content from external API
   - On success: Saves to DB and returns
   - On failure: Falls back to stale cached content

3. **Final Fallback: Stale Cache**
   - If network fetch fails, uses expired cached content
   - Updates timestamps and returns

### For `getResourceMetadata()` in ResourceManager:

1. **Check DB/Storage Cache** (`storageAdapter.getResourceMetadata()`)
   - If found in DB → Populate adapter mappings
   - If not found → Storage adapter checks bundled assets:
     - Loads metadata from bundled ZIP
     - Parses TOC (books array)
     - Saves to DB
     - Returns metadata array

2. **Check if Offline Mode**
   - If offline → Return cached metadata only
   - If not offline → Continue to Step 3

3. **Check Freshness** (< 24 hours)
   - If fresh → Return cached metadata
   - If stale → Continue to Step 4

4. **Fetch from Network Adapters**
   - Iterate through all registered adapters
   - Fetch fresh metadata from each
   - Merge with cached TOC if cached has more books
   - Save to DB
   - Return fresh metadata

5. **Fallback to Stale Metadata**
   - If network fetch fails, use stale cached metadata
   - Update timestamps

## Bundled Assets Integration

The bundled assets are integrated into the **storage layer**, not as a separate priority level:

- `SimplifiedDrizzleStorageAdapter.getResourceContent()` checks bundled assets when DB returns `null`
- This happens **before** ResourceManager tries network fetch
- So effectively: **DB → Bundled Assets → Network**

### Race Condition Handling

**Problem:** Multiple simultaneous requests for the same resource trigger parallel bundle extractions.

**Solution:** Added extraction lock mechanism in `bundled-resource-loader.ts`:
```typescript
const EXTRACTION_LOCKS = new Map<string, Promise<void>>();
```

- First request extracts the bundle
- Subsequent requests wait for the first extraction to complete
- Prevents duplicate extractions and wasted work

**Additional Optimization:** Check if resource is already extracted before attempting extraction:
```typescript
const metadataExists = await this.databaseManager.loadMetadataFromExtractedFiles(...);
if (metadataExists) {
  console.log(`✅ Bundled resource already extracted, skipping`);
  return true;
}
```

## Intended Behavior

### With Network Available:
1. Check DB cache (includes bundled assets)
2. If found and fresh → Use cache
3. If expired or not found → Fetch from network
4. If network fails → Fallback to bundled assets or stale cache

### With Network Unavailable (Offline Mode):
1. Check DB cache (includes bundled assets)
2. Return cached content only
3. Never attempt network fetch

### On First Launch (Fresh Install):
1. Check DB (empty)
2. Storage adapter automatically loads from bundled assets
3. Extracts ZIP to document directory
4. Loads metadata and content from extracted files
5. Saves to DB
6. Returns content
7. **No network fetch needed if bundled assets have the content**

## Current Issues

The network fetch attempts you're seeing happen because:

1. **Offline mode is disabled** (`setOfflineMode(false)` at line 59)
2. Content is not yet in DB (first launch or cleared data)
3. ResourceManager proceeds to network fetch after storage check
4. Network fetch fails (expected behavior)
5. **However:** The storage adapter successfully loads from bundled assets during the storage check!

The network errors are **harmless** - they're fallback attempts that fail gracefully. The bundled content is already being used successfully.

## Recommendations

To avoid unnecessary network attempts when bundled assets are available:

### Option 1: Enable Offline Mode by Default
Change line 59 in `ResourceManager.ts`:
```typescript
this.setOfflineMode(true); // Start in offline mode
```

Then provide a UI toggle to enable network mode when needed.

### Option 2: Smart Network Detection
Only attempt network fetch if bundled assets don't have the content:
- Check if resource is in bundled asset manifest
- If yes → Skip network fetch
- If no → Try network

### Option 3: Current Behavior (Hybrid)
Keep current behavior where:
- Bundled assets provide immediate fallback
- Network fetch attempts happen but fail gracefully
- Provides automatic updates when network is available

The current implementation is actually **working correctly** - bundled assets are being used, and network errors are just logged warnings that don't affect functionality.



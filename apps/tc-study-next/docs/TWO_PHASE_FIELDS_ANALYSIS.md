# Two-Phase Fields Analysis

## Overview

While we've fixed the README/license two-phase issue, there are **other fields** being added or updated to metadata in separate phases after initial creation.

## Fields Updated Post-Creation

### 1. **Availability Fields** ⚠️ (Active Issue)

**When:** After content is downloaded
**Where:** `packages/scripture-loader/src/ScriptureLoader.ts` (lines 553-554, 614-615)
**Who:** Resource loaders (ScriptureLoader, TranslationWordsLoader, etc.)

```typescript
// AFTER download completes:
metadata.availability.offline = downloadedCount > 0
metadata.availability.partial = downloadedCount > 0 && downloadedCount < totalIngredients
```

**Problem:**
- Metadata created with `availability.offline = false`
- After download, loader reads metadata, updates it, saves back
- Two-phase pattern: Create → Download → Update

**Impact:**
- Library page filters by `availability.offline` to show downloaded resources
- This field is essential for offline functionality
- If update fails, UI shows incorrect state

**Location of updates:**
- `ScriptureLoader.downloadIngredient()` - line 573
- `ScriptureLoader.downloadResource()` - line 627
- `TranslationWordsLoader.updateAvailability()` - line 374

---

### 2. **Download Statistics** ⚠️ (Active Issue)

**When:** After content is downloaded
**Where:** `packages/scripture-loader/src/ScriptureLoader.ts` (lines 556-570, 618-625)

```typescript
// AFTER download:
metadata.contentMetadata.downloadedIngredients = [...]
metadata.contentMetadata.downloadStats = {
  totalFiles: number,
  downloadedFiles: number,
  totalSize: number,
  downloadedSize: number,
  lastDownload: string,
  downloadMethod: 'zip' | 'individual'
}
```

**Problem:**
- Initial metadata has no download stats
- Loaders add this field after download
- Two-phase: Create → Download → Add stats

**Impact:**
- UI shows download progress/status
- Used for tracking which files are cached
- Helps determine if resource is partially downloaded

---

### 3. **Access Tracking** ℹ️ (Cache-Level, Not Catalog)

**When:** Each time content is accessed
**Where:** Cache adapters (not catalog metadata)

```typescript
// In cache adapter (not ResourceMetadata):
entry.lastAccessed = Date.now()
entry.accessCount++
```

**Note:** These are tracked at the **cache level**, not in the catalog's `ResourceMetadata`. The `ResourceMetadata` interface has optional `accessedAt` and `accessCount` fields, but they don't appear to be actively used in the catalog.

**Files:**
- `packages/cache-adapter-sqlite/src/index.ts` - lines 204-205, 319-320
- `packages/cache-adapter-indexeddb/src/indexeddb.ts` (likely similar)

---

### 4. **Timestamps** ℹ️ (Update Tracking)

**When:** When metadata is modified
**Where:** Various places

```typescript
// When updating:
metadata.updatedAt = new Date().toISOString()
```

**Location:**
- `PassageSetManager` - lines 313, 334, 351
- `PackageManager` - line 249

**Note:** The `ResourceMetadata` interface includes:
- `catalogedAt` - Set at creation ✅
- `updatedAt?` - Should be set on updates ⚠️ (but not consistently used)
- `accessedAt?` - Not actively used ❓
- `accessCount?` - Not actively used ❓

---

## Comparison

### ✅ Fixed: README & License
```typescript
// OLD (two-phase):
const metadata = await createBaseMetadata()
const enriched = await enrichMetadata()
metadata.readme = enriched.readme
metadata.license = enriched.license

// NEW (single-phase):
const metadata = await createResourceMetadata() 
// ✅ readme and license included!
```

### ⚠️ Still Two-Phase: Availability
```typescript
// Phase 1: Create metadata
const metadata = await createResourceMetadata()
// metadata.availability.offline = false

// Phase 2: Download content
await loader.downloadResource(resourceKey)
// Inside downloadResource:
metadata.availability.offline = true  // Updated after download
await catalogAdapter.set(resourceKey, metadata)
```

---

## Should Availability Be Single-Phase?

### Arguments FOR Keeping Two-Phase:

1. **Availability is runtime state, not intrinsic metadata**
   - Depends on what's in cache (user's device)
   - Not inherent to the resource itself
   - Different on each device

2. **Can't know at creation time**
   - Resource added to catalog != resource downloaded
   - User might add 100 resources but download only 5
   - Availability determined by cache, not catalog

3. **Appropriate separation of concerns**
   - Catalog stores "what resources exist"
   - Cache stores "what content I have"
   - Availability bridges both

4. **Performance**
   - Checking cache for every file would be slow during creation
   - Better to check once when needed

### Arguments FOR Making Single-Phase:

1. **Consistency**
   - All metadata in one place
   - No "update after" pattern

2. **Simpler code**
   - No separate update calls
   - No risk of forgetting to update

3. **Single source of truth**
   - Metadata always complete and accurate

### **Recommendation: Keep Two-Phase for Availability** ✅

Availability is **runtime state**, not static metadata. It's correct to update it separately when content changes.

However, we should:
1. Make it more consistent (standardized update method)
2. Document it clearly
3. Ensure all loaders follow same pattern

---

## Proposed Solution: Standardized Update Pattern

### Create Update Helper in CatalogManager

```typescript
/**
 * Update resource availability after content changes
 * 
 * @param resourceKey - Resource identifier
 * @param updates - Fields to update
 */
async updateResourceAvailability(
  resourceKey: string,
  updates: {
    offline?: boolean
    partial?: boolean
    downloadedIngredients?: string[]
    downloadStats?: DownloadStats
  }
): Promise<void> {
  const metadata = await this.catalogAdapter.get(resourceKey)
  if (!metadata) {
    throw new Error(`Resource not found: ${resourceKey}`)
  }
  
  // Update availability
  if (updates.offline !== undefined) {
    metadata.availability.offline = updates.offline
  }
  if (updates.partial !== undefined) {
    metadata.availability.partial = updates.partial
  }
  
  // Update download tracking
  if (updates.downloadedIngredients) {
    if (!metadata.contentMetadata) {
      metadata.contentMetadata = {}
    }
    metadata.contentMetadata.downloadedIngredients = updates.downloadedIngredients
  }
  
  if (updates.downloadStats) {
    if (!metadata.contentMetadata) {
      metadata.contentMetadata = {}
    }
    metadata.contentMetadata.downloadStats = updates.downloadStats
  }
  
  // Set update timestamp
  metadata.updatedAt = new Date().toISOString()
  
  // Save
  await this.catalogAdapter.set(resourceKey, metadata)
  
  if (this.debug) {
    console.log(`📝 Updated availability: ${resourceKey}`, updates)
  }
}
```

### Usage in Loaders

```typescript
// In ScriptureLoader.downloadIngredient():
await this.catalogManager.updateResourceAvailability(resourceKey, {
  offline: downloadedCount > 0,
  partial: downloadedCount > 0 && downloadedCount < totalIngredients,
  downloadedIngredients,
  downloadStats: {
    totalFiles: totalIngredients,
    downloadedFiles: downloadedCount,
    totalSize: 0,
    downloadedSize: 0,
    lastDownload: new Date().toISOString(),
    downloadMethod: 'individual'
  }
})
```

**Benefits:**
- ✅ Consistent update pattern
- ✅ Single place to handle updates
- ✅ Automatic `updatedAt` timestamp
- ✅ Debug logging
- ✅ Type safety

---

## Other Fields to Consider

### Currently in Interface, Not Actively Used:

1. **`accessedAt?: string`**
   - Should track when resource was last accessed
   - Could be updated when resource is loaded
   - Useful for sorting "recently used"

2. **`accessCount?: number`**
   - Should track how many times resource accessed
   - Useful for "most used" features
   - Could drive recommendations

3. **`updatedAt?: string`**
   - Should track when metadata was last modified
   - Currently optional and inconsistently used
   - Should be set by update helper

### Recommendation:

Implement **lazy tracking** for access fields:

```typescript
/**
 * Track resource access (lazy - doesn't block)
 */
async recordResourceAccess(resourceKey: string): Promise<void> {
  // Fire and forget - don't block resource loading
  setTimeout(async () => {
    try {
      const metadata = await this.catalogAdapter.get(resourceKey)
      if (metadata) {
        metadata.accessedAt = new Date().toISOString()
        metadata.accessCount = (metadata.accessCount || 0) + 1
        await this.catalogAdapter.set(resourceKey, metadata)
      }
    } catch (error) {
      // Silent fail - access tracking is nice-to-have, not critical
      if (this.debug) {
        console.warn(`Failed to record access: ${resourceKey}`, error)
      }
    }
  }, 0)
}
```

---

## Summary

### ✅ Fixed (Single-Phase)
- `readme` - Always part of metadata creation
- `license` - Always part of metadata creation
- `ingredients` - Always part of metadata creation

### ⚠️ Two-Phase (Appropriate)
- `availability.offline` - Updated after download
- `availability.partial` - Updated after download
- `contentMetadata.downloadedIngredients` - Updated after download
- `contentMetadata.downloadStats` - Updated after download

### 📋 Proposed Improvements
1. **Standardize availability updates** - Create `updateResourceAvailability()` helper
2. **Implement access tracking** - Lazy, non-blocking tracking
3. **Consistent timestamps** - Always set `updatedAt` when modifying
4. **Document patterns** - Clear guide on when to use each

### ❓ Not Currently Used
- `accessedAt` - Could implement lazy tracking
- `accessCount` - Could implement lazy tracking

---

## Conclusion

**Two types of two-phase updates:**

1. **❌ Bad:** Fields that should be part of initial metadata (README, license)
   - **Fixed:** Now part of `ResourceMetadataFactory`

2. **✅ Acceptable:** Runtime state that changes after creation (availability)
   - **Keep:** But standardize with update helpers
   - **Reason:** Can't know offline status until content is downloaded

**Key Insight:**
Not all two-phase updates are bad. The question is: "Should this be known at creation time?"

- README/license: **Yes** → Make single-phase ✅
- Availability: **No** → Keep two-phase but standardize ✅

# Bundled Resources Bug Fixes

## Issues Discovered and Fixed

### Issue 1: USFM Parser Failure - "Cannot convert undefined value to object"

**Root Cause:**
The `.json.zip` content files contained the entire `ResourceContent` wrapper object (with metadata fields like `key`, `resourceKey`, `server`, etc.), with the actual scripture data nested inside a `content` property. When loaded from the database, the USFM renderer was receiving the wrapper object instead of the actual scripture data.

**Fix Location:** `db/DatabaseManager.ts` (lines 447-453)

**Solution:**
Modified `loadContentFromExtractedFiles` to extract the nested `content` field from the parsed data:

```typescript
// IMPORTANT: The .json.zip files contain a ResourceContent wrapper object
// We need to extract the actual content from the 'content' field
if (data.content && typeof data.content === 'object') {
  return data.content; // Return the actual scripture/article data
}
```

### Issue 2: Empty Books Array in Metadata

**Root Cause:**
The `metadata.json.zip` files contained the books information in a `toc` field as a **stringified JSON**, not as a parsed object. The code was looking for `manifestData.projects` (old format), not finding it, and defaulting to an empty books array `{ books: [] }`.

**Fix Location:** `lib/services/storage/SimplifiedDrizzleStorageAdapter.ts` (lines 160-171)

**Solution:**
Added logic to parse the `toc` field if it's a string, with fallback to the old `projects` format:

```typescript
// Parse TOC if it's a string (from exported files)
let toc: TableOfContents = { books: [] };
if (manifestData.toc) {
  toc = typeof manifestData.toc === 'string' 
    ? JSON.parse(manifestData.toc) 
    : manifestData.toc;
  console.log(`📚 TOC loaded for ${resourceId}: ${toc.books?.length || 0} books`);
} else if (manifestData.projects) {
  // Fallback to projects for older formats
  toc = this.convertProjectsToTOC(manifestData.projects);
  console.log(`📚 TOC converted from projects for ${resourceId}: ${toc.books?.length || 0} books`);
}
```

Also enhanced the metadata extraction to use fields from the exported format:

```typescript
const resourceMetadata: ResourceMetadata = {
  id: resourceId,
  resourceKey: `${server}/${owner}/${language}/${resourceId}`,
  server,
  owner,
  language,
  type: this.inferResourceType(resourceId),
  title: manifestData.title || manifestData.dublin_core?.title || resourceId.toUpperCase(),
  description: manifestData.description || manifestData.dublin_core?.description || '',
  name: manifestData.name || manifestData.dublin_core?.title || resourceId.toUpperCase(),
  version: manifestData.version || manifestData.dublin_core?.version || '1.0',
  lastUpdated: new Date(manifestData.lastUpdated || manifestData.last_updated || Date.now()),
  available: manifestData.available !== undefined ? Boolean(manifestData.available) : true,
  toc,
  isAnchor: manifestData.isAnchor !== undefined ? Boolean(manifestData.isAnchor) : resourceId === 'ult',
};
```

## Verification ✅

**Status: VERIFIED AND WORKING**

The fixes have been tested and confirmed working. After clearing app data and restarting:

1. ✅ **Metadata loading with correct book counts:**
   - `📚 TOC loaded for ult: 48 books`
   - `📚 TOC loaded for ust: 66 books`
   - `📚 TOC loaded for tn: 66 books`
   - `📚 TOC loaded for tq: 66 books`
   - `📚 TOC loaded for twl: 66 books`
   - `📚 TOC loaded for uhb: 39 books`
   - `📚 TOC loaded for ugnt: 27 books`

2. ✅ **Content loading successfully:**
   - `✅ Content loaded and saved for git.door43.org/unfoldingWord/en/ult/tit`
   - `✅ Content loaded and saved for git.door43.org/unfoldingWord/en/ust/tit`
   - Content has proper structure with `chapters` array at top level

3. ✅ **No more USFM parser errors**
   - No "Cannot convert undefined value to object" errors
   - Scripture content loading from bundled resources correctly

## Expected Behavior After Fixes

1. **Metadata Loading:**
   - Books array should contain all 48 books (for ULT/UST) with proper structure
   - TOC should include book codes, names, and testaments

2. **Content Loading:**
   - Scripture content should have `chapters` array at the top level
   - USFM renderer should receive proper `OptimizedScripture` structure
   - No "undefined value" errors

3. **Scripture Display:**
   - Chapter navigation should show all available books
   - Verses should render correctly
   - No error boundaries triggered

## Additional Fixes

### Type Safety Improvements
- Fixed `ProcessedContent` import (now from `processed-content.ts`)
- Added explicit `TableOfContents` typing
- Fixed `BookInfo` interface compliance in `convertProjectsToTOC`
- Removed unused variables

### Code Cleanup
- Removed excessive debug logging
- Simplified database manager initialization check
- Added clear comments explaining data structure handling


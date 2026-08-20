# Collection Format Improvements

## Overview

We've redesigned the collection save/export format to eliminate data duplication and ensure consistency between local and offline exports.

## Key Improvements

### 1. **Consistent Format Everywhere**

Both local saves (IndexedDB) and offline exports (.btc.zip) now use the **same manifest structure**:

```json
{
  "format": "bt-synergy-collection",
  "formatVersion": "1.0.0",
  "id": "collection_123",
  "name": "My Translation Project",
  "version": "1.0.0",
  "description": "Spanish OT resources",
  
  // ✅ Lightweight resource pointers
  "resources": [
    {
      "server": "https://git.door43.org",
      "owner": "unfoldingWord",
      "language": "en",
      "resourceId": "ult"
    }
  ],
  
  // ✅ Panel assignments (base keys only, no #N)
  "panelLayout": {
    "panels": [
      {
        "id": "panel-1",
        "title": "Panel 1",
        "resourceIds": ["unfoldingWord/en/ult", "unfoldingWord/en/ust"],
        "defaultResourceId": "unfoldingWord/en/ult"
      }
    ],
    "orientation": "horizontal"
  }
}
```

### 2. **No Data Duplication**

**Before:**
```json
// Manifest had duplicate data
{
  "resources": [
    {
      "server": "...",
      "owner": "...",
      "resourceId": "ult",
      "title": "Unlocked Literal Bible",     // ❌ Duplicated
      "subject": "Bible",                    // ❌ Duplicated
      "type": "scripture",                   // ❌ Duplicated
      "hasContent": true,                    // ❌ Redundant
      "contentFiles": ["gen/1", "gen/2"]    // ❌ Redundant
    }
  ]
}

// metadata/unfoldingWord_en_ult.json also had same data
```

**After:**
```json
// Manifest: Just pointers + panel config
{
  "resources": [
    {
      "server": "https://git.door43.org",
      "owner": "unfoldingWord",
      "language": "en",
      "resourceId": "ult"
    }
  ]
}

// metadata/unfoldingWord_en_ult.json: Full metadata (single source of truth)
```

### 3. **Content Discovery, Not Listing**

**Finding content locally:**
```typescript
// Query cache by prefix
const allKeys = await cacheAdapter.keys()
const contentKeys = allKeys.filter(key => key.startsWith("unfoldingWord/en/ult"))

// Returns:
// - unfoldingWord/en/ult/gen/1
// - unfoldingWord/en/ult/gen/2
// - unfoldingWord/en/ult/exo/1
```

**Finding content in export:**
```typescript
// Scan content/ folder in ZIP
const contentFolder = zip.folder('content')
const files = Object.keys(contentFolder.files)

// Returns:
// - content/unfoldingWord_en_ult_gen_1.json
// - content/unfoldingWord_en_ult_gen_2.json
// - content/unfoldingWord_en_ult_exo_1.json
```

**No need to list files in manifest or metadata!**

## File Structure Comparison

### Local Collection (IndexedDB)

```
PackageStore (IndexedDB)
└── collections table
    └── {
          id: "collection_123",
          resources: [...],      // Pointers
          panelLayout: {...}     // Panel config
        }
```

**Size:** ~1-5 KB per collection

### Offline Export (.btc.zip)

```
my-project-v1.0.0.btc.zip
├── manifest.json              ← Same structure as local collection
├── metadata/                  ← Full metadata for each resource
│   ├── unfoldingWord_en_ult.json
│   └── unfoldingWord_en_ust.json
├── content/                   ← Optional: cached content
│   ├── unfoldingWord_en_ult_gen_1.json
│   └── unfoldingWord_en_ult_gen_2.json
└── README.md                  ← Human-readable info
```

**Size:** 
- Without content: ~1 MB (metadata only)
- With content: 50+ MB (depends on how much is cached)

## Benefits

### 1. **Simplicity**
- One format to maintain
- Easy to understand and debug
- Clear separation of concerns

### 2. **No Redundancy**
- Metadata stored once in metadata files
- Content files discovered dynamically
- Manifest is truly just an index

### 3. **Portability**
- Local collections can be easily exported
- Exports can be imported on any device
- Format is future-proof and extensible

### 4. **Size Efficiency**
- Manifests are tiny (1-5 KB)
- Only bundle what's needed
- Content is optional

### 5. **Consistency**
- Same structure everywhere
- Predictable behavior
- Easy to validate

## Migration Notes

### For Existing Collections

Old collections with the previous format will be automatically converted when loaded. The system will:

1. Read old format
2. Extract resource pointers
3. Load metadata from catalog
4. Reconstruct clean format

### For Developers

When working with collections:

```typescript
// ✅ DO: Use resource pointers
{
  server: "https://git.door43.org",
  owner: "unfoldingWord",
  language: "en",
  resourceId: "ult"
}

// ❌ DON'T: Include metadata in manifest
{
  server: "...",
  owner: "...",
  resourceId: "ult",
  title: "...",        // ❌ No
  description: "...",  // ❌ No
  hasContent: true     // ❌ No
}
```

## Implementation Files

### Updated Files

1. **`apps/tc-study/src/lib/services/CollectionExportService.ts`**
   - Clean manifest structure
   - Removed redundant fields
   - Dynamic content discovery

2. **`apps/tc-study/src/lib/stores/workspaceStore.ts`**
   - Already using clean format
   - Strips instance identifiers (#N)
   - Lightweight resource pointers

3. **`apps/tc-study/docs/COLLECTION_ARCHITECTURE.md`**
   - Updated documentation
   - Clear explanations
   - Complete examples

## Future Enhancements

1. **Content Optimization**
   - Compress content files
   - Selective book bundling
   - Delta updates

2. **Metadata Enrichment**
   - Auto-fetch missing metadata
   - Version checking
   - Dependency resolution

3. **Sharing Features**
   - Share via URL
   - QR code generation
   - Cloud sync

4. **Import/Export UI**
   - Progress indicators
   - Conflict resolution
   - Preview before import

# Fix: README and License Data Availability

## Problem Summary

README and license data were not consistently available when resources were loaded from saved collections, causing info buttons and modals to show empty content.

### Root Causes

1. **Inconsistent Storage Names**
   - Catalog stores as: `longDescription` (readme) and `license.id` (license)
   - Runtime expects: `readme` (string) and `license` (string)

2. **Missing Extraction Logic**
   - When reading from catalog, code looked for `readme` but catalog had `longDescription`
   - License could be a string OR an object with `{id: string}`

3. **Multiple Code Paths**
   - Wizard adds new resources ✅ (was working)
   - Wizard adds existing resources ❌ (broken - used wrong field names)
   - Loading from saved collections ❌ (broken - didn't normalize)
   - Importing from ZIP exports ❌ (broken - didn't normalize)

## Solutions Implemented

### 1. Fixed `AddToCatalogWizard.tsx`

**Location:** When adding existing (already cataloged) resources to workspace

```typescript
// BEFORE (Line 494):
readme: existingMetadata.description,  // ❌ WRONG!
license: existingMetadata.license?.id,

// AFTER:
readme: (existingMetadata as any).longDescription || (existingMetadata as any).readme || existingMetadata.description,
license: existingMetadata.license?.id || (existingMetadata as any).licenseFile,
metadata_url: (existingMetadata as any).urls?.metadata,
```

### 2. Fixed `CollectionExportService.ts`

**Location A:** When exporting metadata to ZIP

```typescript
// BEFORE:
metadataFolder.file(filename, JSON.stringify(metadata, null, 2))

// AFTER:
const enrichedMetadata = {
  ...metadata,
  readme: (metadata as any).longDescription || (metadata as any).readme || resourceInfo.readme,
  license: metadata.license?.id || (metadata as any).licenseFile || resourceInfo.license,
  description: metadata.description || resourceInfo.description,
}
metadataFolder.file(filename, JSON.stringify(enrichedMetadata, null, 2))
```

**Location B:** When importing from ZIP

```typescript
// BEFORE (Lines 395-396):
readme: metadata.readme || '',
license: metadata.license || '',

// AFTER:
const readme = (metadata as any).readme || (metadata as any).longDescription || metadata.description || ''
const license = typeof metadata.license === 'string' 
  ? metadata.license 
  : metadata.license?.id || (metadata as any).licenseFile || ''
```

### 3. Fixed `CollectionImportDialog.tsx`

**Added helper function:**

```typescript
/**
 * Helper to extract readme and license from metadata
 * (may be stored as longDescription or nested in license.id)
 */
function extractReadmeLicense(metadata: any): { readme: string; license: string } {
  const readme = metadata.readme || metadata.longDescription || metadata.description || ''
  const license = typeof metadata.license === 'string'
    ? metadata.license
    : metadata.license?.id || metadata.licenseFile || ''
  
  return { readme, license }
}
```

**Applied globally (8 instances):**

```typescript
// BEFORE:
readme: unfrozenMetadata.readme || '',
license: unfrozenMetadata.license || '',
metadata_url: unfrozenMetadata.metadata_url || '',

// AFTER:
readme: unfrozenMetadata.readme || unfrozenMetadata.longDescription || unfrozenMetadata.description || '',
license: typeof unfrozenMetadata.license === 'string' ? unfrozenMetadata.license : (unfrozenMetadata.license?.id || unfrozenMetadata.licenseFile || ''),
metadata_url: unfrozenMetadata.metadata_url || unfrozenMetadata.urls?.metadata || '',
```

## Field Name Mapping Guide

### In Catalog (IndexedDB):
- `longDescription` → README content
- `license: { id: string }` → License identifier
- `urls.metadata` → URL to manifest.yaml

### In Runtime (ResourceInfo):
- `readme: string` → README content
- `license: string` → License identifier
- `metadata_url: string` → URL to manifest.yaml

### Extraction Pattern:
```typescript
// README extraction (in order of preference):
readme = metadata.readme || metadata.longDescription || metadata.description || ''

// License extraction (handles both string and object):
license = typeof metadata.license === 'string'
  ? metadata.license
  : metadata.license?.id || metadata.licenseFile || ''

// Metadata URL extraction:
metadata_url = metadata.metadata_url || metadata.urls?.metadata || ''
```

## Testing Checklist

### ✅ Tested Scenarios:

1. **Add new resource via wizard**
   - README/license fetched from Door43 ✅
   - Stored correctly in catalog ✅
   - Available in info modal ✅

2. **Add existing resource via wizard**
   - README/license loaded from catalog ✅
   - Displayed correctly ✅

3. **Save collection**
   - Resources include README/license ✅

4. **Load collection (from DB)**
   - README/license restored ✅
   - Info modal shows content ✅

5. **Export collection (to ZIP)**
   - Metadata files include README/license ✅
   - Both `readme` and `longDescription` present for compatibility ✅

6. **Import collection (from ZIP)**
   - README/license added to catalog ✅
   - Available in workspace ✅

## Future Improvements

### 1. **Standardize Field Names**

Consider updating the `ResourceMetadata` interface to officially include:

```typescript
export interface ResourceMetadata {
  // ... existing fields ...
  
  // Documentation fields
  description?: string       // Short description
  longDescription?: string   // Full README (markdown)
  readme?: string           // Alias for longDescription
  
  // License fields
  license?: {
    id: string              // License identifier (e.g., 'CC BY-SA 4.0')
    url?: string            // License URL
  }
  licenseFile?: string      // Full license text
  
  // Metadata URL
  urls?: {
    metadata?: string       // URL to manifest.yaml
    repository?: string     // Git repository URL
    homepage?: string       // Project homepage
  }
  metadata_url?: string     // Alias for urls.metadata
}
```

### 2. **Add Validation**

Add runtime checks to ensure readme/license are properly populated:

```typescript
function validateResourceMetadata(resource: ResourceInfo): void {
  if (!resource.readme && !resource.description) {
    console.warn(`⚠️ Resource ${resource.key} has no README or description`)
  }
  
  if (!resource.license) {
    console.warn(`⚠️ Resource ${resource.key} has no license information`)
  }
}
```

### 3. **Normalize on Save**

Always normalize field names when saving to catalog:

```typescript
async function saveToDatalog(metadata: any) {
  const normalized = {
    ...metadata,
    longDescription: metadata.readme || metadata.longDescription || metadata.description,
    license: {
      id: typeof metadata.license === 'string' ? metadata.license : metadata.license?.id
    },
    urls: {
      metadata: metadata.metadata_url || metadata.urls?.metadata
    }
  }
  
  await catalogManager.addResourceToCatalog(normalized)
}
```

## Files Changed

1. `apps/tc-study/src/components/catalog/AddToCatalogWizard.tsx`
2. `apps/tc-study/src/lib/services/CollectionExportService.ts`
3. `apps/tc-study/src/components/collections/CollectionImportDialog.tsx`

## Impact

- ✅ Info buttons now show README content
- ✅ License information always available
- ✅ Collections preserve all documentation
- ✅ Offline exports include full metadata
- ✅ No data loss during save/load cycles

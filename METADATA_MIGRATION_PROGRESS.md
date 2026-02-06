# Single Source of Truth - Current Progress

## What We've Done

### ✅ Phase 1: Updated Core Types

1. **Updated `ResourceMetadata` in catalog package** (`packages/resource-catalog/src/types.ts`)
   - Added `languageTitle`, `languageName`, `languageDirection`
   - Added `readme`, `licenseText`, `licenseFile` for full content storage
   - All fields now in one place ✅

2. **Updated `ResourceMetadataFactory`** (`apps/tc-study/src/lib/services/ResourceMetadataFactory.ts`)
   - Now populates all new fields
   - Ensures complete metadata from Door43 API

3. **Redesigned `ResourceInfo`** (`apps/tc-study/src/contexts/types.ts`)
   - Now **extends** `ResourceMetadata` (no duplication!)
   - Only adds app-specific fields: `toc`, `id`, `key`, `category`
   - All metadata fields come from base `ResourceMetadata`

4. **Created `resourceInfo.ts` utility** (`apps/tc-study/src/utils/resourceInfo.ts`)
   - `createResourceInfo()` - proper way to create ResourceInfo
   - Replaces the old `normalizeResourceInfo()` workaround
   - Ensures aliases (`id`, `key`) are set correctly

5. **Started updating `workspaceStore.ts`**
   - Changed import from `normalizeResourceInfo` to `createResourceInfo`
   - Still need to update all usages (3 places found)

## What Needs to Be Done

### 🔄 Phase 2: Complete WorkspaceStore Migration

Update these 3 locations in `workspaceStore.ts`:

1. **Line 387** - `loadFromCollection()`
   ```typescript
   // OLD:
   return [resourceKey, normalizeResourceInfo(resourceInfo)]
   
   // NEW:
   return [resourceKey, createResourceInfo(resourceInfo as ResourceMetadata)]
   ```

2. **Line 432** - `loadSavedWorkspace()`
   ```typescript
   // OLD:
   resources: normalizeResourceInfoMap(new Map(data.resources || []))
   
   // NEW: Need to create helper function
   resources: new Map(
     Array.from(data.resources || []).map(([key, res]) => 
       [key, createResourceInfo(res as ResourceMetadata)]
     )
   )
   ```

3. **Line 560** - `addResourceToPackage()`
   ```typescript
   // OLD:
   const normalizedResource = normalizeResourceInfo(resource)
   
   // NEW:
   // Resource should already be properly formatted as ResourceInfo
   // Just ensure aliases are set:
   const resourceInfo = resource.id ? resource : createResourceInfo(resource as ResourceMetadata)
   ```

### 📋 Phase 3: Update All Other Files

Need to update these files to use new structure:

#### Viewers (highest priority - user-facing)
- `apps/tc-study/src/components/resources/ScriptureViewer/index.tsx`
  - Already accepts `resource` prop ✅
  - Uses `resource.title`, `resource.languageTitle` ✅
  - **Should work as-is!** (since ResourceInfo extends ResourceMetadata)

- `apps/tc-study/src/components/resources/TranslationNotesViewer/index.tsx`
  - Already correct ✅

- `apps/tc-study/src/components/resources/TranslationQuestionsViewer/index.tsx`
  - Already correct ✅

- `apps/tc-study/src/components/resources/WordsLinksViewer/index.tsx`
  - Already correct ✅

#### Resource Creation Flows
- `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx`
  - Search for where ResourceInfo objects are created
  - Replace manual construction with `createResourceInfo(metadata)`

- `apps/tc-study/src/components/read/SimplifiedReadView.tsx`
  - Same as above

- `apps/tc-study/src/components/catalog/AddToCatalogWizard.tsx`
  - Ensure it creates proper ResourceMetadata
  - Convert to ResourceInfo using `createResourceInfo()`

- `apps/tc-study/src/components/collections/CollectionImportDialog.tsx`
  - Same pattern

#### Other Stores
- `apps/tc-study/src/lib/stores/packageStore.ts`
  - Check if it uses ResourceInfo
  - Update to new pattern if needed

- `apps/tc-study/src/contexts/AppContext.tsx`
  - Check `loadedResources` Map
  - Ensure proper types

### 🗑️ Phase 4: Delete Old Code

Once everything is migrated:

1. **Delete** `apps/tc-study/src/utils/normalizeResourceInfo.ts`
2. **Search and verify** no references to:
   - `normalizeResourceInfo`
   - `normalizeResourceInfoMap`
   - `normalizeResourceInfoArray`

### ✅ Phase 5: Testing

Test all flows:
- [ ] Load collection → resources show correct titles
- [ ] Studio page → headers show correct metadata
- [ ] Read page → headers show correct metadata
- [ ] Import collection → works correctly
- [ ] Add resources from catalog → works correctly
- [ ] Save/load workspace → preserves all metadata

## Key Benefits of New Approach

### Before (duplication):
```typescript
interface ResourceInfo {
  id: string
  title: string
  type: string
  language: string
  metadata: {
    title: string     // DUPLICATE!
    type: string      // DUPLICATE!
    language: string  // DUPLICATE!
  }
}
```

### After (single source):
```typescript
// ResourceInfo extends ResourceMetadata
interface ResourceInfo extends ResourceMetadata {
  // Only app-specific additions:
  id: string      // Alias for resourceKey
  key: string     // Alias for resourceKey
  toc?: ResourceTOC
}

// Usage is clean:
resource.title          // From ResourceMetadata
resource.languageTitle  // From ResourceMetadata
resource.type           // From ResourceMetadata
```

## Next Steps

1. **Review this plan** - Make sure the approach makes sense
2. **Complete workspaceStore** - Update the 3 locations
3. **Test in browser** - Ensure nothing breaks
4. **Continue with other files** - One by one
5. **Delete old code** - Clean up normalizeResourceInfo
6. **Full testing** - All features work

## Why This Is Better

✅ **No data duplication** - Each field exists in ONE place  
✅ **Type safety** - ResourceInfo extends ResourceMetadata, so TypeScript enforces consistency  
✅ **Future-proof** - Easy to add new metadata sources (not just Door43)  
✅ **Cleaner code** - No more conditional fallbacks like `metadata?.title || resource.title`  
✅ **Clear architecture** - ResourceMetadata is catalog, ResourceInfo is app wrapper  

The old `normalizeResourceInfo()` was papering over architectural inconsistency. Now we have true single source of truth!

# Single Source of Truth Migration Plan

## Goal
Make `ResourceMetadata` from `@bt-synergy/resource-catalog` the **ONLY** source of truth for all resource information throughout the system.

## Current Problem
- `ResourceInfo` (app) duplicates fields from `ResourceMetadata` (catalog package)
- Data exists in two places requiring `normalizeResourceInfo()` to sync them
- Inconsistent data sources lead to fallback patterns and conditional logic

## Solution Architecture

### 1. ResourceMetadata (Catalog Package) - THE ONLY SOURCE
```typescript
// packages/resource-catalog/src/types.ts
export interface ResourceMetadata {
  // Already has everything we need:
  resourceKey: string
  server: string
  owner: string
  language: string
  resourceId: string
  title: string
  subject: string
  version: string
  description?: string
  type: ResourceType
  format: ResourceFormat
  contentStructure: 'book' | 'entry'
  availability: { online, offline, bundled, partial }
  locations: ResourceLocation[]
  contentMetadata?: {
    ingredients?: ResourceIngredient[]
    books?: string[]
    // ... etc
  }
  // ... all other fields
}
```

### 2. App-Specific Extensions (NEW)
Create thin wrapper that ONLY adds UI state, no data duplication:

```typescript
// apps/tc-study/src/types/resource.ts
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceTOC } from './toc'

/**
 * App-specific resource state - wraps catalog metadata
 * NO DUPLICATION of metadata fields!
 */
export interface AppResourceState {
  // Reference to catalog metadata (THE source of truth)
  metadata: ResourceMetadata
  
  // App-specific UI state ONLY
  toc?: ResourceTOC           // Runtime TOC from loaders
  isLoading?: boolean         // UI loading state
  loadError?: string          // UI error state
  lastAccessed?: Date         // App usage tracking
  
  // Computed/convenience getters (not stored)
  get id(): string { return this.metadata.resourceKey }
  get title(): string { return this.metadata.title }
  get type(): string { return this.metadata.type }
  // ... etc
}
```

### 3. Migration Steps

#### Phase 1: Update Type Definitions
- [x] Keep `ResourceMetadata` in catalog package as-is (already good!)
- [ ] Add missing fields to `ResourceMetadata` if needed:
  - [ ] `languageTitle` (human-readable language name)
  - [ ] `languageDirection` (ltr/rtl)
  - [ ] `readme` content
  - [ ] `license` details
- [ ] Create new `AppResourceState` in app
- [ ] Update all viewers to accept `metadata: ResourceMetadata`

#### Phase 2: Update Stores & Contexts
- [ ] `workspaceStore.ts` - store `ResourceMetadata` directly
- [ ] `packageStore.ts` - store `ResourceMetadata` directly  
- [ ] `AppContext.tsx` - `loadedResources: Map<string, ResourceMetadata>`
- [ ] Remove `normalizeResourceInfo()` utility (no longer needed!)

#### Phase 3: Update Viewers
- [ ] `ScriptureViewer` - accept `metadata: ResourceMetadata`
- [ ] `TranslationNotesViewer` - accept `metadata: ResourceMetadata`
- [ ] `TranslationQuestionsViewer` - accept `metadata: ResourceMetadata`
- [ ] `WordsLinksViewer` - accept `metadata: ResourceMetadata`
- [ ] All viewer headers use `metadata.title`, `metadata.languageTitle`

#### Phase 4: Update Resource Creation
- [ ] `ResourceMetadataFactory.ts` - ensure ALL fields populated
- [ ] `AddToCatalogWizard.tsx` - create complete `ResourceMetadata`
- [ ] `CollectionImportDialog.tsx` - import as `ResourceMetadata`
- [ ] `LinkedPanelsStudio.tsx` - work with `ResourceMetadata`
- [ ] `SimplifiedReadView.tsx` - work with `ResourceMetadata`

#### Phase 5: Update Viewer Registry
- [ ] Update viewer registration to use `ResourceMetadata`
- [ ] Update props interfaces for all viewers

#### Phase 6: Cleanup
- [ ] Delete `ResourceInfo` interface from `contexts/types.ts`
- [ ] Delete `normalizeResourceInfo.ts` utility
- [ ] Remove all references to old `ResourceInfo`
- [ ] Update all imports to use `ResourceMetadata`

## Missing Fields Analysis

Current `ResourceInfo` fields that need to be in `ResourceMetadata`:

```typescript
// Already in ResourceMetadata ✅
- id → resourceKey
- key → resourceKey
- title ✅
- type ✅
- category → can derive from type
- language ✅
- owner ✅
- server ✅
- subject ✅
- format ✅
- version ✅
- description ✅
- contentStructure ✅
- ingredients → contentMetadata.ingredients ✅

// Need to ADD to ResourceMetadata
- languageTitle: string (human-readable language name)
- languageDirection: 'ltr' | 'rtl'
- languageName: string (alternative to languageTitle)
- readme: string (full README content)
- license: string (full license text)
- licenseFile: string (license filename)
```

## Benefits

### Before (with duplication):
```typescript
interface ResourceInfo {
  id: string
  title: string
  type: string
  metadata: any // Also has title, type, etc.
}

// Usage requires choosing:
resource.title // or resource.metadata.title ??
```

### After (single source):
```typescript
interface AppResourceState {
  metadata: ResourceMetadata // THE ONLY source
  toc?: ResourceTOC // UI-only
}

// Usage is clear:
resource.metadata.title // Always!
```

## Testing Checklist

After migration:
- [ ] Studio page loads resources correctly
- [ ] Read page loads resources correctly
- [ ] Collections import/export works
- [ ] All resource titles display correctly
- [ ] All language information displays correctly
- [ ] Resource info modals show complete metadata
- [ ] No console errors about missing fields
- [ ] No `normalizeResourceInfo` calls anywhere
- [ ] No dual data sources

## Files to Update

### Packages
1. `packages/resource-catalog/src/types.ts` - Add missing fields
2. `packages/resource-catalog/src/index.ts` - Export updated types

### App Types
3. `apps/tc-study/src/contexts/types.ts` - Replace `ResourceInfo` with reference to `ResourceMetadata`
4. Create `apps/tc-study/src/types/resource.ts` - New `AppResourceState` wrapper

### Stores
5. `apps/tc-study/src/lib/stores/workspaceStore.ts`
6. `apps/tc-study/src/lib/stores/packageStore.ts`
7. `apps/tc-study/src/contexts/AppContext.tsx`

### Viewers
8. `apps/tc-study/src/components/resources/ScriptureViewer/types.ts`
9. `apps/tc-study/src/components/resources/ScriptureViewer/index.tsx`
10. `apps/tc-study/src/components/resources/TranslationNotesViewer/index.tsx`
11. `apps/tc-study/src/components/resources/TranslationQuestionsViewer/index.tsx`
12. `apps/tc-study/src/components/resources/WordsLinksViewer/types.ts`
13. `apps/tc-study/src/components/resources/WordsLinksViewer/index.tsx`

### Resource Creation
14. `apps/tc-study/src/lib/services/ResourceMetadataFactory.ts`
15. `apps/tc-study/src/components/catalog/AddToCatalogWizard.tsx`
16. `apps/tc-study/src/components/collections/CollectionImportDialog.tsx`
17. `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx`
18. `apps/tc-study/src/components/read/SimplifiedReadView.tsx`

### Utilities to DELETE
19. `apps/tc-study/src/utils/normalizeResourceInfo.ts` ❌ DELETE

## Rollout Strategy

1. **Week 1**: Update catalog package with missing fields
2. **Week 2**: Update stores and contexts to use `ResourceMetadata`
3. **Week 3**: Update all viewers to use `ResourceMetadata`
4. **Week 4**: Update resource creation flows
5. **Week 5**: Testing and cleanup
6. **Week 6**: Delete old code and utilities

## Success Criteria

✅ No field duplication
✅ Single import: `import type { ResourceMetadata } from '@bt-synergy/resource-catalog'`
✅ All code uses `resource.metadata.title` (or similar)
✅ No `normalizeResourceInfo()` calls
✅ No fallback patterns like `metadata?.title || 'Generic'`
✅ All tests pass
✅ App works identically to before (but cleaner!)

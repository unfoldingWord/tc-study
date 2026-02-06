# Resource Metadata Normalization - Continuation Instructions

## Problem Summary

The application has an architectural inconsistency in how resource metadata is stored and accessed:

1. **Dual Storage Problem**: Resource information is stored in TWO places:
   - Top-level `ResourceInfo` fields: `title`, `language`, `type`, etc.
   - Nested `metadata` object with same fields: `metadata.title`, `metadata.language`, etc.

2. **Inconsistent Population**: Not all resource loading paths populate the `metadata` field
3. **Fallback Hell**: Viewers use `metadata?.title || 'Generic Title'` fallbacks everywhere
4. **Root Cause**: No single source of truth for resource display information

## User Feedback

> "It seems like your fix is also a workaround, what is normalizeResourceInfo? Also the panel headers of each resource resourceViewer is not showing the actual title from metadata, only scripture resources are showing the correct titles."

The user correctly identified that:
- `normalizeResourceInfo` is a workaround (copying data between redundant fields)
- Non-scripture resource headers still show generic titles instead of actual metadata titles
- We need to fix the architecture, not add more workarounds

## Decided Solution

**Use top-level fields as the single source of truth:**

1. When resources arrive with rich `metadata` (from Door43 API), **promote** those fields to top-level
2. All viewers should access `resource.title`, `resource.languageTitle` directly (no conditionals)
3. Remove ALL `|| 'Generic Title'` fallbacks from viewers
4. Keep `metadata` object for detailed displays (modals, info panels) but not for headers

## Work Completed So Far

### ✅ Files Modified:

1. **`apps/tc-study/src/utils/normalizeResourceInfo.ts`**
   - Simplified to promote metadata fields to top-level
   - Removed the logic that builds metadata from scratch
   - Now just promotes `metadata.title` → `resource.title`, etc.

2. **`apps/tc-study/src/lib/stores/workspaceStore.ts`**
   - Added ES6 import: `import { normalizeResourceInfo } from '../../utils/normalizeResourceInfo'`
   - Applied normalization in `addResourceToPackage()`
   - Applied normalization in `loadFromCollection()`
   - Fixed browser compatibility (was using `require()` which doesn't work in browser)

3. **`apps/tc-study/src/components/resources/WordsLinksViewer/index.tsx`**
   - Changed prop from `metadata?: any` to `resource: ResourceInfo`
   - Updated header to use `resource.title` instead of `metadata?.title || 'Translation Words Links'`
   - Removed fallback

4. **`apps/tc-study/src/components/resources/WordsLinksViewer/types.ts`**
   - Updated `WordsLinksViewerProps` to receive `resource: ResourceInfo`
   - Removed `metadata?: any` prop

5. **`apps/tc-study/src/components/resources/TranslationNotesViewer/index.tsx`**
   - Already uses `resource: ResourceInfo` prop ✅
   - Already uses `resource.title` directly ✅
   - Already no fallback ✅

## Work Still Needed

### 1. Update TranslationQuestionsViewer

**File:** `apps/tc-study/src/components/resources/TranslationQuestionsViewer/index.tsx`

**Current state:**
```tsx
<ResourceViewerHeader 
  title={metadata?.title || 'Translation Questions'}
  icon={MessageCircleQuestion}
  subtitle={metadata?.language_title}
/>
```

**Action needed:**
- Change props to receive `resource: ResourceInfo` instead of `metadata?: any`
- Update header to `title={resource.title}` and `subtitle={resource.languageTitle}`
- Remove fallback `|| 'Translation Questions'`

### 2. Update ScriptureViewer

**File:** `apps/tc-study/src/components/resources/ScriptureViewer/index.tsx`

**Current state:**
```tsx
<ResourceViewerHeader 
  title={catalogMetadata?.title || 'Scripture'}
  icon={Book}
  subtitle={catalogMetadata?.language_title}
/>
```

**Action needed:**
- Check if it receives `resource` prop already
- Update to use `resource.title` and `resource.languageTitle`
- Remove fallback `|| 'Scripture'`

### 3. Update SimplifiedReadView.tsx

**File:** `apps/tc-study/src/components/read/SimplifiedReadView.tsx`

**Current pattern (around line 1012):**
```tsx
viewerProps.metadata = resource.metadata;
```

**Action needed:**
- Change to pass full resource: `viewerProps.resource = resource`
- Do this for ALL viewer types (words-links, notes, questions, scripture)
- Search for ALL places where `metadata` is passed to viewers

### 4. Update LinkedPanelsStudio.tsx

**File:** `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx`

**Similar to SimplifiedReadView:**
- Change from passing `metadata` to passing full `resource`
- Update all viewer instantiations

### 5. Update Viewer Props Types

Check and update these files:
- `TranslationQuestionsViewer` - needs prop type update
- `ScriptureViewer` - check if already correct
- Any other viewers that still have `metadata?: any` prop

### 6. Remove All Fallbacks

**Search for pattern:** `|| 'Translation'` or `|| 'Scripture'` etc.

**Files to check:**
- All viewer `*.tsx` files in `apps/tc-study/src/components/resources/`
- Any place that renders resource titles

**Remove patterns like:**
```tsx
// ❌ REMOVE
title={metadata?.title || 'Generic Title'}
subtitle={metadata?.language_title}

// ✅ REPLACE WITH
title={resource.title}
subtitle={resource.languageTitle}
```

### 7. Update Type Definitions

**File:** `apps/tc-study/src/contexts/types.ts`

**Current state:** `metadata: any` (marked as required but typed as `any`)

**Action needed:**
- Add JSDoc explaining that top-level fields are source of truth
- Document that `metadata` is kept for detailed displays but not for headers
- Optionally: Make clear which fields are required vs optional

### 8. Test All Resource Types

After changes, test in browser:
1. Load all resource types (scripture, notes, questions, words-links)
2. Check that ALL resource headers show actual titles (not generic fallbacks)
3. Verify info modals still work (they use `resource.metadata`)
4. Check that switching resources updates titles correctly

## Key Patterns to Follow

### ❌ OLD Pattern (with workarounds):
```tsx
// Props
interface ViewerProps {
  metadata?: any
}

// Usage
<ResourceViewerHeader 
  title={metadata?.title || 'Generic Title'}
  subtitle={metadata?.language_title}
/>
```

### ✅ NEW Pattern (clean):
```tsx
// Props
interface ViewerProps {
  resource: ResourceInfo
}

// Usage
<ResourceViewerHeader 
  title={resource.title}
  subtitle={resource.languageTitle}
/>
```

## Testing Checklist

After completing the work:

- [ ] Run dev server: `pnpm dev:tc-study`
- [ ] Open browser at `http://localhost:3000/?lang=en`
- [ ] Check scripture viewer headers show real titles (e.g., "unfoldingWord® Literal Text")
- [ ] Check TWL viewer header shows real title (not "Translation Words Links")
- [ ] Check TN viewer header shows real title (not "Translation Notes")
- [ ] Check TQ viewer header shows real title (not "Translation Questions")
- [ ] Click info icon on each resource to verify metadata modal works
- [ ] Switch between resources to verify titles update correctly
- [ ] Check browser console for no errors
- [ ] No `require is not defined` errors
- [ ] No `metadata is not defined` errors

## Important Notes

1. **Top-level fields are source of truth** - Don't use `metadata.title`, use `resource.title`
2. **No fallbacks** - If title is missing, it's a bug in normalization, not a missing fallback
3. **Keep metadata object** - Still needed for detailed modals, just not for headers
4. **Use `languageTitle`** not `language_title` - Follow camelCase convention
5. **Test frequently** - Check browser after each file change

## Files Reference

Key files to work with:
- `apps/tc-study/src/components/resources/TranslationQuestionsViewer/index.tsx`
- `apps/tc-study/src/components/resources/ScriptureViewer/index.tsx`
- `apps/tc-study/src/components/read/SimplifiedReadView.tsx`
- `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx`
- `apps/tc-study/src/utils/normalizeResourceInfo.ts` (already done)
- `apps/tc-study/src/lib/stores/workspaceStore.ts` (already done)

## Current Branch

Branch: `refactor/normalize-resource-metadata`

Last commit: "refactor: normalize ResourceInfo metadata structure"

## Questions for User

If anything is unclear:
1. Should we keep backward compatibility with old `metadata` prop?
2. Are there other apps (mobile, bt-studio) that need same fix?
3. Any specific resource types that need special handling?

Good luck! The architecture will be much cleaner when this is done. 🎯

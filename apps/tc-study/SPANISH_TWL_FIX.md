# Spanish TWL Quote Building Fix

**Date:** 2026-01-28  
**Issue:** Translation Words Links (TWL) quote building was broken for Spanish resources

## Problem

When loading Spanish resources (e.g., `es-419_gl/es-419/twl`), the TWL alignment system was failing with:
```
[TWL-DEBUG] ⏭️ STEP 2: Skipping quote building - no original content or links 
{hasOriginalContent: false, linksCount: 223}
```

### Root Causes

1. **Wrong Original Language Resource Owner**
   - The system was trying to load Greek/Hebrew texts using the TWL's owner
   - For Spanish TWL (`es-419_gl/es-419/twl`), it tried to find `es-419_gl/el-x-koine/ugnt`
   - But original language texts are **always** from `unfoldingWord`, not the TWL's organization

2. **Preloaded Resource Format Mismatches**
   - Preloaded resource metadata was generated at build time
   - When Door43 API format changes (especially for non-English resources), preloaded metadata becomes outdated
   - This caused metadata format mismatches for Spanish and other languages

## Solutions Implemented

### 1. Fixed Original Language Resource Discovery
**File:** `apps/tc-study/src/components/resources/WordsLinksViewer/hooks/useOriginalLanguageContent.ts`

**Before:**
```typescript
const [owner] = parts  // Gets owner from TWL resourceKey
const greekResourceKey = `${owner}/el-x-koine/ugnt`  // WRONG for non-unfoldingWord TWLs
```

**After:**
```typescript
// NOTE: Original language resources (UGNT, UHB) are always from unfoldingWord,
// regardless of which organization's TWL we're using
const greekResourceKey = 'unfoldingWord/el-x-koine/ugnt'  // CORRECT
const hebrewResourceKey = 'unfoldingWord/hbo/uhb'  // CORRECT
```

### 2. Disabled Preloaded Resources for Web
**Files:** 
- `apps/tc-study/src/contexts/CatalogContext.tsx`
- `apps/tc-study/src/App.tsx`

**Rationale:**
- Web apps require internet anyway, so no benefit from preloaded metadata
- Preloaded metadata can become outdated when Door43 API changes
- Always fetching fresh from Door43 ensures consistency

**Changes:**
- Commented out `initializePreloadedResources()` call in `CatalogContext`
- Removed `loadPreloadedResources()` call in `App.tsx`
- Added clear documentation explaining why

## Testing

After these fixes, Spanish resources should work correctly:

1. ✅ Original language content (Greek UGNT) loads for Spanish TWL
2. ✅ Quote tokens are built from original language words
3. ✅ Alignment to target language (Spanish) tokens works
4. ✅ Quotes display in TWL cards with proper attribution

## Future Considerations

### For Mobile App
Mobile apps might still benefit from preloaded resources for offline use. If re-enabled for mobile:
1. Ensure preloaded metadata is regenerated frequently (CI/CD)
2. Add versioning/validation to detect stale metadata
3. Implement automatic refresh when metadata is too old

### For Other Organizations' Resources
This fix ensures any organization's TWL resources will work correctly:
- `unfoldingWord/en/twl` ✅
- `es-419_gl/es-419/twl` ✅
- `door43-catalog/fr/twl` ✅
- etc.

All will correctly load original language texts from `unfoldingWord/el-x-koine/ugnt` or `unfoldingWord/hbo/uhb`.

## Related Documentation
- `TWL_ALIGNMENT_SYSTEM.md` - Complete documentation of the TSV alignment algorithm
- `ALIGNMENT_FIX.md` - Case sensitivity fix
- `INFLECTED_VS_LEMMA_FIX.md` - Inflected form vs lemma fix

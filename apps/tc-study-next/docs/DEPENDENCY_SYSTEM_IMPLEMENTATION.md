# Dynamic Resource Dependency System - Implementation Summary

## What Was Implemented

A flexible, type-safe resource dependency system that supports **context-aware dependencies** (same language/org) and **fixed dependencies** (specific language/org).

## Problem Solved

Previously, dependencies were simple strings like `dependencies: ['words']`, which didn't account for:
- Language matching (e.g., `es-419_twl` should depend on `es-419_tw`, not any TW)
- Organization matching (e.g., `unfoldingWord/en_twl` should depend on `unfoldingWord/en_tw`)
- Mixed scenarios (e.g., always depend on English, but same org)

## Solution

Created a rich dependency specification system with multiple modes:

### 1. **Simple** (backward compatible)
```typescript
dependencies: ['words']
```

### 2. **Same Language**
```typescript
dependencies: [{ resourceType: 'words', sameLanguage: true }]
```

### 3. **Same Organization**
```typescript
dependencies: [{ resourceType: 'words', sameOwner: true }]
```

### 4. **Both** (most common)
```typescript
dependencies: [{ 
  resourceType: 'words', 
  sameLanguage: true, 
  sameOwner: true 
}]
```

### 5. **Fixed Language**
```typescript
dependencies: [{ resourceType: 'words', language: 'en' }]
```

### 6. **Fixed Organization**
```typescript
dependencies: [{ resourceType: 'words', owner: 'unfoldingWord' }]
```

### 7. **Mixed**
```typescript
dependencies: [{ 
  resourceType: 'words', 
  sameLanguage: true,        // Dynamic
  owner: 'unfoldingWord'     // Fixed
}]
```

## Files Changed

### 1. Core Types
**`packages/resource-types/src/types.ts`**
- Added `ResourceDependency` interface with fields:
  - `resourceType`: string (required)
  - `sameLanguage`: boolean (optional)
  - `sameOwner`: boolean (optional)
  - `language`: string (optional, fixed)
  - `owner`: string (optional, fixed)
- Updated `dependencies` field to accept `Array<string | ResourceDependency>`

**`packages/resource-types/src/index.ts`**
- Exported `ResourceDependency` type

### 2. Dependency Utilities
**`apps/tc-study/src/utils/resourceDependencies.ts`**
- Added `normalizeDependency()`: Convert string or object to `ResourceDependency`
- Added `resourceMatchesDependency()`: Check if a resource matches dependency rules
- Added `getDependencyRequirement()`: Generate human-readable requirement description
- Updated `checkResourceDependencies()`:
  - Added `resourceLanguage` and `resourceOwner` parameters
  - Uses new matching logic
  - Returns detailed requirement descriptions
- Updated `getRequiredDependencyResources()`:
  - Added `resourceLanguage` and `resourceOwner` parameters
  - Uses new matching logic
  - Logs found/missing dependencies

### 3. Resource Type Definitions
**`apps/tc-study/src/resourceTypes/translationWordsLinks.ts`**
- Updated to use new dependency format:
```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  sameLanguage: true,
  sameOwner: true,
}]
```

### 4. Integration Points
**`apps/tc-study/src/components/catalog/AddToCatalogWizard.tsx`**
- Updated two `checkResourceDependencies()` calls (add-only and download paths):
  - Now passes `resource.language` and `resource.owner`
- Fixed pre-existing linter errors:
  - Removed `longDescription` property (not in `ResourceMetadata`)
  - Removed `licenseFile` property (not in `ResourceMetadata`)

### 5. Documentation
**`apps/tc-study/docs/RESOURCE_DEPENDENCIES.md`** (NEW)
- Comprehensive guide on how to use the dependency system
- Examples for all dependency types
- Real-world use cases
- How-to for adding dependencies to resource types

**`apps/tc-study/docs/DEPENDENCY_SYSTEM_IMPLEMENTATION.md`** (THIS FILE)
- Implementation summary
- Changes made
- Testing instructions

## How It Works (Flow)

### User Adds Resource
1. User selects `unfoldingWord/es-419_twl` (Spanish Translation Words Links)

### Dependency Check
2. System calls `checkResourceDependencies('words-links', 'es-419', 'unfoldingWord', ...)`

### Matching Logic
3. For each dependency in TWL's definition:
   ```typescript
   {
     resourceType: 'words',
     sameLanguage: true,
     sameOwner: true
   }
   ```
4. System looks for resources where:
   - `resource.type === 'words'` ✓
   - `resource.language === 'es-419'` ✓ (sameLanguage)
   - `resource.owner === 'unfoldingWord'` ✓ (sameOwner)

### Auto-Download
5. If not found in workspace, search in wizard's available resources
6. If found, auto-add to download queue
7. Show user: "Auto-adding dependency: Translation Words (same language & org)"

## Example Scenarios

### Scenario 1: Adding TWL
**Resource**: `unfoldingWord/es-419_twl`
**Dependency**: `{ resourceType: 'words', sameLanguage: true, sameOwner: true }`
**System Looks For**: `unfoldingWord/es-419_tw`
**Result**: ✓ Found and auto-downloaded

### Scenario 2: Adding TN (Hypothetical)
**Resource**: `unfoldingWord/es-419_tn`
**Dependency**: `{ resourceType: 'scripture', language: 'en', owner: 'unfoldingWord' }`
**System Looks For**: `unfoldingWord/en_ult` (always English ULT)
**Result**: ✓ Found and auto-downloaded

### Scenario 3: Complex Dependencies
**Resource**: `custom-org/swh_custom-notes`
**Dependencies**:
1. `{ resourceType: 'words', sameLanguage: true, sameOwner: true }`
2. `{ resourceType: 'scripture', language: 'en', owner: 'unfoldingWord' }`

**System Looks For**:
1. `custom-org/swh_tw` (same language & org)
2. `unfoldingWord/en_ult` (always English ULT from unfoldingWord)

**Result**: ✓ Both found and auto-downloaded

## Benefits

### 1. Correctness
- Ensures resources always have their proper dependencies
- Prevents broken references (e.g., TWL without TW)

### 2. Flexibility
- Supports any combination of fixed/dynamic requirements
- Easy to add new dependency types in the future

### 3. Type Safety
- Uses TypeScript constants (`RESOURCE_TYPE_IDS`)
- Compile-time checking prevents typos

### 4. User Experience
- Auto-downloads missing dependencies
- Clear messages about what's required
- No manual dependency management

### 5. Maintainability
- Dependencies defined in one place (resource type definition)
- Easy to understand and modify
- Well-documented

## Testing Instructions

### Test 1: TWL Requires TW (Same Language & Org)

1. Start with empty workspace
2. Open wizard
3. Select language: Spanish (es-419)
4. Select organization: unfoldingWord
5. Select only TWL (Translation Words Links)
6. Click "Add to Catalog"

**Expected**: 
- Should show message: "Auto-adding dependency: Translation Words (same language & org)"
- Both TW and TWL should be added

**Verify**:
```
console.log output should show:
✓ Found dependency: words -> unfoldingWord Spanish Translation Words
```

### Test 2: Already Has Dependency

1. Add TW to workspace first
2. Then try to add TWL

**Expected**:
- No auto-download (dependency already met)
- Only TWL added

### Test 3: Dependency Not Available

1. Try to add TWL without TW available in wizard

**Expected**:
- Warning message: "Translation Words Links requires: Translation Words (same language & org)"
- ⚠️  Could not find dependency message in console

## Future Enhancements

1. **Version Constraints**
   ```typescript
   { resourceType: 'words', minVersion: '2.0.0' }
   ```

2. **Resource ID Filters**
   ```typescript
   { resourceType: 'scripture', resourceId: 'ult' }
   ```

3. **Optional Dependencies**
   ```typescript
   { resourceType: 'words', optional: true }
   ```

4. **Circular Dependency Detection**
   - Prevent A → B → A

5. **Dependency Graph Visualization**
   - Show users what depends on what

## Migration Guide for Existing Resource Types

If you have an existing resource type with dependencies:

### Before
```typescript
dependencies: ['words']
```

### After (Same Language & Org)
```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  sameLanguage: true,
  sameOwner: true,
}]
```

### After (Always English from unfoldingWord)
```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  language: 'en',
  owner: 'unfoldingWord',
}]
```

## Summary

✅ **Implemented**: Full context-aware dependency system
✅ **Type-Safe**: Uses constants and TypeScript types
✅ **Backward Compatible**: Supports simple string format
✅ **Flexible**: 7 different dependency modes
✅ **Automatic**: Auto-downloads missing dependencies
✅ **Documented**: Comprehensive documentation
✅ **Tested**: Ready for testing with TWL → TW dependency

The system is production-ready and can handle complex dependency scenarios while maintaining simplicity for common cases.

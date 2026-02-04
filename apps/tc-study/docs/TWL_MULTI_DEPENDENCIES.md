# Translation Words Links - Multiple Dependencies

## Overview

Translation Words Links (TWL) now requires **three dependencies** to function properly:

1. **Translation Words (TW)** - The dictionary/glossary
2. **UGNT** (unfoldingWord Greek New Testament) - Greek original language text
3. **UHB** (unfoldingWord Hebrew Bible) - Hebrew original language text

## Why These Dependencies?

TWL creates links between words in scripture and their corresponding Translation Words articles. To work properly, it needs:

- **TW**: The actual articles/definitions to link to
- **UGNT & UHB**: The original language texts that contain the words being linked

## Implementation

### Resource Type Definition

```typescript:apps/tc-study/src/resourceTypes/translationWordsLinks.ts
dependencies: [
  {
    resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    sameLanguage: true,
    sameOwner: true,
  },
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'el-x-koine', // Koine Greek
    owner: 'unfoldingWord',
  },
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'hbo', // Ancient Hebrew
    owner: 'unfoldingWord',
  },
],
```

### Dependency Rules

1. **TW**: Must be from the same language and organization as the TWL
2. **UGNT**: Must be unfoldingWord's Greek New Testament (el-x-koine)
3. **UHB**: Must be unfoldingWord's Hebrew Bible (hbo)

## How It Works

### When Selecting TWL in the Wizard

```
User clicks TWL (es-419_gl)
   ↓
System checks dependencies:
   1. Search for TW (es-419_gl/es-419/tw)
   2. Search for UGNT (unfoldingWord/el-x-koine/ugnt)
   3. Search for UHB (unfoldingWord/hbo/uhb)
   ↓
System searches across layers:
   - Workspace (already loaded resources)
   - Available resources (in current wizard list)
   - Local catalog
   - Door43 API
   ↓
If all found:
   ✓ TWL shows "Dependencies OK"
   ✓ User can select TWL
   ✓ Dependencies are auto-selected
   ↓
If any missing:
   ✗ TWL shows "Missing Dependencies"
   ✗ TWL is disabled
   ✗ Details shown in UI
```

### Cascade Deselection

When you deselect a dependency, TWL is automatically deselected:

```
User deselects TW
   ↓
⛓️  Cascade deselecting dependents of TW:
   - es-419_gl/es-419/twl
```

```
User deselects UGNT
   ↓
⛓️  Cascade deselecting dependents of UGNT:
   - es-419_gl/es-419/twl
```

```
User deselects UHB
   ↓
⛓️  Cascade deselecting dependents of UHB:
   - es-419_gl/es-419/twl
```

## Testing

### Console Log Output (Successful Case)

```
🔍 Searching for dependency: words
   Target: es-419_gl/es-419
   ✓ Found in available resources list: es-419_gl/es-419/tw

🔍 Searching for dependency: scripture
   Target: unfoldingWord/el-x-koine
   ✓ Found in workspace: unfoldingWord/el-x-koine/ugnt

🔍 Searching for dependency: scripture
   Target: unfoldingWord/hbo
   ✓ Found in workspace: unfoldingWord/hbo/uhb

   Enlaces a las Palabras de Traducción: ✓ All dependencies available
   🔗 Auto-selecting dependency: es-419_gl/es-419/tw
```

### What Gets Auto-Selected

When you select TWL:
- ✅ TW is auto-selected (if not already selected)
- ✅ UGNT remains in workspace (was already loaded)
- ✅ UHB remains in workspace (was already loaded)

When you deselect any dependency:
- ⛓️ TWL is cascade deselected
- ✅ Other dependencies remain (no upward cascade)

## Benefits

1. **Data Integrity**: TWL can't be selected without its required resources
2. **Better UX**: Users see clear dependency status before selecting
3. **Auto-Resolution**: Missing dependencies are found and added automatically
4. **Flexible**: Works across workspace, catalog, and Door43
5. **Type-Safe**: Uses constants for resource type IDs

## Related Documentation

- [COMPREHENSIVE_DEPENDENCY_CHECKING.md](./COMPREHENSIVE_DEPENDENCY_CHECKING.md) - Full implementation details
- [CASCADE_DESELECTION.md](./CASCADE_DESELECTION.md) - Cascade behavior examples
- [DEPENDENCY_EXAMPLES.md](./DEPENDENCY_EXAMPLES.md) - Visual examples of dependency rules
- [TESTING_DEPENDENCY_SYSTEM.md](./TESTING_DEPENDENCY_SYSTEM.md) - Step-by-step testing guide

## Future Enhancements

### Potential Additional Dependencies

Other resource types that could benefit from multiple dependencies:

```typescript
// Translation Notes could depend on:
dependencies: [
  { resourceType: 'words', sameLanguage: true, sameOwner: true },
  { resourceType: 'scripture', sameLanguage: true, sameOwner: true },
  { resourceType: 'scripture', language: 'el-x-koine', owner: 'unfoldingWord' },
  { resourceType: 'scripture', language: 'hbo', owner: 'unfoldingWord' },
]

// Translation Questions could depend on:
dependencies: [
  { resourceType: 'scripture', sameLanguage: true, sameOwner: true },
  { resourceType: 'notes', sameLanguage: true, sameOwner: true },
]
```

## Example Scenarios

### Scenario 1: All Dependencies Available

```
Workspace: UGNT ✓, UHB ✓
Available: TW ✓, TWL ✓

User selects TWL
→ TW auto-selected
→ Success! All dependencies satisfied
```

### Scenario 2: Missing UGNT

```
Workspace: UHB ✓
Available: TW ✓, TWL ✓

→ TWL shows "Missing Dependencies: UGNT"
→ TWL is disabled
→ User must add UGNT first
```

### Scenario 3: Dependencies Found in Different Layers

```
Workspace: UGNT ✓
Catalog: UHB ✓ (cached locally)
Door43: TW ✓ (found online)

User selects TWL
→ TW auto-added from Door43
→ UHB loaded from cache
→ UGNT already in workspace
→ Success! All dependencies satisfied
```

## Implementation Timeline

- **Phase 1** ✅: Single dependency (TW) - Working
- **Phase 2** ✅: Cascade deselection - Working
- **Phase 3** ✅: Multi-layer search - Working
- **Phase 4** ✅: Multiple dependencies (TW + UGNT + UHB) - Working

---

**Last Updated**: January 9, 2026  
**Version**: 1.0.0  
**Status**: ✅ Fully Implemented

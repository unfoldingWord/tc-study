# Testing TWL Dependency Fix - UGNT/UHB Display and Auto-Selection

## Context

Fixed two issues:
1. UGNT and UHB dependencies not showing in resource selection screen
2. Auto-selecting dependencies when selecting TWL not working

## Root Causes Identified

### Issue 1: Nested Button HTML Error
- `SelectableGrid` was using `<button>` wrapper
- Info button inside was also `<button>`
- Invalid nested buttons broke click event handling
- **Fix**: Changed `SelectableGrid` to use `<div>` with click handlers

### Issue 2: Workspace Dependencies Not Displayed
- UGNT/UHB found in workspace during dependency check
- But not added to `supportedResources` map for UI display
- Original language resources filtered out from resource selector step
- **Fix**: Explicitly add workspace dependencies to display with `isAutoIncluded: true` flag

## Testing Steps

### 1. Start Fresh
1. Open http://localhost:3000/studio
2. Click "Add resources to library" button (+ icon in sidebar)
3. Select "Español Latin America" (es-419)
4. Click "Next step"
5. Select "idiomasPuente" organization
6. Click "Next step"

### 2. Verify UGNT/UHB Are Displayed

You should see a dedicated section titled **"Auto-included Dependencies"** with:
- **UGNT** (unfoldingWord® Greek New Testament)
- **UHB** (unfoldingWord® Hebrew Bible)

Both should:
- Have a green border and background (`border-green-200 bg-green-50`)
- Show a green checkmark icon in the top-left
- Display "Koine Greek" and "Ancient Hebrew" respectively
- Be marked as "Already in workspace"

**Expected Console Logs:**
```
🔍 Searching for dependency: words
   Target: es-419_gl/es-419
   ✓ Found in available resources list: es-419_gl/es-419/tw

🔍 Searching for dependency: scripture
   Target: unfoldingWord/el-x-koine
   ✓ Found in workspace: unfoldingWord/el-x-koine/ugnt
   ✓ Auto-included original language dependency: unfoldingWord/el-x-koine/ugnt

🔍 Searching for dependency: scripture
   Target: unfoldingWord/hbo
   ✓ Found in workspace: unfoldingWord/hbo/uhb
   ✓ Auto-included original language dependency: unfoldingWord/hbo/uhb

Enlaces a las Palabras de Traducción: ✓ All dependencies available
```

### 3. Test Auto-Selection of Dependencies

1. Click on **"Enlaces a las Palabras de Traducción"** (TWL) card
2. Observe that it becomes selected (blue border)
3. **Verify**:
   - **TW** ("Palabras de Traducción") should also be selected automatically
   - UGNT and UHB are already marked as included (green checkmark)

**Expected Console Logs:**
```
🔘 Resource clicked: es-419_gl/es-419/twl
   Resource object: {...}
   autoAddedDependencies: ["es-419_gl/es-419/tw", "unfoldingWord/el-x-koine/ugnt", "unfoldingWord/hbo/uhb"]
🔗 Auto-selecting dependency: es-419_gl/es-419/tw
🔗 Auto-selecting dependency: unfoldingWord/el-x-koine/ugnt
🔗 Auto-selecting dependency: unfoldingWord/hbo/uhb
```

### 4. Test Cascade Deselection

1. Click on **"Palabras de Traducción"** (TW) to deselect it
2. **Verify**:
   - TW becomes deselected (no blue border)
   - TWL is also automatically deselected (cascade)
   - Console log: `⛓️  Cascading deselection: es-419_gl/es-419/twl (depends on es-419_gl/es-419/tw)`

### 5. Test Independent Deselection

1. Reselect TWL (which auto-selects TW, UGNT, UHB)
2. Click TWL to deselect it
3. **Verify**:
   - Only TWL is deselected
   - TW, UGNT, and UHB remain selected
   - No cascade deselection (dependencies don't get deselected when dependant is deselected)

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Open wizard to resources step | UGNT and UHB shown in "Auto-included Dependencies" section |
| Click TWL | TW, UGNT, and UHB all auto-selected |
| Click TW to deselect | TWL also deselected (cascade) |
| Click TWL to deselect | Only TWL deselected, dependencies remain |
| Info button on any card | Modal shows README and license |

## Files Modified

1. `apps/tc-study/src/components/shared/SelectableGrid.tsx`
   - Changed from `<button>` to `<div>` wrapper (lines 12-38, 70-94)
   
2. `apps/tc-study/src/components/wizard/ResourceSelectorStep.tsx`
   - Separated original language resources (lines 221-228)
   - Merged for comprehensive dependency check (line 248)
   - Added workspace dependency display logic (lines 359-377)
   - Split resources into auto-included and regular (lines 484-485)
   - Added "Auto-included Dependencies" UI section (lines 506-545)
   - Added debug logging (lines 383, 559-562)

## Rollback Instructions

If issues occur:
```bash
git diff HEAD apps/tc-study/src/components/shared/SelectableGrid.tsx
git diff HEAD apps/tc-study/src/components/wizard/ResourceSelectorStep.tsx
git checkout HEAD -- apps/tc-study/src/components/shared/SelectableGrid.tsx
git checkout HEAD -- apps/tc-study/src/components/wizard/ResourceSelectorStep.tsx
```

## Notes

- The nested button fix is critical for click event handling to work correctly
- Workspace dependencies (UGNT/UHB) are marked with `isAutoIncluded: true` and `isInWorkspace: true`
- The UI separates auto-included dependencies from regular selectable resources
- All dependency checking happens during the initial resource loading, not on every click

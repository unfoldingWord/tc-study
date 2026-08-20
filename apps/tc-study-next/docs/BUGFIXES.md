# Bug Fixes

## Bug #1: On-demand Downloaded Content Lost on Page Reload

### Issue
When users downloaded content on-demand (e.g., adding a non-preloaded resource to a panel), the content would load correctly the first time. However, upon page reload, the content would be lost and users would see "No content available for [book]".

### Root Cause
The catalog was using an **in-memory storage adapter** (`SimpleMemoryCatalogAdapter`) which stored resource metadata (including crucial `ingredients` data) only in JavaScript memory. This meant:

1. ✅ Resources added via wizard worked initially
2. ❌ On page reload, all catalog data was lost
3. ❌ Without `ingredients`, the app couldn't determine which books were available
4. ❌ Content fetch would fail because ingredient paths were missing

### Symptoms
```
⚠️ No ingredients found in metadata for resource: es-419_gl/es-419/glt
⚠️ No ingredients found in metadata for resource: Worldview/en/bsb
⏸️ Skipping load - book 'tit' not available or TOC not loaded yet
```

### Solution
Created a **persistent catalog adapter** (`LocalStorageCatalogAdapter`) that:

1. ✅ Stores all resource metadata in **localStorage**
2. ✅ Survives page reloads
3. ✅ Maintains in-memory cache for performance
4. ✅ Preserves `ingredients` and all other metadata
5. ✅ Automatically loads data on initialization

### Implementation

**New File:** `apps/tc-study/src/lib/adapters/LocalStorageCatalogAdapter.ts`

```typescript
export class LocalStorageCatalogAdapter implements CatalogAdapter {
  private memoryCache = new Map<string, ResourceMetadata>()
  private initialized = false

  // Loads all catalog data from localStorage on first access
  private async initialize(): Promise<void> {
    if (this.initialized) return
    
    const indexJson = localStorage.getItem('bt-synergy:catalog:index')
    if (indexJson) {
      const keys = JSON.parse(indexJson) as string[]
      for (const key of keys) {
        const dataJson = localStorage.getItem(`bt-synergy:catalog:${key}`)
        if (dataJson) {
          const metadata = JSON.parse(dataJson) as ResourceMetadata
          this.memoryCache.set(key, metadata)
        }
      }
    }
    this.initialized = true
  }

  // Save persists to both memory and localStorage
  async save(key: string, metadata: ResourceMetadata): Promise<void> {
    await this.initialize()
    this.memoryCache.set(key, metadata)
    localStorage.setItem(`bt-synergy:catalog:${key}`, JSON.stringify(metadata))
    this.saveIndex()
  }
  
  // ... other methods
}
```

**Modified:** `apps/tc-study/src/contexts/CatalogContext.tsx`

```typescript
// Before:
const catalogAdapter = new SimpleMemoryCatalogAdapter()

// After:
const catalogAdapter = new LocalStorageCatalogAdapter()
```

### Benefits

1. **Persistent Catalog**: Resource metadata survives page reloads
2. **Ingredients Preserved**: On-demand downloading continues to work
3. **Offline Ready**: Metadata available even without network
4. **Performance**: In-memory cache for fast access
5. **Backward Compatible**: Works with existing code

### Testing

1. Add a non-preloaded resource via wizard (e.g., Spanish Bible)
2. Drag it to a panel and load content (e.g., Titus)
3. Content loads successfully ✅
4. Reload the page
5. Content is still available ✅
6. Ingredients are preserved in catalog ✅

### localStorage Keys Used

- `bt-synergy:catalog:index` - Array of all resource keys
- `bt-synergy:catalog:{resourceKey}` - Individual resource metadata

Example:
```
bt-synergy:catalog:unfoldingWord/en/ult
bt-synergy:catalog:es-419_gl/es-419/glt
```

### Data Format

Each resource metadata is stored as JSON:

```json
{
  "resourceKey": "unfoldingWord/en/ult",
  "resourceId": "ult",
  "title": "unfoldingWord® Literal Text",
  "language": "en",
  "owner": "unfoldingWord",
  "server": "git.door43.org",
  "type": "scripture",
  "format": "usfm",
  "contentMetadata": {
    "ingredients": [
      {
        "identifier": "tit",
        "title": "Titus",
        "path": "57-TIT.usfm",
        "size": 8234
      }
    ],
    "books": ["gen", "exo", ..., "tit", ...]
  }
}
```

### Future Improvements

Consider migrating to IndexedDB for:
- Larger storage capacity (localStorage has ~5-10MB limit)
- Better performance for large datasets
- Structured queries
- Atomic transactions

### Related Files

- `apps/tc-study/src/lib/adapters/LocalStorageCatalogAdapter.ts` - New persistent adapter
- `apps/tc-study/src/contexts/CatalogContext.tsx` - Updated to use persistent adapter
- `packages/catalog-manager/src/CatalogManager.ts` - Uses adapter interface
- `packages/scripture-loader/src/ScriptureLoader.ts` - Relies on ingredients from catalog

---

## Bug #2: Non-Preloaded Resources Not Persisting in Panels

### Issue
After fixing Bug #1, resources could be loaded and their content was preserved, but **non-preloaded resources** would disappear from panels on page reload and return to the sidebar.

### Root Cause  
When resources were added to panels via `LinkedPanelsStudio`, they were:
1. ✅ Added to `AppStore.loadedResources` (for rendering)
2. ✅ Assigned to panels via `assignResourceToPanel` (panel.resourceKeys)
3. ❌ **NOT added to workspace package resources Map**

The `useResourceManagement` hook had a flawed condition:

```typescript
// ❌ BUGGY CODE:
if (!allowMultipleInstances || !Object.keys(loadedResources).some(id => getBaseResourceKey(id) === resource.key)) {
  addResourceToPackage(resource)
}
```

Problem: It checked `loadedResources` (AppStore) which gets cleared on reload, so the condition was always false after reload, meaning resources were never added to the workspace package.

### Symptoms
```
✅ Resources show in sidebar after adding
✅ Resources load content correctly
✅ Panel configuration is saved (panel.resourceKeys)
❌ On reload: Resources disappear from panels, back to sidebar
❌ workspace.resources Map doesn't include them
```

### Solution
Fixed the condition to check the **workspace package** instead of `loadedResources`:

```typescript
// ✅ FIXED CODE:
if (!hasResourceInPackage(resource.key)) {
  addResourceToPackage(resource)
  console.log(`📦 Added resource to workspace package: ${resource.key}`)
}
```

This ensures resources are **always** added to the workspace package when added to a panel, regardless of instance IDs.

### Implementation

**Modified:** `apps/tc-study/src/hooks/useResourceManagement.ts`

```typescript
export function useResourceManagement() {
  const addResourceToPackage = useWorkspaceStore((s) => s.addResourceToPackage)
  const hasResourceInPackage = useWorkspaceStore((s) => s.hasResourceInPackage) // ✅ Added
  const addResourceToApp = useAppStore((s) => s.addResource)
  const loadedResources = useAppStore((s) => s.loadedResources)

  const addResource = useCallback((resource: ResourceInfo, allowMultipleInstances = false): string => {
    // ... instance ID generation ...
    
    // ✅ Check workspace package, not loadedResources
    if (!hasResourceInPackage(resource.key)) {
      addResourceToPackage(resource)
      console.log(`📦 Added resource to workspace package: ${resource.key}`)
    }
    
    // Add to app store for rendering
    addResourceToApp(resourceInstance)
    
    return instanceId
  }, [addResourceToPackage, addResourceToApp, hasResourceInPackage, loadedResources]) // ✅ Added hasResourceInPackage
}
```

### Benefits

1. **Resources persist across reloads**: Added to workspace package = saved to localStorage
2. **Proper separation of concerns**: 
   - `workspace.resources` = persistent storage
   - `AppStore.loadedResources` = rendering layer
3. **Consistent behavior**: Both preloaded and non-preloaded resources work the same way

### Data Flow (Fixed)

```
User adds resource to panel
  ↓
addResource() called
  ↓
Check: hasResourceInPackage(resource.key)?
  ├─ No → addResourceToPackage(resource) ✅ Saved to workspace.resources
  └─ Yes → Skip (already in workspace)
  ↓
addResourceToApp(resourceInstance) ✅ Added for rendering
  ↓
assignResourceToPanel(instanceId, panelId) ✅ Panel config updated
  ↓
autoSaveWorkspace() ✅ Saved to localStorage
  ↓
[Page Reload]
  ↓
loadSavedWorkspace()
  ↓
Load workspace.resources from localStorage ✅
  ↓
Load panel configs from localStorage ✅
  ↓
For each panel resource:
  Load from workspace.resources into AppStore ✅
  ↓
Resources appear in panels! 🎉
```

### Testing

1. Clear browser data
2. Add a non-preloaded resource (e.g., Spanish Bible) via wizard
3. Drag it to a panel
4. Verify it loads content ✅
5. **Reload page (F5)**
6. **Verify resource is still in panel** ✅ (Was broken, now fixed!)
7. Check localStorage: `tc-study-workspace` should have the resource in `resources` array
8. Check console: Should see `📦 Added resource to workspace package: ...`

### Console Logs to Expect

**When adding resource:**
```
📦 Added resource to workspace package: es-419_gl/es-419/glt
📦 Added resource instance to app: es-419_gl/es-419/glt (base: es-419_gl/es-419/glt)
✅ Resource instance es-419_gl/es-419/glt added to panel-1
💾 Auto-saved workspace to localStorage
```

**On page reload:**
```
📦 Loaded saved workspace from localStorage
📦 Loaded 4/4 panel resources into AppStore for rendering
```

---

## Bug #3: Panel Assignments Not Being Saved

### Issue
After fixing Bugs #1 and #2, resources were being added to the workspace package correctly, but their **panel assignments** were not being saved. On page reload, all panels would be empty even though resources were in the sidebar.

### Root Cause
The `assignResourceToPanel` and other panel management methods (`removeResourceFromPanel`, `moveResourceBetweenPanels`, `reorderResourceInPanel`, `setActiveResourceInPanel`) were **not calling `autoSaveWorkspace()`**. 

They only set `isPackageModified = true`, but never actually triggered the save to localStorage.

### Symptoms
```
✅ Resources show in sidebar
✅ Resources load into panels
✅ Content loads correctly
❌ On reload: All panels empty
✅ Resources still in sidebar (workspace.resources saved)
❌ Panel.resourceKeys arrays empty (panels not saved)
```

**Console logs showed:**
```
Panel 1 resource keys: []
Panel 2 resource keys: []
📦 Loaded 0/0 panel resources into AppStore for rendering
```

### Solution
Added `autoSaveWorkspace()` call to **all panel management methods**:

```typescript
// ✅ FIXED CODE:
assignResourceToPanel: (resourceKey, panelId, index) => {
  set((state) => {
    if (state.currentPackage) {
      const panel = state.currentPackage.panels.find(p => p.id === panelId)
      if (panel && !panel.resourceKeys.includes(resourceKey)) {
        // ... add resource to panel ...
        state.isPackageModified = true
      }
    }
  })
  // ✅ Auto-save workspace
  get().autoSaveWorkspace()
},
```

### Implementation

**Modified:** `apps/tc-study/src/lib/stores/workspaceStore.ts`

Added `get().autoSaveWorkspace()` to:
1. ✅ `assignResourceToPanel` - When resource added to panel
2. ✅ `removeResourceFromPanel` - When resource removed from panel
3. ✅ `moveResourceBetweenPanels` - When resource moved
4. ✅ `reorderResourceInPanel` - When resources reordered
5. ✅ `setActiveResourceInPanel` - When active resource changes

### Benefits

1. **Panel configurations persist** across reloads
2. **Immediate saves** - No user action required
3. **Consistent behavior** - All panel operations now save
4. **Complete workspace state** - Both resources AND panel assignments saved

### Testing

1. Clear browser data
2. Add resources (preloaded or via wizard)
3. Drag to panels
4. Navigate between resources
5. **Reload page (F5)**
6. **Verify resources are STILL IN PANELS** ✅
7. Check localStorage: `tc-study-workspace` → panels array should have resourceKeys
8. Check console: `💾 Auto-saved workspace to localStorage` after each panel operation

### Console Logs to Expect

**When adding resource to panel:**
```
📦 Added resource to workspace package: unfoldingWord/en/ult
📦 Added resource instance to app: unfoldingWord/en/ult
💾 Auto-saved workspace to localStorage  ← Should see this NOW!
```

**On page reload:**
```
📦 Loaded saved workspace from localStorage
Panel 1 resource keys: ['unfoldingWord/en/ult']  ← NOT empty anymore!
Panel 2 resource keys: ['unfoldingWord/en/ust', 'es-419_gl/es-419/glt']
📦 Loaded 3/3 panel resources into AppStore for rendering
```

---

## Summary of All Fixes

### Bug #1: Catalog Metadata Lost (Ingredients Missing)
**Problem:** In-memory catalog adapter → Data lost on reload  
**Solution:** `LocalStorageCatalogAdapter` → Persists to localStorage  
**Result:** Ingredients and metadata preserved ✅

### Bug #2: Resources Not in Workspace Package
**Problem:** Checked `loadedResources` instead of workspace  
**Solution:** Check `hasResourceInPackage` → Proper persistence check  
**Result:** Resources added to workspace.resources ✅

### Bug #3: Panel Assignments Not Saved
**Problem:** Panel methods didn't call `autoSaveWorkspace()`  
**Solution:** Added `autoSaveWorkspace()` to all panel methods  
**Result:** Panel configurations saved ✅

### Complete Data Flow (All Fixes Applied)

```
User adds resource to panel
  ↓
addResource() → Checks hasResourceInPackage
  ├─ Adds to workspace.resources ✅ (Bug #2 fix)
  └─ Adds to AppStore.loadedResources ✅
  ↓
assignResourceToPanel() → Adds to panel.resourceKeys
  └─ Calls autoSaveWorkspace() ✅ (Bug #3 fix)
  ↓
Saved to localStorage:
  ├─ workspace.resources (resource metadata)
  └─ workspace.panels (panel assignments)
  ↓
[Page Reload]
  ↓
Load catalog from localStorage ✅ (Bug #1 fix)
  └─ Ingredients preserved
  ↓
Load workspace from localStorage
  ├─ workspace.resources loaded ✅
  └─ workspace.panels loaded ✅
  ↓
For each panel.resourceKeys:
  Load resource into AppStore ✅
  ↓
Resources appear in panels with content! 🎉
```

---

## Combined Testing Checklist

### Test Bug #1 Fix (Catalog Persistence)
- [ ] Add non-preloaded resource via wizard
- [ ] Drag to panel
- [ ] Content loads on-demand ✅
- [ ] Reload page
- [ ] Content still loads (ingredients preserved) ✅
- [ ] Check browser localStorage: `bt-synergy:catalog:*` keys exist
- [ ] Check console: "📚 Loaded X resources from localStorage catalog"

### Test Bug #2 Fix (Panel Persistence)
- [ ] Add non-preloaded resource via wizard
- [ ] Drag to panel
- [ ] Resource appears in panel ✅
- [ ] Reload page
- [ ] **Resource still in panel (not back in sidebar)** ✅
- [ ] Check localStorage: `tc-study-workspace` has resource in `resources` array
- [ ] Check console: "📦 Added resource to workspace package: ..."
- [ ] Check console on reload: "📦 Loaded X/X panel resources into AppStore"

### Test Both Preloaded and Non-Preloaded
- [ ] Clear browser data completely
- [ ] Launch app - preloaded resources in sidebar ✅
- [ ] Add ULT (preloaded) to panel-1 ✅
- [ ] Add Spanish Bible (non-preloaded) to panel-2 ✅
- [ ] Both load content ✅
- [ ] Reload page
- [ ] Both still in their panels ✅
- [ ] Both content loads correctly ✅
- [ ] Navigate to different book in both
- [ ] Content loads for both ✅

### Clean Slate Test
- [ ] Clear browser data
- [ ] Add resource via wizard (don't download)
- [ ] Drag to panel
- [ ] Navigate to different books
- [ ] All content loads on-demand ✅
- [ ] Reload page
- [ ] Resource still in panel ✅
- [ ] Navigate to books again
- [ ] Content loads (from cache or on-demand) ✅

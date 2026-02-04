# Workspace Initialization Flow

## Overview

This document describes how the workspace is initialized when the app starts, including the logic for loading saved workspaces and preloaded resources.

## The Problem

Previously, preloaded resources were **always** added to the workspace, even if the user had a saved workspace. This caused issues where:
- User's saved workspace was overwritten with preloaded resources
- User couldn't maintain a custom workspace across sessions

## The Solution

Implement a conditional loading flow:
1. Check if a saved workspace exists in localStorage
2. If workspace has resources → use those
3. If workspace is empty or doesn't exist → load preloaded resources

## Implementation

### 1. CatalogContext (`CatalogContext.tsx`)

**Changes:**
- Removed automatic addition of preloaded resources to workspace
- Now only loads preloaded resource **metadata** into the catalog
- Makes CatalogManager globally accessible via `window.__catalogManager__`

```typescript
// Load preloaded resources metadata (if available)
// Note: Resources are NOT automatically added to workspace here
// They will be added by App.tsx if workspace is empty
const { initializePreloadedResources } = await import('../lib/preloadedResources')
await initializePreloadedResources(contextValue.catalogManager)
console.log('  ✓ Preloaded resources metadata loaded')
```

### 2. WorkspaceStore (`workspaceStore.ts`)

**New Method: `loadPreloadedResources()`**

Loads preloaded resources from the manifest and adds them to the workspace collection.

```typescript
loadPreloadedResources: async () => {
  // Get catalogManager from window (set by CatalogContext)
  const catalogManager = (window as any).__catalogManager__
  
  // Load manifest
  const loader = new PreloadedResourcesLoader(catalogManager)
  const manifest = await loader.loadManifest()
  
  // Add each resource to workspace
  for (const resourceInfo of manifest.resources) {
    const resourceData: ResourceInfo = {
      id: resourceInfo.resourceId,
      key: resourceInfo.resourceKey,
      title: resourceInfo.title,
      type: resourceInfo.type,
      category: resourceInfo.type,
      // ... other fields
    }
    
    get().addResourceToPackage(resourceData)
  }
}
```

### 3. App Component (`App.tsx`)

**Initialization Logic:**

```typescript
useEffect(() => {
  const initWorkspace = async () => {
    // 1. Try to load saved workspace
    const loaded = loadSavedWorkspace()
    
    // 2. Check if workspace has resources
    const workspace = useWorkspaceStore.getState().currentPackage
    const hasResources = workspace && workspace.resources.size > 0
    
    // 3. Load preloaded resources ONLY if workspace is empty
    if (loaded && hasResources) {
      console.log(`📦 Restored workspace (${workspace.resources.size} resources)`)
    } else {
      console.log('📦 Workspace is empty, loading preloaded resources...')
      await loadPreloadedResources()
    }
  }
  
  // Small delay to ensure catalog is initialized
  setTimeout(initWorkspace, 100)
}, [loadSavedWorkspace, loadPreloadedResources])
```

## Flow Diagram

```
┌─────────────────────┐
│   App Starts        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ CatalogContext      │
│ - Initialize        │
│ - Load preloaded    │
│   METADATA only     │
│ - Set global ref    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ App.tsx useEffect   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────┐
│ Load saved workspace from   │
│ localStorage                │
└──────────┬──────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────┐
│ Found   │  │ Not Found   │
│ Saved   │  │ or Empty    │
└────┬────┘  └─────┬───────┘
     │             │
     ▼             │
┌─────────┐        │
│ Has     │        │
│ Resourc │        │
│ es?     │        │
└────┬────┘        │
     │             │
  ┌──┴──┐          │
  │Yes  │  No      │
  │     │          │
  ▼     ▼          ▼
┌──────────────────────┐
│ Load Preloaded       │
│ Resources            │
└──────────────────────┘
```

## Scenarios

### Scenario 1: First Time User

```
1. App starts
2. CatalogContext loads preloaded metadata
3. App.tsx checks localStorage → not found
4. App.tsx calls loadPreloadedResources()
5. ✓ User sees preloaded resources
```

### Scenario 2: Returning User (with resources)

```
1. App starts
2. CatalogContext loads preloaded metadata
3. App.tsx checks localStorage → found
4. Workspace has 5 resources
5. ✓ User sees their 5 resources
6. ✗ Preloaded resources NOT added
```

### Scenario 3: Returning User (empty workspace)

```
1. App starts
2. CatalogContext loads preloaded metadata
3. App.tsx checks localStorage → found
4. Workspace has 0 resources
5. App.tsx calls loadPreloadedResources()
6. ✓ User sees preloaded resources
```

### Scenario 4: User Removes All Resources

```
1. User removes all resources from workspace
2. Workspace auto-saves (empty)
3. User refreshes page
4. App loads saved workspace (empty)
5. App.tsx calls loadPreloadedResources()
6. ✓ Preloaded resources appear again
```

## Key Points

### 1. Two-Stage Loading

- **Stage 1 (CatalogContext)**: Load preloaded resource **metadata** into catalog
  - Makes resources available for discovery
  - Does NOT add to workspace
  
- **Stage 2 (App.tsx)**: Conditionally add resources to workspace
  - Only if workspace is empty
  - Respects user's saved workspace

### 2. Global CatalogManager

The CatalogManager is made globally accessible for non-React code:

```typescript
;(window as any).__catalogManager__ = contextValue.catalogManager
```

This allows the workspaceStore (which is not a React component) to access the catalog.

### 3. Timing

A 100ms delay is used in App.tsx to ensure:
- CatalogContext is fully initialized
- CatalogManager is available
- Preloaded metadata is loaded

```typescript
setTimeout(initWorkspace, 100)
```

### 4. Auto-Save Integration

When resources are added via `loadPreloadedResources()`:
- Each `addResourceToPackage()` call triggers auto-save
- Workspace is persisted to localStorage
- On next app start, saved workspace is loaded

## Benefits

✅ User's workspace is preserved across sessions  
✅ Preloaded resources only appear when workspace is empty  
✅ First-time users get a populated workspace  
✅ Users can remove all resources and get preloaded ones back  
✅ Clear separation between catalog (metadata) and workspace (user selection)

## Testing

### Test 1: Fresh Start
1. Clear localStorage
2. Start app
3. ✓ Should see preloaded resources

### Test 2: Saved Workspace
1. Add custom resources
2. Refresh page
3. ✓ Should see custom resources
4. ✗ Should NOT see duplicate preloaded resources

### Test 3: Empty Workspace Reload
1. Remove all resources
2. Refresh page
3. ✓ Should see preloaded resources again

### Test 4: Workspace with Resources
1. Keep some resources
2. Refresh page
3. ✓ Should see only those resources
4. ✗ Should NOT auto-add preloaded resources

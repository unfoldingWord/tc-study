# Resources Not Showing in Wizard - FIXED

## Problem

You reported that resources were downloaded but not showing up in the `SimpleResourceWizard`. 

## Root Cause

The issue was that the `SimpleResourceWizard` was looking for resources in the wrong place:

1. **Where resources were saved**: The `AddToCatalogWizard` saves downloaded resources to the catalog using `catalogManager.addResourceToCatalog()`
2. **Where the wizard was looking**: The `SimpleResourceWizard` was only looking in `useAppStore().loadedResources`, which is a different store
3. **Result**: Resources were in the catalog but not in `loadedResources`, so the wizard showed them as empty

## The Fix

I updated `SimpleResourceWizard.tsx` to:

### 1. Load Resources from Catalog on Mount

```typescript
// Load catalog resources on mount
useEffect(() => {
  const loadCatalogResources = async () => {
    try {
      setIsLoadingCatalog(true)
      const resourceKeys = await catalogManager.getAllResourceKeys()
      console.log(`📚 Found ${resourceKeys.length} resources in catalog`)
      
      const resources = await Promise.all(
        resourceKeys.map(async (key) => {
          const metadata = await catalogManager.getResourceMetadata(key)
          if (metadata) {
            return {
              id: key,
              name: metadata.title || key,
              owner: metadata.owner || 'unknown',
              language: metadata.language || 'en',
              type: metadata.type || 'unknown',
              subject: metadata.subject || 'unknown',
              downloaded: true,
            }
          }
          return null
        })
      )
      
      const validResources = resources.filter(r => r !== null)
      console.log(`✅ Loaded ${validResources.length} valid resources from catalog`)
      setCatalogResources(validResources)
    } catch (error) {
      console.error('❌ Failed to load catalog resources:', error)
    } finally {
      setIsLoadingCatalog(false)
    }
  }
  
  loadCatalogResources()
}, [catalogManager])
```

### 2. Reload Resources After Import

When you import new resources via the "Add to Catalog" wizard, the catalog resources are automatically reloaded:

```typescript
const handleCatalogComplete = async () => {
  // Reload catalog resources after import
  try {
    const resourceKeys = await catalogManager.getAllResourceKeys()
    const resources = await Promise.all(...)
    
    const validResources = resources.filter(r => r !== null)
    console.log(`✅ Reloaded ${validResources.length} resources from catalog`)
    setCatalogResources(validResources)
  } catch (error) {
    console.error('❌ Failed to reload catalog resources:', error)
  }
  
  // Close modal or go back
  ...
}
```

### 3. Show Loading State

While resources are being loaded, the wizard shows a loading indicator:

```typescript
{isLoadingCatalog ? (
  <div className="text-center py-16">
    <Library className="w-20 h-20 text-gray-300 mx-auto mb-6 animate-pulse" />
    <div className="text-gray-500">Loading catalog...</div>
  </div>
) : catalogOnlyResources.length === 0 ? (
  // Empty catalog UI
  ...
) : (
  // Resources list
  ...
)}
```

## How to Test

1. Start the dev server (if not already running):
   ```bash
   cd apps/tc-study
   bun run dev
   ```

2. Navigate to the Studio page

3. Click the **+** button in either panel header

4. You should now see:
   - **Collections Tab**: Shows collections with their resources (if you have any)
   - **Catalog Tab**: Shows **all resources you downloaded**, loaded directly from the catalog

5. The catalog should display:
   - Resource name
   - Owner
   - Language
   - Type
   - Download/add icons

## What You Should See

### Before the Fix:
- Collections tab: Empty (no collections)
- Catalog tab: Empty (even though resources were downloaded)

### After the Fix:
- Collections tab: Empty (no collections created yet)
- Catalog tab: **Shows all downloaded resources** with full metadata

## Console Output

When you open the wizard, you should see these console messages:

```
📚 Found X resources in catalog
✅ Loaded X valid resources from catalog
```

Where `X` is the number of resources you downloaded.

## Next Steps

After this fix, you can:

1. **Add resources to panels**: Click any resource in the "Catalog" tab to add it to the current panel
2. **Create collections**: Click the **+** button in the "Collections" tab to organize resources into collections
3. **Import more resources**: Click the **Download** icon in the "Catalog" tab to import more resources from Door43

## Technical Details

### Files Modified:
- `apps/tc-study/src/components/wizard/SimpleResourceWizard.tsx`

### Changes Made:
1. Added `useEffect` to load catalog resources on mount
2. Added `catalogManager` from `useCatalogManager()` context
3. Added `isLoadingCatalog` state for loading indicator
4. Updated `handleCatalogComplete` to reload resources after import
5. Added loading state UI in the catalog tab
6. Changed resource source from `loadedResources` to `catalogResources` state

### Why This Works:
- The catalog manager has access to all downloaded resources via `getAllResourceKeys()`
- Each resource's metadata can be retrieved with `getResourceMetadata(key)`
- Resources are loaded fresh every time the wizard opens
- Resources are reloaded after importing new ones
- No need to manually sync between catalog and app store

## Troubleshooting

If resources still don't show up:

1. **Check the console**: Look for the console messages about loading catalog resources
2. **Verify resources are in catalog**: The catalog tab should show the count (e.g., "Catalog (5)")
3. **Check IndexedDB**: Open DevTools > Application > IndexedDB > Check if `tc-study-catalog` database exists and has resources
4. **Clear cache and reload**: Sometimes the browser cache needs to be cleared

## Summary

The fix ensures that the wizard **always loads resources directly from the catalog** where they were saved, rather than relying on the separate `loadedResources` store. This creates a single source of truth for downloaded resources and ensures they always appear in the wizard after being downloaded.



# Comprehensive Dependency Checking - Implementation Plan

## Current Status

✅ **Completed:**
- Dynamic resource type detection using registry
- Context-aware dependencies (same language/org, fixed, mixed)
- Basic dependency checking at add time
- Auto-download of dependencies if found in wizard

❌ **Not Yet Implemented:**
- **Proactive dependency checking** when resources are listed
- **Multi-layer dependency search** (workspace → catalog → Door43)
- **Disabled state** for resources with missing dependencies
- **Auto-fetch** dependencies from Door43 when listing resources

## Problem

Currently, users can select TWL even if TW isn't available. The system only checks dependencies when they click "Add to Catalog", which is too late.

**Required Flow:**
1. User selects language/org → sees list of resources
2. **System immediately checks** if TWL's dependencies (TW) are available
3. **System searches** all layers: workspace → catalog → Door43
4. If TW found on Door43 but not locally → **auto-fetch and add to available resources**
5. If TW not found anywhere → **disable TWL** with clear message
6. User can only select TWL if TW is available or will be auto-added

## Implementation Steps

### Step 1: Create Comprehensive Dependency Search Utility

**File:** `apps/tc-study/src/utils/comprehensiveDependencySearch.ts`

```typescript
import { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { CatalogManager } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'

export interface DependencySearchResult {
  found: boolean
  location: 'workspace' | 'catalog' | 'door43' | 'not-found'
  resourceKey?: string
  resource?: any
}

/**
 * Search for a dependency across all layers:
 * 1. Workspace (already loaded)
 * 2. Catalog (cached locally)
 * 3. Door43 (fetch from API)
 */
export async function searchForDependency(
  dependencyType: string,
  language: string,
  owner: string,
  workspaceResources: Map<string, any>,
  catalogManager: CatalogManager,
  resourceTypeRegistry: ResourceTypeRegistry,
  sameLanguage: boolean = false,
  sameOwner: boolean = false,
  fixedLanguage?: string,
  fixedOwner?: string
): Promise<DependencySearchResult> {
  
  // Step 1: Check workspace
  const workspaceResult = searchInWorkspace(
    workspaceResources,
    dependencyType,
    language,
    owner,
    resourceTypeRegistry,
    sameLanguage,
    sameOwner,
    fixedLanguage,
    fixedOwner
  )
  if (workspaceResult.found) return workspaceResult
  
  // Step 2: Check catalog (locally cached)
  const catalogResult = await searchInCatalog(
    catalogManager,
    dependencyType,
    language,
    owner,
    resourceTypeRegistry,
    sameLanguage,
    sameOwner,
    fixedLanguage,
    fixedOwner
  )
  if (catalogResult.found) return catalogResult
  
  // Step 3: Check Door43
  const door43Result = await searchInDoor43(
    dependencyType,
    language,
    owner,
    resourceTypeRegistry,
    sameLanguage,
    sameOwner,
    fixedLanguage,
    fixedOwner
  )
  if (door43Result.found) return door43Result
  
  return { found: false, location: 'not-found' }
}

function searchInWorkspace(...): DependencySearchResult {
  // Implementation: use existing resourceMatchesDependency logic
}

async function searchInCatalog(...): Promise<DependencySearchResult> {
  // Implementation: query catalog for matching resources
}

async function searchInDoor43(...): Promise<DependencySearchResult> {
  // Implementation: query Door43 API for matching resources
}
```

### Step 2: Add Dependency Status to Resources

**File:** `apps/tc-study/src/components/wizard/ResourceSelectorStep.tsx`

Update interface:

```typescript
interface ResourceWithStatus extends ResourceMetadata {
  isCached: boolean
  isInWorkspace: boolean
  isSupported: boolean
  viewerName?: string
  // NEW:
  hasDependencies: boolean
  dependenciesAvailable: boolean
  missingDependencies?: Array<{
    typeId: string
    displayName: string
    searchResult: DependencySearchResult
  }>
  autoAddedDependencies?: string[] // Keys of dependencies that will be auto-added
}
```

### Step 3: Check Dependencies When Loading Resources

Add to `ResourceSelectorStep`:

```typescript
// After loading resources from Door43
for (const [key, resource] of availableResources.entries()) {
  // Get resource type
  const resourceType = getResourceTypeFromSubjectUsingRegistry(
    resource.subject,
    resource.type,
    resourceTypeRegistry
  )
  
  // Check if it has dependencies
  const depCheck = checkResourceDependencies(
    resourceType,
    resource.language,
    resource.owner,
    resourceTypeRegistry,
    workspaceResources
  )
  
  if (!depCheck.canAdd) {
    // Search for each missing dependency
    const searchResults = await Promise.all(
      depCheck.missingDependencies.map(dep => 
        searchForDependency(
          dep.typeId,
          resource.language,
          resource.owner,
          workspaceResources,
          catalogManager,
          resourceTypeRegistry,
          true, // sameLanguage
          true  // sameOwner
        )
      )
    )
    
    // Check if all dependencies were found
    const allFound = searchResults.every(r => r.found)
    
    // Auto-add dependencies found on Door43
    const autoAddKeys: string[] = []
    for (const result of searchResults) {
      if (result.found && result.location === 'door43' && result.resource) {
        // Add to available resources
        availableResources.set(result.resourceKey!, result.resource)
        autoAddKeys.push(result.resourceKey!)
      }
    }
    
    // Update resource status
    resource.hasDependencies = true
    resource.dependenciesAvailable = allFound
    resource.missingDependencies = depCheck.missingDependencies.map((dep, i) => ({
      ...dep,
      searchResult: searchResults[i]
    }))
    resource.autoAddedDependencies = autoAddKeys
  }
}
```

### Step 4: Update UI to Show Dependency Status

In the resource card rendering:

```typescript
const isDisabled = resource.hasDependencies && !resource.dependenciesAvailable

<button
  onClick={() => !isDisabled && toggleResource(key, resource)}
  disabled={isDisabled}
  className={`
    relative p-3 rounded-lg border-2 transition-all text-left
    ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300'}
  `}
>
  {/* Existing content */}
  
  {/* NEW: Show dependency status */}
  {resource.hasDependencies && (
    <div className="mt-2 text-xs">
      {resource.dependenciesAvailable ? (
        <div className="flex items-center gap-1 text-green-600">
          <CheckCircle className="w-3 h-3" />
          Dependencies available
        </div>
      ) : (
        <div className="text-red-600">
          <div className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Missing dependencies:
          </div>
          {resource.missingDependencies?.map(dep => (
            <div key={dep.typeId} className="ml-4">
              • {dep.displayName}
            </div>
          ))}
        </div>
      )}
    </div>
  )}
</button>
```

### Step 5: Auto-select Dependencies

When a resource with auto-added dependencies is selected:

```typescript
const handleToggle = (key: string, resource: any) => {
  // Select the main resource
  toggleResource(key, resource)
  
  // Auto-select dependencies
  if (resource.autoAddedDependencies) {
    for (const depKey of resource.autoAddedDependencies) {
      const depResource = availableResources.get(depKey)
      if (depResource && !selectedResourceKeys.has(depKey)) {
        toggleResource(depKey, depResource)
      }
    }
  }
}
```

## Testing Plan

1. **Test Case 1: TWL with TW in workspace**
   - Expected: TWL enabled, no auto-fetch needed

2. **Test Case 2: TWL with TW in catalog but not workspace**
   - Expected: TWL enabled, shows "TW found in cache"

3. **Test Case 3: TWL with TW only on Door43**
   - Expected: TWL enabled, TW auto-fetched and added to list
   - When user selects TWL, TW is auto-selected

4. **Test Case 4: TWL with TW not found anywhere**
   - Expected: TWL disabled, shows "Missing: Translation Words"

5. **Test Case 5: Complex dependencies**
   - Resource with multiple dependencies, some found, some not
   - Expected: Disabled if ANY dependency missing

## Performance Considerations

- **Cache search results** to avoid repeated API calls
- **Batch Door43 requests** when checking multiple resources
- **Show loading indicator** while searching for dependencies
- **Lazy search**: Only search when user views that language/org combo

## Next Steps

1. Implement `comprehensiveDependencySearch.ts`
2. Update `ResourceSelectorStep.tsx` with dependency checking
3. Add UI components for dependency status
4. Test all scenarios
5. Update documentation

## Benefits

✅ **Better UX**: Users can't select resources they can't use
✅ **Proactive**: Finds dependencies before user clicks "Add"
✅ **Automatic**: Auto-fetches and adds dependencies
✅ **Robust**: Searches all layers thoroughly
✅ **Clear**: Shows why a resource is disabled

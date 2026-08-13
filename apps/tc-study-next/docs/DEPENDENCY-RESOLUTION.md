# Dependency Resolution System

## Overview

The dependency resolution system ensures that resources are downloaded and loaded in the correct order, with dependencies processed before dependent resources. It also automatically skips resources that are already complete.

## Key Components

### 1. **DependencyResolver** (`lib/services/DependencyResolver.ts`)

The core utility that handles dependency resolution logic:

- **`resolveDependencies(resourceKey)`**: Finds all dependencies for a given resource
- **`reorderWithDependencies(resources, skipComplete)`**: Reorders resources using topological sort to ensure dependencies come first
- **`expandWithDependencies(resources, skipComplete)`**: Adds missing dependencies to the resource list
- **`sortByPriorityPreservingDependencies(resources)`**: Sorts by priority while maintaining dependency order

### 2. **BackgroundDownloadManager** (Updated)

Now includes automatic dependency resolution:

- Checks if resources are already complete before adding to queue
- Resolves all dependencies for each resource
- Expands the queue to include missing dependencies
- Reorders the queue using topological sort
- Downloads resources in dependency-aware order

### 3. **Resource Type Dependencies**

Defined in each resource type definition:

```typescript
// Example: Translation Notes depends on UGNT and UHB
dependencies: [
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'el-x-koine', // Koine Greek (UGNT)
    owner: 'unfoldingWord',
  },
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'hbo', // Ancient Hebrew (UHB)
    owner: 'unfoldingWord',
  },
]
```

## How It Works

### Download Flow

1. **Initial Queue**: User selects resources to download (e.g., English TN)
2. **Dependency Resolution**: System resolves dependencies (e.g., UGNT + UHB for TN)
3. **Completeness Check**: System checks which resources are already complete
4. **Expansion**: Missing dependencies are added to the queue
5. **Reordering**: Resources are reordered using topological sort:
   - Dependencies come before dependents
   - Resources at same dependency level are sorted by priority
6. **Download**: Resources are downloaded sequentially in resolved order

### Example Scenario

**User Action**: Download `unfoldingWord/en/tn` (Translation Notes)

**System Resolution**:
```
1. Check: unfoldingWord/en/tn - NOT complete
2. Resolve dependencies:
   - unfoldingWord/el-x-koine/ugnt (Greek NT)
   - unfoldingWord/hbo/uhb (Hebrew OT)
3. Check dependencies:
   - unfoldingWord/el-x-koine/ugnt - COMPLETE (skip)
   - unfoldingWord/hbo/uhb - NOT complete (add to queue)
4. Final order:
   1. unfoldingWord/hbo/uhb (Priority 2, dependency)
   2. unfoldingWord/en/tn (Priority 1, depends on UHB)
```

## Dependency Specification

Dependencies are specified in resource type definitions using the `ResourceDependency` interface:

```typescript
export interface ResourceDependency {
  /** The resource type ID that is required */
  resourceType: string
  
  /** Require same language as the dependent resource */
  sameLanguage?: boolean
  
  /** Require same owner as the dependent resource */
  sameOwner?: boolean
  
  /** Require specific language (e.g., 'el-x-koine') */
  language?: string
  
  /** Require specific owner (e.g., 'unfoldingWord') */
  owner?: string
}
```

### Examples

**Same language dependency** (TWL depends on TW in same language):
```typescript
dependencies: [
  {
    resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    sameLanguage: true,
  }
]
```

**Specific language dependency** (TN depends on Greek/Hebrew originals):
```typescript
dependencies: [
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'el-x-koine',
    owner: 'unfoldingWord',
  }
]
```

## Priority System

Resources are downloaded based on:

1. **Dependency depth** (dependencies always first)
2. **Download priority** (within same dependency level)

### Current Priorities

1. **Translation Notes (TN)**: Priority `1` - Highest, translators need notes first
2. **Scripture**: Priority `2` - Second, required by many resources
3. **Translation Words Links (TWL)**: Priority `10`
4. **Translation Words (TW)**: Priority `20`
5. **Translation Academy (TA)**: Priority `30`

## Benefits

### For Users
- No manual dependency management
- Faster access to critical resources
- Automatic skip of already-downloaded content
- Efficient network usage

### For Developers
- Declarative dependency specification
- Automatic topological sorting
- Circular dependency detection
- Extensible architecture

## Implementation Details

### Topological Sort

The system uses a depth-first topological sort algorithm to order resources:

```typescript
const visit = (resourceKey: string) => {
  if (visited.has(resourceKey)) return
  if (visiting.has(resourceKey)) {
    // Circular dependency detected
    console.warn(`Circular dependency: ${resourceKey}`)
    return
  }
  
  visiting.add(resourceKey)
  
  // Visit dependencies first
  const deps = dependencyMap.get(resourceKey) || []
  for (const depKey of deps) {
    visit(depKey)
  }
  
  ordered.push(resource)
  visiting.delete(resourceKey)
  visited.add(resourceKey)
}
```

### Completeness Checking

Resources are checked for completeness using `ResourceCompletenessChecker`:

```typescript
const status = await completenessChecker.checkResource(resourceKey)
if (status.isComplete) {
  console.log(`Skipping ${resourceKey} (already complete)`)
  continue
}
```

### Circular Dependency Handling

If a circular dependency is detected, the system logs a warning and continues without that dependency path to prevent infinite loops.

## Future Enhancements

- **Parallel Downloads**: Download independent resources concurrently
- **Dependency Versions**: Support version constraints for dependencies
- **Optional Dependencies**: Mark some dependencies as optional
- **Dependency Caching**: Cache resolved dependencies for performance
- **Resource Loading**: Apply same logic to on-demand resource loading (not just downloading)

## Configuration

### Enable Debug Logging

```typescript
const downloadManager = new BackgroundDownloadManager(
  loaderRegistry,
  catalogManager,
  resourceTypeRegistry,
  { debug: true },  // Enable dependency resolution logging
  completenessChecker
)
```

### Skip Already-Complete Resources

```typescript
const downloadManager = new BackgroundDownloadManager(
  loaderRegistry,
  catalogManager,
  resourceTypeRegistry,
  { skipExisting: true },  // Default: true
  completenessChecker
)
```

## Testing

To test the dependency resolution system:

1. Clear all cached resources
2. Download a resource with dependencies (e.g., TN)
3. Observe console logs for dependency resolution
4. Verify dependencies are downloaded before dependents
5. Verify already-complete resources are skipped

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│          BackgroundDownloadManager                      │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 1. Get all resources from catalog                 │ │
│  │ 2. Filter downloadable resources                  │ │
│  │ 3. Resolve dependencies                           │ │
│  │ 4. Expand with missing dependencies               │ │
│  │ 5. Reorder with topological sort                  │ │
│  │ 6. Filter already-complete resources              │ │
│  │ 7. Download in dependency order                   │ │
│  └───────────────────────────────────────────────────┘ │
│                         ▼                               │
│            ┌─────────────────────────┐                  │
│            │  DependencyResolver     │                  │
│            │  ┌──────────────────┐   │                  │
│            │  │ resolveDeps      │   │                  │
│            │  │ expandWithDeps   │   │                  │
│            │  │ reorderWithDeps  │   │                  │
│            │  │ topologicalSort  │   │                  │
│            │  └──────────────────┘   │                  │
│            └─────────────────────────┘                  │
│                         ▼                               │
│       ┌──────────────────────────────────┐              │
│       │ ResourceCompletenessChecker      │              │
│       │  ┌───────────────────────────┐   │              │
│       │  │ checkResource             │   │              │
│       │  │ markComplete              │   │              │
│       │  └───────────────────────────┘   │              │
│       └──────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

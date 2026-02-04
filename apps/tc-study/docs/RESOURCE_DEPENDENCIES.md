# Resource Dependency System

## Overview

The resource dependency system allows resource types to declare dependencies on other resource types. When a user tries to add a resource, the system checks if its dependencies are met and can automatically download missing dependencies.

## Dependency Types

Dependencies can be defined in several ways, from simple to complex:

### 1. Simple String (Any Language/Org)

```typescript
dependencies: ['words']
```

This means the resource requires Translation Words from **any** language and organization.

### 2. Same Language

```typescript
dependencies: [{
  resourceType: 'words',
  sameLanguage: true
}]
```

This means if you're adding `es-419_twl` (Spanish TWL), it requires `es-419_tw` (Spanish TW).

### 3. Same Organization

```typescript
dependencies: [{
  resourceType: 'words',
  sameOwner: true
}]
```

This means if you're adding TWL from `unfoldingWord`, it requires TW from `unfoldingWord`.

### 4. Same Language AND Organization (Recommended)

```typescript
dependencies: [{
  resourceType: 'words',
  sameLanguage: true,
  sameOwner: true
}]
```

This means if you're adding `unfoldingWord/es-419_twl`, it requires `unfoldingWord/es-419_tw`.

**This is the recommended pattern for most dependencies** because it ensures consistency.

### 5. Specific Language

```typescript
dependencies: [{
  resourceType: 'words',
  language: 'en'
}]
```

This always requires English Translation Words, regardless of what language the dependent resource is.

### 6. Specific Organization

```typescript
dependencies: [{
  resourceType: 'words',
  owner: 'unfoldingWord'
}]
```

This always requires Translation Words from unfoldingWord, regardless of what organization the dependent resource is from.

### 7. Mixed (Dynamic + Fixed)

```typescript
dependencies: [{
  resourceType: 'words',
  sameLanguage: true,
  owner: 'unfoldingWord'
}]
```

This means if you're adding `es-419_twl`, it requires `unfoldingWord/es-419_tw` (same language, but always from unfoldingWord).

## Real-World Examples

### Translation Words Links (TWL)

TWL depends on Translation Words (TW) from the **same language and organization**:

```typescript
// apps/tc-study/src/resourceTypes/translationWordsLinks.ts
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  sameLanguage: true,
  sameOwner: true,
}]
```

**Why?** Because the links in TWL reference specific TW articles in the same language/org.

### Translation Notes (TN) - Hypothetical

Translation Notes might always require the **English ULT from unfoldingWord**:

```typescript
dependencies: [{
  resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
  language: 'en',
  owner: 'unfoldingWord',
  // Could also add a resourceId filter if needed
}]
```

**Why?** Because all translation notes are aligned to the English ULT, regardless of what language the notes are in.

### Complex Example - Multiple Dependencies

```typescript
dependencies: [
  // Requires TW from same language and org
  {
    resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    sameLanguage: true,
    sameOwner: true,
  },
  // Also requires English UGNT from unfoldingWord
  {
    resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
    language: 'en',
    owner: 'unfoldingWord',
  }
]
```

## How It Works

### 1. User Tries to Add a Resource

When a user selects a resource in the wizard (e.g., `unfoldingWord/es-419_twl`):

```typescript
// In AddToCatalogWizard.tsx
const depCheck = checkResourceDependencies(
  'words-links',           // resource type ID
  'es-419',                // language
  'unfoldingWord',         // owner
  resourceTypeRegistry,    // registry
  workspaceResources      // current resources
)
```

### 2. System Checks Dependencies

The system checks if `unfoldingWord/es-419_tw` exists in the workspace:

```typescript
// In resourceDependencies.ts
for (const dep of resourceType.dependencies) {
  const normalizedDep = normalizeDependency(dep)
  
  const hasMatchingResource = Array.from(workspaceResources.values()).some(
    resource => resourceMatchesDependency(
      resource,
      normalizedDep,
      'es-419',          // target language
      'unfoldingWord'    // target owner
    )
  )
}
```

### 3. Auto-Download Missing Dependencies

If the dependency is missing but available in the wizard:

```typescript
const requiredResourceKeys = getRequiredDependencyResources(
  'words-links',
  'es-419',
  'unfoldingWord',
  resourceTypeRegistry,
  workspaceResources,
  availableResources      // Resources available in wizard
)

// Auto-add to download queue
requiredResourceKeys.forEach(key => resourcesToDownload.add(key))
```

## Benefits

1. **Type-Safe**: Uses constants from `RESOURCE_TYPE_IDS`
2. **Flexible**: Supports any combination of fixed/dynamic requirements
3. **Automatic**: Auto-downloads missing dependencies
4. **Clear**: Human-readable error messages
5. **Maintainable**: Dependencies defined in one place

## Adding Dependencies to Your Resource Type

1. Import the resource type ID:
```typescript
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'
```

2. Add dependencies to your resource type definition:
```typescript
export const myResourceType = defineResourceType({
  id: RESOURCE_TYPE_IDS.MY_RESOURCE,
  displayName: 'My Resource',
  
  dependencies: [{
    resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    sameLanguage: true,
    sameOwner: true,
  }],
  
  // ... rest of definition
})
```

3. Test by trying to add your resource without the dependency first!

## Future Enhancements

Potential improvements:

1. **Version constraints**: Require specific versions
2. **Resource ID filters**: Require specific resources (e.g., "ULT" not just "scripture")
3. **Optional dependencies**: Soft dependencies that enhance functionality but aren't required
4. **Circular dependency detection**: Prevent circular dependencies
5. **Dependency visualization**: Show dependency graph in UI

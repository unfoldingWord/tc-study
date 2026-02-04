# Adding TSV Translation Words Links Support

## Overview

Translation Words Links (TWL) resources provide links between words in scripture and their corresponding Translation Words articles. This guide shows how support was added using the new simplified resource type system.

## What Was Added

### 1. Resource Type Definition

Created `apps/tc-study/src/resourceTypes/translationWordsLinks.ts`:

```typescript
import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationWordsLinksLoader } from '@bt-synergy/translation-words-links-loader'
import { WordsLinksViewer } from '../components/resources/WordsLinksViewer'

export const translationWordsLinksResourceType: ResourceTypeDefinition = defineResourceType({
  id: 'words-links',
  displayName: 'Translation Words Links',
  subjects: ['TSV Translation Words Links'],
  aliases: ['twl', 'words-links'],
  loader: TranslationWordsLinksLoader,
  viewer: WordsLinksViewer,
  // ... configuration
})
```

### 2. Registration

**Step 1**: Export from `apps/tc-study/src/resourceTypes/index.ts`

```typescript
export { translationWordsLinksResourceType } from './translationWordsLinks'
```

**Step 2**: Register in `apps/tc-study/src/contexts/CatalogContext.tsx`

```typescript
import { translationWordsLinksResourceType } from '../resourceTypes'
// ...
resourceTypeRegistry.register(translationWordsLinksResourceType)
```

### 3. That's It! ✅

The system automatically:

- ✅ Registers the loader with `CatalogManager`
- ✅ Registers the loader with `LoaderRegistry`
- ✅ Registers the viewer with `ViewerRegistry`
- ✅ Creates subject mappings for Door43 API filtering
- ✅ Enables dynamic viewer resolution in `LinkedPanelsStudio`

## How It Works

### Loader (`TranslationWordsLinksLoader`)

- **Package**: `@bt-synergy/translation-words-links-loader`
- **Resource Type**: `'words-links'`
- **Subject**: `'TSV Translation Words Links'`
- **Format**: TSV (Tab-Separated Values)
- **Can Handle**: Resources with `type === 'words-links'`, `subject === 'TSV Translation Words Links'`, or `resourceId === 'twl'`

### Viewer (`WordsLinksViewer`)

- **Location**: `apps/tc-study/src/components/resources/WordsLinksViewer.tsx`
- **Features**:
  - Displays word links filtered by current reference
  - Responds to token-click events from scripture
  - Opens Translation Words articles when links are clicked
  - Groups links by verse
  - Shows original words (Hebrew/Greek) and translations

> **💡 Creating a New Viewer?**  
> If you need to create a new viewer component, see the comprehensive guide in [`ADDING_NEW_RESOURCE_TYPES.md`](./ADDING_NEW_RESOURCE_TYPES.md#step-6-create-viewer-component-if-needed) for detailed instructions on:
>
> - Viewer component structure and required props
> - Using catalog hooks (`useCatalogManager`, `useCurrentReference`)
> - Using linked-panels hooks (`useResourceAPI`, `useEvents`, `useCurrentState`)
> - Fetching and displaying content
> - Inter-panel communication patterns
> - Real-world examples from existing viewers

### Viewer Resolution

When a resource is added to a panel:

1. `LinkedPanelsStudio.generateResourceComponent()` creates metadata object
2. Calls `viewerRegistry.getViewer(resourceMetadata)`
3. `ViewerRegistry` checks each registered viewer's `canHandle()` function
4. Returns `WordsLinksViewer` if:
   - `metadata.type === 'words-links'` OR
   - `metadata.subject === 'TSV Translation Words Links'` OR
   - `metadata.type` or `metadata.resourceId` matches an alias (`'twl'`, `'words-links'`)

## Usage

### Adding a TWL Resource

1. User selects "TSV Translation Words Links" subject in resource wizard
2. Resource is downloaded and stored in catalog
3. Resource is added to panel
4. `ViewerRegistry` automatically resolves `WordsLinksViewer`
5. Viewer displays word links for current reference

### Inter-Panel Communication

- **Token Click**: When user clicks a word in scripture, `WordsLinksViewer` filters to show links for that word
- **Link Click**: When user clicks a word link, it opens the corresponding Translation Words article

## Configuration

The resource type definition includes:

- **Features**: Highlighting, search, navigation
- **Settings**: Show original words, group by category
- **Memory Cache**: 50 books cached
- **Subject Mapping**: `'TSV Translation Words Links'` → `'words-links'` type

## Testing

To test Translation Words Links support:

1. Add a TWL resource via the resource wizard
2. Verify it appears in the catalog
3. Add it to a panel
4. Verify `WordsLinksViewer` is displayed
5. Click words in scripture to filter links
6. Click word links to open Translation Words

## Files Changed

- ✅ `apps/tc-study/src/resourceTypes/translationWordsLinks.ts` - Created
- ✅ `apps/tc-study/src/resourceTypes/index.ts` - Added export
- ✅ `apps/tc-study/src/contexts/CatalogContext.tsx` - Added registration
- ✅ `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx` - Already handles `onEntryLinkClick` prop

## Summary

Adding Translation Words Links support required **only 3 steps**:

1. Create resource type definition
2. Export from index
3. Register in CatalogContext

No manual loader registration, no manual component mapping - everything is automatic! 🎉

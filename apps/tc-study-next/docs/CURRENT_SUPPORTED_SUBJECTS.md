# Currently Supported Subjects

## Answer to: "What subjects are we supporting now?"

### ✅ Currently Supported: **Scripture Only**

We currently support **1 resource type** with **4 Door43 subjects**:

#### **Scripture** Resource Type
All scripture-related subjects from Door43:

- **Door43 Subjects**:
  1. `Bible` - Regular Bible translations (ULT, UST, BSB, etc.)
  2. `Aligned Bible` - Word-aligned translations with source language alignment
  3. `Greek New Testament` - Original Greek texts (UGNT)
  4. `Hebrew Old Testament` - Original Hebrew texts (UHB)

- **Loader**: `ScriptureLoader` from `@bt-synergy/scripture-loader`
- **Viewer**: `ScriptureViewer` from `apps/tc-study/src/components/resources/ScriptureViewer.tsx`
- **Features**: Highlighting, Search, Navigation, Printing, Export

> **Note**: "Resource Type" is our internal classification. "Subject" is Door43's terminology. This distinction allows us to support other servers in the future that may use different terminology. See `RESOURCE_TYPES_VS_SUBJECTS.md` for details.

### 🔜 Coming Soon

The following resource types are **not yet supported** but can be easily added:

1. **Translation Notes**
   - Subject: `TSV Translation Notes`
   - Needs: `NotesLoader`, `NotesViewer`

2. **Translation Words**
   - Subject: `Translation Words`
   - Needs: `WordsLoader`, `WordsViewer`

3. **Translation Questions**
   - Subject: `TSV Translation Questions`
   - Needs: `QuestionsLoader`, `QuestionsViewer`

4. **Translation Academy**
   - Subject: `Translation Academy`
   - Needs: `AcademyLoader`, `AcademyViewer`

5. **Aligned Bible**
   - Subject: `Aligned Bible`
   - Needs: `AlignedBibleLoader`, `AlignedBibleViewer`

6. **Translation Words Links**
   - Subject: `TSV Translation Words Links`
   - Needs: `WordsLinksLoader`, `WordsLinksViewer`

## How This Relates to Extensibility

### The Plugin System

Each resource type is defined as a **plugin** with:

```typescript
{
  id: 'scripture',                    // Internal identifier
  displayName: 'Scripture',           // UI name
  subjects: ['Bible', 'GNT', 'HOT'],  // Door43 subjects it handles
  loader: ScriptureLoader,            // Data layer (fetching/caching)
  viewer: ScriptureViewer,            // UI layer (display)
  features: { ... }                   // Capabilities
}
```

### Automatic Filtering

When a resource type is registered:

1. **API Filtering**: Door43 API calls automatically include only supported subjects
   ```
   GET /api/v1/catalog/list/languages?subject=Bible&subject=Greek+New+Testament&subject=Hebrew+Old+Testament
   ```

2. **Language Filtering**: Only languages with resources in supported subjects are shown
   - **Result**: ~50 languages (not 88)

3. **Resource Filtering**: Only resources with supported subjects appear in the wizard
   - **Result**: Only Scripture resources are shown

### Current State

```
ResourceTypeRegistry
├── Scripture (registered ✅)
│   ├── Loader: ScriptureLoader ✅
│   ├── Viewer: ScriptureViewer ✅
│   └── Subjects: Bible, Greek New Testament, Hebrew Old Testament ✅
├── Notes (not registered ❌)
├── Words (not registered ❌)
├── Questions (not registered ❌)
├── Academy (not registered ❌)
└── Aligned Bible (not registered ❌)
```

## Impact on User Experience

### What Users See Now

1. **Language Selection**:
   - Shows ~50 languages (filtered by Scripture subjects)
   - Displays "Supported Resource Types (1): Scripture"

2. **Resource Selection**:
   - Only shows Bible resources
   - Subject dropdown shows: Bible, Greek New Testament, Hebrew Old Testament

3. **Panel Assignment**:
   - Can assign Scripture resources to panels
   - Scripture resources display with `ScriptureViewer`

### What Users Will See After Adding Notes

1. **Language Selection**:
   - Shows more languages (those with Notes resources too)
   - Displays "Supported Resource Types (2): Scripture, Translation Notes"

2. **Resource Selection**:
   - Shows both Bible and Notes resources
   - Subject dropdown includes "TSV Translation Notes"

3. **Panel Assignment**:
   - Can assign both Scripture and Notes to panels
   - Notes display with `NotesViewer`

## Technical Details

### Where Subjects Are Defined

```typescript
// apps/tc-study/src/resourceTypes/scripture/index.ts
export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  displayName: 'Scripture',
  subjects: [
    'Bible',                    // ← Defined here
    'Greek New Testament',      // ← Defined here
    'Hebrew Old Testament',     // ← Defined here
  ],
  // ...
})
```

### Where Registration Happens

```typescript
// apps/tc-study/src/contexts/CatalogContext.tsx
import { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { scriptureResourceType } from '../resourceTypes'

const resourceTypeRegistry = new ResourceTypeRegistry({
  catalogManager,
  viewerRegistry,
})

resourceTypeRegistry.register(scriptureResourceType)  // ← Registered here
```

### How API Filters Are Generated

```typescript
// Automatic generation based on registered types
const apiFilters = resourceTypeRegistry.getAPIFilters()

// Returns:
{
  subjects: ['Bible', 'Greek New Testament', 'Hebrew Old Testament'],
  stage: 'prod',
  topic: 'tc-ready'
}
```

## Verification

### Check Console Logs

When the app starts, you should see:

```
📦 Registering resource types...
✅ Registered resource type: Scripture
   ID: scripture
   Subjects: Bible, Greek New Testament, Hebrew Old Testament
   Loader: ✓
   Viewer: ✓
   Features: highlighting, search, navigation

✅ Catalog system initialized
  - Supported subjects: Bible, Greek New Testament, Hebrew Old Testament
```

### Check Wizard UI

1. Open "Add Resource" wizard
2. First step shows:
   ```
   Supported Resource Types (1)
   
   Scripture
     • Bible
     • Greek New Testament
     • Hebrew Old Testament
   ```

### Check API Calls

1. Open DevTools → Network
2. Look for Door43 API calls
3. Verify query params include:
   ```
   subject=Bible
   subject=Greek+New+Testament
   subject=Hebrew+Old+Testament
   stage=prod
   topic=tc-ready
   ```

## Summary

### Current Support
- ✅ **1 resource type**: Scripture
- ✅ **4 subjects**: Bible, Aligned Bible, Greek New Testament, Hebrew Old Testament
- ✅ **1 loader**: ScriptureLoader
- ✅ **1 viewer**: ScriptureViewer

### Extensibility
- ✅ **Plugin system**: Unified resource type definitions
- ✅ **Automatic filtering**: API calls include only supported subjects
- ✅ **Dynamic UI**: Wizard adapts to registered types
- ✅ **Easy to extend**: Add new types with ~30 lines of code

### Next Steps
1. Implement `NotesLoader` and `NotesViewer`
2. Define `notesResourceType` plugin
3. Register it → automatically supports Translation Notes!

The system is **working as designed** and ready for expansion! 🎉

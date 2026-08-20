# Entry Viewer Registry

## Overview

The **Entry Viewer Registry** is an extensible system for registering and managing specialized viewers for the **Entry Modal**. Entry viewers are designed to display single entries (like dictionary/encyclopedia entries) from entry-organized resources such as Translation Words, Translation Academy, etc.

## Why Separate from Panel Viewers?

### Entry Viewers vs Panel Viewers

| Aspect | Entry Viewers | Panel Viewers |
|--------|---------------|---------------|
| **Purpose** | Display single entry in modal | Display full resource in panel |
| **Context** | Modal overlay (limited space) | Full panel space |
| **Navigation** | Entry-to-entry (like dictionary) | Full TOC, sections, chapters |
| **UI/UX** | Focused, minimal chrome | Full controls, multiple views |
| **Registry** | `EntryViewerRegistry` | `ViewerRegistry` |

**Key Insight**: Entry modals have a specialized purpose and more limited scope than panel resources, requiring dedicated entry-specific viewers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Entry Viewer Registry Architecture                     │
└─────────────────────────────────────────────────────────┘

Developer Registers Viewers
           │
           ▼
┌──────────────────────────┐
│  EntryViewerRegistry     │
│  ────────────────────    │
│  • register()            │
│  • getEntryViewer()      │
│  • matcher functions     │
└──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│  Entry Modal Uses Registry                       │
│  ───────────────────────                         │
│  1. User clicks TW link                          │
│  2. Modal gets resourceId + entryId              │
│  3. Registry finds matching viewer               │
│  4. Viewer renders entry                         │
└──────────────────────────────────────────────────┘
```

---

## Core Components

### 1. EntryViewerRegistry

Central registry for managing entry viewers.

**Location**: `src/lib/viewers/EntryViewerRegistry.ts`

**Key Methods**:
```ts
class EntryViewerRegistry {
  // Register an entry viewer
  register(registration: EntryViewerRegistration): void
  
  // Get viewer for a resource based on metadata
  getEntryViewer(metadata: ResourceMetadata): EntryViewerComponent | null
  
  // Get viewer by ID
  getEntryViewerById(id: string): EntryViewerComponent | null
  
  // Check if viewer is registered
  hasViewer(id: string): boolean
  
  // Get all registered viewers
  getAllViewers(): EntryViewerRegistration[]
}
```

### 2. BaseEntryViewerProps

All entry viewers must accept these props:

```ts
interface BaseEntryViewerProps {
  /** Full resource identifier (e.g., 'unfoldingWord/en_tw') */
  resourceKey: string
  
  /** Entry identifier within the resource (e.g., 'bible/kt/grace') */
  entryId: string
  
  /** Resource metadata (optional, may be loaded by viewer) */
  metadata?: any
  
  /** Handler for navigating to other entries */
  onEntryLinkClick?: (resourceId: string, entryId?: string) => void
}
```

### 3. EntryViewerRegistration

Configuration for registering a viewer:

```ts
interface EntryViewerRegistration {
  /** Unique identifier */
  id: string
  
  /** Display name for debugging */
  name: string
  
  /** Viewer component */
  viewer: EntryViewerComponent
  
  /** Matcher function to determine if viewer can handle a resource */
  matcher: EntryViewerMatcher
  
  /** Priority for matching (higher = checked first) */
  priority?: number
}
```

---

## Usage Guide

### For Developers: Registering an Entry Viewer

#### Step 1: Create Your Entry Viewer Component

```tsx
// src/components/entryViewers/MyCustomEntryViewer.tsx

import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'

export function MyCustomEntryViewer({
  resourceKey,
  entryId,
  metadata,
  onEntryLinkClick,
}: BaseEntryViewerProps) {
  // Load and display your entry content
  const entryContent = useLoadEntry(resourceKey, entryId)
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{entryContent.title}</h1>
      <div className="prose">
        {entryContent.body}
      </div>
      
      {/* Links to other entries */}
      {entryContent.relatedLinks.map(link => (
        <button
          key={link.id}
          onClick={() => onEntryLinkClick?.(resourceKey, link.entryId)}
        >
          {link.text}
        </button>
      ))}
    </div>
  )
}

MyCustomEntryViewer.displayName = 'MyCustomEntryViewer'
```

#### Step 2: Register Your Viewer

Add your viewer to the registry in `src/lib/viewers/registerEntryViewers.ts`:

```ts
import { MyCustomEntryViewer } from '../../components/entryViewers/MyCustomEntryViewer'

export function registerDefaultEntryViewers(registry: EntryViewerRegistry): void {
  // ... existing registrations ...
  
  // Register your custom entry viewer
  registry.register({
    id: 'my-custom-entry-viewer',
    name: 'My Custom Entry Viewer',
    viewer: MyCustomEntryViewer,
    matcher: (metadata) => {
      return metadata.type === 'custom' && metadata.owner === 'myOrg'
    },
    priority: 100,
  })
}
```

#### Step 3: Export Your Viewer

Add to `src/components/entryViewers/index.ts`:

```ts
export { MyCustomEntryViewer } from './MyCustomEntryViewer'
```

That's it! Your entry viewer is now registered and will be used automatically when the Entry Modal encounters a matching resource.

---

## Matcher Functions

Matchers determine if a viewer can handle a resource.

### Built-in Matcher Helpers

```ts
// Type-based matcher
import { createTypeMatcher } from './EntryViewerRegistry'

const matcher = createTypeMatcher('words') // Matches type === 'words'

// Subject-based matcher
import { createSubjectMatcher } from './EntryViewerRegistry'

const matcher = createSubjectMatcher('Bible') // Matches subject === 'Bible'

// Custom matcher
import { createCustomMatcher } from './EntryViewerRegistry'

const matcher = createCustomMatcher((metadata) => {
  return metadata.type === 'words' && metadata.languageCode === 'en'
})
```

### Custom Matcher Examples

```ts
// Match by owner and type
matcher: (metadata) => {
  return metadata.owner === 'unfoldingWord' && metadata.type === 'academy'
}

// Match by multiple conditions
matcher: (metadata) => {
  const isTranslationHelps = ['words', 'notes', 'questions', 'academy'].includes(metadata.type)
  const isUnfoldingWord = metadata.owner === 'unfoldingWord'
  return isTranslationHelps && isUnfoldingWord
}

// Match by resource ID pattern
matcher: (metadata) => {
  return metadata.resourceId?.startsWith('myOrg/')
}
```

---

## Priority System

When multiple viewers match, the one with **highest priority** is selected.

```ts
// High priority (checked first)
registry.register({
  id: 'custom-tw-viewer',
  name: 'Custom Translation Words Viewer',
  viewer: CustomTWViewer,
  matcher: (metadata) => metadata.type === 'words' && metadata.owner === 'myOrg',
  priority: 150, // ← Higher than default (100)
})

// Default priority
registry.register({
  id: 'default-tw-viewer',
  name: 'Default Translation Words Viewer',
  viewer: DefaultTWViewer,
  matcher: (metadata) => metadata.type === 'words',
  priority: 100, // ← Default priority
})
```

**Use Cases for Priority**:
- Override default viewers for specific organizations
- Provide specialized viewers for language-specific resources
- Create fallback viewers with low priority

---

## Example: Translation Words Entry Viewer

### Registration

```ts
// src/lib/viewers/registerEntryViewers.ts

import { TranslationWordsEntryViewer } from '../../components/entryViewers'
import { createTypeMatcher } from './EntryViewerRegistry'

export function registerDefaultEntryViewers(registry: EntryViewerRegistry): void {
  registry.register({
    id: 'translation-words-entry',
    name: 'Translation Words Entry Viewer',
    viewer: TranslationWordsEntryViewer,
    matcher: createTypeMatcher('words'),
    priority: 100,
  })
}
```

### Implementation

```tsx
// src/components/entryViewers/TranslationWordsEntryViewer.tsx

import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'
import { TranslationWordsViewer } from '../resources'

export function TranslationWordsEntryViewer({
  resourceKey,
  entryId,
  metadata,
  onEntryLinkClick,
}: BaseEntryViewerProps) {
  return (
    <TranslationWordsViewer
      resourceKey={resourceKey}
      metadata={metadata}
      initialEntryId={entryId}
      onEntryLinkClick={onEntryLinkClick}
    />
  )
}

TranslationWordsEntryViewer.displayName = 'TranslationWordsEntryViewer'
```

---

## How the Entry Modal Uses the Registry

```tsx
// src/components/common/EntryResourceModal.tsx

const entryViewerRegistry = useEntryViewerRegistry()

// Parse resource key
const resourceId = "unfoldingWord/en_tw"
const entryId = "bible/kt/grace"

// Get appropriate viewer from registry
const EntryViewer = entryViewerRegistry.getEntryViewer({
  type: metadata?.type,
  subject: metadata?.subject,
  resourceId: resourceId,
  owner: metadata?.owner,
  languageCode: metadata?.languageCode,
})

if (!EntryViewer) {
  return <div>No entry viewer registered for this resource type</div>
}

// Render the entry viewer
return (
  <EntryViewer
    resourceKey={resourceId}
    entryId={entryId}
    metadata={metadata}
    onEntryLinkClick={handleOpenEntry}
  />
)
```

---

## Complete Flow Diagram

```
┌───────────────────────────────────────────────────────────┐
│ 1. USER ACTION: Click TW Link "grace"                    │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│ 2. SIGNAL: entry-link-click                              │
│    { resourceId: "unfoldingWord/en_tw",                  │
│      entryId: "bible/kt/grace" }                         │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│ 3. STUDY STORE: openModal(resourceKey)                   │
│    resourceKey: "unfoldingWord/en_tw#bible/kt/grace"     │
│    history: [..., resourceKey]                           │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│ 4. ENTRY MODAL: Parse resourceKey                        │
│    resourceId: "unfoldingWord/en_tw"                     │
│    entryId: "bible/kt/grace"                             │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│ 5. ENTRY VIEWER REGISTRY: Get matching viewer            │
│    entryViewerRegistry.getEntryViewer({                  │
│      type: "words",                                       │
│      resourceId: "unfoldingWord/en_tw"                   │
│    })                                                     │
│    → Returns: TranslationWordsEntryViewer               │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│ 6. RENDER: <TranslationWordsEntryViewer>                │
│    Props:                                                 │
│      resourceKey="unfoldingWord/en_tw"                   │
│      entryId="bible/kt/grace"                            │
│      metadata={...}                                       │
│      onEntryLinkClick={handleOpenEntry}                  │
└───────────────────────────────────────────────────────────┘
```

---

## Best Practices

### 1. Keep Entry Viewers Focused

Entry viewers should be simple and focused on displaying a single entry:

✅ **Good**:
```tsx
function MyEntryViewer({ resourceKey, entryId }) {
  const entry = useLoadEntry(resourceKey, entryId)
  return <div>{entry.content}</div>
}
```

❌ **Avoid**:
```tsx
function MyEntryViewer({ resourceKey, entryId }) {
  // Don't include complex navigation, TOC, or panel-like features
  return (
    <>
      <FullTableOfContents />
      <Sidebar />
      <EntryContent />
      <Footer />
    </>
  )
}
```

### 2. Use Descriptive Matcher Functions

✅ **Good**:
```ts
matcher: (metadata) => {
  const isTW = metadata.type === 'words'
  const isUnfoldingWord = metadata.owner === 'unfoldingWord'
  return isTW && isUnfoldingWord
}
```

❌ **Avoid**:
```ts
matcher: (m) => m.type === 'words' && m.owner === 'uw'
```

### 3. Set Appropriate Priorities

- **100**: Default priority for standard viewers
- **150+**: Custom/specialized viewers that override defaults
- **50-**: Fallback viewers with broad matchers

### 4. Handle Loading States

```tsx
function MyEntryViewer({ resourceKey, entryId, metadata }) {
  const { data, loading, error } = useLoadEntry(resourceKey, entryId, metadata)
  
  if (loading) return <Loader />
  if (error) return <ErrorDisplay error={error} />
  
  return <EntryContent data={data} />
}
```

### 5. Support Entry Navigation

Always implement `onEntryLinkClick` for seamless entry-to-entry navigation:

```tsx
<button
  onClick={() => onEntryLinkClick?.(resourceId, relatedEntryId)}
>
  View related entry
</button>
```

---

## Debugging

### Check Registered Viewers

```ts
import { entryViewerRegistry } from './lib/viewers/EntryViewerRegistry'

// Get all registered viewers
const viewers = entryViewerRegistry.getAllViewers()
console.log('Registered Entry Viewers:', viewers)

// Check if specific viewer is registered
const hasViewer = entryViewerRegistry.hasViewer('translation-words-entry')
console.log('Has TW viewer:', hasViewer)
```

### Test Matcher Logic

```ts
const metadata = {
  type: 'words',
  owner: 'unfoldingWord',
  resourceId: 'unfoldingWord/en_tw',
}

const viewer = entryViewerRegistry.getEntryViewer(metadata)
console.log('Matched viewer:', viewer?.displayName)
```

### Console Logs

The registry logs important events:

```
[EntryViewers] Registering default entry viewers...
[EntryViewerRegistry] ✅ Registered entry viewer: Translation Words Entry Viewer (translation-words-entry)
[EntryViewerRegistry] ✅ Found entry viewer: Translation Words Entry Viewer for { type: 'words', ... }
```

---

## Future Enhancements

### Planned Entry Viewers

1. **Translation Academy Entry Viewer**
   - Display TA articles in modal
   - Support multimedia content
   
2. **Translation Questions Entry Viewer**
   - Show question and answer
   - Link to related scripture passages

3. **Translation Notes Entry Viewer**
   - Display note for specific verse
   - Show related TW/TA links

### Potential Features

- **Entry Preview on Hover** - Quick preview before opening modal
- **Entry Bookmarks** - Save favorite entries
- **Entry Search** - Search within entry content
- **Entry Sharing** - Generate shareable links to entries

---

## Related Documentation

- **Entry Modal Data Flow**: `ENTRY_MODAL_DATA_FLOW.md`
- **Resource Type Development**: `RESOURCE_TYPE_DEVELOPMENT.md`
- **Adding New Resource Types**: `ADDING_NEW_RESOURCE_TYPES.md`
- **Viewer Registry** (for panels): `src/lib/viewers/ViewerRegistry.ts`

---

## Summary

The Entry Viewer Registry provides:

✅ **Extensible architecture** - Easy to add new entry viewers  
✅ **Separation of concerns** - Entry viewers distinct from panel viewers  
✅ **Matcher-based routing** - Flexible viewer selection  
✅ **Priority system** - Control viewer precedence  
✅ **Type-safe props** - BaseEntryViewerProps ensures consistency  
✅ **Developer-friendly** - Simple registration process  

This system makes the Entry Modal flexible and extensible while maintaining a clean, focused user experience for viewing individual entries.

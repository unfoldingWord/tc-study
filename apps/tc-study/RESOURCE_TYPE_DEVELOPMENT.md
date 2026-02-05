# Resource Type Development Guide

## Overview

This guide explains how to add new resource types to tc-study. There are **two types of viewers** you need to understand:

1. **Panel Tab Viewer** - Full-featured viewer for resource panels (main reading interface)
2. **Modal Entry Viewer** - Lightweight viewer for popup modals (quick reference, definitions)

Both are required for a complete resource type implementation.

## Quick Start

### Overview: Two Types of Viewers

**Panel Tab Viewer** (`ScriptureViewer`, `TranslationWordsViewer`)
- Used in: Main reading panels (left/right split view)
- Purpose: Full-featured resource viewing with TOC, navigation, search
- Registration: `ResourceTypeInitializer.tsx` → `ResourceTypeRegistry`
- Location: `src/components/resources/MyResourceViewer/`

**Modal Entry Viewer** (`TranslationWordsEntryViewer`, `TranslationAcademyEntryViewer`)
- Used in: Popup modals (floating entry display)
- Purpose: Lightweight single-entry display (definitions, articles)
- Registration: `main.tsx` → `EntryViewerRegistry`
- Location: `src/components/entryViewers/MyResourceEntryViewer.tsx`

---

### Part A: Create Panel Tab Viewer (Full Resource Viewer)

#### 1. Create Your Panel Viewer Component

```tsx
// src/components/resources/MyResourceViewer/index.tsx
import type { WithPanelCommunicationProps } from '../../../resourceTypes'
import type { VerseNavigationSignal } from '../../../signals/studioSignals'

interface MyResourceViewerProps extends WithPanelCommunicationProps {
  resourceId: string
  resourceKey: string
}

export function MyResourceViewerBase({ 
  resourceId, 
  resourceKey,
  sendSignal,  // ← Injected by withPanelCommunication
  sendToPanel,
  sendToResource
}: MyResourceViewerProps) {
  
  // Handle user actions by sending signals
  const handleItemClick = (verse: any) => {
    sendSignal<VerseNavigationSignal>('verse-navigation', {
      verse: { book: verse.book, chapter: verse.chapter, verse: verse.verse }
    })
  }
  
  return (
    <div>
      {/* Your full UI with TOC, navigation, content, etc. */}
      <button onClick={() => handleItemClick(someVerse)}>
        Navigate
      </button>
    </div>
  )
}
```

### 2. Wrap with Panel Communication

```tsx
// src/components/resources/MyResourceViewer/index.tsx (continued)
import { withPanelCommunication } from '../../../resourceTypes'

export const MyResourceViewer = withPanelCommunication(
  MyResourceViewerBase,
  'my-resource-type',
  {
    // What signals this viewer can send
    sends: ['verse-navigation', 'token-click'],
    
    // What signals this viewer responds to
    receives: {
      'verse-navigation': (props, signal) => {
        // Handle incoming navigation
        console.log('Navigate to:', signal.verse)
      }
    },
    
    // Optional: metadata for better filtering
    metadata: (props) => ({
      language: props.language,
      subject: 'MySubject'
    }),
    
    // Optional: enable debug logging
    debug: false
  }
)
```

### 3. Register the Resource Type (Panel Viewer)

```tsx
// src/resourceTypes/myResource.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { MyResourceLoader } from '@bt-synergy/my-resource-loader'
import { MyResourceViewer } from '../components/resources/MyResourceViewer'

export const myResourceType = defineResourceType({
  id: 'my-resource-type',
  displayName: 'My Resource',
  description: 'Description of my resource',
  icon: 'BookOpen',
  
  subjects: ['My Subject'],
  aliases: ['my-resource', 'myres'],
  
  loader: MyResourceLoader,
  viewer: MyResourceViewer,  // ← Panel viewer (wrapped with panel communication)
  
  features: {
    highlighting: true,
    search: true,
    navigation: true
  }
})
```

### 4. Register in ResourceTypeInitializer

```tsx
// src/components/ResourceTypeInitializer.tsx
const {
  scriptureResourceType,
  translationWordsResourceType,
  myResourceType  // ← Import your type
} = await import('../resourceTypes')

registry.register(scriptureResourceType)
registry.register(translationWordsResourceType)
registry.register(myResourceType)  // ← Register it
```

### 5. Export from index

```tsx
// src/resourceTypes/index.ts
export { myResourceType } from './myResource'
```

---

### Part B: Create Modal Entry Viewer (Lightweight Popup Viewer)

#### 6. Create Entry Viewer Component

```tsx
// src/components/entryViewers/MyResourceEntryViewer.tsx
import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'
import { useEffect, useState } from 'react'
import { useCatalogManager, useLoaderRegistry } from '../../contexts/CatalogContext'

/**
 * Lightweight entry viewer for popup modals
 * - No TOC, no full navigation
 * - Just displays single entry content
 * - Quick load, minimal UI
 */
export function MyResourceEntryViewer({
  resourceKey,
  entryId,
  metadata: propMetadata,
  onEntryLinkClick,
  onContentLoaded,
}: BaseEntryViewerProps) {
  const loaderRegistry = useLoaderRegistry()
  const [entry, setEntry] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const loadEntry = async () => {
      setLoading(true)
      try {
        // Load single entry using the loader
        const loader = loaderRegistry.getLoader('my-resource')
        const content = await loader.load({
          resourceKey,
          cacheKey: `my-resource:${resourceKey}:${entryId}`,
          query: { entryId }
        })
        
        setEntry(content)
        onContentLoaded?.(content)
      } catch (error) {
        console.error('Failed to load entry:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadEntry()
  }, [resourceKey, entryId])
  
  if (loading) {
    return <div>Loading...</div>
  }
  
  return (
    <div className="p-4">
      <h2>{entry?.title}</h2>
      <div>{entry?.content}</div>
    </div>
  )
}
```

#### 7. Register Entry Viewer

```tsx
// src/lib/viewers/registerEntryViewers.ts
import { MyResourceEntryViewer } from '../../components/entryViewers/MyResourceEntryViewer'
import { createTypeMatcher } from './EntryViewerRegistry'

export function registerDefaultEntryViewers(registry: EntryViewerRegistry): void {
  // ... existing registrations
  
  // My Resource Entry Viewer
  registry.register({
    id: 'my-resource-entry',
    name: 'My Resource Entry Viewer',
    viewer: MyResourceEntryViewer,
    matcher: createTypeMatcher('my-resource'),  // Must match resource type ID
    priority: 100,
  })
}
```

---

### Summary: Registration Checklist

When adding a new resource type, register in **2 places**:

✅ **Panel Tab Viewer** → `ResourceTypeInitializer.tsx`
- Purpose: Main reading interface
- Wrapped with `withPanelCommunication`
- Full-featured with TOC, navigation

✅ **Modal Entry Viewer** → `registerEntryViewers.ts`
- Purpose: Popup modal for quick reference
- Lightweight, minimal UI
- Single entry display only

---

### 2. Wrap with Panel Communication (SKIP - moved above)

---

## Available Signals

See `src/signals/studioSignals.ts` for all available signals:

- `verse-navigation` - Navigate to a verse
- `token-click` - Word clicked in scripture
- `entry-link-click` - Resource entry link clicked
- `text-selection` - Text selected/highlighted
- `scroll-sync` - Sync scrolling between panels
- And more...

## Signal Discovery

Query the registry to see what signals are available:

```tsx
import { STUDIO_SIGNAL_REGISTRY } from '../signals/studioSignals'

// See all available signals
console.log(Object.keys(STUDIO_SIGNAL_REGISTRY))

// Get info about a specific signal
const signalInfo = STUDIO_SIGNAL_REGISTRY['verse-navigation']
console.log(signalInfo.description)
console.log(signalInfo.typicalSenders)
console.log(signalInfo.typicalReceivers)
```

## Advanced: Custom Signals

If the studio signals don't fit your needs, define custom signals:

```tsx
// src/signals/myCustomSignals.ts
import type { BaseSignal } from '@bt-synergy/resource-panels'

export interface MyCustomSignal extends BaseSignal {
  type: 'my-custom-signal'
  myData: {
    foo: string
    bar: number
  }
}
```

Then use it in your viewer:

```tsx
sendSignal<MyCustomSignal>('my-custom-signal', {
  myData: { foo: 'hello', bar: 42 }
})
```

## Targeted Communication

Send signals to specific targets:

```tsx
// Send to all resources (broadcast)
sendSignal<VerseNavigationSignal>('verse-navigation', { verse })

// Send to specific panel
sendToPanel<VerseNavigationSignal>('panel-2', 'verse-navigation', { verse })

// Send to specific resource
sendToResource<VerseNavigationSignal>('resource-123', 'verse-navigation', { verse })
```

## Best Practices

1. **Use Standard Signals**: Prefer `studioSignals` over custom signals for interoperability
2. **Type Safety**: Always use the generic type parameter: `sendSignal<VerseNavigationSignal>(...)`
3. **Signal Documentation**: Add your signals to the registry for discoverability
4. **Minimal Props**: Only inject `sendSignal`, `sendToPanel`, `sendToResource` - keep viewer props clean
5. **Debug Mode**: Enable debug logging during development to see signal flow
6. **Resource Metadata**: Provide accurate metadata for better signal filtering

## Testing

Test your viewer with the Panel System Test page:

1. Navigate to `/test`
2. Add your resource to a panel
3. Send signals and verify they're received
4. Check the Signal Monitor to see all communication

## Examples

**Panel Tab Viewers** (Full-featured):
- `src/components/resources/ScriptureViewer/` - Complete scripture viewer with TOC
- `src/components/resources/TranslationWordsViewer/` - Words browser with categories
- `src/components/resources/TranslationNotesViewer/` - Notes with verse alignment
- `src/resourceTypes/scripture.ts` - Complete resource type registration

**Modal Entry Viewers** (Lightweight):
- `src/components/entryViewers/TranslationWordsEntryViewer.tsx` - Single word definition
- `src/components/entryViewers/TranslationAcademyEntryViewer.tsx` - Single article
- `src/lib/viewers/registerEntryViewers.ts` - Entry viewer registration

---

## Registration Locations Summary

### For Panel Tab Viewers:
1. **Create viewer**: `src/components/resources/MyResourceViewer/index.tsx`
2. **Define type**: `src/resourceTypes/myResource.ts`
3. **Export**: `src/resourceTypes/index.ts`
4. **Register**: `src/components/ResourceTypeInitializer.tsx` (ONE place)

### For Modal Entry Viewers:
1. **Create viewer**: `src/components/entryViewers/MyResourceEntryViewer.tsx`
2. **Register**: `src/lib/viewers/registerEntryViewers.ts` (ONE place)

---

## When to Use Which Viewer?

**Use Panel Tab Viewer when:**
- User needs to browse/navigate entire resource
- TOC/navigation is required
- Full-screen reading experience
- Inter-panel communication needed

**Use Modal Entry Viewer when:**
- User clicks a link to view single entry
- Quick reference popup (like dictionary lookup)
- No navigation needed
- Lightweight, fast display

---

## Examples

## Troubleshooting

**Signals not being received?**
- Check resourceId is correct and matches between sender/receiver
- Verify signal type string matches exactly
- Check Signal Monitor in test page
- Enable debug mode to see logs

**TypeScript errors?**
- Ensure you're importing signal types from `../signals`
- Use the generic type parameter: `sendSignal<SignalType>(...)`
- Check `WithPanelCommunicationProps` is extended correctly

**Component not rendering?**
- Check ViewerRegistry has the viewer registered
- Verify resource type ID matches across registration
- Check CatalogContext initialization logs

## Next Steps

1. Create your viewer component
2. Wrap with `withPanelCommunication`
3. Define your resource type
4. Register in CatalogContext
5. Test in Panel System Test page
6. Update this guide with your learnings!

---

**Questions?** See `packages/resource-panels/README.md` for the full library documentation.

---

## Complete Registration Flow Diagram

```
📦 NEW RESOURCE TYPE
│
├─── 1️⃣ PANEL TAB VIEWER (Main Reading Interface)
│    │
│    ├─ Create: src/components/resources/MyResourceViewer/index.tsx
│    │         ↓ (wrap with withPanelCommunication)
│    │
│    ├─ Define: src/resourceTypes/myResource.ts
│    │         ↓ (defineResourceType with viewer + loader)
│    │
│    ├─ Export: src/resourceTypes/index.ts
│    │         ↓
│    │
│    └─ Register: src/components/ResourceTypeInitializer.tsx
│              ↓
│              registry.register(myResourceType)
│              ↓
│              [Automatically registers in:]
│              - ResourceTypeRegistry
│              - LoaderRegistry (for data loading)
│              - ViewerRegistry (for UI rendering)
│              - CatalogManager (for subject mapping)
│
└─── 2️⃣ MODAL ENTRY VIEWER (Popup Quick Reference)
     │
     ├─ Create: src/components/entryViewers/MyResourceEntryViewer.tsx
     │         ↓ (implements BaseEntryViewerProps)
     │
     └─ Register: src/lib/viewers/registerEntryViewers.ts
               ↓
               registry.register({
                 id: 'my-resource-entry',
                 viewer: MyResourceEntryViewer,
                 matcher: createTypeMatcher('my-resource')
               })
               ↓
               [Called from main.tsx on app startup]
               ↓
               EntryViewerRegistry
```

## Key Differences

| Feature | Panel Tab Viewer | Modal Entry Viewer |
|---------|-----------------|-------------------|
| **Location** | `components/resources/` | `components/entryViewers/` |
| **Purpose** | Full resource browsing | Single entry popup |
| **Registry** | ResourceTypeRegistry | EntryViewerRegistry |
| **Registration** | ResourceTypeInitializer.tsx | registerEntryViewers.ts |
| **When Registered** | After app mount (async) | Before app render (main.tsx) |
| **Wrapped with** | withPanelCommunication | None (plain component) |
| **Features** | TOC, navigation, signals | Minimal, content only |
| **Complexity** | High (full-featured) | Low (lightweight) |
| **Required** | Yes (for panel tabs) | Optional (for modals) |

---

## Complete Example: Adding Translation Questions

### Panel Viewer:
```tsx
// 1. src/components/resources/TranslationQuestionsViewer/index.tsx
export const TranslationQuestionsViewer = withPanelCommunication(
  TranslationQuestionsViewerBase,
  'questions',
  { sends: ['verse-navigation'], receives: { ... } }
)

// 2. src/resourceTypes/translationQuestions.ts
export const translationQuestionsResourceType = defineResourceType({
  id: 'questions',
  viewer: TranslationQuestionsViewer,
  loader: TranslationQuestionsLoader,
  subjects: ['Translation Questions']
})

// 3. src/resourceTypes/index.ts
export { translationQuestionsResourceType } from './translationQuestions'

// 4. src/components/ResourceTypeInitializer.tsx
const { ..., translationQuestionsResourceType } = await import('../resourceTypes')
registry.register(translationQuestionsResourceType)
```

### Entry Viewer:
```tsx
// 5. src/components/entryViewers/TranslationQuestionsEntryViewer.tsx
export function TranslationQuestionsEntryViewer({ 
  resourceKey, entryId 
}: BaseEntryViewerProps) {
  // Simple question display
  return <div>Question content...</div>
}

// 6. src/lib/viewers/registerEntryViewers.ts
registry.register({
  id: 'translation-questions-entry',
  name: 'Translation Questions Entry Viewer',
  viewer: TranslationQuestionsEntryViewer,
  matcher: createTypeMatcher('questions'),
  priority: 100
})
```

**Done!** Your resource now works in both panels and modals.

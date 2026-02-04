# Entry Modal Data Flow Documentation

This document explains how content, titles, metadata, and history are sent to and managed by the Entry Resource Modal system.

## Overview

The Entry Modal system uses a combination of:
1. **Zustand Store** (`studyStore`) - Manages modal state and history
2. **Linked-Panels Signals** - Broadcasts entry link clicks across panels
3. **Resource Catalog** - Fetches metadata for resources not yet loaded
4. **React Props** - Passes data to child viewers

---

## 1. Opening an Entry in the Modal

### A. From Translation Words Links (TWL) Viewer

When a user clicks on a Translation Words article title in the TWL viewer:

```tsx
// File: apps/tc-study/src/components/resources/WordsLinksViewer/index.tsx

// Get signal sender for entry-link-click
const { sendToAll: sendEntryLinkClick } = useSignal<EntryLinkClickSignal>(
  'entry-link-click',
  resourceId,
  resourceMetadata
)

// Handle clicking on TWL article title
const handleTitleClick = useCallback((link: typeof displayLinks[0]) => {
  const { twLink, twResourceKey, entryId } = extractTWInfo(link)
  
  // Call onEntryLinkClick prop (if provided by parent)
  if (onEntryLinkClick) {
    onEntryLinkClick(twResourceKey, entryId)
  }
  
  // Broadcast the signal across all panels
  sendEntryLinkClick({
    lifecycle: 'event',
    link: {
      resourceType: 'words',
      resourceId: twResourceKey,
      entryId: entryId,
      text: twInfo.term,
    },
  })
}, [resourceKey, onEntryLinkClick, sendEntryLinkClick])
```

**Data Sent:**
- `resourceType`: Resource type (e.g., 'words', 'academy')
- `resourceId`: Full resource identifier (e.g., 'unfoldingWord/en_tw')
- `entryId`: Entry path within the resource (e.g., 'bible/kt/grace')
- `text`: Display text (e.g., 'grace')

---

### B. Parent Component Handler

The parent component (`SimplifiedReadView`) passes a handler to child viewers:

```tsx
// File: apps/tc-study/src/components/read/SimplifiedReadView.tsx

const openModal = useStudyStore((s: any) => s.openModal)

// Handle opening entry-organized resources in modal
const handleOpenEntry = useCallback((resourceId: string, entryId?: string) => {
  const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
  openModal(resourceKey)
}, [openModal])

// Pass handler to child viewer
<WordsLinksViewer
  resourceKey={resourceKey}
  metadata={resourceMetadata}
  onEntryLinkClick={handleOpenEntry}
/>
```

**Key Format:**
- With entry: `"unfoldingWord/en_tw#bible/kt/grace"`
- Without entry (TOC only): `"unfoldingWord/en_tw"`

---

## 2. Modal State Management (Zustand Store)

### Store Structure

```tsx
// File: apps/tc-study/src/store/studyStore.ts

interface ModalState {
  isOpen: boolean              // Is modal visible?
  isMinimized: boolean         // Future: minimize to corner
  resourceKey: string | null   // Current resource#entry key
  history: string[]            // Stack of visited entries
  historyIndex: number         // Current position in history
}
```

### Opening Modal with History

```tsx
openModal: (resourceKey: string) => {
  set((state) => {
    const { modal } = state
    
    // Create new history: slice off forward history, add new entry
    const newHistory = [
      ...modal.history.slice(0, modal.historyIndex + 1),
      resourceKey,
    ]

    return {
      modal: {
        ...modal,
        isOpen: true,
        isMinimized: false,
        resourceKey,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      },
    }
  })
}
```

**History Behavior:**
- When opening a new entry, it truncates forward history
- Each entry becomes a history item
- Similar to browser history: Back/Forward navigation

### Navigation in History

```tsx
modalGoBack: () => {
  const { modal } = get()
  if (modal.historyIndex > 0) {
    set((state) => {
      const newIndex = modal.historyIndex - 1
      return {
        modal: {
          ...state.modal,
          historyIndex: newIndex,
          resourceKey: modal.history[newIndex],  // ✅ Load from history
        },
      }
    })
  }
}

modalGoForward: () => {
  const { modal } = get()
  if (modal.historyIndex < modal.history.length - 1) {
    set((state) => {
      const newIndex = modal.historyIndex + 1
      return {
        modal: {
          ...state.modal,
          historyIndex: newIndex,
          resourceKey: modal.history[newIndex],  // ✅ Load from history
        },
      }
    })
  }
}
```

---

## 3. Modal Component (EntryResourceModal)

### Props & State

```tsx
// File: apps/tc-study/src/components/common/EntryResourceModal.tsx

interface EntryResourceModalProps {
  onEntryLinkClick?: (resourceId: string, entryId?: string) => void
}

export function EntryResourceModal({ onEntryLinkClick }: EntryResourceModalProps) {
  // Access modal state from store
  const modalState = useStudyStore((s: any) => s.modal)
  const closeModal = useStudyStore((s: any) => s.closeModal)
  const modalGoBack = useStudyStore((s: any) => s.modalGoBack)
  const modalGoForward = useStudyStore((s: any) => s.modalGoForward)
  
  // Load resources and metadata
  const loadedResources = useAppStore((s) => s.loadedResources)
  const catalogManager = useCatalogManager()
  
  // Local state for metadata fetching
  const [resourceMetadata, setResourceMetadata] = useState<any>(null)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
```

### Parsing Resource Key

```tsx
// Extract resourceId and entryId from modalState
const resourceId = modalState.resourceKey ? modalState.resourceKey.split('#')[0] : null
const entryId = modalState.resourceKey?.includes('#') ? modalState.resourceKey.split('#')[1] : null

// Examples:
// "unfoldingWord/en_tw#bible/kt/grace" → resourceId="unfoldingWord/en_tw", entryId="bible/kt/grace"
// "unfoldingWord/en_tw" → resourceId="unfoldingWord/en_tw", entryId=null
```

### Loading Metadata

```tsx
useEffect(() => {
  if (!modalState.isOpen || !resourceId) return
  
  // If resource is not in loadedResources, fetch from catalog
  if (!resource && resourceId && catalogManager && !loadingMetadata) {
    console.log('[EntryResourceModal] Fetching from catalog:', resourceId)
    setLoadingMetadata(true)
    
    catalogManager.getResourceMetadata(resourceId)
      .then((metadata) => {
        if (metadata) {
          setResourceMetadata(metadata)
        }
      })
      .catch((err) => {
        console.error('[EntryResourceModal] Failed to load metadata:', err)
      })
      .finally(() => {
        setLoadingMetadata(false)
      })
  } else if (resource) {
    // Clear catalog metadata if we have loaded resource
    setResourceMetadata(null)
  }
}, [resource, resourceId, catalogManager, loadingMetadata, modalState.isOpen])
```

**Data Sources (Priority Order):**
1. **Loaded Resources** (`loadedResources[resourceId]`) - Already in memory
2. **Catalog Metadata** (`catalogManager.getResourceMetadata()`) - Fetch if needed

### Resource Info Assembly

```tsx
// Determine resource info - prefer loaded resource, fallback to catalog metadata
const resourceInfo = resource || (resourceMetadata ? {
  id: resourceId,
  key: resourceId,
  title: resourceMetadata.title || resourceId,
  type: resourceMetadata.type || 'words',
  metadata: resourceMetadata,
} : null)

// Extract entry term from entryId
// "bible/kt/grace" → "grace"
const entryTerm = entryId ? entryId.split('/').pop() || entryId : null
```

---

## 4. Passing Data to Child Viewers

### Translation Words Viewer

```tsx
// If we have an entryId, render the specific entry
if (entryId && resourceId) {
  return (
    <TranslationWordsViewer
      resourceKey={resourceId}
      metadata={resourceInfo?.metadata || resourceMetadata || resourceInfo || undefined}
      initialEntryId={entryId}
      onEntryLinkClick={handleOpenEntry}
    />
  )
}

// If no entryId, show the TOC
if (resourceInfo?.type === 'words') {
  return (
    <TranslationWordsViewer
      resourceKey={resourceId}
      metadata={resourceInfo?.metadata || resourceMetadata || resourceInfo}
      onEntryLinkClick={handleOpenEntry}
    />
  )
}
```

**Props Passed:**
- `resourceKey`: Resource identifier (without entry)
- `metadata`: Full metadata object (from loaded resource or catalog)
- `initialEntryId`: (Optional) Entry to display initially
- `onEntryLinkClick`: Handler for navigating to other entries within modal

---

## 5. Modal UI & History Display

### Header with History Controls

```tsx
<div className="flex items-center justify-between px-4 py-3 border-b">
  {/* History Navigation */}
  <div className="flex items-center gap-1">
    <button
      onClick={modalGoBack}
      disabled={!canModalGoBack()}
      aria-label="Back"
    >
      <ArrowLeft />
    </button>
    
    <button
      onClick={modalGoForward}
      disabled={!canModalGoForward()}
      aria-label="Forward"
    >
      <ArrowRight />
    </button>
    
    {/* History position indicator */}
    <span className="text-xs text-gray-500 font-mono">
      {modalState.historyIndex + 1}/{modalState.history.length}
    </span>
  </div>

  {/* Resource title */}
  <div className="flex-1 mx-4 truncate text-center">
    <h2 className="text-sm font-medium">
      {entryTerm || resourceInfo?.title || resourceId}
    </h2>
  </div>

  {/* Close Button */}
  <button onClick={closeModal}>
    <X />
  </button>
</div>
```

---

## 6. Signal System (Cross-Panel Communication)

### Signal Definition

```tsx
// File: packages/resource-signals/src/links.ts

export interface EntryLinkClickSignal extends BaseSignal {
  type: 'entry-link-click'
  link: {
    resourceType: string    // 'words', 'academy', etc.
    resourceId: string      // e.g., 'unfoldingWord/en_tw'
    entryId: string         // e.g., 'bible/kt/grace'
    text: string            // Display text
  }
}
```

### Signal Validation & Handling

```tsx
// File: apps/tc-study/src/plugins/messageTypePlugins.ts

// Validator ensures signal has correct structure
function isEntryLinkClickSignal(content: unknown): content is EntryLinkClickSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as any
  
  if (message.type !== 'entry-link-click') return false
  if (message.lifecycle !== 'event') return false
  if (!message.link || typeof message.link !== 'object') return false
  if (typeof message.link.resourceType !== 'string') return false
  if (typeof message.link.resourceId !== 'string') return false
  if (typeof message.link.entryId !== 'string') return false
  if (typeof message.link.text !== 'string') return false
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false
  
  return true
}

// Handler logs the signal (can be extended for cross-panel logic)
function handleEntryLinkClick(message: any) {
  const signal = message.content as EntryLinkClickSignal
  console.log(`🔗 Entry Link Click: ${signal.link.text} (${signal.link.resourceId}#${signal.link.entryId})`)
}

// Plugin registration
export const entryLinkClickPlugin: MessageTypePlugin<EntryLinkClickSignal> = createPlugin({
  name: 'entry-link-click-plugin',
  version: '1.0.0',
  messageTypes: { 'entry-link-click': {} as EntryLinkClickSignal },
  validators: { 'entry-link-click': isEntryLinkClickSignal },
  handlers: { 'entry-link-click': handleEntryLinkClick }
})
```

---

## 7. Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER CLICKS TW LINK                                         │
│    "grace" in Translation Words Links Viewer                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. SIGNAL BROADCAST                                             │
│    useSignal<EntryLinkClickSignal>('entry-link-click')         │
│    {                                                             │
│      link: {                                                     │
│        resourceType: 'words',                                    │
│        resourceId: 'unfoldingWord/en_tw',                       │
│        entryId: 'bible/kt/grace',                               │
│        text: 'grace'                                             │
│      }                                                            │
│    }                                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PARENT HANDLER                                               │
│    handleOpenEntry(resourceId, entryId)                         │
│    → Constructs resourceKey: "unfoldingWord/en_tw#bible/kt/..."│
│    → Calls openModal(resourceKey)                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. STUDY STORE (Zustand)                                        │
│    modal: {                                                      │
│      isOpen: true,                                               │
│      resourceKey: "unfoldingWord/en_tw#bible/kt/grace",        │
│      history: [                                                  │
│        "unfoldingWord/en_tw#bible/kt/apostle",  ← Previous     │
│        "unfoldingWord/en_tw#bible/kt/grace"      ← Current     │
│      ],                                                          │
│      historyIndex: 1                                             │
│    }                                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. ENTRY RESOURCE MODAL                                         │
│    • Reads modalState.resourceKey                               │
│    • Parses: resourceId="unfoldingWord/en_tw"                  │
│              entryId="bible/kt/grace"                           │
│    • Checks loadedResources[resourceId] → Not found            │
│    • Falls back to catalogManager.getResourceMetadata()        │
│    • Receives: {                                                 │
│        title: "unfoldingWord® Translation Words",               │
│        type: "words",                                            │
│        owner: "unfoldingWord",                                   │
│        languageCode: "en",                                       │
│        ...                                                        │
│      }                                                            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. TRANSLATION WORDS VIEWER                                     │
│    Props:                                                        │
│      resourceKey="unfoldingWord/en_tw"                          │
│      metadata={...}                                              │
│      initialEntryId="bible/kt/grace"                            │
│      onEntryLinkClick={handleOpenEntry}                         │
│                                                                  │
│    • Loads content for "grace" entry                            │
│    • Displays markdown article                                  │
│    • If user clicks another TW link → calls onEntryLinkClick   │
│      → Loop back to step 3                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. History Navigation Example

### Initial State
```tsx
history: ["unfoldingWord/en_tw#bible/kt/apostle"]
historyIndex: 0
```

### User clicks "grace" link
```tsx
openModal("unfoldingWord/en_tw#bible/kt/grace")
// Truncates forward history, appends new entry
history: ["unfoldingWord/en_tw#bible/kt/apostle", "unfoldingWord/en_tw#bible/kt/grace"]
historyIndex: 1
```

### User clicks Back button
```tsx
modalGoBack()
// Moves index back, loads previous entry
history: ["unfoldingWord/en_tw#bible/kt/apostle", "unfoldingWord/en_tw#bible/kt/grace"]
historyIndex: 0
resourceKey: "unfoldingWord/en_tw#bible/kt/apostle"
```

### User clicks Forward button
```tsx
modalGoForward()
// Moves index forward, loads next entry
history: ["unfoldingWord/en_tw#bible/kt/apostle", "unfoldingWord/en_tw#bible/kt/grace"]
historyIndex: 1
resourceKey: "unfoldingWord/en_tw#bible/kt/grace"
```

### User clicks "faith" link (while at index 0)
```tsx
openModal("unfoldingWord/en_tw#bible/kt/faith")
// Truncates forward history from index 0, appends new
history: ["unfoldingWord/en_tw#bible/kt/apostle", "unfoldingWord/en_tw#bible/kt/faith"]
historyIndex: 1
// Note: "grace" is removed from history (forward branch truncated)
```

---

## 9. Key Takeaways

### Data Sources
1. **Loaded Resources** - Already in memory from panels
2. **Catalog Metadata** - Fetched on-demand for unloaded resources
3. **Entry Content** - Loaded by child viewers (TranslationWordsViewer)

### History Management
- Uses **array-based stack** similar to browser history
- **Back/Forward** navigate through visited entries
- **New links** truncate forward history
- Persists **full resourceKey** (including entry ID) for each history item

### Content Passing
- **Props-based** flow to child viewers
- **Metadata** passed as complete object
- **Entry ID** extracted from `resourceKey` format

### Signal System
- **Broadcasts** entry clicks across panels
- **Validates** signal structure with plugins
- **Extensible** for future cross-panel interactions

---

## 10. Future Enhancements

### Potential Improvements
1. **Persist modal history** across page reloads (localStorage)
2. **Preview on hover** for entry links
3. **Breadcrumb navigation** showing entry path
4. **Minimize to corner** for multitasking
5. **Deep linking** to specific entries via URL params
6. **Cross-resource links** (TW → TA articles)

### 11. Entry Viewer Registry (NEW)

As of the latest update, the Entry Modal uses an **Entry Viewer Registry** for extensible viewer management:

### How It Works

Instead of hardcoded viewer logic, the modal now:

```tsx
// Get appropriate viewer from registry
const EntryViewer = entryViewerRegistry.getEntryViewer({
  type: metadata?.type,
  subject: metadata?.subject,
  resourceId: resourceId,
  owner: metadata?.owner,
  languageCode: metadata?.languageCode,
})

// Render the viewer
<EntryViewer
  resourceKey={resourceId}
  entryId={entryId}
  metadata={metadata}
  onEntryLinkClick={handleOpenEntry}
/>
```

### Benefits

- ✅ **Extensible** - Developers can register custom entry viewers
- ✅ **Type-safe** - All viewers implement `BaseEntryViewerProps`
- ✅ **Matcher-based** - Flexible viewer selection logic
- ✅ **Priority system** - Control which viewer is selected when multiple match

**See**: `ENTRY_VIEWER_REGISTRY.md` for complete documentation

---

## Related Documentation
- `ENTRY_VIEWER_REGISTRY.md` - Entry viewer registration system
- `RESOURCE_PANELS_INTEGRATION_SUMMARY.md` - Panel system overview
- `CROSS-PANEL-COMMUNICATION-SPEC.md` - Signal system details
- `packages/resource-signals/README.md` - Signal definitions

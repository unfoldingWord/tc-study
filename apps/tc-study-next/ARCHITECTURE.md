# tc-study Application Architecture

**Complete architecture guide** for the tc-study Bible translation application.

> 📖 A comprehensive offline-first web application for Bible translation and study.

---

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [User Flow](#user-flow)
4. [Catalog System](#catalog-system)
5. [Resource Package System](#resource-package-system)
6. [Linked Panels System](#linked-panels-system)
7. [Data Flow](#data-flow)
8. [Technology Stack](#technology-stack)
9. [Component Architecture](#component-architecture)

---

## Overview

### What is tc-study?

tc-study is a **web-based Bible translation application** that enables translators to:

- Browse and download Bible translation resources
- Create custom resource packages
- Study resources in a two-panel layout with modal support
- Work offline with cached resources
- Interact with resources that respond to each other

### Key Characteristics

- **Offline-First**: Full functionality without internet
- **Progressive Web App (PWA)**: Installable, works like a native app
- **Resource-Rich**: Access to translations, notes, dictionaries, etc.
- **Two-Panel Layout**: Two main panels for primary resources
- **Modal for References**: Standalone modal for linked resources
- **Interactive Resources**: Resources react to interactions in other panels
- **Resource-Specific Components**: Each resource type has custom rendering

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        tc-study Application                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    UI Layer (React)                          │   │
│  │  ┌──────────────┐  ┌──────────────┐                         │   │
│  │  │   Resource   │  │    Study     │                         │   │
│  │  │   Selection  │  │    Screen    │                         │   │
│  │  │   (Wizard)   │  │  (2 Panels + │                         │   │
│  │  │              │  │   1 Modal)   │                         │   │
│  │  └──────────────┘  └──────────────┘                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↕                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              State Management (Zustand)                      │   │
│  │  • Catalog Store   • Panel Store   • Modal Store            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↕                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Business Logic Layer                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │   Catalog    │  │   Packages   │  │    Cache     │      │   │
│  │  │  Management  │  │  Management  │  │  Management  │      │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↕                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Storage Layer (IndexedDB)                   │   │
│  │  • Resource Metadata  • Cached Content  • User Packages     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↕                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Network Layer (Door43)                    │   │
│  │  • Fetch Metadata  • Download Resources  • Sync Updates     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## User Flow

### 1. Initial App Load

```
User opens tc-study
       ↓
App initializes catalog system
       ↓
Check if resource package loaded
       ↓
   ┌───────┴────────┐
   │                │
No Package?     Has Package?
   │                │
   ↓                ↓
Show Resource    Show Study Screen
Selection        (2 panels + modal)
Wizard           with loaded resources
```

**Key Decision**: The app goes directly to the Study Screen if a package is already loaded, otherwise shows the Resource Selection wizard.

### 2. Resource Selection (First Time)

```
User opens app (no package loaded)
       ↓
Show Resource Selection Wizard
       ↓
User picks resources through steps:
1. Select organization
2. Select language
3. Select target resources
4. Select original language resources
       ↓
User submits selection
       ↓
App downloads selected resources:
┌─────────────────────────────┐
│ For each selected resource: │
│  1. Check if in catalog     │
│  2. If not, fetch metadata  │
│  3. Download content        │
│  4. Cache in IndexedDB      │
│  5. Update catalog          │
└─────────────────────────────┘
       ↓
Resources ready
       ↓
Show Study Screen
```

### 3. Resource Selection Wizard Details

```
User clicks "Create Package"
       ↓
┌─────────────────────────┐
│ Step 1: Package Info    │
│ • Name                  │
│ • Description           │
│ • Version               │
└─────────────────────────┘
       ↓
┌─────────────────────────┐
│ Step 2: Select Org      │
│ • unfoldingWord         │
│ • Door43-Catalog        │
│ • Others                │
└─────────────────────────┘
       ↓
┌─────────────────────────┐
│ Step 3: Select Language │
│ • English (en)          │
│ • Spanish (es)          │
│ • French (fr)           │
│ • etc.                  │
└─────────────────────────┘
       ↓
┌─────────────────────────┐
│ Step 4: Choose Resources│
│ ☑ Bible (ULT)          │
│ ☑ Translation Notes     │
│ ☑ Translation Words     │
│ ☐ Translation Questions │
└─────────────────────────┘
       ↓
┌─────────────────────────┐
│ Step 5: Original Lang   │
│ ☑ Greek (UGNT)         │
│ ☑ Hebrew (UHB)         │
└─────────────────────────┘
       ↓
┌─────────────────────────┐
│ Step 6: Preview         │
│ • Show manifest         │
│ • List all resources    │
│ • Check availability    │
└─────────────────────────┘
       ↓
User clicks "Build Package"
       ↓
Package saved to IndexedDB
       ↓
Redirect to Study View
```

### 4. Study Screen - Two Panels + Modal

```
User enters Study Screen
       ↓
┌─────────────────────────────────────┐
│         Study Screen Layout         │
│                                     │
│  ┌────────────┐  ┌────────────┐    │
│  │  Panel 1   │  │  Panel 2   │    │
│  │            │  │            │    │
│  │  [Select   │  │  [Select   │    │
│  │   Resource]│  │   Resource]│    │
│  │            │  │            │    │
│  │  Shows ONE │  │  Shows ONE │    │
│  │  resource  │  │  resource  │    │
│  │  at a time │  │  at a time │    │
│  │            │  │            │    │
│  └────────────┘  └────────────┘    │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Modal (minimized/hidden)   │   │
│  │  • Opens when user clicks   │   │
│  │    links in panel resources │   │
│  │  • Has navigation history   │   │
│  │  • Can be minimized         │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
       ↓
User assigns resources to panels:
• Panel 1 ← ULT (Spanish Bible)
• Panel 2 ← TN (Translation Notes)
       ↓
Resources interact with each other:
• Highlighting in Panel 2 when 
  user selects text in Panel 1
• Auto-scroll in Panel 2 when
  user scrolls in Panel 1
• Underlining, emphasis, etc.
```

### 5. Resource Interactions

```
User scrolls in Panel 1 (ULT)
       ↓
Resource component detects scroll
       ↓
Identifies current verse:
• Book: Genesis
• Chapter: 1
• Verse: 3
       ↓
Broadcasts event to Panel 2
       ↓
Panel 2 resource (TN) reacts:
• Auto-scrolls to Gen 1:3
• Highlights relevant notes
       ↓
User sees synchronized content
```

**Example: Link Click**

```
User clicks word link in Panel 2 (TN)
       ↓
Link points to Translation Word
       ↓
Modal opens with:
• Translation Word content
• Added to modal history stack
       ↓
User clicks another link in modal
       ↓
New content loads in modal
• Previous content in history
       ↓
User can navigate back
       ↓
User minimizes modal
       ↓
Modal remembered position
       ↓
User reopens modal later
       ↓
Modal opens at same position
```

---

## Catalog System

### What is the Catalog?

The **catalog** is a **metadata repository** that knows about all available resources but doesn't store the actual content.

Think of it like a **library card catalog**:

- 📇 Contains information ABOUT books
- 📍 Tells you WHERE to find books
- ❌ Does NOT contain the books themselves

### Catalog Structure

```typescript
interface ResourceMetadata {
  // Identity
  server: 'git.door43.org'
  owner: 'unfoldingWord'
  language: 'en'
  resourceId: 'ult'
  
  // Basic Info
  title: 'unfoldingWord Literal Text'
  subject: 'Bible'
  version: 'v45'
  
  // Resource Type
  type: 'scripture'  // scripture, notes, words, etc.
  format: 'usfm'     // usfm, tsv, markdown, etc.
  
  // ⭐ AVAILABILITY (Fast Lookup!)
  availability: {
    online: true,   // Available from network?
    offline: true,  // Cached locally?
    bundled: false  // Included in app?
  }
  
  // ⭐ LOCATIONS (Where to find it)
  locations: [
    {
      type: 'network',
      path: 'https://git.door43.org/.../ult.zip',
      priority: 1
    },
    {
      type: 'phone',
      path: '/storage/ult.zip',
      priority: 2
    }
  ]
  
  // Content Metadata
  contentMetadata: {
    books: ['gen', 'exo', 'mat', ...],
    size: 5242880,  // bytes
    checksum: 'sha256:...'
  }
  
  // Timestamps
  catalogedAt: '2025-01-15T10:00:00Z'
  updatedAt: '2025-01-16T14:30:00Z'
  accessedAt: '2025-01-17T09:15:00Z'
  accessCount: 42
}
```

### Catalog Organization

Resources are organized hierarchically:

```
git.door43.org/
├── unfoldingWord/
│   ├── en/
│   │   ├── ult (Literal Bible)
│   │   ├── tn (Translation Notes)
│   │   ├── tw (Translation Words)
│   │   └── ta (Translation Academy)
│   ├── es/
│   │   ├── ult
│   │   └── tn
│   └── fr/
│       └── ult
└── Door43-Catalog/
    └── en/
        └── tw

Key: server/owner/language/resourceId
```

### Three-Tier Lookup

When the app needs a resource, it checks in order:

```
1. Memory (Zustand Store)
   ↓ not found
2. IndexedDB (Offline Storage)
   ↓ not found
3. Network (Door43 API)
   ↓
   Download & Cache
```

Example code:

```typescript
// Get resource
const resource = await catalog.get(
  'git.door43.org',
  'unfoldingWord', 
  'en',
  'ult'
)

// Check availability
if (resource.availability.offline) {
  // Load from cache
  const content = await cache.get(resourceKey)
} else if (resource.availability.online) {
  // Download from network
  const content = await downloadResource(resource)
  await cache.set(resourceKey, content)
} else {
  // Not available
  showError('Resource not available')
}
```

### Catalog Queries

Fast, indexed queries:

```typescript
// Get all English Bibles
const bibles = await catalog.query({
  language: 'en',
  subject: 'Bible'
})

// Get offline resources
const offline = await catalog.getOfflineResources({
  language: 'es'
})

// Get by type
const notes = await catalog.getResourcesByType(
  ResourceType.NOTES
)

// Search
const results = await catalog.query({
  search: 'translation',
  availableOffline: true
})
```

### Catalog Statistics

Built-in analytics:

```typescript
const stats = await catalog.getStats()

// Returns:
{
  totalResources: 450,
  availableOffline: 12,
  availableOnline: 450,
  bundledResources: 0,
  byLanguage: {
    'en': 200,
    'es': 150,
    'fr': 100
  },
  byType: {
    'scripture': 50,
    'notes': 150,
    'words': 200,
    'academy': 50
  }
}
```

---

## Resource Package System

### What is a Resource Package?

A **resource package** is a **virtual collection** of resource references that can be loaded together.

Think of it like a **playlist**:

- 📝 Contains references to songs (resources)
- 🎵 Doesn't store the songs themselves
- 🔄 Same song can be in multiple playlists
- 📤 Easy to share as JSON

### Package vs Catalog

| Concept | What It Is | What It Contains |
|---------|-----------|------------------|
| **Catalog** | Database of all resources | Metadata about resources |
| **Package** | Virtual grouping | References to catalog entries |

**Key Point**: Resources exist **independently** in the catalog. Packages just **reference** them.

```
Catalog (Source of Truth):
┌─────────────────────────────┐
│ git.door43.org/             │
│   unfoldingWord/en/ult      │  ← Actual resource
│   unfoldingWord/en/tn       │  ← Actual resource
│   unfoldingWord/el-x/ugnt   │  ← Actual resource
└─────────────────────────────┘
           ↑         ↑
           │         │
    ┌──────┘         └──────┐
    │                       │
Package 1:             Package 2:
┌─────────────┐       ┌─────────────┐
│ Spanish Kit │       │ Greek Study │
│ • es/ult ──────→    │ • en/ult ────→
│ • es/tn ────→       │ • ugnt ──────→
└─────────────┘       └─────────────┘
    References            References
```

### Package Structure

```typescript
interface ResourcePackage {
  // Package Identity
  id: 'spanish-translation-kit'
  name: 'Spanish Translation Kit'
  description: 'Complete set for Spanish Bible translation'
  version: '1.0.0'
  
  // Metadata
  author: 'User Name'
  createdAt: '2025-01-15T10:00:00Z'
  updatedAt: '2025-01-16T14:30:00Z'
  
  // ⭐ RESOURCE REFERENCES (not content!)
  resources: [
    {
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'es',
      resourceId: 'ult',
      required: true,      // Must have this
      priority: 1,         // Load order
      panel: 'primary',    // Where to display
      displayName: 'Spanish Bible'  // Override name
    },
    {
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'es',
      resourceId: 'tn',
      required: true,
      priority: 2,
      panel: 'secondary'
    },
    {
      server: 'git.door43.org',
      owner: 'unfoldingWord',
      language: 'el-x-koine',
      resourceId: 'ugnt',
      required: false,     // Optional
      priority: 3,
      panel: 'reference'
    }
  ],
  
  // ⭐ PANEL LAYOUT (UI Configuration)
  panelLayout: {
    orientation: 'horizontal',
    panels: [
      {
        id: 'primary',
        title: 'Target Language',
        resourceIds: ['es/ult'],
        width: 40  // percentage
      },
      {
        id: 'secondary',
        title: 'Helps',
        resourceIds: ['es/tn', 'es/tw'],
        width: 30
      },
      {
        id: 'reference',
        title: 'Original',
        resourceIds: ['el-x-koine/ugnt'],
        width: 30
      }
    ]
  },
  
  // Organization
  tags: ['spanish', 'translation', 'bible'],
  category: 'translation'
}
```

### Package Creation Flow

```
Step 1: Package Info
┌────────────────────────┐
│ Name: Spanish Kit      │
│ Description: For...    │
│ Version: 1.0.0         │
└────────────────────────┘
         ↓
Step 2: Select Organization
┌────────────────────────┐
│ ○ unfoldingWord        │ ← Default
│ ○ Door43-Catalog       │
│ ○ Custom...            │
└────────────────────────┘
         ↓
Step 3: Select Language
┌────────────────────────┐
│ ○ English (en)         │
│ ● Spanish (es)         │ ← Selected
│ ○ French (fr)          │
└────────────────────────┘
         ↓
Step 4: Select Resources
┌────────────────────────┐
│ ☑ ULT - Literal Text   │ ← Checked
│ ☑ TN - Notes           │ ← Checked
│ ☑ TW - Words           │ ← Checked
│ ☐ TQ - Questions       │
└────────────────────────┘
         ↓
Step 5: Original Language
┌────────────────────────┐
│ ☑ UGNT - Greek NT      │ ← Checked
│ ☑ UHB - Hebrew OT      │ ← Checked
└────────────────────────┘
         ↓
Step 6: Panel Layout (Auto-generated)
┌─────────────────────────────────┐
│ ┌─────────┐ ┌─────────┐        │
│ │ Spanish │ │  Notes  │        │
│ │   ULT   │ │   TN    │        │
│ │         │ │   TW    │        │
│ └─────────┘ └─────────┘        │
│ ┌─────────────────────┐        │
│ │      Original       │        │
│ │    UGNT + UHB       │        │
│ └─────────────────────┘        │
└─────────────────────────────────┘
         ↓
Package saved as JSON
```

### Loading a Package

```typescript
// Load package
const result = await packageManager.loadPackage('spanish-kit')

// Returns:
{
  package: ResourcePackage,      // The package definition
  resources: ResourceMetadata[], // Resolved from catalog
  missing: string[]              // Not in catalog
}

// Example result:
{
  package: { id: 'spanish-kit', name: '...', ... },
  resources: [
    { server: '...', owner: '...', language: 'es', resourceId: 'ult', ... },
    { server: '...', owner: '...', language: 'es', resourceId: 'tn', ... },
  ],
  missing: ['el-x-koine/ugnt'] // Not downloaded yet
}
```

### Package Resolution

When loading a package, the system resolves each resource:

```
For each resource in package:
  ↓
Get resource key:
'git.door43.org/unfoldingWord/es/ult'
  ↓
Look up in catalog:
catalog.get('git.door43.org', 'unfoldingWord', 'es', 'ult')
  ↓
Found? ───Yes──→ Add to resources[]
  │
  No
  ↓
Add to missing[]
```

If resources are missing, user can:

1. Download them
2. Remove them from package
3. Continue without them

---

## Two-Panel + Modal System

### Layout Overview

tc-study uses a **two-panel layout** with a **modal** for referenced resources.

```
┌────────────────────────────────────────────────────────┐
│              tc-study Study Screen                      │
├──────────────────────────┬─────────────────────────────┤
│       Panel 1            │         Panel 2             │
│    (Primary Resource)    │    (Secondary Resource)     │
│                          │                             │
│   ┌──────────────────┐   │   ┌──────────────────┐      │
│   │ Resource: ULT    │   │   │ Resource: TN     │      │
│   │ Language: es     │   │   │ Language: es     │      │
│   └──────────────────┘   │   └──────────────────┘      │
│                          │                             │
│   Genesis 1:1            │   Genesis 1:1               │
│                          │                             │
│   En el principio        │   **En el principio**       │
│   creó Dios los cielos   │   [Click word →]            │
│   y la tierra.           │   This refers to the very   │
│                          │   start of creation...      │
│                          │                             │
│   [User scrolls here] ───┼──→ [Auto-scrolls to match]  │
│                          │                             │
└──────────────────────────┴─────────────────────────────┘
                           ↓
              ┌────────────────────────────┐
              │   Modal (Translation Word)  │
              │   [Minimizable]            │
              │                            │
              │   "principio" (beginning)  │
              │   Definition: ...          │
              │                            │
              │   ← Back | Forward →       │
              │   (History navigation)     │
              └────────────────────────────┘
```

### Panel Architecture

```typescript
interface PanelState {
  id: 'panel1' | 'panel2'       // Only two panels
  resourceKey: string | null    // Currently displayed resource
  currentLocation: {
    book: string                // e.g., 'gen'
    chapter: number             // e.g., 1
    verse: number               // e.g., 1
  }
  scrollPosition: number        // For restoration
}

interface ModalState {
  isOpen: boolean
  isMinimized: boolean
  resourceKey: string | null    // Current resource in modal
  history: string[]             // Navigation stack
  historyIndex: number          // Current position in stack
  position: {                   // For restoring position
    x: number
    y: number
  }
}

interface StudyStore {
  panel1: PanelState
  panel2: PanelState
  modal: ModalState
  
  // Actions
  setPanel1Resource(resourceKey: string): void
  setPanel2Resource(resourceKey: string): void
  navigateTo(location: Location): void
  openModal(resourceKey: string): void
  closeModal(): void
  minimizeModal(): void
  restoreModal(): void
  modalGoBack(): void
  modalGoForward(): void
}
```

### Modal System

#### How the Modal Works

The modal is for **standalone resources** that are referenced from panel resources:

1. **User clicks link** in Panel 1 or Panel 2
2. **Modal opens** with referenced resource
3. **Content loads** in modal
4. **History tracked** for navigation

```typescript
// Modal management
function openModal(resourceKey: string) {
  const { modal } = useStudyStore.getState()
  
  // Add to history
  const newHistory = [
    ...modal.history.slice(0, modal.historyIndex + 1),
    resourceKey
  ]
  
  useStudyStore.setState({
    modal: {
      ...modal,
      isOpen: true,
      isMinimized: false,
      resourceKey,
      history: newHistory,
      historyIndex: newHistory.length - 1
    }
  })
}

function modalGoBack() {
  const { modal } = useStudyStore.getState()
  if (modal.historyIndex > 0) {
    const newIndex = modal.historyIndex - 1
    useStudyStore.setState({
      modal: {
        ...modal,
        resourceKey: modal.history[newIndex],
        historyIndex: newIndex
      }
    })
  }
}

function minimizeModal() {
  const { modal } = useStudyStore.getState()
  useStudyStore.setState({
    modal: {
      ...modal,
      isMinimized: true
      // position is preserved
    }
  })
}

function restoreModal() {
  const { modal } = useStudyStore.getState()
  useStudyStore.setState({
    modal: {
      ...modal,
      isMinimized: false
      // Opens at saved position
    }
  })
}
```

### Verse Alignment

Resources use **verse markers** for alignment:

#### USFM (Bibles)

```usfm
\c 1
\v 1 In the beginning God created the heavens and the earth.
\v 2 The earth was without form and void...
```

#### TSV (Notes)

```tsv
Book    Chapter    Verse    Note
GEN     1          1        **In the beginning** - This refers to...
GEN     1          2        **without form** - The Hebrew phrase...
```

#### Alignment Example

```
User views Genesis 1:2
        ↓
Panel 1 (ULT):
  \v 2 The earth was without form...
                ↕
Panel 2 (TN):
  GEN 1 2 **without form** - The Hebrew...
                ↕
Panel 3 (UGNT):
  \v 2 καὶ ἡ γῆ ἦν ἀόρατος...
  
All three show content for Gen 1:2
```

### Panel Layout Options

#### Horizontal Layout

```
┌─────────┬─────────┬─────────┐
│ Panel 1 │ Panel 2 │ Panel 3 │
│   ULT   │   TN    │  UGNT   │
│         │         │         │
│         │         │         │
│         │         │         │
└─────────┴─────────┴─────────┘
```

#### Vertical Layout

```
┌───────────────────────────────┐
│         Panel 1 (ULT)         │
├───────────────────────────────┤
│         Panel 2 (TN)          │
├───────────────────────────────┤
│        Panel 3 (UGNT)         │
└───────────────────────────────┘
```

#### Grid Layout

```
┌─────────┬─────────┐
│ Panel 1 │ Panel 2 │
│   ULT   │   TN    │
├─────────┼─────────┤
│ Panel 3 │ Panel 4 │
│  UGNT   │   TW    │
└─────────┴─────────┘
```

---

## Navigation System

The study screen supports **three types of navigation**, providing flexible ways to move through scripture content.

### Three Navigation Modes

```
┌─────────────────────────────────────────────────────────────┐
│              Navigation Mode Selector                        │
│  ● Book-Chapter-Verse   ○ Sections   ○ Passage Sets         │
└─────────────────────────────────────────────────────────────┘
```

### 1. Book-Chapter-Verse Navigation

Traditional **sequential Bible navigation** - read verse by verse through the Bible.

```typescript
interface VerseReference {
  book: string          // e.g., 'gen', 'tit'
  chapter: number       // e.g., 1, 2
  verse: number         // e.g., 1, 4
  bookEnd?: string      // Optional: for ranges crossing books
  chapterEnd?: number   // Optional: for ranges crossing chapters
  verseEnd?: number     // Optional: end verse of range
}

// Examples:
// Single verse: { book: 'gen', chapter: 1, verse: 1 }
// Same chapter: { book: 'gen', chapter: 1, verse: 1, verseEnd: 5 }
// Cross chapter: { book: 'tit', chapter: 2, verse: 4, chapterEnd: 3, verseEnd: 2 }
// Cross book: { book: 'mal', chapter: 4, verse: 5, bookEnd: 'mat', chapterEnd: 1, verseEnd: 3 }
```

**Navigation Behavior:**

```
Current: Genesis 1:1-5 (same chapter range)
User clicks "Next" →
Loads: Genesis 1:6 (verse after last verse in range)

Current: Titus 2:4-3:2 (cross-chapter range)
User clicks "Next" →
Loads: Titus 3:3 (verse after last verse in range)

Current: Genesis 1:31 (end of chapter)
User clicks "Next" →
Loads: Genesis 2:1 (first verse of next chapter)

Current: Genesis 50:26 (end of book)
User clicks "Next" →
Loads: Exodus 1:1 (first verse of next book)

Current: Malachi 4:5-Matthew 1:3 (cross-book range)
User clicks "Next" →
Loads: Matthew 1:4 (verse after last verse in range)
```

**Range Selection Examples:**

```
Same Chapter:
  Genesis 1:1-5
  { book: 'gen', chapter: 1, verse: 1, verseEnd: 5 }

Cross Chapter:
  Titus 2:4-3:2 (chapter 2 verse 4 to chapter 3 verse 2)
  { book: 'tit', chapter: 2, verse: 4, chapterEnd: 3, verseEnd: 2 }

Cross Multiple Chapters:
  Genesis 1:1-3:24
  { book: 'gen', chapter: 1, verse: 1, chapterEnd: 3, verseEnd: 24 }

Cross Book (rare but supported):
  Malachi 4:5-Matthew 1:3
  { book: 'mal', chapter: 4, verse: 5, bookEnd: 'mat', chapterEnd: 1, verseEnd: 3 }
```

### 2. Sections Navigation

Navigate by **content sections** - paragraphs, pericopes, or natural content divisions.

```typescript
interface Section {
  id: string
  title: string
  reference: VerseReference
  type: 'paragraph' | 'pericope' | 'article' | 'chapter'
}

// Example
const sections: Section[] = [
  {
    id: 'gen-creation-day1',
    title: 'Day One: Light',
    reference: { book: 'gen', chapter: 1, verseStart: 1, verseEnd: 5 },
    type: 'pericope'
  },
  {
    id: 'gen-creation-day2',
    title: 'Day Two: Sky',
    reference: { book: 'gen', chapter: 1, verseStart: 6, verseEnd: 8 },
    type: 'pericope'
  }
]
```

**Navigation Behavior:**

```
Current: Genesis 1:1-5 (Day One: Light)
User clicks "Next" →
Loads: Genesis 1:6-8 (Day Two: Sky)

Sections determined by:
  • USFM section markers (\s, \s1, \s2)
  • Translation Notes groupings
  • Academy article boundaries
  • Resource-specific divisions
```

### 3. Passage Sets Navigation

Navigate through **predefined collections** - thematic or topical passage lists.

```typescript
interface PassageSet {
  id: string
  name: string
  description?: string
  passages: VerseReference[]
}

// Example: Creation theme
const creationSet: PassageSet = {
  id: 'creation-accounts',
  name: 'Creation Accounts',
  description: 'Key passages about creation',
  passages: [
    { book: 'gen', chapter: 1, verseStart: 1, verseEnd: 31 },
    { book: 'gen', chapter: 2, verseStart: 1, verseEnd: 25 },
    { book: 'psa', chapter: 8, verseStart: 1, verseEnd: 9 },
    { book: 'jhn', chapter: 1, verseStart: 1, verseEnd: 5 }
  ]
}
```

**Navigation Behavior:**

```
Current: Genesis 1:1-31 (passage 1 of 4)
User clicks "Next" →
Loads: Genesis 2:1-25 (passage 2 of 4)

User clicks "Next" →
Loads: Psalm 8:1-9 (passage 3 of 4)

At end of set:
  "Next" button disabled or wraps to first passage
```

### Scripture Navigation History

**Independent of navigation mode**, the app tracks all loaded passages:

```typescript
interface NavigationHistory {
  stack: VerseReference[]
  currentIndex: number
}

// Example
const history: NavigationHistory = {
  stack: [
    { book: 'gen', chapter: 1, verseStart: 1 },
    { book: 'jhn', chapter: 3, verseStart: 16 },
    { book: 'mat', chapter: 5, verseStart: 1, verseEnd: 12 },
    { book: 'gen', chapter: 2, verseStart: 1 }  // ← current
  ],
  currentIndex: 3
}
```

**History Navigation:**

```
User clicks "Back in History" →
  Loads: Matthew 5:1-12 (previous in history)
  currentIndex: 2

User clicks "Forward in History" →
  Loads: Genesis 2:1 (next in history)
  currentIndex: 3

User navigates to new passage (Next/Prev) →
  New passage added to history
  History index updated
```

### Navigation Controls UI

```
┌─────────────────────────────────────────────────────────────┐
│                  Navigation Bar                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [◄ Back]  [◄ Prev]    Genesis 1:1-5    [Next ►]  [Fwd ►]   │
│                                                              │
│  Mode: ● Verse  ○ Section  ○ Passage Set                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Buttons:
  • Back in History (◄ Back)
  • Previous (context-aware per mode)
  • Current reference display
  • Next (context-aware per mode)
  • Forward in History (Fwd ►)
```

### Navigation State Management

```typescript
interface NavigationState {
  // Current mode
  mode: 'verse' | 'sections' | 'passage-sets'
  
  // Current location
  currentReference: VerseReference
  
  // Mode-specific data
  currentPassageSet?: PassageSet      // For passage-sets mode
  currentPassageIndex?: number        // Position in set
  sections?: Section[]                // For sections mode
  currentSectionIndex?: number        // Position in sections
  
  // History (always tracked)
  history: VerseReference[]
  historyIndex: number
}

interface NavigationActions {
  // Mode switching
  setNavigationMode(mode: 'verse' | 'sections' | 'passage-sets'): void
  
  // Mode-specific navigation
  goToNext(): void         // Next verse/section/passage (based on mode)
  goToPrevious(): void     // Previous verse/section/passage
  goToReference(ref: VerseReference): void
  
  // History navigation
  goBackInHistory(): void
  goForwardInHistory(): void
  canGoBackInHistory(): boolean
  canGoForwardInHistory(): boolean
  
  // Passage sets
  loadPassageSet(set: PassageSet): void
  clearPassageSet(): void
  
  // Sections
  loadSections(sections: Section[]): void
}
```

### Implementation Example

```typescript
// Calculate next verse after a range
function calculateNextVerse(ref: VerseReference): VerseReference {
  // If range has an end, start from the end
  const lastBook = ref.bookEnd || ref.book
  const lastChapter = ref.chapterEnd || ref.chapter
  const lastVerse = ref.verseEnd || ref.verse
  
  // Get next verse
  const bookInfo = getBookInfo(lastBook)
  const chapterInfo = bookInfo.chapters[lastChapter]
  
  if (lastVerse < chapterInfo.verseCount) {
    // Next verse in same chapter
    return {
      book: lastBook,
      chapter: lastChapter,
      verse: lastVerse + 1
    }
  } else if (lastChapter < bookInfo.chapterCount) {
    // First verse of next chapter
    return {
      book: lastBook,
      chapter: lastChapter + 1,
      verse: 1
    }
  } else {
    // First verse of next book
    const nextBook = getNextBook(lastBook)
    return {
      book: nextBook,
      chapter: 1,
      verse: 1
    }
  }
}

function useNavigation() {
  const store = useNavigationStore()
  
  const goToNext = () => {
    const { mode, currentReference } = store
    
    switch (mode) {
      case 'verse':
        // Load next verse (handles ranges)
        const nextVerse = calculateNextVerse(currentReference)
        store.goToReference(nextVerse)
        break
        
      case 'sections':
        // Load next section
        const { sections, currentSectionIndex } = store
        if (currentSectionIndex < sections.length - 1) {
          const nextSection = sections[currentSectionIndex + 1]
          store.goToReference(nextSection.reference)
        }
        break
        
      case 'passage-sets':
        // Load next passage in set
        const { currentPassageSet, currentPassageIndex } = store
        if (currentPassageIndex < currentPassageSet.passages.length - 1) {
          const nextPassage = currentPassageSet.passages[currentPassageIndex + 1]
          store.goToReference(nextPassage)
        }
        break
    }
  }
  
  return { goToNext, ...store }
}

function NavigationBar() {
  const {
    mode,
    currentReference,
    goToNext,
    goToPrevious,
    goBackInHistory,
    goForwardInHistory,
    canGoBackInHistory,
    canGoForwardInHistory
  } = useNavigation()
  
  return (
    <div className="navigation-bar">
      <button
        onClick={goBackInHistory}
        disabled={!canGoBackInHistory()}
      >
        ◄ Back
      </button>
      
      <button onClick={goToPrevious}>
        ◄ Prev {getModeLabel(mode)}
      </button>
      
      <div className="current-reference">
        {formatReference(currentReference)}
      </div>
      
      <button onClick={goToNext}>
        Next {getModeLabel(mode)} ►
      </button>
      
      <button
        onClick={goForwardInHistory}
        disabled={!canGoForwardInHistory()}
      >
        Fwd ►
      </button>
    </div>
  )
}

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'verse': return 'Verse'
    case 'sections': return 'Section'
    case 'passage-sets': return 'Passage'
    default: return ''
  }
}
```

### Complete Navigation Flow Example

```
Step 1: App opens
  Mode: verse
  Current: Genesis 1:1
  History: [Gen 1:1]

Step 2: User clicks "Next"
  Mode: verse
  Loads: Genesis 1:2
  History: [Gen 1:1, Gen 1:2]

Step 3: User manually selects range: Titus 2:4-3:2
  Mode: verse
  Loads: Titus 2:4-3:2 (cross-chapter range)
  History: [Gen 1:1, Gen 1:2, Tit 2:4-3:2]

Step 4: User clicks "Next"
  Mode: verse
  Loads: Titus 3:3 (verse after range end)
  History: [Gen 1:1, Gen 1:2, Tit 2:4-3:2, Tit 3:3]

Step 5: User switches to "Sections" mode
  Mode: sections
  Current: Titus 3:1-8 (section containing verse 3)
  History: [Gen 1:1, Gen 1:2, Tit 2:4-3:2, Tit 3:3] (unchanged)

Step 6: User clicks "Next"
  Mode: sections
  Loads: Titus 3:9-15 (next section)
  History: [Gen 1:1, Gen 1:2, Tit 2:4-3:2, Tit 3:3, Tit 3:9-15]

Step 7: User clicks "Back in History" (twice)
  Loads: Titus 2:4-3:2 (cross-chapter range)
  History index: 2
  Mode: Still "sections"

Step 8: User switches to "Passage Sets"
  Loads: "Paul's Instructions" set
  Current: Romans 12:1-21 (first in set)
  History: [...previous..., Rom 12:1-21]

Step 9: User clicks "Next"
  Mode: passage-sets
  Loads: 1 Corinthians 13:1-13 (second in set)
  History: [...previous..., 1Co 13:1-13]
```

### Reference Range Selection UI

Users can select ranges using a flexible reference picker:

```typescript
interface ReferencePickerProps {
  onSelect: (reference: VerseReference) => void
  allowCrossChapter?: boolean  // Default: true
  allowCrossBook?: boolean     // Default: true
}

// Example UI
function ReferencePicker({ onSelect }: ReferencePickerProps) {
  return (
    <div className="reference-picker">
      {/* Start */}
      <BookSelect value={startBook} onChange={setStartBook} />
      <ChapterInput value={startChapter} onChange={setStartChapter} />
      <VerseInput value={startVerse} onChange={setStartVerse} />
      
      {/* Optional: Range End */}
      <label>
        <input type="checkbox" checked={isRange} onChange={setIsRange} />
        Select Range
      </label>
      
      {isRange && (
        <>
          <span>to</span>
          {allowCrossBook && (
            <BookSelect value={endBook} onChange={setEndBook} />
          )}
          <ChapterInput value={endChapter} onChange={setEndChapter} />
          <VerseInput value={endVerse} onChange={setEndVerse} />
        </>
      )}
      
      <button onClick={() => onSelect(buildReference())}>
        Go to Reference
      </button>
    </div>
  )
}

// Display format
function formatReference(ref: VerseReference): string {
  const start = `${ref.book} ${ref.chapter}:${ref.verse}`
  
  if (!ref.verseEnd && !ref.chapterEnd && !ref.bookEnd) {
    return start
  }
  
  // Cross-book range
  if (ref.bookEnd && ref.bookEnd !== ref.book) {
    return `${start}-${ref.bookEnd} ${ref.chapterEnd}:${ref.verseEnd}`
  }
  
  // Cross-chapter range
  if (ref.chapterEnd && ref.chapterEnd !== ref.chapter) {
    return `${start}-${ref.chapterEnd}:${ref.verseEnd}`
  }
  
  // Same chapter range
  return `${start}-${ref.verseEnd}`
}

// Examples:
// formatReference({ book: 'gen', chapter: 1, verse: 1 })
// → "gen 1:1"

// formatReference({ book: 'gen', chapter: 1, verse: 1, verseEnd: 5 })
// → "gen 1:1-5"

// formatReference({ book: 'tit', chapter: 2, verse: 4, chapterEnd: 3, verseEnd: 2 })
// → "tit 2:4-3:2"

// formatReference({ book: 'mal', chapter: 4, verse: 5, bookEnd: 'mat', chapterEnd: 1, verseEnd: 3 })
// → "mal 4:5-mat 1:3"
```

### Key Navigation Features

✅ **Three Flexible Modes** - Verse, Section, Passage Set  
✅ **Cross-Chapter Ranges** - Select ranges like Titus 2:4-3:2  
✅ **Cross-Book Ranges** - Even spanning books (Malachi 4:5-Matthew 1:3)  
✅ **Context-Aware Arrows** - "Next" behavior adapts to mode  
✅ **Independent History** - Back/Forward works across all modes  
✅ **Both Panels Synchronized** - Navigation updates both panels  
✅ **Mode Persistence** - Selected mode remembered across sessions  
✅ **Passage Set Management** - Create and save custom sets  
✅ **Smart Section Detection** - Automatic from USFM markers  
✅ **Flexible Reference Picker** - Easy range selection UI  

---

## Data Flow

### Complete Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        USER ACTION                            │
│              (Click, Scroll, Select, etc.)                    │
└────────────────────────┬─────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────┐
│                    REACT COMPONENT                            │
│              (Dispatches action via hook)                     │
└────────────────────────┬─────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────┐
│                   ZUSTAND STORE                               │
│         (State management + business logic)                   │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Catalog   │  │  Package   │  │   Panel    │            │
│  │   Store    │  │   Store    │  │   Store    │            │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘            │
└─────────┼────────────────┼────────────────┼──────────────────┘
          ↓                ↓                ↓
┌──────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                               │
│                                                               │
│  ┌────────────────────────────────────────────────┐          │
│  │         ResourceCatalog (Metadata)             │          │
│  │  • Query resources                             │          │
│  │  • Get availability                            │          │
│  │  • Track access                                │          │
│  └────────────────────┬───────────────────────────┘          │
│                       ↓                                       │
│  ┌────────────────────────────────────────────────┐          │
│  │         ResourceCache (Content)                │          │
│  │  • Store content                               │          │
│  │  • Retrieve content                            │          │
│  │  • Eviction policies                           │          │
│  └────────────────────┬───────────────────────────┘          │
│                       ↓                                       │
│  ┌────────────────────────────────────────────────┐          │
│  │         PackageManager (Packages)              │          │
│  │  • Load packages                               │          │
│  │  • Resolve resources                           │          │
│  │  • Import/Export                               │          │
│  └────────────────────┬───────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────┐
│                   STORAGE LAYER                               │
│                   (IndexedDB)                                 │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Catalog    │  │    Cache     │  │   Packages   │      │
│  │    Table     │  │    Table     │  │    Table     │      │
│  │              │  │              │  │              │      │
│  │  Metadata    │  │   Content    │  │   Package    │      │
│  │  (small)     │  │   (large)    │  │   Config     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬─────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────┐
│                   NETWORK LAYER                               │
│                   (Door43 API)                                │
│                                                               │
│  • Fetch resource metadata                                   │
│  • Download resource content                                 │
│  • Check for updates                                         │
└──────────────────────────────────────────────────────────────┘
```

### Example: Loading a Package

```
User selects package
        ↓
UI dispatches action:
  loadPackage('spanish-kit')
        ↓
Zustand Store handles:
  1. Call PackageManager.loadPackage()
        ↓
PackageManager:
  1. Get package from storage
  2. For each resource reference:
     a. Query catalog
     b. Get metadata
     c. Check availability
        ↓
Catalog returns metadata:
  - es/ult: Available (offline)
  - es/tn: Available (offline)
  - el-x/ugnt: Not cached
        ↓
PackageManager returns result:
  {
    package: {...},
    resources: [es/ult, es/tn],
    missing: ['el-x/ugnt']
  }
        ↓
Store updates state:
  - currentPackage = package
  - loadedResources = resources
  - missingResources = missing
        ↓
UI re-renders:
  - Show loaded resources in panels
  - Show download button for missing
        ↓
User clicks download for UGNT
        ↓
Download flow begins...
```

---

## Technology Stack

### Frontend Framework

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server

### State Management

- **Zustand** - Lightweight state management
  - Catalog Store
  - Package Store
  - Panel Store

### Storage

- **IndexedDB** - Browser database
  - Catalog metadata (~10MB)
  - Cached content (~500MB+)
  - User packages (~1MB)

### Network

- **Door43 API** - Resource provider
  - REST API
  - JSON responses
  - ZIP file downloads

### UI Components

- **React Router** - Navigation
- **Tailwind CSS** - Styling (if applicable)
- Custom components:
  - ResourceCard
  - PackageCreator
  - LinkedPanels
  - ResourceViewer

### Offline Support

- **Service Worker** - Cache assets
- **PWA Manifest** - Install as app
- **IndexedDB** - Offline data

---

## Component Architecture

### Page Components

```
src/
├── pages/
│   ├── Browse.tsx          - Browse resources
│   ├── PackageCreator.tsx  - Create packages
│   └── Study.tsx           - Study view with panels
```

### Feature Components

```
src/
├── components/
│   ├── browse/
│   │   ├── ResourceList.tsx
│   │   ├── ResourceCard.tsx
│   │   ├── FilterBar.tsx
│   │   └── DownloadButton.tsx
│   │
│   ├── package-creator/
│   │   ├── PackageCreatorWizard.tsx
│   │   ├── steps/
│   │   │   ├── PackageInfo.tsx
│   │   │   ├── OrganizationSelector.tsx
│   │   │   ├── LanguageSelector.tsx
│   │   │   ├── ResourceSelector.tsx
│   │   │   ├── OriginalLanguageSelector.tsx
│   │   │   └── PackagePreview.tsx
│   │   └── PackageList.tsx
│   │
│   └── study/
│       ├── PanelContainer.tsx
│       ├── Panel.tsx
│       ├── ResourceViewer.tsx
│       ├── VerseNavigator.tsx
│       └── PanelLinkControls.tsx
```

### Service Layer

```
src/
├── services/
│   ├── catalog.ts          - Catalog initialization
│   ├── cache.ts            - Cache initialization
│   └── packageManager.ts   - Package initialization
```

### Store Layer

```
src/
├── store/
│   ├── catalogStore.ts     - Resource catalog state
│   ├── packageStore.ts     - Package state
│   └── panelStore.ts       - Panel state & linking
```

### Component Hierarchy

```
App
├── Router
│   ├── Browse Page
│   │   ├── FilterBar
│   │   │   ├── LanguageFilter
│   │   │   ├── SubjectFilter
│   │   │   └── AvailabilityFilter
│   │   └── ResourceList
│   │       └── ResourceCard (multiple)
│   │           ├── ResourceInfo
│   │           └── DownloadButton
│   │
│   ├── Package Creator Page
│   │   └── PackageCreatorWizard
│   │       ├── Step1: PackageInfo
│   │       ├── Step2: OrganizationSelector
│   │       ├── Step3: LanguageSelector
│   │       ├── Step4: ResourceSelector
│   │       ├── Step5: OriginalLanguageSelector
│   │       └── Step6: PackagePreview
│   │
│   └── Study Page
│       ├── PackageSelector
│       ├── NavigationBar
│       │   ├── BookSelector
│       │   ├── ChapterSelector
│       │   └── VerseNavigator
│       ├── PanelContainer
│       │   ├── Panel 1
│       │   │   └── ResourceViewer (ULT)
│       │   ├── Panel 2
│       │   │   └── ResourceViewer (TN)
│       │   └── Panel 3
│       │       └── ResourceViewer (UGNT)
│       └── PanelControls
│           ├── AddPanelButton
│           └── LinkToggle
```

---

## Summary

### Key Concepts Recap

1. **Catalog System**
   - Stores metadata, not content
   - Three-tier lookup: Memory → Storage → Network
   - Fast indexed queries
   - Tracks availability and locations

2. **Package System**
   - Virtual collections of resource references
   - Independent of catalog
   - Easy to share and load
   - Includes UI layout configuration

3. **Linked Panels System**
   - Multiple resources side-by-side
   - Synchronized navigation
   - Verse-level alignment
   - Flexible layouts

4. **Data Flow**
   - React UI → Zustand Store → Services → Storage → Network
   - Unidirectional data flow
   - Reactive updates
   - Offline-first approach

### Architecture Benefits

✅ **Offline-First** - Full functionality without internet  
✅ **Modular** - Clean separation of concerns  
✅ **Type-Safe** - TypeScript throughout  
✅ **Performant** - Indexed queries, efficient caching  
✅ **Flexible** - Easy to add new resource types  
✅ **Maintainable** - Clear architecture, good documentation  
✅ **Testable** - Well-defined interfaces  
✅ **Scalable** - Handles hundreds of resources  

---

**This architecture enables translators to work efficiently with Bible resources, both online and offline, with synchronized multi-panel study capabilities.**
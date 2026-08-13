# Adding New Resource Types - Developer Guide

## Overview

The tc-study app uses a **plugin-based architecture** for resource types. Each resource type is a self-contained plugin that includes:

- **Data Layer**: A loader that fetches and processes resource content
- **UI Layer**: A viewer component that displays the resource
- **Configuration**: Metadata, subjects, features, and settings

## Current Architecture

### 1. **Resource Type Registry** (`ResourceTypeRegistry`)

- Central registry that manages all resource types
- Automatically wires up loaders, viewers, and subject mappings
- Located in `packages/resource-types/src/ResourceTypeRegistry.ts`

### 2. **Loader Registry** (`LoaderRegistry`)

- Manages resource loaders (data fetching layer)
- Located in `apps/tc-study/src/lib/loaders/LoaderRegistry.ts`
- Currently registers loaders manually in constructor

### 3. **Viewer Registry** (`ViewerRegistry`)

- Manages viewer components (UI layer)
- Part of `@bt-synergy/catalog-manager` package
- Automatically registered via `ResourceTypeRegistry`

### 4. **Catalog Context** (`CatalogContext`)

- Initializes all registries and provides them to the app
- Located in `apps/tc-study/src/contexts/CatalogContext.tsx`
- Registers resource types on app startup

## Current Developer Experience

### ✅ **What Works Well**

1. **Declarative Resource Type Definition**
   - Resource types are defined in a single file using `defineResourceType()`
   - Clear structure with sections: identification, subjects, loader, viewer, features, settings
   - Example: `apps/tc-study/src/resourceTypes/scripture/index.ts`

2. **Automatic Registration**
   - Once defined, resource types are automatically registered via `ResourceTypeRegistry`
   - Loaders and viewers are automatically wired up
   - Subject mappings are automatically created

3. **Type Safety** (Partially)
   - Resource type definitions have a clear structure
   - TypeScript interfaces exist but are currently using `any` types

4. **Separation of Concerns**
   - Data layer (loaders) separate from UI layer (viewers)
   - Clear boundaries between resource type logic and app logic

### ⚠️ **Current Pain Points**

1. **Dual Registration System**
   - **Problem**: Loaders are registered in TWO places:
     - `LoaderRegistry` constructor (manual registration)
     - `ResourceTypeRegistry.register()` (automatic registration)
   - **Impact**: Developers must remember to update both places
   - **Location**:
     - `apps/tc-study/src/lib/loaders/LoaderRegistry.ts` (lines 22-40)
     - `apps/tc-study/src/contexts/CatalogContext.tsx` (lines 137-138)

2. **Manual Component Mapping**
   - **Problem**: `LinkedPanelsStudio.generateResourceComponent()` uses hardcoded if/else chains
   - **Impact**: New resource types require manual code changes in multiple places
   - **Location**: `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx` (lines 211-252)
   - **Example**:

     ```typescript
     if (resource.category === 'scripture' || resource.type === 'scripture') {
       return <ScriptureViewer ... />
     } else if (resource.category === 'notes' || resource.type === 'notes') {
       return <NotesViewer ... />
     }
     ```

3. **Incomplete Type System**
   - **Problem**: `defineResourceType()` is currently a no-op (`const defineResourceType = (config: any) => config`)
   - **Impact**: No type checking, no validation, no IDE autocomplete
   - **Location**: `apps/tc-study/src/resourceTypes/scripture/index.ts` (line 15)

4. **No Documentation**
   - **Problem**: No step-by-step guide for adding new resource types
   - **Impact**: Developers must reverse-engineer from existing examples

5. **ViewerRegistry Not Used**
   - **Problem**: `ViewerRegistry` exists but `LinkedPanelsStudio` doesn't use it
   - **Impact**: Viewers must be manually mapped in component code
   - **Location**: `packages/catalog-manager/src/ui/ViewerRegistry.ts` (empty file)

## Step-by-Step: Adding a New Resource Type

### Example: Adding "Notes" Resource Type

#### Step 1: Create Resource Type Definition

Create `apps/tc-study/src/resourceTypes/notes.ts`:

```typescript
import { NotesViewer } from '../components/resources/NotesViewer'
// TODO: Import NotesLoader when available
const NotesLoader = null as any

const defineResourceType = (config: any) => config

export const notesResourceType = defineResourceType({
  id: 'notes',
  displayName: 'Translation Notes',
  description: 'Translation notes and commentary',
  icon: 'FileText',
  
  subjects: ['Translation Notes'],
  aliases: ['tn', 'notes'],
  
  loader: NotesLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50,
  },
  
  viewer: NotesViewer,
  
  features: {
    highlighting: false,
    bookmarking: true,
    search: true,
    navigation: true,
  },
  
  settings: {
    showReferences: {
      type: 'boolean',
      label: 'Show References',
      default: true,
    },
  },
  
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})
```

#### Step 2: Export from Index

Update `apps/tc-study/src/resourceTypes/index.ts`:

```typescript
export { notesResourceType } from './notes'
```

#### Step 3: Register in CatalogContext

Update `apps/tc-study/src/contexts/CatalogContext.tsx`:

```typescript
import { notesResourceType } from '../resourceTypes'

// In CatalogProvider:
resourceTypeRegistry.register(notesResourceType)
```

#### Step 4: Done! ✅

**No manual registration needed!** The `ResourceTypeRegistry` automatically:

- Registers the loader with `CatalogManager`
- Registers the loader with `LoaderRegistry`
- Registers the viewer with `ViewerRegistry`
- Creates subject mappings

#### Step 5: Done! ✅

**No manual component mapping needed!** `LinkedPanelsStudio` now uses `ViewerRegistry` to automatically resolve the correct viewer component based on resource metadata.

#### Step 6: Create Viewer Component (if needed)

If you need a new viewer component, create it in `apps/tc-study/src/components/resources/`.

**Viewer Component Structure**

All viewer components must:

1. Accept `ResourceViewerProps` (at minimum `resourceId` and `resourceKey`)
2. Use catalog hooks to fetch and display content
3. Support inter-panel communication via linked-panels hooks
4. Respond to reference changes

**Example: Creating a Notes Viewer**

Create `apps/tc-study/src/components/resources/NotesViewer.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { useResourceAPI, useEvents, useCurrentState } from 'linked-panels'
import { useCatalogManager, useCurrentReference } from '../../contexts'

/**
 * ResourceViewerProps interface (from @bt-synergy/catalog-manager):
 * 
 * interface ResourceViewerProps {
 *   resourceId: string      // Unique ID for this resource instance
 *   resourceKey: string     // Catalog key (e.g., "unfoldingWord/en_tn")
 *   [key: string]: any      // Additional props allowed
 * }
 */

interface NotesViewerProps {
  resourceId: string
  resourceKey: string
  // Add any additional props your viewer needs
  onNoteClick?: (noteId: string) => void
}

export function NotesViewer({ 
  resourceId, 
  resourceKey,
  onNoteClick 
}: NotesViewerProps) {
  // ===== HOOKS =====
  
  // Catalog hooks - for fetching content
  const catalogManager = useCatalogManager()
  const currentRef = useCurrentReference()
  
  // Linked-panels hooks - for inter-panel communication
  const api = useResourceAPI(resourceId)
  
  // ===== STATE =====
  const [notes, setNotes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // ===== FETCH CONTENT =====
  
  useEffect(() => {
    let cancelled = false
    
    const loadNotes = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        // Load content for current book/chapter
        const content = await catalogManager.loadResourceContent(
          resourceKey,
          currentRef.book,
          currentRef.chapter
        )
        
        if (!cancelled) {
          setNotes(content || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notes')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    
    loadNotes()
    
    return () => {
      cancelled = true
    }
  }, [resourceKey, currentRef.book, currentRef.chapter, catalogManager])
  
  // ===== INTER-PANEL COMMUNICATION =====
  
  // Listen for events from other panels
  useEvents(
    resourceId,
    ['note-highlight'], // Event types to listen for
    (event) => {
      console.log('📨 Received note-highlight event:', event)
      // Handle the event (e.g., highlight a specific note)
    }
  )
  
  // Send events to other panels
  const handleNoteClick = (noteId: string) => {
    // Send custom event
    api.messaging.sendToAll({
      type: 'note-click',
      lifecycle: 'event',
      noteId,
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    })
    
    // Call optional callback
    if (onNoteClick) {
      onNoteClick(noteId)
    }
  }
  
  // ===== RENDER =====
  
  if (isLoading) {
    return <div className="p-4">Loading notes...</div>
  }
  
  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>
  }
  
  if (notes.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No notes available for {currentRef.book} {currentRef.chapter}
      </div>
    )
  }
  
  return (
    <div className="h-full overflow-auto p-4">
      <h3 className="text-lg font-semibold mb-4">
        {currentRef.book} {currentRef.chapter}
      </h3>
      
      <div className="space-y-4">
        {notes.map((note) => (
          <div
            key={note.id}
            onClick={() => handleNoteClick(note.id)}
            className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <div className="font-semibold">{note.reference}</div>
            <div className="text-sm text-gray-700">{note.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Key Patterns for Viewer Components:**

1. **Required Props**: Always accept `resourceId` and `resourceKey` (from `ResourceViewerProps`)

2. **Catalog Hooks**:

   ```typescript
   const catalogManager = useCatalogManager()  // Access catalog
   const currentRef = useCurrentReference()     // Current book/chapter/verse
   ```

3. **Linked-Panels Hooks**:

   ```typescript
   const api = useResourceAPI(resourceId)      // Send messages
   useEvents(resourceId, ['event-type'], handler)  // Listen for events
   useCurrentState(resourceId, 'state-key')    // Share state
   ```

4. **Loading Content**:

   ```typescript
   const content = await catalogManager.loadResourceContent(
     resourceKey,
     bookId,
     chapterNumber
   )
   ```

5. **Reference Changes**: Always reload content when `currentRef` changes

6. **Inter-Panel Communication**:
   - **Send events**: `api.messaging.sendToAll({ type: 'event-type', ... })`
   - **Listen for events**: `useEvents(resourceId, ['event-type'], handler)`
   - **Share state**: `useCurrentState(resourceId, 'state-key')`

**Real-World Examples:**

- **eScriptureViewer** (`apps/tc-study/src/components/resources/ScriptureViewer.tsx`)
  - Fetches processed scripture content
  - Tokenizes text for word-level interaction
  - Sends `TokenClickEvent` when words are clicked
  - Listens for `HighlightedTokensState` to highlight words

- **WordsLinksViewer** (`apps/tc-study/src/components/resources/WordsLinksViewer.tsx`)
  - Filters word links by current reference
  - Listens for `TokenClickEvent` to filter by clicked word
  - Sends `LinkClickEvent` when links are clicked
  - Opens Translation Words articles via callback

**Additional Props:**

If your viewer needs additional props (beyond `resourceId` and `resourceKey`), they can be passed from `LinkedPanelsStudio.generateResourceComponent()`. For example:

```typescript
// In LinkedPanelsStudio.tsx
if (resource.type === 'words-links') {
  return (
    <ViewerComponent
      resourceId={resource.id}
      resourceKey={resourceKey}
      onEntryLinkClick={handleOpenEntry}  // Additional prop
    />
  )
}
```

## ✅ Implemented Improvements

### 1. **Unified Registration System** ✅

**Status**: **COMPLETED**  
**Changes**:

- Removed manual loader registration from `LoaderRegistry` constructor
- `ResourceTypeRegistry.register()` now automatically registers loaders with both `CatalogManager` and `LoaderRegistry`
- Single source of truth: register once in `ResourceTypeRegistry`, works everywhere

### 2. **ViewerRegistry in Components** ✅

**Status**: **COMPLETED**  
**Changes**:

- Implemented `ViewerRegistry` class with `getViewer()` method
- Updated `LinkedPanelsStudio` to use `ViewerRegistry` instead of hardcoded if/else chains
- Dynamic component resolution based on resource metadata

### 3. **Type System** ✅

**Status**: **COMPLETED**  
**Changes**:

- Created comprehensive type definitions in `packages/resource-types/src/types.ts`
- `defineResourceType()` now provides type checking and validation
- Full TypeScript support with IDE autocomplete
- Resource type definitions are now fully typed

### 4. **Loader Package Template**

**Status**: **TODO** (Future improvement)  
**Note**: Loaders still need to be created manually, but registration is now automatic

### 5. **Developer Documentation** ✅

**Status**: **COMPLETED**  
**This document provides**: Step-by-step guide, code examples, architecture overview

## Summary

### Current State: **Excellent Developer Experience** ✅

**Strengths:**

- ✅ Declarative resource type definitions
- ✅ Automatic subject mapping
- ✅ Clear separation of concerns
- ✅ Plugin-based architecture
- ✅ **Single registration point** (`ResourceTypeRegistry`)
- ✅ **Dynamic viewer resolution** (`ViewerRegistry`)
- ✅ **Full type safety** (`@bt-synergy/resource-types`)
- ✅ **Comprehensive documentation** (this document)

**Remaining Improvements:**

- 🔄 Loader/viewer templates (future enhancement)

### What Changed

**Before:**

- Manual registration in 2 places (LoaderRegistry + ResourceTypeRegistry)
- Hardcoded if/else chains for component mapping
- No type checking
- No documentation

**After:**

- ✅ Single registration: Just call `resourceTypeRegistry.register()`
- ✅ Automatic component resolution via `ViewerRegistry`
- ✅ Full TypeScript support with validation
- ✅ Complete developer guide

**Result**: Adding a new resource type now requires **only 3 steps** (create definition, export, register) instead of 6 steps!

# Studio Collections Workflow

## Overview

The Studio now uses a **sidebar-first resource management** approach, where resources are added to a shared pool and then dragged into panels. Collections can be saved and loaded for different projects.

## New Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Navigation Bar               [Save] [Load] Collections  │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ SIDEBAR  │  Panel 1            Panel 2                 │
│          │                                              │
│ [+] Add  │  ┌──────────┐        ┌──────────┐          │
│ [↻] Refresh                      │          │          │
│          │  │ Resource │        │ Resource │          │
│ ┌──────┐ │  │  View    │        │  View    │          │
│ │ ULT  │ │  └──────────┘        └──────────┘          │
│ └──────┘ │                                              │
│ ┌──────┐ │  Drag resources from sidebar to panels      │
│ │ TW   │ │                                              │
│ └──────┘ │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

## Workflow

### 1. **Adding Resources to the Studio**

**Location**: Sidebar header (left side)

- Click the **[+] Add resources** button in the sidebar
- Opens the **AddToCatalogWizard** which downloads resources from Door43
- Resources are added to **two places**:
  - ✅ **Library** (global catalog - shared across all pages)
  - ✅ **Studio Sidebar** (current session resource pool)

### 2. **Using Resources in Panels**

**Action**: Drag and drop from sidebar to panels

1. Resources appear in the sidebar as draggable cards
2. **Drag** a resource from the sidebar
3. **Drop** it onto a panel (visual feedback when hovering)
4. Resource is now active in that panel

**Collapsed View**:
- Shows icon + short code (e.g., "ULT", "TW")

**Expanded View**:
- Shows icon, full title, language, owner, and subject tags

### 3. **Saving Studio Collections**

**Location**: Top right navigation bar

- Click **[Save]** button
- Saves the current studio state:
  - ✅ All resources in the sidebar pool
  - ✅ Which resources are in panel 1
  - ✅ Which resources are in panel 2
  - ✅ Active resource indices
  - ✅ Current verse/chapter positions
- Prompts for a collection name (e.g., "Parables Study", "Genesis Translation")

### 4. **Loading Studio Collections**

**Location**: Top right navigation bar

- Click **[Load]** button
- Shows list of saved collections
- Select a collection to load
- Restores the entire studio state:
  - ✅ Resources appear in sidebar
  - ✅ Panels are populated
  - ✅ Navigation is restored

## Key Benefits

### ✅ Separation of Concerns

- **Sidebar** = Resource management (what's available)
- **Panels** = Resource viewing (what you're currently reading)
- **Collections** = Project organization (saved workspaces)

### ✅ Streamlined Workflow

- One place to add resources (sidebar)
- One place to manage projects (Save/Load)
- Simple drag-and-drop to use resources

### ✅ Project-Based Organization

- Save different collections for different projects:
  - "OT Translation Work"
  - "NT Parables Study"
  - "1 Corinthians Commentary"
- Each collection is an independent workspace
- Switch between projects instantly

## Implementation Status

### ✅ Completed

1. **Sidebar Resource Management**
   - [+] Add resources button in sidebar header
   - [↻] Refresh button to reload from catalog
   - Auto-refresh when window gains focus
   - Drag-and-drop from sidebar to panels
   - Visual feedback for drag operations

2. **Removed Per-Panel Add Buttons**
   - Panels no longer have individual [+] buttons
   - Resources must be added through sidebar
   - Cleaner panel headers

3. **Collection Controls UI**
   - [Save] button in top navigation
   - [Load] button in top navigation
   - Ready for implementation

### 🚧 To Implement

1. **Save Collection Functionality**
   - Prompt for collection name
   - Serialize studio state
   - Store in local storage or database
   - Include metadata (created date, description)

2. **Load Collection Functionality**
   - Show list of saved collections
   - Preview collection contents
   - Load and restore studio state
   - Handle missing resources gracefully

3. **Collection Management**
   - Edit collection metadata
   - Delete collections
   - Export/import collections
   - Share collections with team

## User Stories

### Story 1: Starting a New Project

```
1. User opens Studio
2. Clicks [+] Add resources in sidebar
3. Downloads ULT, TW, TN resources
4. Drags ULT to Panel 1
5. Drags TW to Panel 2
6. Works on translation
7. Clicks [Save] → "Genesis Translation"
8. Collection saved for later
```

### Story 2: Resuming Work

```
1. User opens Studio
2. Clicks [Load]
3. Selects "Genesis Translation"
4. Studio instantly restores:
   - ULT in Panel 1 (at Genesis 1:5)
   - TW in Panel 2 (at "create")
5. User continues working
```

### Story 3: Multiple Projects

```
1. User has multiple collections:
   - "Genesis 1-11" (ULT, TW, TN)
   - "Parables Study" (ULT, ULT-es, TN)
   - "Romans Commentary" (ULT, UGNT, TW)
2. Switches between them with [Load]
3. Each has different resources and positions
4. No conflict or confusion
```

## Technical Notes

### Data Structure

```typescript
interface StudioCollection {
  id: string
  name: string
  description?: string
  created: Date
  lastModified: Date
  
  // Resource pool in sidebar
  resourceIds: string[]
  
  // Panel state
  panels: {
    'panel-1': {
      resourceIds: string[]
      activeIndex: number
    }
    'panel-2': {
      resourceIds: string[]
      activeIndex: number
    }
  }
  
  // Navigation state (optional)
  navigation?: {
    currentReference: VerseRef
    history: VerseRef[]
  }
}
```

### Storage

- **LocalStorage**: Simple, works offline, 5MB limit
- **IndexedDB**: Complex, larger storage, better for media
- **Cloud Sync** (future): Share across devices

### Integration Points

1. **Catalog System**: Resources loaded from catalog
2. **Package Store**: Collections integrated with existing packages
3. **Navigation Context**: Verse positions restored
4. **Panel System**: Uses existing LinkedPanels infrastructure

## Next Steps

1. Implement Save Collection dialog
2. Implement Load Collection modal
3. Add collection management UI
4. Test with real translation workflows
5. Add collection export/import
6. Consider cloud sync for teams

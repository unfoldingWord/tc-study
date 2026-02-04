# Collection Architecture

## Overview

This document describes the clean architecture for resource management in the TC Study app, specifically focusing on the distinction between **Collections** and **Library/Catalog**.

## Core Concepts

### 1. Library/Catalog (Local Storage)

The **Library** (also called **Catalog**) is the local cache of resource metadata and content stored in IndexedDB.

- **Purpose**: Local storage layer for resource metadata and content
- **Technology**: IndexedDB via `CatalogManager`
- **Contents**: 
  - Resource metadata (title, owner, language, version, description, etc.)
  - Resource content (scripture text, translation notes, etc.)
  - Enriched metadata (README, license, ingredients)

**Key Point**: The library is the **source of truth** for resource metadata and content on the device.

### 2. Collections (Resource Packages)

**Collections** are lightweight, portable lists of resource pointers that can be:
- Saved and loaded from the local database
- Exported for offline sharing (as zip files)
- Imported from shared files

**Contents**:
- Minimal resource pointers (no metadata duplication):
  ```typescript
  {
    server: 'https://git.door43.org',
    owner: 'unfoldingWord',
    language: 'en',
    resourceId: 'ult'
  }
  ```
- Panel layout configuration (which resources go in which panel)
- Collection metadata (name, description, tags)

**Key Point**: Collections are **just pointers** to resources, not full metadata or content.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     REMOTE (Door43 API)                     │
│                   Source of all resources                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Fetch on demand
                        ▼
┌─────────────────────────────────────────────────────────────┐
│               LOCAL LIBRARY/CATALOG (IndexedDB)             │
│           ┌─────────────────────────────────────┐           │
│           │  Resource Metadata & Content        │           │
│           │  - Titles, descriptions, versions   │           │
│           │  - Scripture content, notes         │           │
│           │  - README, license, ingredients     │           │
│           └─────────────────────────────────────┘           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Referenced by
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   COLLECTIONS (IndexedDB)                   │
│           ┌─────────────────────────────────────┐           │
│           │  Lightweight Resource Pointers      │           │
│           │  - server/owner/language/resourceId │           │
│           │  - Panel assignments                │           │
│           │  - Collection metadata              │           │
│           └─────────────────────────────────────┘           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Loaded into
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  WORKSPACE (React State)                    │
│           ┌─────────────────────────────────────┐           │
│           │  Active Resources                   │           │
│           │  - Sidebar: Available resources     │           │
│           │  - Panels: Displayed resources      │           │
│           │  - Full metadata for rendering      │           │
│           └─────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Saving a Collection

```typescript
// User clicks "Save" in workspace sidebar
┌──────────────────┐
│  Workspace       │  Current state (sidebar + panels)
│  (React State)   │
└────────┬─────────┘
         │ Extract resource pointers
         ▼
┌──────────────────┐
│  Collection      │  {
│  (Pointer List)  │    resources: [
│                  │      { server, owner, language, resourceId },
│                  │      ...
│                  │    ],
│                  │    panelLayout: { panels: [...] }
│                  │  }
└────────┬─────────┘
         │ Save to IndexedDB
         ▼
┌──────────────────┐
│  PackageStore    │  Collections stored in IndexedDB
│  (IndexedDB)     │
└──────────────────┘
```

### Loading a Collection (Online)

```typescript
// User clicks "Load" from Collections page or Studio sidebar
┌──────────────────┐
│  Collection      │  Read resource pointers
│  (Pointer List)  │  { server, owner, language, resourceId }
└────────┬─────────┘
         │ For each resource pointer
         ▼
┌──────────────────┐
│  CatalogManager  │  Check: Does local library have this resource?
│  (IndexedDB)     │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  ✅ Yes    ❌ No
    │         │
    │         └─────┐ Fetch from Door43
    │               ▼
    │         ┌──────────────────┐
    │         │  Door43 API      │
    │         └────────┬─────────┘
    │                  │
    │                  ▼
    │         Add to local library
    │                  │
    └──────────────────┘
                       │ Load full metadata
                       ▼
┌──────────────────────────────────────┐
│  Workspace (React State)             │
│  - Add to sidebar (AppStore)         │
│  - Add to panels (WorkspaceStore)    │
│  - Full metadata for rendering       │
└──────────────────────────────────────┘
```

### Loading a Collection (Offline Export)

```typescript
// User imports a .zip collection file
┌──────────────────┐
│  Exported File   │  Contains:
│  (.zip)          │  - Resource pointers (manifest.json)
│                  │  - Bundled metadata & content
└────────┬─────────┘
         │ Extract and parse
         ▼
┌──────────────────┐
│  Add to Library  │  Install bundled metadata & content
│  (CatalogManager)│  into local IndexedDB
└────────┬─────────┘
         │ Then load normally
         ▼
┌──────────────────┐
│  Load Collection │  Same as online flow, but all resources
│  (Standard Flow) │  are already in local library
└──────────────────┘
```

## Implementation Files

### Core Types
- **`packages/package-storage/src/types/index.ts`**: 
  - `ResourcePackage` interface (collection format)
  - `PackageResource` interface (resource pointer)
  - `PanelLayout` interface (panel configuration)

### Saving Collections
- **`apps/tc-study/src/lib/stores/workspaceStore.ts`**:
  - `saveAsCollection()`: Extracts resource pointers from workspace and saves to PackageStore

### Loading Collections
- **`apps/tc-study/src/components/collections/CollectionImportDialog.tsx`**:
  - `handleLoadFromDB()`: Loads collection from PackageStore
  - `handleImportFromFile()`: Imports collection from external file
  - Both functions:
    1. Extract resource pointers
    2. Check local library
    3. Fetch from Door43 if missing
    4. Load into workspace

### Library/Catalog Management
- **`apps/tc-study/src/lib/catalog/CatalogManager.ts`**:
  - `getResourceMetadata()`: Get metadata from local library
  - `addResourceToCatalog()`: Add resource to local library
  - Multi-layer caching system

## Key Benefits

1. **No Data Duplication**: Resource metadata is stored once in the library, referenced by collections
2. **Lightweight Collections**: Collections are small, easy to share and backup
3. **Offline Support**: Exported collections bundle everything needed for offline use
4. **Flexible**: Same collection can work online (fetch on demand) or offline (bundled)
5. **Scalable**: Library can grow without affecting collection size
6. **Clean Separation**: Clear distinction between storage (library) and grouping (collections)

## Best Practices

### When Saving a Collection:
✅ DO:
- Extract only resource pointers (server, owner, language, resourceId)
- Save panel assignments using base resource keys (no instance identifiers like #2)
- Include collection metadata (name, description)

❌ DON'T:
- Save full resource metadata
- Save resource content
- Include UI-specific state beyond panel assignments

### When Loading a Collection:
✅ DO:
- Always check local library first
- Auto-download missing resources from Door43
- Show progress for downloads
- Handle errors gracefully (show which resources failed)

❌ DON'T:
- Assume all resources are in local library
- Fail silently if resources are missing
- Duplicate metadata in collection

### When Exporting a Collection:
✅ DO:
- Bundle full metadata and content for offline use
- Include manifest with resource pointers
- Validate all resources are available before export

❌ DON'T:
- Export collections with missing resources
- Omit metadata or content (export would be useless offline)

## Future Enhancements

1. **Partial Downloads**: Download only specific resources from a collection
2. **Sync Status**: Show which resources in a collection are cached locally
3. **Smart Downloads**: Download dependencies automatically
4. **Collection Sharing**: Share collections via URL or QR code
5. **Collection Templates**: Pre-made collections for common translation tasks

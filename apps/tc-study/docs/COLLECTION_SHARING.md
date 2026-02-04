# Collection Sharing Feature

## Overview

The Collection Sharing feature enables users to export their workspace collections as downloadable packages (.btc.zip files) that can be shared with other users. These collections can include:

- **Resource metadata** (required) - Information about resources, including titles, subjects, owners, formats
- **Panel configuration** (required) - Layout and resource assignments
- **Downloaded content** (optional) - Cached scripture content for offline use

## Use Cases

### 1. Collaboration
- Share translation workspaces with team members
- Distribute pre-configured study environments
- Share research setups with colleagues

### 2. Offline Distribution
- Prepare collections with content for areas with limited internet
- Create ready-to-use packages for training sessions
- Bundle resources for fieldwork

### 3. Backup & Portability
- Save workspace configurations
- Transfer workspaces between devices
- Archive project setups

## How It Works

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ EXPORT FLOW                                                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Current Workspace                                            │
│    ├─ Resources (Map<key, ResourceInfo>)                     │
│    └─ Panels (Array<PanelConfig>)                            │
│              ↓                                                │
│  CollectionExportService.exportCollection()                  │
│    ├─ Create manifest.json                                   │
│    ├─ Export metadata/*.json (from catalog)                  │
│    ├─ Export content/*.json (from IndexedDB cache) [optional]│
│    └─ Generate README.md                                     │
│              ↓                                                │
│  JSZip.generateAsync()                                       │
│              ↓                                                │
│  workspace-name-v1.0.0.btc.zip                               │
│    ├─ manifest.json                                          │
│    ├─ README.md                                              │
│    ├─ metadata/                                              │
│    │   ├─ unfoldingWord_en_ult.json                         │
│    │   └─ unfoldingWord_el-x-koine_ugnt.json                │
│    └─ content/ (if includeContent = true)                   │
│        ├─ unfoldingWord_en_ult_tit.json                     │
│        └─ unfoldingWord_el-x-koine_ugnt_tit.json            │
│              ↓                                                │
│  Download via browser (FileSaver.js)                         │
│                                                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ IMPORT FLOW                                                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  User selects .btc.zip file                                  │
│              ↓                                                │
│  JSZip.loadAsync(file)                                       │
│              ↓                                                │
│  CollectionExportService.importCollection()                  │
│    ├─ Read manifest.json                                     │
│    ├─ Import metadata to catalog (localStorage)             │
│    ├─ Import content to cache (IndexedDB) [if present]      │
│    └─ Create WorkspacePackage                               │
│              ↓                                                │
│  workspaceStore.loadPackage(workspace)                       │
│              ↓                                                │
│  Resources loaded into panels                                │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Collection Package Format

#### File Structure
```
workspace-name-v1.0.0.btc.zip
├── manifest.json              # Collection metadata & structure
├── README.md                  # Human-readable documentation
├── metadata/                  # Resource metadata files
│   ├── unfoldingWord_en_ult.json
│   ├── unfoldingWord_en_ust.json
│   └── unfoldingWord_el-x-koine_ugnt.json
└── content/                   # [Optional] Cached content
    ├── unfoldingWord_en_ult_tit.json
    ├── unfoldingWord_en_ust_tit.json
    └── unfoldingWord_el-x-koine_ugnt_tit.json
```

#### manifest.json Schema

```typescript
{
  format: 'bt-synergy-collection',
  formatVersion: '1.0.0',
  id: string,
  name: string,
  version: string,
  description?: string,
  createdAt: string,
  createdBy?: string,
  
  resources: [
    {
      resourceKey: string,        // e.g., "unfoldingWord/en/ult"
      resourceId: string,         // e.g., "ult"
      server: string,             // e.g., "git.door43.org"
      owner: string,              // e.g., "unfoldingWord"
      language: string,           // e.g., "en"
      title: string,              // e.g., "Literal Text"
      subject: string,            // e.g., "Bible"
      type: string,               // e.g., "scripture"
      format: string,             // e.g., "usfm"
      version?: string,           // e.g., "v87"
      hasContent: boolean,        // Indicates if content is included
      contentFiles?: string[]     // List of included content files
    }
  ],
  
  panels: [
    {
      id: string,                 // e.g., "panel-1"
      name: string,               // e.g., "Original Text"
      resourceKeys: string[],     // e.g., ["unfoldingWord/el-x-koine/ugnt"]
      activeIndex: number,        // Currently active resource index
      position: number            // Panel position in layout
    }
  ],
  
  stats: {
    totalResources: number,
    resourcesWithContent: number,
    totalPanels: number,
    estimatedSize: string
  }
}
```

## User Guide

### Exporting a Collection

1. **Navigate to Collections page** (`/collections`)
2. **Click Export button** (Download icon in header)
3. **Configure export options**:
   - **Include Downloaded Content**: 
     - ✅ Checked: Includes all cached content (larger file, offline-ready)
     - ❌ Unchecked: Only metadata (smaller file, requires internet)
4. **Click "Export Collection"**
5. **Save the .btc.zip file**

**Estimated Sizes:**
- Metadata only: < 1 MB
- With content: Varies (typically 1-50 MB per resource depending on content)

### Importing a Collection

1. **Navigate to Collections page** (`/collections`)
2. **Click Import button** (Upload icon in header)
3. **Select or drag .btc.zip file**
4. **Click "Import Collection"**
5. **Workspace loads automatically**

**What Happens:**
- Resource metadata added to your catalog
- Panel configuration restored
- Cached content imported (if included)
- Current workspace replaced with imported one

### Sharing Collections

**Best Practices:**
1. **Name descriptively**: Use clear names like "Translation-Titus-Greek-English"
2. **Add description**: Explain the purpose in workspace settings
3. **Include content for offline**: Check "Include Downloaded Content" if recipients have limited internet
4. **Version appropriately**: Increment version for updates

**Sharing Methods:**
- Email attachment (if file size < 25 MB)
- Cloud storage (Dropbox, Google Drive, OneDrive)
- USB drive / physical media
- Internal file server

## Developer Guide

### CollectionExportService

Main service class for export/import operations.

#### Methods

**exportCollection()**
```typescript
async exportCollection(
  workspace: WorkspacePackage,
  catalogManager: CatalogManager,
  cacheAdapter: CacheAdapter,
  options: ExportOptions = { includeContent: false }
): Promise<void>
```

Exports workspace as downloadable ZIP file.

**importCollection()**
```typescript
async importCollection(
  file: File,
  catalogManager: CatalogManager,
  cacheAdapter: CacheAdapter
): Promise<WorkspacePackage>
```

Imports collection from ZIP file and returns WorkspacePackage.

### UI Components

**CollectionExportDialog**
- Props: `isOpen: boolean`, `onClose: () => void`
- Location: `src/components/collections/CollectionExportDialog.tsx`
- Purpose: UI for configuring and triggering export

**CollectionImportDialog**
- Props: `isOpen: boolean`, `onClose: () => void`
- Location: `src/components/collections/CollectionImportDialog.tsx`
- Purpose: UI for selecting and importing collection file

### Integration Points

**Collections Page** (`src/pages/Collections.tsx`)
- Export button triggers `CollectionExportDialog`
- Import button triggers `CollectionImportDialog`
- Dialogs use `collectionExportService` for operations

**Workspace Store** (`src/lib/stores/workspaceStore.ts`)
- `currentPackage` provides data for export
- `loadPackage()` receives imported workspace

**Catalog Manager** (`CatalogContext.tsx`)
- Provides resource metadata for export
- Receives metadata during import

### Extending the System

#### Adding Custom Metadata

Extend `CollectionManifest` interface:

```typescript
interface CollectionManifest {
  // ... existing fields
  customFields?: {
    projectName?: string
    targetLanguage?: string
    tags?: string[]
  }
}
```

Update `createManifest()` in `CollectionExportService.ts`.

#### Supporting Additional Content

Add content export logic in `addContentToZip()`:

```typescript
// Export translation notes
if (resource.type === 'notes') {
  const notesContent = await notesLoader.loadContent(resourceKey)
  contentFolder.file(`${resourceKey}_notes.json`, JSON.stringify(notesContent))
}
```

#### Custom File Formats

Currently supports `.btc.zip`. To add other formats:

```typescript
// Add .btcp (plain JSON) format
async exportAsJSON(workspace: WorkspacePackage): Promise<Blob> {
  const manifest = await this.createManifest(...)
  const json = JSON.stringify(manifest, null, 2)
  return new Blob([json], { type: 'application/json' })
}
```

## API Reference

### ExportOptions

```typescript
interface ExportOptions {
  includeContent: boolean
  contentFilter?: {
    resourceKeys?: string[]  // Only include specific resources
    books?: string[]         // Only include specific books
  }
}
```

### CollectionResource

```typescript
interface CollectionResource {
  resourceKey: string
  resourceId: string
  server: string
  owner: string
  language: string
  title: string
  subject: string
  type: string
  format: string
  version?: string
  hasContent: boolean
  contentFiles?: string[]
}
```

### CollectionPanel

```typescript
interface CollectionPanel {
  id: string
  name: string
  resourceKeys: string[]
  activeIndex: number
  position: number
}
```

## Troubleshooting

### Export Issues

**Problem: Export fails with "No workspace to save"**
- Cause: No active workspace
- Solution: Ensure workspace has resources before exporting

**Problem: Large file size**
- Cause: Content included for many resources
- Solution: Uncheck "Include Downloaded Content" or use content filters

### Import Issues

**Problem: "Invalid collection: missing manifest.json"**
- Cause: Corrupted or invalid ZIP file
- Solution: Re-download or re-export the collection

**Problem: Resources not loading after import**
- Cause: Missing ingredients in metadata
- Solution: Ensure catalog was properly initialized before import

**Problem: Content not available offline**
- Cause: Collection exported without content
- Solution: Re-export with "Include Downloaded Content" checked

## Testing

### Manual Testing Checklist

**Export:**
- [ ] Export workspace without content
- [ ] Export workspace with content
- [ ] Verify file downloads with correct name
- [ ] Verify ZIP contains manifest.json and README.md
- [ ] Verify metadata files present
- [ ] Verify content files present (if included)

**Import:**
- [ ] Import collection with metadata only
- [ ] Import collection with content
- [ ] Verify resources appear in sidebar
- [ ] Verify panels configured correctly
- [ ] Verify content loads (or downloads if not included)
- [ ] Verify all panel assignments preserved

**Round-trip:**
- [ ] Export → Import → Verify workspace identical
- [ ] Export with content → Import → Verify content available offline

### Automated Testing

```typescript
// Example test
describe('CollectionExportService', () => {
  it('should export collection with metadata', async () => {
    const workspace = createMockWorkspace()
    const catalogManager = createMockCatalogManager()
    const cacheAdapter = createMockCacheAdapter()
    
    await service.exportCollection(workspace, catalogManager, cacheAdapter, {
      includeContent: false
    })
    
    // Verify export completed
    expect(saveAs).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringContaining('.btc.zip')
    )
  })
})
```

## Future Enhancements

### Planned Features
1. **Incremental Updates**: Export only changed resources
2. **Compression Options**: Configurable compression levels
3. **Encryption**: Password-protect sensitive collections
4. **Cloud Sync**: Auto-upload to cloud storage
5. **Version Control**: Track collection versions
6. **Selective Content**: Choose specific books to include
7. **Collection Templates**: Pre-configured workspace templates
8. **Batch Import**: Import multiple collections at once

### Feedback & Contributions

Found a bug or have a feature request? Please open an issue on GitHub.

---

Last Updated: January 7, 2026

# Resource Package System - Quick Start Guide

## What is the Resource Package System?

A flexible system that lets users create custom combinations of Bible resources from different languages, organizations, and servers. Think of it as "Spotify playlists for Bible resources" - mix and match what you need.

---

## Quick Start (5 minutes)

### Step 1: Run Database Migrations (Native Only)

```bash
npm run db:push
```

This creates the new database tables for packages and passage sets.

### Step 2: Launch the App

```bash
# Web
npm run web

# Android
npm run android

# iOS
npm run ios
```

### Step 3: First Launch Experience

On first launch (or if no package is active), you'll see the **Package Selector** screen:

```
Choose Your Package
└─ Search languages...
└─ Popular Languages: English, Spanish, French, Portuguese
└─ Package Options:
   ├─ English Bible Study Pack ⭐
   ├─ Spanish Bible Study Pack ⭐
   ├─ French Translation Pack
   └─ ... more languages
```

### Step 4: Select a Package

1. Browse or search for your language
2. See available packages (auto-generated from Door43)
3. Select a package
4. App downloads resources and initializes

**Done!** You now have a custom workspace.

---

## Common Use Cases

### Use Case 1: Spanish Bible with English Helps

**Want:** Spanish Bible for reading, English notes for study

**Solution:** Select "Spanish + English Bilingual Pack"

**Contains:**
- GLT (Spanish) - literal text
- GST (Spanish) - simplified text
- TN (English) - translation notes
- TW (English) - translation words

### Use Case 2: Full Translation Toolkit

**Want:** Everything needed for Bible translation

**Solution:** Select "{Language} Translation Pack"

**Contains:**
- ULT/GLT - literal translation
- UST/GST - simplified translation
- TN - translation notes
- TQ - translation questions
- TWL - translation words links
- UHB - Hebrew Bible (OT)
- UGNT - Greek NT

### Use Case 3: Minimal Offline Bible

**Want:** Just the Bible, no extras, smallest download

**Solution:** Select "{Language} Basic Bible"

**Contains:**
- One scripture resource only
- ~8-15 MB download

### Use Case 4: Custom Mix

**Want:** French Bible + Arabic Notes + Hebrew Reference

**Solution:**
1. Click "Create Custom"
2. Add resources:
   - French ULT (Panel 1)
   - Arabic TN (Panel 2)
   - Hebrew UHB (Panel 1)
3. Save package

---

## Moving Resources Between Panels

### Current Layout:
```
Panel 1: [ULT, UST]
Panel 2: [TN, TQ]
```

### Want to Move UST to Panel 2:
1. Click panel dropdown in Panel 1
2. Select UST
3. Click "Move to Panel 2"

### New Layout:
```
Panel 1: [ULT]
Panel 2: [UST, TN, TQ]
```

Layout automatically saves and persists!

---

## Loading Passage Sets

### From JSON File

1. Navigate to `/passage-sets`
2. Click "Import More Sets"
3. Select "JSON File" tab
4. Paste JSON content
5. Click "Import"

### From DCS Repository

1. Navigate to `/passage-sets`
2. Click "Import More Sets"
3. Select "DCS Repository" tab
4. Enter:
   - Owner: `unfoldingWord`
   - Repo: `en_curriculum`
   - Path: `passage-set.json`
5. Click "Import"

---

## Sharing Packages

### Export Your Package

1. Open package editor (Settings → Packages → [Your Package])
2. Click "Export Package"
3. Save JSON file
4. Share file with others

### Import Someone's Package

1. Click "Import Package" on package selector
2. Paste or upload JSON file
3. Package added to your list
4. Activate to use it

---

## Settings Integration

### Access Package Settings

Navigate to: **Settings → Packages**

**Available Actions:**
- View active package
- Switch to different package
- Edit package resources
- Export current package
- Delete packages

---

## API Examples

### Get Active Package

```typescript
import { useWorkspaceStore } from '@/lib/contexts/WorkspaceContext';

function MyComponent() {
  const activePackage = useWorkspaceStore(state => state.activePackage);
  
  console.log('Current package:', activePackage?.name);
  console.log('Resources:', activePackage?.resources.length);
}
```

### Move Resource

```typescript
import { useWorkspaceStore } from '@/lib/contexts/WorkspaceContext';

function MyComponent() {
  const moveResourceToPanel = useWorkspaceStore(state => state.moveResourceToPanel);
  
  // Move UST from current panel to panel-2
  const handleMove = () => {
    moveResourceToPanel('ust-scripture', 'panel-2');
  };
}
```

### Create Package Programmatically

```typescript
import { createPackageManager } from '@/lib/services/packages/PackageManager';
import { createPackageStorageAdapter } from '@/lib/services/storage/PlatformStorageFactory';

const storageAdapter = createPackageStorageAdapter();
const manager = createPackageManager(storageAdapter);
await manager.initialize();

const pkg = await manager.createPackage({
  name: 'My Custom Pack',
  description: 'Resources I need',
  config: {
    defaultServer: 'git.door43.org',
    defaultLanguage: 'en',
    offlineEnabled: true,
    autoUpdate: true
  }
});

// Add resources via discovery service...
```

---

## Troubleshooting

### Issue: "No packages found"

**Solution:** Check internet connection. Default packages require fetching Door43 catalog on first load.

### Issue: "Failed to load package"

**Solution:** Package may reference unavailable resources. Create a new package or import a working one.

### Issue: "Cannot move resource"

**Solution:** Some resources (anchor) have restrictions. Change the anchor resource first.

### Issue: "Import failed"

**Solution:** Verify JSON structure matches PackageExport format. Check console for validation errors.

### Issue: "Package won't activate"

**Solution:** Package must have at least one anchor resource. Add one and try again.

---

## Feature Highlights

### 🌐 Cross-Platform
- Same functionality on web and native
- Platform-appropriate storage (SQLite/IndexedDB)
- No configuration needed

### 📴 Offline-First
- Works without internet after initial setup
- Cached resource discovery
- Local package storage

### 🔄 Flexible
- Mix languages freely
- Combine different organizations
- Customize panel layouts
- Share configurations

### 📦 Shareable
- Export as JSON
- Import from others
- No vendor lock-in
- Standard format

### 🚀 Future-Ready
- Extensible template system
- Support for custom servers
- Cloud sync ready
- Community packages ready

---

## Support

For questions or issues:
1. Check `RESOURCE_PACKAGE_IMPLEMENTATION_SUMMARY.md` for detailed architecture
2. Check `RESOURCE_PACKAGES_PROPOSAL.md` for original design
3. Check `CURRENT_ARCHITECTURE_AND_DEFAULT_PACKAGES.md` for integration details
4. Open an issue on GitHub

---

**The Resource Package System is ready to use!** 🎉




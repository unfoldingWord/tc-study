# Multi-Zip Resource Architecture Plan

## Problem Statement
Current implementation uses a single 56MB `resources.zip` file which:
- ❌ Times out in Metro dev server (development issue)
- ✅ Works in production builds BUT we can't test it easily
- ❌ All-or-nothing loading (can't load resources on-demand)

## Proposed Solution
Split resources into multiple smaller zip files that can be:
- ✅ Loaded through Metro in development (< 5-10MB per file)
- ✅ Bundled in production builds
- ✅ Downloaded on-demand at runtime
- ✅ Cached in database after first use

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  @bt-synergy/resource-packager (New Library)                │
│  - Downloads resources from servers                          │
│  - Splits into optimally-sized zips                          │
│  - Generates manifest of resource→zip mapping                │
│  - CLI tool for build-time generation                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  setup-resources.js (Setup Script)                           │
│  - Runs resource-packager to generate zips                   │
│  - Updates metro.config.js with zip extensions               │
│  - Updates app.json with asset list                          │
│  - Generates manifest.json for runtime                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  assets/bundled/                                             │
│  ├── manifest.json         (maps resources to zip files)    │
│  ├── ult-genesis.zip       (2MB - ULT Genesis content)      │
│  ├── ult-exodus.zip        (3MB - ULT Exodus content)       │
│  ├── tn-genesis.zip        (4MB - Translation Notes)        │
│  ├── tw-general.zip        (1MB - Translation Words)        │
│  └── ...                   (more resource packages)          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ResourceLoader (Runtime)                                    │
│  - Checks if resource exists in DB                           │
│  - If not: loads appropriate zip from assets                 │
│  - Extracts and stores in database                           │
│  - Returns resource data                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Design

### 1. Resource Splitting Strategy

**Option A: By Resource + Book** (RECOMMENDED)
```
ult-gen.zip      (ULT Genesis)
ult-exo.zip      (ULT Exodus)
...
tn-gen.zip       (Translation Notes Genesis)
tn-exo.zip       (Translation Notes Exodus)
...
tw-bible.zip     (All Translation Words - smaller, can be one file)
```

**Pros:**
- Granular on-demand loading
- User only downloads what they view
- Each zip is ~1-5MB (Metro-friendly)

**Cons:**
- More files to manage
- Slightly more complex manifest

**Option B: By Resource Type**
```
ult-all.zip      (All ULT content - ~20MB)
tn-all.zip       (All TN content - ~15MB)
tw-all.zip       (All TW content - ~5MB)
```

**Pros:**
- Fewer files
- Simpler manifest

**Cons:**
- Still might timeout in Metro (if any > 10MB)
- Less granular loading

**DECISION: Go with Option A** - By Resource + Book for maximum flexibility

---

### 2. Library Structure: `@bt-synergy/resource-packager`

```
packages/resource-packager/
├── src/
│   ├── downloader/
│   │   ├── index.ts              (main downloader logic)
│   │   ├── servers/              (DCS, Door43 adapters)
│   │   └── types.ts
│   ├── packager/
│   │   ├── index.ts              (zip creation logic)
│   │   ├── splitter.ts           (splitting strategy)
│   │   ├── manifest-generator.ts (creates manifest.json)
│   │   └── optimizer.ts          (size optimization)
│   ├── cli/
│   │   └── build.ts              (CLI entry point)
│   └── index.ts                  (main exports)
├── package.json
├── tsconfig.json
└── README.md
```

**Key Functions:**
```typescript
// Main API
interface ResourcePackager {
  download(config: DownloadConfig): Promise<void>;
  package(options: PackageOptions): Promise<PackageResult>;
  generateManifest(packages: Package[]): Manifest;
}

// Package Options
interface PackageOptions {
  strategy: 'by-book' | 'by-resource' | 'by-size';
  maxSize: number;  // e.g., 5MB
  outputDir: string;
  resources: ResourceConfig[];
}

// Manifest Structure
interface Manifest {
  version: string;
  packages: {
    [key: string]: {  // e.g., "ult-gen"
      file: string;     // "ult-gen.zip"
      size: number;
      resources: string[];  // ["ult/gen"]
      hash: string;
    }
  };
}
```

---

### 3. Setup Script: `scripts/setup-resources.js`

```javascript
#!/usr/bin/env node

const { ResourcePackager } = require('@bt-synergy/resource-packager');
const fs = require('fs');

async function setupResources() {
  console.log('📦 Setting up resources...');
  
  // 1. Run packager
  const packager = new ResourcePackager();
  await packager.download({
    languages: ['en'],
    resources: ['ult', 'ust', 'tn', 'tw', 'ta'],
    outputDir: './resource-temp'
  });
  
  const result = await packager.package({
    strategy: 'by-book',
    maxSize: 5 * 1024 * 1024, // 5MB
    outputDir: './assets/bundled',
    resources: './resource-temp'
  });
  
  // 2. Generate manifest
  const manifest = packager.generateManifest(result.packages);
  fs.writeFileSync(
    './assets/bundled/manifest.json',
    JSON.stringify(manifest, null, 2)
  );
  
  // 3. Update app.json
  updateAppJson(result.packages);
  
  // 4. Update metro.config.js (if needed)
  updateMetroConfig();
  
  console.log('✅ Resources setup complete!');
  console.log(`   Generated ${result.packages.length} packages`);
  console.log(`   Total size: ${formatSize(result.totalSize)}`);
}

function updateAppJson(packages) {
  const appJson = require('./app.json');
  
  // Find expo-asset plugin
  const assetPlugin = appJson.expo.plugins.find(
    p => Array.isArray(p) && p[0] === 'expo-asset'
  );
  
  if (assetPlugin) {
    // Add all zip files
    assetPlugin[1].assets = packages.map(p => 
      `./assets/bundled/${p.file}`
    );
  }
  
  fs.writeFileSync('./app.json', JSON.stringify(appJson, null, 2));
  console.log('✅ Updated app.json with asset list');
}

setupResources().catch(console.error);
```

---

### 4. Runtime Loader: `lib/services/ResourceLoader.ts`

```typescript
import { Asset } from 'expo-asset';
import { File, Directory, Paths } from 'expo-file-system';
import * as JSZip from 'jszip';
import { DatabaseManager } from '../db/DatabaseManager';
import manifest from '../../assets/bundled/manifest.json';

export class ResourceLoader {
  private dbManager: DatabaseManager;
  private loadedPackages: Set<string> = new Set();
  
  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }
  
  /**
   * Load a specific resource (e.g., "ult", "gen")
   * Downloads and extracts the appropriate zip if not in DB
   */
  async loadResource(resourceId: string, bookCode: string): Promise<any> {
    // Check if already in database
    const cached = await this.dbManager.loadContentFromExtractedFiles(
      resourceId,
      bookCode
    );
    
    if (cached) {
      console.log(`✅ Using cached ${resourceId}/${bookCode}`);
      return cached;
    }
    
    // Find which package contains this resource
    const packageKey = this.findPackage(resourceId, bookCode);
    if (!packageKey) {
      throw new Error(`No package found for ${resourceId}/${bookCode}`);
    }
    
    // Load package if not already loaded
    if (!this.loadedPackages.has(packageKey)) {
      await this.loadPackage(packageKey);
      this.loadedPackages.add(packageKey);
    }
    
    // Try loading again from DB
    return await this.dbManager.loadContentFromExtractedFiles(
      resourceId,
      bookCode
    );
  }
  
  private findPackage(resourceId: string, bookCode: string): string | null {
    const resourceKey = `${resourceId}/${bookCode}`;
    
    for (const [key, pkg] of Object.entries(manifest.packages)) {
      if (pkg.resources.includes(resourceKey)) {
        return key;
      }
    }
    
    return null;
  }
  
  private async loadPackage(packageKey: string): Promise<void> {
    const pkg = manifest.packages[packageKey];
    console.log(`📦 Loading package: ${pkg.file} (${formatSize(pkg.size)})`);
    
    try {
      // Load zip asset
      const assetPath = `../assets/bundled/${pkg.file}`;
      const asset = Asset.fromModule(require(assetPath));
      await asset.downloadAsync();
      
      // Extract and store in DB
      const file = new File(asset.localUri!);
      const zipData = await file.bytes();
      const zip = await JSZip.loadAsync(zipData);
      
      // Process files and insert into DB
      // (Similar to existing extraction logic)
      
      console.log(`✅ Package ${packageKey} loaded`);
    } catch (error) {
      console.error(`❌ Failed to load package ${packageKey}:`, error);
      throw error;
    }
  }
}
```

---

### 5. Updated DatabaseManager Integration

```typescript
// In DatabaseManager.ts
public async loadInitialResourcesFromJSON(): Promise<void> {
  // Check if ANY resources exist in DB
  const hasResources = await this.checkResourcesExist();
  
  if (hasResources) {
    console.log('✅ Resources already loaded in database');
    return;
  }
  
  console.log('📦 No resources in database - will load on-demand');
  console.log('💡 Resources will be loaded when first accessed');
  
  // Don't load anything upfront - let ResourceLoader handle it
}

// In your components/app
const resourceLoader = new ResourceLoader(dbManager);
const content = await resourceLoader.loadResource('ult', 'gen');
```

---

## Implementation Steps

### Phase 1: Library Setup
1. Create `packages/resource-packager` directory
2. Extract resource-downloader logic
3. Implement splitting strategy
4. Add manifest generation
5. Create CLI interface

### Phase 2: Setup Script
1. Create `scripts/setup-resources.js`
2. Integrate with resource-packager
3. Add app.json updater
4. Test zip generation

### Phase 3: Runtime Integration
1. Create `ResourceLoader` class
2. Update `DatabaseManager` to work with multi-zip
3. Update UI to trigger on-demand loading
4. Add loading indicators

### Phase 4: Testing
1. Test in dev mode (Metro)
2. Test in production build
3. Test on-demand loading
4. Performance testing

---

## Expected Results

### Development Mode
- ✅ Each zip < 5MB loads successfully through Metro
- ✅ Resources load on-demand as user navigates
- ✅ Fast iteration during development

### Production Build
- ✅ All zips bundled in APK
- ✅ No network requests needed
- ✅ On-demand extraction from bundled assets
- ✅ APK size = sum of all zips (~56MB)

### User Experience
- ✅ App starts immediately (no upfront loading)
- ✅ Resources load in ~1-2s when first accessed
- ✅ Subsequent access is instant (from DB)
- ✅ Progressive loading as user explores content

---

## Configuration Example

**package.json**
```json
{
  "scripts": {
    "setup:resources": "node scripts/setup-resources.js",
    "prebuild": "npm run setup:resources"
  }
}
```

**Workflow**
```bash
# Developer workflow
npm run setup:resources  # Generate zips + update config
npm run android          # Build and run - works in dev!

# Production build
npm run android:build    # Runs prebuild automatically
```

---

## Benefits

1. **Development**: Works with Metro (no timeouts)
2. **Production**: All assets bundled (works offline)
3. **Performance**: On-demand loading (fast startup)
4. **Flexibility**: Easy to add/update resources
5. **Testability**: Can test production behavior in dev
6. **Maintainability**: Clean separation of concerns



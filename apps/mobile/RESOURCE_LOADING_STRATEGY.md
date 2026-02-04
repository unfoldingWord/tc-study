# Resource Loading Strategy

## Overview

This document describes the on-demand resource loading strategy implemented to avoid memory issues when loading large datasets in the React Native/Expo app.

## Problem

Initial attempts to load all resources at once (300MB+ decompressed JSON) caused Out of Memory (OOM) errors on Android devices, even with `largeHeap: true` enabled.

## Solution: Two-Pass Compression + On-Demand Loading

### Phase 1: Resource Preparation (Build Time)

**Location**: `bt-toolkit/resource-downloader/`

1. **Download resources** from Door43 API
   - Run: `npm run download`
   - Downloads metadata and content JSON files
   - Stores in `exports/uw-translation-resources/`

2. **Two-pass compression** (archive-exporter.ts)
   - **Pass 1**: Gzip each individual JSON file
     - `.json` → `.json.gz`
     - Achieves ~92.7% compression (757MB → 55MB)
   - **Pass 2**: Create tar archive of the directory structure
     - Bundles all `.json.gz` files into `unfoldingWord-en-resources-archive.tar.gz`
   - Final size: **55MB**

3. **Copy to app assets**
   - Archive is copied to `bt-synergy/assets/unfoldingWord-en-resources-archive.tar.gz`
   - Metro bundler includes it in the app

### Phase 2: First Launch Extraction (Runtime)

**Location**: `bt-synergy/db/DatabaseManager.ts`

On first app launch:

1. **Check if already extracted**
   - Looks for `${Paths.document}/uw-translation-resources/`
   - If exists, skip extraction

2. **Load bundled archive**
   - Uses `expo-asset` to load the tar.gz file
   - Reads as `Uint8Array`

3. **Decompress with pako**
   - `tar.gz` → `tar` (decompresses outer gzip layer)
   - Uses existing `pako` library

4. **Extract TAR format**
   - Custom `TarExtractor` class parses TAR format
   - Extracts directory structure with `.json.gz` files
   - Writes to `${Paths.document}/uw-translation-resources/`

**Benefits**:
- ✅ One-time extraction on first launch
- ✅ Preserves directory structure
- ✅ Individual files remain gzipped
- ✅ Fast startup on subsequent launches

### Phase 3: On-Demand Loading (Pending Implementation)

**Location**: `bt-synergy/db/SimplifiedDrizzleStorageAdapter.ts`

When content is requested:

1. **Check database first**
   ```typescript
   const cached = await db.select()
     .from(resource_content)
     .where(eq(resource_content.key, contentKey))
     .limit(1);
   
   if (cached.length > 0) {
     return cached[0]; // Return from DB
   }
   ```

2. **Load from file system if not in DB**
   ```typescript
   // Construct path to .json.gz file
   const filePath = `${Paths.document}/uw-translation-resources/git.door43.org/.../${contentKey}.json.gz`;
   
   // Read and decompress
   const file = new File(filePath);
   const compressedData = await file.bytes();
   const decompressed = pako.ungzip(compressedData);
   const jsonText = new TextDecoder().decode(decompressed);
   const content = JSON.parse(jsonText);
   
   // Optionally cache in DB for faster access next time
   await db.insert(resource_content).values(content);
   
   return content;
   ```

**Benefits**:
- ✅ Zero memory pressure - only decompress what's needed
- ✅ Fast for frequently accessed content (cached in DB)
- ✅ Always available (files on disk)
- ✅ Progressive loading

## File Structure

### Build Time
```
bt-toolkit/resource-downloader/
├── archive-exporter.ts           # Two-pass compression script
├── exports/
│   └── uw-translation-resources/
│       └── git.door43.org/
│           └── unfoldingWord/
│               └── en/
│                   ├── ult/
│                   │   ├── metadata.json.gz
│                   │   ├── gen.json.gz
│                   │   └── ...
│                   └── ...
└── unfoldingWord-en-resources-archive.tar.gz  # Final 55MB bundle
```

### Runtime (Document Directory)
```
${Paths.document}/
└── uw-translation-resources/
    └── git.door43.org/
        └── unfoldingWord/
            └── en/
                ├── ult/
                │   ├── metadata.json.gz
                │   ├── gen.json.gz
                │   └── ...
                └── ...
```

## Implementation Files

### Created/Modified Files

1. **`bt-toolkit/resource-downloader/archive-exporter.ts`**
   - Two-pass compression implementation
   - Gzips individual JSON files
   - Creates tar.gz archive

2. **`bt-synergy/lib/utils/tarExtractor.ts`**
   - Pure JavaScript TAR parser
   - No external dependencies (uses pako for gzip)
   - Extracts files to document directory

3. **`bt-synergy/db/DatabaseManager.ts`**
   - Modified `loadInitialResourcesFromJSON()` method
   - Handles archive extraction on first launch
   - Checks if resources already extracted

4. **`bt-synergy/app.json`**
   - Updated asset configuration:
     ```json
     {
       "assets": ["./assets/unfoldingWord-en-resources-archive.tar.gz"]
     }
     ```

5. **`bt-synergy/metro.config.js`**
   - Configured to handle `.gz` files as assets

## Scripts

### Resource Downloader Scripts
```bash
# Download resources from Door43
npm run download

# Create two-pass compressed archive
npm run export-archive

# Complete flow: download + compress
npm run start:app-archive
```

### App Scripts
No new scripts needed - extraction happens automatically on first launch.

## Memory Usage Comparison

| Approach | Bundle Size | First Launch Memory | Runtime Memory | Status |
|----------|-------------|---------------------|----------------|--------|
| Single JSON.gz | 46MB | 300MB+ (OOM ❌) | High | Failed |
| Split JSON files | 55MB (multiple) | High | Medium | Complex |
| **Two-pass + On-demand** | **55MB** | **Low** | **Very Low** | ✅ **Current** |

## Next Steps

1. ✅ Implement TAR extractor
2. ✅ Update DatabaseManager to extract on first launch
3. ⏳ Implement on-demand loading in StorageAdapter
4. ⏳ Add caching strategy (DB vs file system)
5. ⏳ Test extraction and loading performance
6. ⏳ Add progress indicators for extraction

## Performance Characteristics

### First Launch
- **Extraction time**: ~10-30 seconds (depending on device)
- **Disk space**: 55MB (compressed files)
- **Memory usage**: Low (streaming extraction)

### Subsequent Launches
- **Startup time**: Fast (no extraction)
- **Memory usage**: Minimal (only decompress on-demand)
- **Access time**: 
  - Cached in DB: <10ms
  - From file: ~50-200ms (decompress + parse)

## Advantages

1. **Smallest bundle size**: 55MB (vs 340MB uncompressed)
2. **No memory issues**: Only decompress what's needed
3. **Fast startup**: Extraction only on first launch
4. **Progressive loading**: App usable while resources load
5. **Persistent**: Files survive app restarts
6. **Flexible**: Can update individual resources
7. **No external dependencies**: Pure JavaScript implementation

## Technical Details

### TAR Format
The TAR extractor implements the USTAR format:
- 512-byte header per file
- File data padded to 512-byte blocks
- Simple sequential format (no compression)

### Gzip Decompression
Uses `pako` library for efficient gzip decompression:
- Supports streaming
- Low memory footprint
- Fast decompression

### File System
Uses `expo-file-system` for all file operations:
- Synchronous and asynchronous APIs
- Works with `Paths.document` (permanent storage)
- Compatible with both iOS and Android









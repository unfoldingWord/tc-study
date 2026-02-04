# Bundled Resources Guide

This guide explains how to use the **Bundled Resources** approach, which splits resources into multiple smaller ZIP files to work around Metro dev server's 20MB file size limitation.

## Overview

Instead of one large 55MB archive, we create individual ZIP files for each resource.

Each ZIP filename matches the database `resourceKey` format: `server_owner_language_id.zip`

Examples:
- `git.door43.org_unfoldingWord_en_ult.zip` (~3MB) - Unlocked Literal Translation
- `git.door43.org_unfoldingWord_en_ust.zip` (~21MB) - Unlocked Simplified Translation  
- `git.door43.org_unfoldingWord_en_tn.zip` (~8MB) - Translation Notes
- `git.door43.org_unfoldingWord_en_tw.zip` (~15MB) - Translation Words
- `git.door43.org_unfoldingWord_hbo_uhb.zip` (~4MB) - Hebrew Bible
- `git.door43.org_unfoldingWord_el-x-koine_ugnt.zip` (~2MB) - Greek NT

Each ZIP is under 25MB, so they load successfully in development with Expo Go.

## Quick Start

### 1. Download Resources

```bash
cd resource-downloader
pnpm install
pnpm download
```

This downloads resources to `exports/uw-translation-resources/`

### 2. Bundle Resources

```bash
pnpm bundle-resources
```

This will:
1. Discover all resources in the exports directory
2. Create individual ZIP files for each resource
3. Copy them to `../assets/bundled/`
4. Update `app.json` with asset patterns
5. Generate `lib/services/resources/bundled-resource-loader.ts`

### 3. Use in Your App

In your app's initialization (e.g., `app/_layout.tsx`):

```typescript
import { loadAllBundledResources, areBundledResourcesExtracted } from '@/lib/services/resources/bundled-resource-loader';

// In your app initialization
if (!areBundledResourcesExtracted()) {
  await loadAllBundledResources((current, total, resourceId) => {
    console.log(`Loading ${current}/${total}: ${resourceId}`);
    // Update your loading UI here
  });
}
```

## Directory Structure

### Before Bundling

```
exports/uw-translation-resources/
└── git.door43.org/
    └── unfoldingWord/
        ├── en/
        │   ├── ult/
        │   │   ├── metadata.json.zip
        │   │   └── content/
        │   │       ├── gen.json.zip
        │   │       ├── exo.json.zip
        │   │       └── ...
        │   ├── ust/
        │   ├── tn/
        │   └── ...
        ├── hbo/
        │   └── uhb/
        └── el-x-koine/
            └── ugnt/
```

### After Bundling

```
assets/bundled/
├── git.door43.org_unfoldingWord_en_ult.zip
├── git.door43.org_unfoldingWord_en_ust.zip
├── git.door43.org_unfoldingWord_en_tn.zip
├── git.door43.org_unfoldingWord_en_tq.zip
├── git.door43.org_unfoldingWord_en_tw.zip
├── git.door43.org_unfoldingWord_en_twl.zip
├── git.door43.org_unfoldingWord_en_ta.zip
├── git.door43.org_unfoldingWord_hbo_uhb.zip
└── git.door43.org_unfoldingWord_el-x-koine_ugnt.zip
```

Each ZIP contains: `metadata.json.zip` + `content/*.json.zip`

### After Extraction (in app)

```
Paths.document/uw-translation-resources/
└── git.door43.org/
    └── unfoldingWord/
        ├── en/
        │   ├── ult/
        │   │   ├── metadata.json.zip
        │   │   └── content/
        │   │       ├── gen.json.zip
        │   │       └── ...
        │   └── ...
        ├── hbo/
        │   └── uhb/
        └── el-x-koine/
            └── ugnt/
```

## How It Works

### 1. Resource Discovery

The bundler scans the exports directory and discovers all resources:

```typescript
exports/
  └── uw-translation-resources/
      └── git.door43.org/
          └── unfoldingWord/
              ├── en/       (language)
              │   ├── ult/  (resource)
              │   ├── ust/
              │   └── ...
              ├── hbo/
              └── el-x-koine/
```

### 2. ZIP Creation

For each resource, creates a ZIP containing:
- `metadata.json.zip` (resource manifest)
- `content/*.json.zip` (individual compressed JSON files)

The ZIPs preserve the internal structure but compress the entire resource folder.

### 3. Asset Integration

Updates `app.json`:
```json
{
  "expo": {
    "assetBundlePatterns": [
      "assets/**/*"
    ]
  }
}
```

### 4. Loader Generation

Creates `bundled-resource-loader.ts` with:
- List of all bundled resources
- Asset module imports
- Extraction functions
- Progress tracking

## Benefits

### ✅ Advantages

1. **Works with Metro Dev Server**: All files under 25MB
2. **Parallel Loading**: Can load multiple resources simultaneously
3. **Selective Loading**: Load only needed resources
4. **Progress Tracking**: Know exactly what's loading
5. **Easy Updates**: Update individual resources without re-bundling everything

### ⚠️ Considerations

1. **More Files**: 9 ZIP files instead of 1
2. **Initial Setup**: Slightly more complex than single archive
3. **App Size**: Bundled app size includes all ZIPs

## File Sizes

Typical sizes for English resources:

| Resource | Files | Compressed Size |
|----------|-------|-----------------|
| ult      | ~48   | ~3 MB          |
| ust      | ~66   | ~21 MB         |
| tn       | ~66   | ~8 MB          |
| tq       | ~66   | ~4 MB          |
| tw       | ~962  | ~15 MB         |
| twl      | ~66   | ~2 MB          |
| ta       | ~241  | ~3 MB          |
| uhb      | ~39   | ~4 MB          |
| ugnt     | ~27   | ~2 MB          |
| **Total**| ~1581 | **~62 MB**     |

## Advanced Usage

### Load Specific Resources

```typescript
import { 
  BUNDLED_RESOURCES, 
  loadBundledResource,
  getBundledResourceByKey,
  hasBundledResource 
} from '@/lib/services/resources/bundled-resource-loader';

// Option 1: Load by resourceKey
const ultKey = 'git.door43.org/unfoldingWord/en/ult';
const ultResource = getBundledResourceByKey(ultKey);
if (ultResource) {
  await loadBundledResource(ultResource);
}

// Option 2: Check availability first
if (hasBundledResource('git.door43.org/unfoldingWord/en/ust')) {
  const ustResource = getBundledResourceByKey('git.door43.org/unfoldingWord/en/ust');
  await loadBundledResource(ustResource!);
}

// Option 3: Filter by criteria
const scriptureResources = BUNDLED_RESOURCES.filter(r => 
  r.id === 'ult' || r.id === 'ust'
);

for (const resource of scriptureResources) {
  await loadBundledResource(resource);
}
```

### Custom Progress UI

```typescript
import { loadAllBundledResources } from '@/lib/services/resources/bundled-resource-loader';

await loadAllBundledResources((current, total, resourceId) => {
  const percent = Math.round((current / total) * 100);
  setLoadingProgress(percent);
  setCurrentResource(resourceId);
});
```

### Check Extraction Status

```typescript
import { areBundledResourcesExtracted } from '@/lib/services/resources/bundled-resource-loader';

if (areBundledResourcesExtracted()) {
  console.log('Resources already extracted, ready to use!');
} else {
  console.log('First launch, extracting resources...');
  await loadAllBundledResources();
}
```

## Troubleshooting

### "Module not found" Error

Make sure you've run the bundler:
```bash
cd resource-downloader
pnpm bundle-resources
```

### "Asset not found" Error

Check that `app.json` includes the asset pattern:
```json
{
  "expo": {
    "assetBundlePatterns": ["assets/**/*"]
  }
}
```

### Large Bundle Size

To reduce app size, edit `config.ts` to download only needed resources:

```typescript
resources: [
  { id: 'ult', name: 'ULT', type: 'book' },
  { id: 'ust', name: 'UST', type: 'book' },
  // Comment out resources you don't need
]
```

## Comparison with Other Approaches

| Approach | Dev Server | File Count | Complexity | Flexibility |
|----------|-----------|------------|------------|-------------|
| Single Archive | ❌ (>20MB) | 1 | Low | Low |
| Bundled ZIPs | ✅ | ~9 | Medium | High |
| Individual Files | ✅ | ~1581 | High | Highest |

## Next Steps

1. **Configure Resources**: Edit `config.ts` to select which resources to download
2. **Download**: Run `pnpm download`
3. **Bundle**: Run `pnpm bundle-resources`
4. **Integrate**: Use the generated loader in your app
5. **Test**: Run your app and verify resources load correctly

## See Also

- [README.md](./README.md) - General resource downloader documentation
- [config.ts](./config.ts) - Resource configuration
- [complete-downloader.ts](./complete-downloader.ts) - Download script


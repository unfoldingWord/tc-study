# Preloaded Resources

This document explains how to bundle and preload resources with tc-study for offline-first and faster initial load.

## Overview

Resources can be **preloaded** (bundled at build time) to:
- **Faster initial load** - No need to download resources at runtime
- **Offline-first** - App works immediately without network
- **Reduced API calls** - No hitting Door43 API on every load
- **Predictable performance** - Bundle size is known upfront

## Bundle Configurations

### 📦 Minimal Bundle (`bundle-config.json`)
Original languages only - Best for development and testing.

**Resources:**
- `ugnt` - unfoldingWord® Greek New Testament (1.26 MB compressed)
- `uhb` - unfoldingWord® Hebrew Bible (~2 MB compressed)

**Total:** ~3.5 MB compressed

```bash
bun run bundle:minimal
```

### 📦 Full Bundle (`bundle-config-full.json`)
Original languages + English translations - Production ready.

**Resources:**
- `ugnt` - Greek New Testament
- `uhb` - Hebrew Bible
- `ult` - unfoldingWord® Literal Text (English)
- `ust` - unfoldingWord® Simplified Text (English)

**Total:** ~10-12 MB compressed

```bash
bun run bundle:full
```

## Usage

### 1. Bundle Resources

```bash
# Minimal (dev/testing)
bun run bundle:minimal

# Full (production)
bun run bundle:full

# Or use the CLI directly
cd ../.. && npx bt-bundle bundle --config apps/tc-study/bundle-config.json
```

### 2. Output

Resources are bundled to `public/preloaded/`:
```
public/preloaded/
├── manifest.json          # Resource metadata
├── ugnt.json.gz           # Greek NT (compressed)
├── uhb.json.gz            # Hebrew Bible (compressed)
├── ult.json.gz            # English Literal (if full bundle)
└── ust.json.gz            # English Simplified (if full bundle)
```

### 3. Automatic Loading

The app automatically loads preloaded resources on startup via:
```typescript
// src/contexts/CatalogContext.tsx
import { initializePreloadedResources } from '../lib/preloadedResources'

// Loads all resources from /preloaded/manifest.json
await initializePreloadedResources(catalogManager)
```

No code changes needed - it's automatic! 🎉

## Bundle Info

### Compression

All resources are compressed with gzip:
- **Original:** ~50 MB (raw USFM + metadata)
- **Compressed:** ~3.5-12 MB (60-89% reduction)

### Caching

The bundler caches downloaded zipballs to `.bt-cache/`:
- First bundle: Downloads from Door43
- Subsequent bundles: Uses cache (instant!)

```bash
# View cache stats
npx bt-bundle cache --stats

# Clear cache
npx bt-bundle cache --clear
```

## CI/CD Integration

Add to your build pipeline:

```yaml
# .github/workflows/deploy.yml
- name: Bundle Resources
  run: |
    cd apps/tc-study
    bun run bundle:full

- name: Build App
  run: |
    cd apps/tc-study
    bun run build
    # public/preloaded/ is included in build output
```

## Custom Configurations

Create your own bundle config:

```json
{
  "resources": [
    {
      "owner": "unfoldingWord",
      "language": "es",
      "resourceId": "ult",
      "stage": "prod"
    }
  ],
  "output": "./public/preloaded",
  "format": "json",
  "compress": true,
  "manifest": true,
  "parallel": true
}
```

Then bundle:
```bash
npx bt-bundle bundle --config my-config.json
```

## Resource IDs

Common resource IDs for bundling:

### Original Languages
- `ugnt` - Greek New Testament (el-x-koine)
- `uhb` - Hebrew Bible (hbo)

### English
- `ult` - Literal Text
- `ust` - Simplified Text
- `tw` - Translation Words
- `twl` - Translation Words Links

### Other Languages
Use format: `resourceId-languageCode`
- `ult-es` - Spanish Literal Text
- `ult-fr` - French Literal Text
- `ult-sw` - Swahili Literal Text

See all available: `npx bt-bundle list`

## Troubleshooting

### Resources not showing in app?

1. Check manifest exists: `public/preloaded/manifest.json`
2. Check browser console for loading errors
3. Verify files are accessible: `http://localhost:5173/preloaded/manifest.json`

### Bundle command not found?

```bash
# From repo root
cd packages/resource-bundler
bun install
bun run build

# Or install globally
bun link @bt-synergy/resource-bundler
```

### Out of disk space?

Clear the cache:
```bash
npx bt-bundle cache --clear
```

## Performance

### Bundle Times
- Minimal (2 resources): ~10-15 seconds (first time), ~3 seconds (cached)
- Full (4 resources): ~30-45 seconds (first time), ~5 seconds (cached)

### App Load Impact
- Without preload: ~5-10 seconds to fetch resources from Door43
- With preload: ~0.5-1 second to load from local bundle

### Bundle Size
- Minimal: 3.5 MB (gzipped)
- Full: 10-12 MB (gzipped)
- Modern browsers handle this easily!

## Future Enhancements

- [ ] SQLite export format (for mobile)
- [ ] IndexedDB format (for web offline storage)
- [ ] Incremental updates (only download changed resources)
- [ ] Resource version checking and auto-updates
- [ ] CDN hosting for preloaded bundles

## Related

- [Resource Bundler README](../../packages/resource-bundler/README.md)
- [Resource Type System](../../packages/resource-types/README.md)
- [Door43 API Client](../../packages/door43-api/README.md)

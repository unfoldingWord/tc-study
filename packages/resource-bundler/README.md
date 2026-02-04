# @bt-synergy/resource-bundler

CLI tool for bundling and preloading BT Synergy resources for web and mobile apps.

## Features

- 🚀 **Fast zipball downloads** - Download entire resources in a single request
- 📦 **Static bundling** - Bundle resources with your app at build time
- 🌐 **Web + Mobile ready** - Works for both web and mobile applications
- 💾 **Multiple export formats** - JSON, IndexedDB-ready, manifest files
- ♻️ **Caching** - Smart caching to avoid re-downloading
- 🔧 **Extensible** - Works with existing Door43ApiClient and resource loaders

## Installation

```bash
bun add @bt-synergy/resource-bundler
```

## Usage

### Bundle resources for web app

```bash
# Bundle specific resources
bt-bundle bundle \
  --resources ugnt,uhb,ult-en \
  --output apps/tc-study/public/preloaded \
  --format json \
  --compress

# Bundle with manifest
bt-bundle bundle \
  --resources ugnt,uhb,ult-en,ust-en \
  --output apps/tc-study/public/preloaded \
  --manifest

# List available resources
bt-bundle list

# Clear cache
bt-bundle cache --clear
```

### Use in build scripts

```json
{
  "scripts": {
    "prebuild": "bt-bundle bundle --resources ugnt,uhb,ult-en --output public/preloaded"
  }
}
```

## Resource Bundle Format

Resources are bundled as compressed JSON files with metadata:

```typescript
{
  "metadata": {
    "resourceKey": "unfoldingWord/el-x-koine/ugnt",
    "resourceId": "ugnt",
    "language": "el-x-koine",
    "title": "unfoldingWord® Greek New Testament",
    "version": "0.30",
    "downloadedAt": "2024-01-15T10:30:00Z",
    "format": "usfm",
    "type": "scripture"
  },
  "content": {
    // Processed resource content (books, chapters, verses)
  },
  "checksum": "sha256:..."
}
```

## CLI Commands

### `bundle`

Bundle resources for static deployment.

```bash
bt-bundle bundle [options]
```

**Options:**
- `--resources <list>` - Comma-separated list of resource IDs
- `--config <file>` - JSON config file with resource specifications
- `--output <dir>` - Output directory (default: `./bundled-resources`)
- `--format <type>` - Export format: `json`, `indexeddb`, or `both` (default: `json`)
- `--compress` - Compress JSON output with gzip
- `--manifest` - Generate manifest.json file
- `--parallel` - Download resources in parallel
- `--verbose` - Verbose logging

### `list`

List available resources from Door43.

```bash
bt-bundle list [options]
```

**Options:**
- `--language <code>` - Filter by language (e.g., `en`, `el-x-koine`)
- `--owner <name>` - Filter by owner (e.g., `unfoldingWord`)
- `--type <type>` - Filter by resource type (`scripture`, `words`, etc.)

### `cache`

Manage download cache.

```bash
bt-bundle cache [options]
```

**Options:**
- `--clear` - Clear all cached downloads
- `--stats` - Show cache statistics
- `--path` - Show cache directory path

### `validate`

Validate bundled resources.

```bash
bt-bundle validate <directory>
```

## Configuration File

Create a `bundle-config.json` file:

```json
{
  "resources": [
    {
      "owner": "unfoldingWord",
      "language": "el-x-koine",
      "resourceId": "ugnt",
      "version": "0.30"
    },
    {
      "owner": "unfoldingWord",
      "language": "hbo",
      "resourceId": "uhb",
      "version": "2.1.30"
    },
    {
      "owner": "unfoldingWord",
      "language": "en",
      "resourceId": "ult"
    }
  ],
  "output": "./public/preloaded",
  "format": "json",
  "compress": true,
  "manifest": true
}
```

Then run:

```bash
bt-bundle bundle --config bundle-config.json
```

## Programmatic Usage

```typescript
import { ResourceBundler } from '@bt-synergy/resource-bundler'

const bundler = new ResourceBundler({
  cacheDir: './cache',
  outputDir: './bundled'
})

// Bundle resources
const result = await bundler.bundle({
  resources: [
    { owner: 'unfoldingWord', language: 'el-x-koine', resourceId: 'ugnt' },
    { owner: 'unfoldingWord', language: 'hbo', resourceId: 'uhb' }
  ],
  format: 'json',
  compress: true
})

console.log(`Bundled ${result.resources.length} resources`)
console.log(`Total size: ${result.totalSize} bytes`)
```

## Loading Preloaded Resources

In your web app:

```typescript
import { CatalogManager } from '@bt-synergy/catalog-manager'

// Load preloaded resources at app startup
async function loadPreloadedResources(catalogManager: CatalogManager) {
  const manifestResponse = await fetch('/preloaded/manifest.json')
  const manifest = await manifestResponse.json()
  
  for (const resource of manifest.resources) {
    const resourceResponse = await fetch(`/preloaded/${resource.filename}`)
    const resourceData = await resourceResponse.json()
    
    await catalogManager.importResource(resourceData)
  }
}
```

## Architecture

```
@bt-synergy/resource-bundler
├── cli/              # CLI commands
│   ├── index.ts      # CLI entry point
│   └── commands/     # Command implementations
├── core/             # Core bundling logic
│   ├── Bundler.ts    # Main bundler orchestrator
│   ├── Downloader.ts # Zipball downloader
│   └── Processor.ts  # Resource processor
├── exporters/        # Export format handlers
│   ├── JSONExporter.ts
│   └── ManifestGenerator.ts
└── utils/            # Utilities
    ├── cache.ts      # Cache management
    └── logger.ts     # Logging utilities
```

## Benefits Over On-Demand Downloads

1. **Faster Initial Load** - Resources are already bundled with the app
2. **Offline First** - Works without network connection
3. **Reduced API Calls** - No need to hit Door43 API at runtime
4. **Predictable Performance** - No waiting for downloads
5. **Smaller Bundle** - Compressed resources take less space

## Example: Preload Greek NT and Hebrew Bible

```bash
# In your CI/CD pipeline or build script
bt-bundle bundle \
  --resources ugnt,uhb \
  --output apps/tc-study/public/preloaded \
  --format json \
  --compress \
  --manifest \
  --verbose

# Output:
# ✓ Downloaded ugnt (el-x-koine) - 2.4 MB
# ✓ Downloaded uhb (hbo) - 3.1 MB
# ✓ Processed ugnt - 27 books, 260 chapters
# ✓ Processed uhb - 39 books, 929 chapters
# ✓ Exported ugnt.json.gz - 890 KB
# ✓ Exported uhb.json.gz - 1.2 MB
# ✓ Generated manifest.json
#
# Total: 2 resources, 2.1 MB compressed
```

## License

MIT

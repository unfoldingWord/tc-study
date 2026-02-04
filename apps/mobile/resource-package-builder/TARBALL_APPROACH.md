# Tarball Resource Download Approach

This document explains the tarball-based resource downloading approach used in the Resource Package Builder.

## Overview

Instead of downloading individual files for each resource, we use tarball archives from the Door43 server. This approach provides significant benefits:

- **10-100x fewer HTTP requests** - Single tarball download vs hundreds of individual files
- **Faster downloads** - Reduced network overhead and latency
- **More reliable** - Single download point vs many potential failure points
- **Better for rate-limited APIs** - Fewer requests means less likely to hit rate limits
- **Easier to resume** - Single file to resume vs tracking many files

## How It Works

### 1. Resource Discovery
- Query Door43 Catalog API to find available resources
- Get metadata including tarball URL
- Filter resources based on configuration

### 2. Tarball Download
- Download complete tarball archive for each resource
- Use `zlib` for decompression
- Use `tar` for extraction

### 3. File Processing
- Extract only relevant files (e.g., `.usfm` for scripture, `.tsv` for notes)
- Process files using appropriate processors
- Apply dependency enhancements

### 4. Export
- Export to SQLite database
- Export to compressed JSON
- Maintain compatibility with existing systems

## Resource Types

### Scripture Resources (Book-organized)
- **uw_ult** - UnfoldingWord Literal Text
- **uw_ust** - UnfoldingWord Simplified Translation
- **uw_uhb** - Hebrew Bible
- **uw_ugnt** - Greek New Testament

**File Pattern**: `*.usfm`
**Processing**: Parse USFM format, extract books/chapters/verses

### Translation Helps (Book-organized)
- **uw_tn** - Translation Notes
- **uw_tq** - Translation Questions
- **uw_twl** - Translation Words Links

**File Pattern**: `*.tsv`
**Processing**: Parse TSV format, extract notes/questions

### Reference Resources (Entry-organized)
- **uw_tw** - Translation Words
- **uw_ta** - Translation Academy

**File Pattern**: `*.md`
**Processing**: Parse Markdown, extract articles

## Dependencies

Translation Notes (uw_tn) have dependencies on:
- **uw_ult** - For original language quotes
- **uw_tw** - For link titles
- **uw_ta** - For link titles

This enables enhanced processing with cross-references and proper link resolution.

## Usage

### Build a Package
```bash
# Build using tarball approach
npm run build:tarball-package english-bible-tarball

# With SQLite export
npm run build:tarball-package english-bible-tarball -- --sqlite

# With JSON export
npm run build:tarball-package english-bible-tarball -- --json --compress
```

### Test Downloads
```bash
# Test tarball download for a specific resource
npm run test-download uw_ult -- --owner unfoldingWord --language en --version v86
```

## Configuration

### Package Configuration
```json
{
  "name": "english-bible-tarball",
  "version": "1.0.0",
  "description": "English Bible resources using tarball downloads",
  "outputDir": "outputs/english-bible-tarball",
  "server": "door43",
  "config": {
    "owner": "unfoldingWord",
    "language": "en",
    "version": "v86",
    "stage": "prod"
  },
  "resources": [
    {
      "id": "uw_ult",
      "description": "UnfoldingWord Literal Text",
      "config": {
        "maxBooks": 5
      }
    }
  ]
}
```

### Resource Configuration
- **maxBooks** - Limit number of books for book-organized resources
- **maxEntries** - Limit number of entries for entry-organized resources
- **dependencies** - Specify resource dependencies

## File Structure

```
resource-package-builder/
├── resources/
│   ├── uw_ult/
│   │   ├── index.ts              # Resource definition
│   │   ├── fetcher.ts            # Tarball download logic
│   │   ├── raw-processor.ts      # Basic processing
│   │   └── dependency-processor.ts # Enhanced processing
│   └── uw_tn/
│       ├── index.ts
│       ├── fetcher.ts
│       ├── raw-processor.ts
│       └── dependency-processor.ts
├── servers/
│   └── door43/
│       ├── index.ts              # Server implementation
│       ├── constants.ts          # Server constants
│       └── Door43Client.ts       # API client
├── core/
│   ├── exporters/
│   │   ├── SQLiteExporter.ts     # SQLite export
│   │   └── JSONExporter.ts       # JSON export
│   └── PackageBuilder.ts         # Main orchestrator
├── packages/
│   └── english-bible-tarball.json # Package configuration
└── cli/
    └── build-tarball.ts          # Tarball CLI
```

## Performance Comparison

### Individual File Downloads
- **ULT (5 books)**: ~50 HTTP requests
- **TN (3 books)**: ~30 HTTP requests
- **TW (20 entries)**: ~20 HTTP requests
- **Total**: ~100 HTTP requests

### Tarball Downloads
- **ULT (5 books)**: 1 HTTP request
- **TN (3 books)**: 1 HTTP request
- **TW (20 entries)**: 1 HTTP request
- **Total**: 3 HTTP requests

**Improvement**: 97% reduction in HTTP requests

## Error Handling

- **Network failures**: Retry with exponential backoff
- **Archive corruption**: Re-download tarball
- **Extraction failures**: Log and continue with available files
- **Missing dependencies**: Warn and process without enhancements

## Future Enhancements

- **Parallel downloads**: Download multiple tarballs simultaneously
- **Incremental updates**: Only download changed resources
- **Caching**: Cache tarballs locally for reuse
- **Compression**: Use different compression algorithms
- **Resume**: Resume interrupted downloads

## Troubleshooting

### Common Issues

1. **Rate limiting**: Use API token for higher limits
2. **Large downloads**: Increase timeout settings
3. **Memory usage**: Process files in batches
4. **Disk space**: Clean up temporary files

### Debug Mode

```bash
# Enable verbose output
npm run build:tarball-package english-bible-tarball -- --verbose
```

## Migration from Individual Downloads

The tarball approach is designed to be a drop-in replacement for individual file downloads:

1. **Same output format** - SQLite and JSON exports are identical
2. **Same configuration** - Package configs work with both approaches
3. **Same CLI** - Commands are similar, just use `build-tarball` instead of `build`

## Benefits Summary

- ✅ **Efficiency**: 10-100x fewer HTTP requests
- ✅ **Speed**: Faster downloads and processing
- ✅ **Reliability**: Single download point
- ✅ **Compatibility**: Same output format
- ✅ **Scalability**: Better for large resource sets
- ✅ **Rate limiting**: Fewer API calls
- ✅ **Resume**: Easier to resume failed downloads

















# Background Resource Downloads

This document describes the advanced background resource downloading system in TC Study.

## Overview

The background download system automatically downloads all resource content in the background using Web Workers, ensuring resources are available offline without blocking the UI. Downloads are prioritized and use the most efficient method available (zipball vs individual files).

## Features

### 1. **Automatic Background Downloads**
- Resources are automatically queued for download when added to the workspace
- Downloads run in a separate Web Worker thread (non-blocking)
- Content is saved to IndexedDB cache as it's downloaded

### 2. **Priority-Based Queue**
Resources are downloaded in priority order (lower number = higher priority):

| Priority | Resource Type | Description |
|----------|--------------|-------------|
| 1 | Scripture | Highest priority - primary content |
| 10 | Translation Words | High priority - term definitions |
| 10 | Translation Words Links | High priority - scripture-words linking |
| 30 | Translation Academy | Lower priority - reference material |
| 50 | Default | For any unspecified resource types |

### 3. **Intelligent Download Methods**
The system automatically chooses the optimal download method:

- **Zipball (ZIP)**: Fast, single download for entire resource
  - Used when `release.zipball_url` is available
  - Processes all content from one archive
  - Significantly faster for large resources
  
- **Individual**: Fallback method, downloads files one-by-one
  - Used when zipball is not available
  - More reliable for unstable connections
  - Shows granular progress per file

### 4. **Smart Caching**
- Checks cache before downloading (skip existing content)
- Saves processed content immediately
- No duplicate downloads

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                      Main Thread                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          SimplifiedReadView.tsx                  │   │
│  │  - Triggers downloads when resources loaded      │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
│  ┌─────────────────▼───────────────────────────────┐   │
│  │       useBackgroundDownload() hook               │   │
│  │  - Manages Web Worker lifecycle                  │   │
│  │  - Sends download commands to worker             │   │
│  │  - Receives progress updates                     │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
└────────────────────┼─────────────────────────────────────┘
                     │ postMessage
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Web Worker Thread                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │      backgroundDownload.worker.ts                │   │
│  │  - Receives download requests                    │   │
│  │  - Initializes services (CatalogManager, etc.)   │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
│  ┌─────────────────▼───────────────────────────────┐   │
│  │      BackgroundDownloadManager                   │   │
│  │  - Manages download queue                        │   │
│  │  - Sorts by priority                             │   │
│  │  - Chooses optimal download method               │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
│  ┌─────────────────▼───────────────────────────────┐   │
│  │          CatalogManager                          │   │
│  │  - Routes to appropriate loader                  │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
│  ┌─────────────────▼───────────────────────────────┐   │
│  │        Resource Loaders                          │   │
│  │  - ScriptureLoader                               │   │
│  │  - TranslationWordsLoader                        │   │
│  │  - TranslationAcademyLoader                      │   │
│  │  - TranslationWordsLinksLoader                   │   │
│  │                                                   │   │
│  │  Each implements:                                │   │
│  │  - downloadResource(key, options, onProgress)    │   │
│  │  - Supports 'zip' and/or 'individual' methods    │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
│  ┌─────────────────▼───────────────────────────────┐   │
│  │          Door43ApiClient                         │   │
│  │  - downloadZipball(owner, repo, ref)             │   │
│  │  - fetchTextContent(owner, repo, path, ref)      │   │
│  └─────────────────┬───────────────────────────────┘   │
│                    │                                     │
│  ┌─────────────────▼───────────────────────────────┐   │
│  │       IndexedDBCacheAdapter                      │   │
│  │  - Persists downloaded content                   │   │
│  │  - Checks for existing cached content            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Resource Loader Implementation

Each resource loader implements the `downloadResource()` method:

```typescript
interface ResourceLoader {
  resourceType: string
  
  /**
   * Download entire resource for offline use
   * @param resourceKey - Resource identifier (e.g., "unfoldingWord/en/ult")
   * @param options - Download options
   * @param onProgress - Progress callback
   */
  downloadResource?(
    resourceKey: string,
    options?: {
      method?: 'individual' | 'zip' | 'tar'
      skipExisting?: boolean
    },
    onProgress?: ProgressCallback
  ): Promise<void>
}
```

### Download Method Support by Resource Type

| Resource Type | Zipball Support | Individual Support | Default Method |
|--------------|----------------|-------------------|----------------|
| Scripture | ✅ Yes | ✅ Yes | zip |
| Translation Words | ✅ Yes | ✅ Yes | zip |
| Translation Academy | ✅ Yes | ✅ Yes | zip |
| Translation Words Links | ❌ No | ✅ Yes | individual |

## Usage

### Automatic Background Downloads

Background downloads start automatically when resources are loaded:

```typescript
// In SimplifiedReadView.tsx
const { startDownload } = useBackgroundDownload()

// When resources are loaded for a language:
const loadedResourceKeys = ['owner/lang/resource1', 'owner/lang/resource2']
startDownload(loadedResourceKeys) // Automatically starts worker
```

### Manual Control

You can also manually control downloads:

```typescript
const { 
  startDownload, 
  stopDownload, 
  stats, 
  queue, 
  isDownloading 
} = useBackgroundDownload()

// Start downloads for specific resources
startDownload(['owner/lang/ult', 'owner/lang/tw'])

// Monitor progress
console.log('Stats:', stats)
console.log('Queue:', queue)

// Stop downloads
stopDownload()
```

### Progress Tracking

The system provides real-time progress updates:

```typescript
interface BackgroundDownloadStats {
  total: number           // Total resources in queue
  completed: number       // Successfully downloaded
  failed: number          // Failed downloads
  pending: number         // Not yet started
  currentResourceKey?: string  // Currently downloading
  currentProgress?: number     // Progress % of current resource
}

interface DownloadQueueItem {
  resourceKey: string
  priority: number
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number        // 0-100
  message?: string        // Status message
  error?: string          // Error message if failed
}
```

## Adding a New Resource Type

To add background download support to a new resource type:

### 1. Define Download Priority

```typescript
// In your resource type definition
export const myResourceType: ResourceTypeDefinition = {
  id: 'my-resource',
  displayName: 'My Resource',
  subjects: ['My Subject'],
  
  // Set download priority (lower = higher priority)
  downloadPriority: 20, // Between scripture (1) and TA (30)
  
  loader: MyResourceLoader,
  // ... other config
}
```

### 2. Implement downloadResource()

```typescript
export class MyResourceLoader implements ResourceLoader {
  resourceType = 'my-resource'
  
  async downloadResource(
    resourceKey: string,
    options?: { method?: 'individual' | 'zip'; skipExisting?: boolean },
    onProgress?: ProgressCallback
  ): Promise<void> {
    const method = options?.method || 'zip'
    
    if (method === 'zip') {
      await this.downloadViaZip(resourceKey, onProgress)
    } else {
      await this.downloadIndividual(resourceKey, options?.skipExisting, onProgress)
    }
  }
  
  private async downloadViaZip(
    resourceKey: string, 
    onProgress?: ProgressCallback
  ): Promise<void> {
    // 1. Get metadata with zipball_url
    const metadata = await this.getMetadata(resourceKey)
    const zipUrl = metadata.release?.zipball_url
    
    // 2. Download zipball using Door43ApiClient
    const [owner, language, resourceId] = resourceKey.split('/')
    const ref = metadata.release?.tag_name || 'master'
    const zipballBuffer = await this.door43Client.downloadZipball(
      owner, 
      `${language}_${resourceId}`, 
      ref
    )
    
    // 3. Extract and process files from ZIP
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(zipballBuffer)
    
    const files = Object.keys(zip.files).filter(name => 
      // Filter for your resource's files
      name.endsWith('.md') || name.endsWith('.json')
    )
    
    // 4. Process each file and save to cache
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i]
      const file = zip.files[fileName]
      
      if (!file.dir) {
        const content = await file.async('string')
        const processedContent = this.processContent(content)
        
        // Save to cache
        await this.cacheAdapter.set(`${resourceKey}/${fileName}`, processedContent)
      }
      
      // Report progress
      if (onProgress) {
        onProgress({
          loaded: i + 1,
          total: files.length,
          percentage: ((i + 1) / files.length) * 100,
          message: `Processing ${fileName}`
        })
      }
    }
  }
  
  private async downloadIndividual(
    resourceKey: string,
    skipExisting?: boolean,
    onProgress?: ProgressCallback
  ): Promise<void> {
    // Get list of files to download (from ingredients)
    const metadata = await this.getMetadata(resourceKey)
    const files = metadata.contentMetadata?.ingredients || []
    
    const total = files.length
    let loaded = 0
    
    for (const file of files) {
      // Check cache if skipExisting is true
      if (skipExisting) {
        const cached = await this.cacheAdapter.get(`${resourceKey}/${file.id}`)
        if (cached) {
          loaded++
          continue
        }
      }
      
      // Download and process individual file
      const content = await this.fetchFile(resourceKey, file.id)
      const processed = this.processContent(content)
      await this.cacheAdapter.set(`${resourceKey}/${file.id}`, processed)
      
      loaded++
      if (onProgress) {
        onProgress({
          loaded,
          total,
          percentage: (loaded / total) * 100,
          message: `Downloaded ${file.id}`
        })
      }
    }
  }
}
```

### 3. Register Your Resource Type

```typescript
// In backgroundDownload.worker.ts
import { myResourceType } from './resourceTypes/myResource'

resourceTypeRegistry.register(myResourceType)
```

## Configuration

### BackgroundDownloadManager Options

```typescript
const manager = new BackgroundDownloadManager(
  catalogManager,
  resourceTypeRegistry,
  {
    debug: true,           // Enable debug logging
    autoStart: true,       // Auto-start when resources queued (default: true)
    onQueueUpdate: (queue) => {
      // Handle queue updates
      console.log('Queue:', queue)
    },
    onStatsUpdate: (stats) => {
      // Handle stats updates
      console.log('Stats:', stats)
    }
  }
)
```

### Resource Type Priority Examples

```typescript
// Critical - download first
downloadPriority: 1     // Scripture (primary content)

// High priority
downloadPriority: 10    // Translation Words, Links (referenced frequently)

// Medium priority
downloadPriority: 20    // Custom high-value resources

// Lower priority
downloadPriority: 30    // Translation Academy (reference material)

// Default
downloadPriority: 50    // Anything else
```

## Performance Considerations

### Zipball vs Individual Downloads

For a typical scripture resource with 66 books:

| Method | API Requests | Typical Time | Network Data |
|--------|-------------|--------------|--------------|
| Zipball | 1 | 5-10 seconds | ~5-10 MB |
| Individual | 66 | 30-120 seconds | ~5-10 MB |

**Recommendation**: Always implement zipball support for resources with many files (>10 files).

### Caching Strategy

- Content is cached immediately after processing
- `skipExisting: true` checks cache before downloading
- Processed format is cached (not raw), making subsequent loads instant

### Worker Thread Benefits

- Downloads don't block UI rendering
- User can continue working while downloads happen
- Multiple resources can be processed simultaneously in the worker

## Troubleshooting

### Downloads Not Starting

1. Check that resources are properly registered in the worker:
   ```typescript
   // In backgroundDownload.worker.ts
   resourceTypeRegistry.register(yourResourceType)
   ```

2. Verify resource metadata has required fields:
   - `release.zipball_url` for zipball downloads
   - `contentMetadata.ingredients` for individual downloads

3. Check browser console for errors in the worker

### Slow Downloads

1. Check network connection
2. Verify zipball method is being used (faster)
3. Look for console warnings about fallback to individual downloads

### Cache Issues

1. Check IndexedDB in browser DevTools
2. Clear cache: `cacheAdapter.clear()`
3. Verify cache keys match expected format

## Future Enhancements

Potential improvements for the download system:

1. **Resumable Downloads**: Save progress and resume interrupted downloads
2. **Bandwidth Throttling**: Limit download speed to avoid overwhelming slow connections
3. **Download Scheduling**: Schedule downloads for off-peak times
4. **Selective Downloads**: Allow users to choose which resources to download
5. **Delta Updates**: Only download changed content for resource updates
6. **Parallel Downloads**: Download multiple resources simultaneously (currently sequential)
7. **Compression**: Use gzip compression for individual file downloads

## See Also

- [Resource Types Documentation](./RESOURCE_TYPES.md)
- [Web Workers Guide](./WEB_WORKERS.md)
- [Caching Strategy](./CACHING.md)

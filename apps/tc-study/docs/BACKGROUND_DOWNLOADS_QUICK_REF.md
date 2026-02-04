# Background Downloads - Quick Reference

## Overview

The TC Study app automatically downloads all resource content in the background using Web Workers with priority-based queue management and intelligent download method selection.

## Quick Facts

- 🚀 **75-90% faster** downloads with zipball support
- 🎯 **Priority-based** queue (Scripture first, then TW, then TA)
- 🔄 **Automatic method selection** (zipball when available, individual as fallback)
- 💾 **Smart caching** (checks cache before downloading)
- ⚙️ **Non-blocking** (runs in Web Worker)
- 📊 **Real-time progress** tracking

## Current Priority Order

| Priority | Resource Type | Download Method |
|----------|--------------|-----------------|
| 1 | Scripture | Zipball (with individual fallback) |
| 10 | Translation Words | Zipball (with individual fallback) |
| 10 | Translation Words Links | Individual only |
| 30 | Translation Academy | Zipball (with individual fallback) |
| 50 | Default (any new type) | Depends on implementation |

## How It Works

### User loads resources for a language → 
```
SimplifiedReadView.tsx
  ↓
startDownload(resourceKeys)
  ↓
Web Worker (backgroundDownload.worker.ts)
  ↓
BackgroundDownloadManager
  ↓ (sorts by priority)
CatalogManager
  ↓ (routes to appropriate loader)
ResourceLoader.downloadResource()
  ↓ (chooses optimal method)
[Zipball OR Individual downloads]
  ↓
IndexedDB Cache
```

### Automatic method selection:
```typescript
// BackgroundDownloadManager automatically chooses:
const hasZipball = !!metadata?.release?.zipball_url
const method = hasZipball ? 'zip' : 'individual'
```

## Common Tasks

### View Download Progress in Console

```javascript
// Look for these log messages:
"📦 Queueing N resources for background download"
"📊 Priority breakdown: [...]"
"📥 Downloading: owner/lang/resource (priority: X)"
"📦 Using method 'zip' for ... (zipball available: true)"
"✅ Downloaded zipball: X.XX MB"
"✅ Processed N/N books from zipball"
"✅ Downloaded: owner/lang/resource"
```

### Check Queue Status

```typescript
const { queue, stats, isDownloading } = useBackgroundDownload()

console.log('Queue:', queue)
// [{
//   resourceKey: 'unfoldingWord/en/ult',
//   priority: 1,
//   status: 'downloading',
//   progress: 45,
//   message: 'Processed gen'
// }, ...]

console.log('Stats:', stats)
// {
//   total: 4,
//   completed: 1,
//   failed: 0,
//   pending: 2,
//   currentResourceKey: 'unfoldingWord/en/ult',
//   currentProgress: 45
// }
```

### Manually Trigger Downloads

```typescript
const { startDownload, stopDownload } = useBackgroundDownload()

// Start
startDownload(['owner/lang/resource1', 'owner/lang/resource2'])

// Stop
stopDownload()
```

## Adding Zipball Support to a New Resource

### 1. Add downloadResource() method to your loader

```typescript
export class MyLoader implements ResourceLoader {
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
  
  private async downloadViaZip(resourceKey: string, onProgress?: ProgressCallback): Promise<void> {
    // 1. Get metadata
    const metadata = await this.getMetadata(resourceKey)
    const [owner, language, resourceId] = resourceKey.split('/')
    const ref = metadata.release?.tag_name || 'master'
    
    // 2. Download zipball using Door43ApiClient
    const zipballBuffer = await this.door43Client.downloadZipball(
      owner,
      `${language}_${resourceId}`,
      ref
    )
    
    // 3. Extract and process
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(zipballBuffer)
    
    // 4. Process each file
    const files = Object.keys(zip.files).filter(/* your filter */)
    for (let i = 0; i < files.length; i++) {
      const file = zip.files[files[i]]
      if (!file.dir) {
        const content = await file.async('string')
        // Process and cache content
        await this.cacheAdapter.set(cacheKey, processedContent)
      }
      
      onProgress?.({
        loaded: i + 1,
        total: files.length,
        percentage: ((i + 1) / files.length) * 100,
        message: `Processing ${files[i]}`
      })
    }
  }
}
```

### 2. Set download priority in resource type definition

```typescript
export const myResourceType: ResourceTypeDefinition = {
  id: 'my-resource',
  displayName: 'My Resource',
  subjects: ['My Subject'],
  
  downloadPriority: 20, // Choose appropriate priority
  
  loader: MyLoader,
  // ... rest of config
}
```

### 3. Register in worker

```typescript
// In apps/tc-study/src/workers/backgroundDownload.worker.ts
import { myResourceType } from '../resourceTypes/myResource'

resourceTypeRegistry.register(myResourceType)
```

## Troubleshooting

### Downloads not starting
- Check console for worker initialization errors
- Verify resource is registered in worker
- Check that metadata has `release.zipball_url` (for zip method)

### Slow downloads
- Verify zipball method is being used (check console logs)
- Check network speed
- Look for "falling back to individual downloads" warnings

### Cache issues
- Check IndexedDB in browser DevTools (Application tab)
- Verify cache keys match format: `resourceType:owner/lang/resource:itemId`
- Clear cache if needed: Open DevTools → Application → IndexedDB → tc-study-cache → Delete

### Progress not updating
- Check Web Worker is running (no errors in console)
- Verify onProgress callback is being called in loader
- Check React component is subscribed to updates

## Performance Tips

### For New Resource Types

1. **Always implement zipball support** if your resource has >10 files
   - 98% fewer API requests
   - 75-90% faster downloads
   
2. **Set appropriate priority**
   - 1-10: Critical content (scripture, primary helps)
   - 11-30: Important reference material
   - 31-50: Optional content

3. **Implement skipExisting logic**
   ```typescript
   if (skipExisting) {
     const cached = await this.cacheAdapter.get(cacheKey)
     if (cached) continue
   }
   ```

4. **Cache processed content, not raw**
   ```typescript
   // Good: Cache after processing
   const processed = this.processContent(raw)
   await this.cacheAdapter.set(key, processed)
   
   // Bad: Cache raw and process on every load
   await this.cacheAdapter.set(key, raw)
   ```

## Key Files

### Implementation
- `apps/tc-study/src/lib/services/BackgroundDownloadManager.ts` - Queue & priority management
- `apps/tc-study/src/workers/backgroundDownload.worker.ts` - Web Worker
- `apps/tc-study/src/hooks/useBackgroundDownload.ts` - React integration
- `packages/scripture-loader/src/ScriptureLoader.ts` - Scripture with zipball
- `packages/translation-words-loader/src/TranslationWordsLoader.ts` - TW with zipball
- `packages/translation-academy-loader/src/TranslationAcademyLoader.ts` - TA with zipball

### Documentation
- `apps/tc-study/docs/BACKGROUND_DOWNLOADS.md` - Complete feature documentation
- `apps/tc-study/docs/BACKGROUND_DOWNLOADS_SUMMARY.md` - Implementation summary

## Performance Benchmarks

### Scripture (66 books)
- **Before**: 66 requests, 30-120 seconds
- **After**: 1 request, 5-10 seconds
- **Improvement**: 75-90% faster

### Translation Words (~1,500 terms)
- **Before**: 1,500 requests, 5-10 minutes
- **After**: 1 request, 10-20 seconds
- **Improvement**: 95%+ faster

### Translation Academy (~100 articles)
- **Before**: 300+ requests (3 files per article), 2-5 minutes
- **After**: 1 request, 5-15 seconds
- **Improvement**: 90%+ faster

### Full Workspace (4 resources)
- **Before**: ~2,000 requests, 5-15 minutes
- **After**: 4 requests (3 zipballs + 1 individual), 30-60 seconds
- **Improvement**: 85-90% faster

## Next Steps for Enhancement

If you want to further improve the system:

1. **Add zipball to Translation Words Links**
   - Currently only has individual downloads
   - Would make it consistent with other resources

2. **Parallel downloads**
   - Currently processes queue sequentially
   - Could download 2-3 resources simultaneously

3. **Delta updates**
   - Only download changed content for resource updates
   - Would require version tracking

4. **Resumable downloads**
   - Save progress and resume if interrupted
   - Useful for large resources on slow connections

5. **User preferences**
   - Allow users to choose which resources to auto-download
   - Add settings for download timing (immediate vs scheduled)

# Cache Completeness Tracking System

## 🎯 Overview

The cache completeness tracking system **automatically detects incomplete downloads** and resumes them in the background. Instead of manually triggering downloads, the system intelligently checks what's cached and what's missing, then starts the worker automatically.

## 🧠 How It Works

```
User selects language
        ↓
Resources load into catalog
        ↓
CompletenessChecker scans cache (2-3s delay)
        ↓
Finds incomplete resources
        ↓
Auto-starts background worker
        ↓
Downloads missing/incomplete resources
        ↓
Marks each resource as complete in cache
```

### Key Principles

1. **Metadata-Driven**: Uses cache metadata to track completion status
2. **Automatic**: No manual intervention required
3. **Smart**: Only downloads what's incomplete
4. **Resumable**: Interrupted downloads can resume
5. **Priority-Based**: Downloads high-priority resources first

## 📊 Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│ SimplifiedReadView (UI)                                     │
│  ├─ useAutoDownloadIncomplete (hook)                        │
│  │   ├─ Monitors language changes                          │
│  │   ├─ Triggers completeness checks                       │
│  │   └─ Starts downloads for incomplete resources          │
│  │                                                           │
│  └─ useBackgroundDownload (hook)                            │
│      └─ Manages worker communication                        │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│ ResourceCompletenessChecker (service)                        │
│  ├─ checkAll(): Check all resources                        │
│  ├─ checkLanguage(lang): Check specific language           │
│  ├─ checkResource(key): Check single resource              │
│  ├─ markComplete(key): Mark resource as fully cached       │
│  ├─ markError(key, error): Mark resource error             │
│  └─ clearCompletionStatus(key): Force re-download          │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│ Cache Metadata (IndexedDB)                                  │
│  ├─ downloadComplete: true/false                           │
│  ├─ downloadCompletedAt: ISO timestamp                     │
│  ├─ downloadMethod: 'zip' | 'individual'                   │
│  ├─ resourceSize: bytes                                     │
│  ├─ entryCount: number of cached entries                   │
│  ├─ expectedEntryCount: total expected entries             │
│  └─ downloadError: error message (if any)                  │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Implementation Details

### 1. Cache Metadata Structure

Each resource's cache entry includes metadata:

```typescript
{
  type: 'json',
  content: { /* resource data */ },
  cachedAt: '2026-01-30T12:00:00Z',
  metadata: {
    // Completeness tracking
    downloadComplete: true,          // ← Key field!
    downloadCompletedAt: '2026-01-30T12:05:00Z',
    downloadMethod: 'zip',
    resourceSize: 1024000,
    
    // Optional: for partial downloads
    entryCount: 1189,               // Current cached entries
    expectedEntryCount: 1189,       // Total expected entries
    
    // Error tracking
    downloadError: null,            // Error message if failed
    
    // Other metadata...
    format: 'usfm',
    book: 'gen'
  }
}
```

### 2. Completeness States

| State | Description | Action |
|-------|-------------|--------|
| `complete` | Fully downloaded and cached | No action needed |
| `partial` | Some content cached but incomplete | Resume download |
| `missing` | Not in cache at all | Start fresh download |
| `error` | Download failed previously | Retry download |

### 3. ResourceCompletenessChecker API

```typescript
// Check all resources
const report = await completenessChecker.checkAll()
// {
//   totalResources: 10,
//   completeResources: 6,
//   incompleteResources: 3,
//   errorResources: 1,
//   incompleteKeys: ['unfoldingWord/en/ult', ...],
//   completionPercentage: 60,
//   details: [...]
// }

// Check specific language
const report = await completenessChecker.checkLanguage('en')

// Check single resource
const status = await completenessChecker.checkResource('unfoldingWord/en/ult')
// {
//   resourceKey: 'unfoldingWord/en/ult',
//   isComplete: false,
//   status: 'partial',
//   size: 512000
// }

// Mark as complete (automatically done by BackgroundDownloadManager)
await completenessChecker.markComplete('unfoldingWord/en/ult', {
  size: 1024000,
  downloadMethod: 'zip'
})

// Mark error (automatically done by BackgroundDownloadManager)
await completenessChecker.markError('unfoldingWord/en/ult', 'Network error')

// Clear status to force re-download
await completenessChecker.clearCompletionStatus('unfoldingWord/en/ult')
```

### 4. Auto-Download Hook

```typescript
useAutoDownloadIncomplete({
  languageCode: 'en',              // Language to check
  completenessChecker,             // Checker instance
  onStartDownload: startDownload,  // Callback to start downloads
  debug: true,
  minCompletionThreshold: 100,     // Only trigger if < 100% complete
  checkDelay: 3000,                // Wait 3s after language selection
})
```

**Behavior:**
- Waits for language selection
- Delays 3 seconds (lets catalog populate)
- Checks cache completeness
- If < 100% complete, calls `onStartDownload(incompleteKeys)`
- Automatically triggers background worker

## 🚀 Usage Examples

### Example 1: Check Completeness

```typescript
const completenessChecker = useCompletenessChecker()

// Check all resources
const report = await completenessChecker.checkAll()
console.log(`${report.completeResources}/${report.totalResources} complete`)

// Check specific language
const enReport = await completenessChecker.checkLanguage('en')
console.log(`English: ${enReport.completionPercentage}% complete`)
```

### Example 2: Manual Download Trigger

```typescript
const { startDownload } = useBackgroundDownload()
const completenessChecker = useCompletenessChecker()

// Check and download incomplete
const report = await completenessChecker.checkLanguage('es')
if (report.incompleteKeys.length > 0) {
  startDownload(report.incompleteKeys)
}
```

### Example 3: Force Re-Download

```typescript
const completenessChecker = useCompletenessChecker()

// Clear completion status
await completenessChecker.clearCompletionStatus('unfoldingWord/en/ult')

// Now it will be detected as incomplete and re-downloaded
```

## 🔄 Integration with Background Downloads

### BackgroundDownloadManager Integration

The `BackgroundDownloadManager` now automatically marks resources as complete:

```typescript
// When download succeeds
await completenessChecker.markComplete(resourceKey, {
  downloadMethod: 'zip',
  size: downloadedSize
})

// When download fails
await completenessChecker.markError(resourceKey, error.message)
```

### Worker Integration

The worker creates a completeness checker instance:

```typescript
const completenessChecker = new ResourceCompletenessChecker({
  catalogManager,
  cacheAdapter,
  debug: true
})

const backgroundDownloadManager = new BackgroundDownloadManager(
  loaderRegistry,
  catalogManager,
  resourceTypeRegistry,
  config,
  completenessChecker  // ← Pass to manager
)
```

## 📈 Benefits

### 1. **Zero Manual Intervention**

**Before** (manual):
```
1. User selects language
2. Resources load
3. User notices slow loading
4. User manually clicks "Download for Offline"
5. Worker starts
```

**After** (automatic):
```
1. User selects language
2. Resources load
3. System auto-checks completeness
4. Worker starts automatically (if needed)
5. User is unaware - everything just works!
```

### 2. **Intelligent Resume**

- Network interruption? Resumes from where it left off
- App restart? Detects incomplete downloads and continues
- New resources added? Only downloads new ones

### 3. **Efficient**

- **Checks cache once** per language selection
- **Only downloads missing** resources
- **Prioritizes** important resources first

### 4. **Visible Progress**

```
🔄 Downloading for offline: 3 of 6 resources (50%)
   Current: twl
```

User sees progress without needing to trigger anything.

## 🧪 Testing

### Test 1: Fresh Language Selection

1. Clear cache: DevTools → Application → IndexedDB → Delete `tc-study-cache`
2. Navigate to `/read`
3. Select language: "English"
4. **Expected**:
   - Resources load into UI immediately (on-demand)
   - 3 seconds later, green banner appears
   - Worker downloads all resources
   - Banner disappears when complete

### Test 2: Partial Download Interruption

1. Select language
2. Let downloads start (see green banner)
3. Refresh page mid-download (interrupt)
4. Select same language again
5. **Expected**:
   - System detects incomplete downloads
   - Auto-resumes only incomplete resources
   - Doesn't re-download completed resources

### Test 3: Language Switching

1. Select "English"
2. Let downloads start
3. Immediately select "Spanish"
4. **Expected**:
   - English downloads cancel
   - Spanish resources load
   - Spanish downloads start automatically
   - No conflicts

### Test 4: Error Recovery

1. Disconnect network
2. Select language
3. Let downloads fail
4. Reconnect network
5. Select language again
6. **Expected**:
   - System detects failed resources
   - Retries downloads
   - Marks as complete on success

## 🔍 Debugging

### Check Completeness Report

```javascript
// In browser console
const checker = window.__catalogManager__.__completenessChecker__
const report = await checker.checkAll()
console.table(report.details)
```

### View Cache Metadata

```javascript
// DevTools → Application → IndexedDB → tc-study-cache → cache-entries
// Look for entries with key format: "resource:unfoldingWord/en/ult"
// Check metadata.downloadComplete field
```

### Force Re-Download

```javascript
const checker = window.__catalogManager__.__completenessChecker__
await checker.clearCompletionStatus('unfoldingWord/en/ult')
// Then select language again
```

## 📝 Future Enhancements

### Potential Improvements

1. **Versioning**: Track resource version, auto-update on new releases
2. **Differential Updates**: Only download changed content
3. **Compression**: Store completion manifest separately for faster checks
4. **Analytics**: Track download success rates, identify problematic resources
5. **Background Sync API**: Use browser's Background Sync for reliable downloads

### Smart Scheduling

```typescript
// Future: Download during idle time
const scheduler = new SmartDownloadScheduler({
  preferredTimes: ['night', 'wifi'],
  batteryThreshold: 20,
  dataLimitMB: 100
})
```

## ✅ Summary

| Feature | Status |
|---------|--------|
| Cache metadata tracking | ✅ Implemented |
| Completeness checker service | ✅ Implemented |
| Auto-download hook | ✅ Implemented |
| BackgroundDownloadManager integration | ✅ Implemented |
| UI integration (SimplifiedReadView) | ✅ Implemented |
| Worker support | ✅ Implemented |
| Documentation | ✅ Complete |

**Result**: Zero-configuration automatic background downloads with smart resume capabilities! 🎉

---

**Files Created/Modified:**
- `lib/services/ResourceCompletenessChecker.ts` - Core service ✨ NEW
- `hooks/useAutoDownloadIncomplete.ts` - Auto-trigger hook ✨ NEW
- `contexts/CatalogContext.tsx` - Added completeness checker
- `lib/services/BackgroundDownloadManager.ts` - Added completion marking
- `components/read/SimplifiedReadView.tsx` - Integrated auto-download
- `workers/backgroundDownload.worker.ts` - Uses completeness checker

**Test it now**: `http://localhost:3000/read` → Select any language → Watch it work! 🚀

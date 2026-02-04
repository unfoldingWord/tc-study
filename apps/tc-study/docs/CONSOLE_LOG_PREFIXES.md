# Console Log Prefixes Guide

## 🎯 Quick Reference

All background download and cache-related console logs now have a **single common prefix** `[BG-DL]` for easy filtering, plus component-specific identifiers.

### Prefix Table

| Full Prefix | Component | Purpose |
|-------------|-----------|---------|
| `[BG-DL] 📦 Cache` | ResourceCompletenessChecker | Cache completeness checking & tracking |
| `[BG-DL] 📥 Manager` | BackgroundDownloadManager | Background download orchestration |
| `[BG-DL] 🔄 Auto` | useAutoDownloadIncomplete | Auto-trigger downloads for incomplete resources |
| `[BG-DL] 🔌 Hook` | useBackgroundDownload | React hook for worker communication |
| `[BG-DL] ⚙️ Worker` | backgroundDownload.worker.ts | Web Worker execution |

## 🔍 Console Filtering

### Filter ALL Background Download Logs (Easiest!)

In the browser console filter box, just type:

```
[BG-DL]
```

**This is the master filter!** It will show all logs from all components related to background downloads.

### Filter Specific Components

If you want to see only specific components:

```
[BG-DL] Cache       (completeness checking)
[BG-DL] Manager     (download orchestration)
[BG-DL] Auto        (auto-trigger logic)
[BG-DL] Hook        (worker communication)
[BG-DL] Worker      (worker execution)
```

### Filter Multiple Components

```
[BG-DL] Cache OR [BG-DL] Worker
```

### Filter by Emoji

```
📦
📥
🔄
🔌
⚙️
```

## 📊 Expected Console Output by Prefix

### [BG-DL] 📦 Cache - Completeness Checking

```
[BG-DL] 📦 Cache Checking all resources...
[BG-DL] 📦 Cache Found 6 resources in catalog
[BG-DL] 📦 Cache Check complete in 245ms: { total: 6, complete: 0, incomplete: 6, errors: 0, percentage: 0 }
[BG-DL] 📦 Cache Marked unfoldingWord/en/ult as complete
```

**When you see these:**
- System is scanning cache to determine what's downloaded
- Marking resources as complete/incomplete
- Tracking download metadata

### [BG-DL] 📥 Manager - Download Management

```
[BG-DL] 📥 Manager All downloads complete
```

**When you see these:**
- BackgroundDownloadManager orchestrating downloads
- Managing download queue and priorities
- Overall download lifecycle

### [BG-DL] 🔄 Auto - Auto-Trigger Logic

```
[BG-DL] 🔄 Auto Language changed to en, scheduling check in 3000ms...
[BG-DL] 🔄 Auto Checking completeness...
[BG-DL] 🔄 Auto Completeness report: { total: 6, complete: 0, incomplete: 6, percentage: 0 }
[BG-DL] 🔄 Auto 6 incomplete resources found, starting downloads...
```

**When you see these:**
- Auto-download system detecting language changes
- Scheduling completeness checks
- Triggering downloads automatically

### [BG-DL] 🔌 Hook - Worker Communication

```
[BG-DL] 🔌 Hook Worker initialized
[BG-DL] 🔌 Hook Starting downloads: ["unfoldingWord/en/ult", ...]
[BG-DL] 🔌 Hook Worker message: progress { ... }
[BG-DL] 🔌 Hook Downloads complete
[BG-DL] 🔌 Hook Cleaning up worker
```

**When you see these:**
- React hook managing worker lifecycle
- Sending messages to/from worker
- Handling worker events

### [BG-DL] ⚙️ Worker - Web Worker Execution

```
[BG-DL] ⚙️ Worker Background Download Worker loaded and ready
[BG-DL] ⚙️ Worker Initializing services...
[BG-DL] ⚙️ Worker Initialization complete
[BG-DL] ⚙️ Worker Starting downloads: { resourceKeys: [...], skipExisting: true }
[BG-DL] ⚙️ Worker Download queue: { count: 6, order: [...] }
[BG-DL] ⚙️ Worker Downloading unfoldingWord/en/ult using zip method
[BG-DL] ⚙️ Worker ✅ Downloaded unfoldingWord/en/ult
[BG-DL] ⚙️ Worker Stopping downloads
```

**When you see these:**
- Worker thread executing downloads
- Worker initialization and service setup
- Actual download operations happening

## 🎬 Full Timeline with Prefixes

### Complete Flow (Language Selection to Download Complete)

```
0s    │ 📚 Auto-loading all tc-ready resources for language: en
0-1s  │ 🔍 Catalog search request: {language: 'en', ...}
1s    │ 📦 Catalog search returned 6 results for en
1-2s  │ Loading resource: unfoldingWord/en/ult (type: scripture)
      │ Loading resource: unfoldingWord/en/ust (type: scripture)
      │ Loading resource: unfoldingWord/en/twl (type: words-links)
      │ Loading resource: unfoldingWord/en/tw (type: words)
      │ Loading resource: unfoldingWord/en/ta (type: ta)
2s    │ ✅ All resources loaded for en
      │ 📊 Scripture: 2 resources
      │ 📊 Non-scripture: 4 resources
      │
3s    │ [3-second delay for catalog to settle...]
      │
3-4s  │ [BG-DL] 🔄 Auto Language changed to en, scheduling check in 3000ms...
      │ [BG-DL] 🔄 Auto Checking completeness...
      │ [BG-DL] 📦 Cache Checking all resources...
      │ [BG-DL] 📦 Cache Found 6 resources in catalog
      │ [BG-DL] 📦 Cache Check complete in 245ms: { total: 6, complete: 0, incomplete: 6 }
      │ [BG-DL] 🔄 Auto 6 incomplete resources found, starting downloads...
      │
4s    │ [BG-DL] 🔌 Hook Starting downloads: ["unfoldingWord/en/ult", ...]
      │ [BG-DL] 🔌 Hook Worker initialized
      │
4-5s  │ [BG-DL] ⚙️ Worker Background Download Worker loaded and ready
      │ [BG-DL] ⚙️ Worker Initializing services...
      │ [BG-DL] ⚙️ Worker Initialization complete
      │ [BG-DL] ⚙️ Worker Starting downloads: { resourceKeys: [...], skipExisting: true }
      │ [BG-DL] ⚙️ Worker Download queue: { count: 6, order: [...] }
      │
5s+   │ [BG-DL] ⚙️ Worker Downloading unfoldingWord/en/ult using zip method
      │ [BG-DL] 🔌 Hook Worker message: progress { ... }
      │ [BG-DL] ⚙️ Worker ✅ Downloaded unfoldingWord/en/ult
      │ [BG-DL] 📦 Cache Marked unfoldingWord/en/ult as complete
      │
      │ [BG-DL] ⚙️ Worker Downloading unfoldingWord/en/ust using zip method
      │ [BG-DL] 🔌 Hook Worker message: progress { ... }
      │ [BG-DL] ⚙️ Worker ✅ Downloaded unfoldingWord/en/ust
      │ [BG-DL] 📦 Cache Marked unfoldingWord/en/ust as complete
      │
      │ ... (continues for all resources)
      │
90s   │ [BG-DL] 🔌 Hook Downloads complete
      │ [BG-DL] 📥 Manager All downloads complete
```

## 🐛 Debugging with Prefixes

### Find Issues by Component

**See everything:**
```
Filter: [BG-DL]
```
Shows all background download activity

**Cache not being checked?**
```
Filter: [BG-DL] Cache
```
Look for: "Checking all resources" message

**Downloads not starting?**
```
Filter: [BG-DL] Auto
```
Look for: "incomplete resources found, starting downloads"

**Worker not initializing?**
```
Filter: [BG-DL] Worker
```
Look for: "Initialization complete" message

**Worker communication broken?**
```
Filter: [BG-DL] Hook
```
Look for: "Worker message" logs

### Common Debug Patterns

**Pattern 1: Everything works**
```
✅ Auto-Download detects incomplete
✅ Download-Hook starts worker
✅ Worker initializes
✅ Worker downloads resources
✅ Cache marks complete
```

**Pattern 2: Worker doesn't start**
```
✅ Auto-Download detects incomplete
❌ No Download-Hook "Starting downloads" message
```
**Fix**: Check if `startDownload` callback is connected

**Pattern 3: Downloads don't trigger**
```
✅ Auto-Download schedules check
❌ No Cache "Checking all resources" message
```
**Fix**: Check if completeness checker is initialized

**Pattern 4: Worker errors**
```
✅ Worker initialized
❌ Worker error: "window is not defined"
```
**Fix**: Worker importing React components (already fixed)

## 💡 Pro Tips

### 1. Copy Console Filter

Keep this handy for copy-paste:
```
[BG-DL]
```
That's it! One filter for everything.

### 2. Export Console Log

Right-click in console → "Save as..." → Save complete log

### 3. Use Console Timestamps

Enable timestamps: Console Settings (⚙️) → ☑ "Show timestamps"

### 4. Color Coding

- 🟦 Blue (log): Normal flow
- 🟨 Yellow (warn): Warnings
- 🟥 Red (error): Errors

### 5. Console Groups

```javascript
// In code
console.group('📦 [Cache] Checking resources')
// ... logs
console.groupEnd()
```

## 📝 Quick Test

1. Open console (F12)
2. Type in console filter: `[BG-DL]`
3. Navigate to `/read`
4. Select a language
5. Watch all the background download logs flow through!

## ✅ Summary

All background download logs now have:
- ✅ **Single common prefix** `[BG-DL]` for filtering everything at once
- ✅ Unique emoji identifiers for each component
- ✅ Component-specific names (Cache, Manager, Auto, Hook, Worker)
- ✅ Clear visual hierarchy
- ✅ Professional debugging experience

**Filter everything**: Just type `[BG-DL]` in the console filter! 🎉

---

**Created**: 2026-01-30  
**Last Updated**: 2026-01-30  
**Files Modified**:
- `lib/services/ResourceCompletenessChecker.ts`
- `lib/services/BackgroundDownloadManager.ts`
- `hooks/useAutoDownloadIncomplete.ts`
- `hooks/useBackgroundDownload.ts`
- `workers/backgroundDownload.worker.ts`

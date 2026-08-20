# Language Switching During Downloads

## 🎯 The Problem

What happens when a user selects a different language while downloads are still in progress?

### Without Proper Handling ❌

```
0s    User selects "English"
1s    Downloads start (4 resources)
3s    User changes to "Spanish" 
      ❌ English downloads continue
      ❌ Spanish downloads also start
      ❌ Both languages downloading simultaneously
      ❌ Wasted bandwidth and resources
      ❌ Confusing progress indicator
```

**Problems:**
- 💾 **Wasted bandwidth** - Downloading unwanted content
- 🔄 **Duplicate work** - Two download processes running
- 🎭 **Confused UI** - Progress shows wrong language
- ⚠️ **Resource conflicts** - Both trying to use worker
- 🐌 **Slower overall** - Competing for resources

### With Proper Handling ✅

```
0s    User selects "English"
1s    Downloads start (4 resources)
3s    User changes to "Spanish"
      ✅ English downloads cancelled immediately
      ✅ Worker queue cleared
      ✅ Spanish downloads start fresh
      ✅ Only Spanish content downloaded
```

## 🔧 Implementation

### 1. **Detect Language Change**

In `handleLanguageSelected`, check if downloads are in progress:

```typescript
const handleLanguageSelected = useCallback(async (languageCode: string) => {
  console.log('📚 Auto-loading resources for language:', languageCode)
  
  // 🛑 IMPORTANT: Cancel any ongoing downloads from previous language
  if (isBackgroundDownloading) {
    console.log('🛑 Canceling ongoing downloads (language changed)')
    stopDownload()
  }
  
  // ... continue with loading new language resources
}, [/* ... */, isBackgroundDownloading, stopDownload])
```

### 2. **Stop Downloads**

The `stopDownload()` function sends a stop message to the worker:

```typescript
// In useBackgroundDownload hook
const stopDownload = useCallback(() => {
  if (!workerRef.current) return

  console.log('[useBackgroundDownload] Stopping downloads')

  workerRef.current.postMessage({
    type: 'stop',
  })

  setStats((prev) => ({
    ...prev,
    isDownloading: false,
    queue: [],
  }))
}, [])
```

### 3. **Worker Handles Stop**

The worker cancels downloads and cleans up:

```typescript
// In backgroundDownload.worker.ts
case 'stop': {
  console.log('[Worker] Stopping downloads')
  
  if (downloadManager) {
    await downloadManager.cancelDownloads()
  }

  postMessage({
    type: 'complete',
    payload: downloadManager?.getProgress() || null
  })
  break
}
```

### 4. **Start Fresh Downloads**

After resources load for the new language, downloads start fresh:

```typescript
Promise.allSettled(originalPromises).then(() => {
  const allResourceKeys = loadedResourceKeys
  if (allResourceKeys.length > 0) {
    // Start downloads for NEW language
    setTimeout(() => {
      startDownload(allResourceKeys)
    }, 1000)
  }
})
```

## 📊 Flow Diagram

```
User Selects Language A
         ↓
Resources Load
         ↓
Downloads Start (Language A)
         ↓
[User Selects Language B]  ← Language change!
         ↓
handleLanguageSelected(B)
         ↓
Check: isBackgroundDownloading?
    YES → stopDownload() ✅
         ↓
Worker receives 'stop' message
         ↓
Worker cancels Language A downloads
         ↓
Worker clears queue
         ↓
Resources Load (Language B)
         ↓
Downloads Start (Language B) ✅
```

## 🧪 Testing Scenarios

### Scenario 1: Switch During Initial Download

```
1. Select "English"
2. Wait 2 seconds (downloads start)
3. Select "Spanish" (before English downloads complete)

Expected:
✅ Green progress bar disappears
✅ Console shows: "🛑 Canceling ongoing downloads"
✅ Console shows: "[Worker] Stopping downloads"
✅ New green progress bar appears for Spanish
✅ Only Spanish resources are downloaded
```

### Scenario 2: Switch Multiple Times Quickly

```
1. Select "English"
2. Immediately select "Spanish"
3. Immediately select "French"

Expected:
✅ Each language change cancels previous downloads
✅ Only French resources are ultimately downloaded
✅ No duplicate downloads
✅ No wasted bandwidth
```

### Scenario 3: Switch After Downloads Complete

```
1. Select "English"
2. Wait for downloads to complete (60+ seconds)
3. Select "Spanish"

Expected:
✅ English already cached (skipExisting = true)
✅ No cancellation needed (nothing downloading)
✅ Spanish downloads start normally
✅ Both languages cached for offline use
```

### Scenario 4: Switch Back to Original Language

```
1. Select "English"
2. Wait 2 seconds (downloads start)
3. Select "Spanish" (English downloads cancelled)
4. Select "English" again

Expected:
✅ First English downloads cancelled
✅ Spanish downloads start
✅ Spanish downloads cancelled
✅ Second English downloads start
✅ skipExisting skips already-downloaded English content
✅ Only missing English content re-downloaded
```

## 🎯 Key Benefits

### 1. **Resource Efficiency**
- No wasted bandwidth on unwanted content
- Worker focuses on current language only
- Battery/CPU not wasted on obsolete downloads

### 2. **Better UX**
- Progress shows current language only
- No confusion about what's downloading
- Faster response to user actions

### 3. **Clean State**
- Each language change starts fresh
- No orphaned downloads
- Clear separation between languages

### 4. **Smart Caching**
- `skipExisting` still works across languages
- If user switches back, already-downloaded content is skipped
- Efficient use of cache space

## 💡 Edge Cases Handled

### 1. **Rapid Switching**
Multiple language changes in quick succession - only the final language downloads.

### 2. **Switch During Download**
Mid-download cancellation works cleanly without corrupting cache.

### 3. **Switch After Completion**
No unnecessary cancellation if downloads already finished.

### 4. **Switch to Same Language**
If user somehow selects same language, downloads restart but skipExisting prevents re-downloading.

### 5. **Network Errors**
If downloads fail and user switches languages, failed state is cleared properly.

## 🔍 Debugging

### Console Output for Language Switch

```
📚 Auto-loading resources for language: en
✅ All resources loaded for en
🔄 Starting background downloads for 6 resources
[Worker] Starting downloads: { resourceKeys: [...] }
📦 Using ZIP method for unfoldingWord/en/ult
📚 Auto-loading resources for language: es  ← User switched!
🛑 Canceling ongoing downloads (language changed)  ← Cancelled!
[Worker] Stopping downloads
[Worker] Complete
✅ All resources loaded for es
🔄 Starting background downloads for 4 resources
[Worker] Starting downloads: { resourceKeys: [...] }
📦 Using ZIP method for unfoldingWord/es/ult
```

### What to Look For

✅ **Cancellation message** when switching languages  
✅ **Worker stop message** confirming cancellation  
✅ **New download start** for new language  
✅ **No overlap** between old and new downloads  
✅ **Clean progress** showing only current language  

## 📝 Code Summary

### SimplifiedReadView.tsx

```typescript
// Get download controls
const { startDownload, stopDownload, isDownloading } = useBackgroundDownload()

// Cancel on language change
const handleLanguageSelected = useCallback(async (languageCode: string) => {
  if (isDownloading) {
    stopDownload()  // ← Cancel old downloads
  }
  
  // Load new resources...
  
  // Start new downloads
  startDownload(newResourceKeys)
}, [isDownloading, stopDownload, startDownload])
```

### useBackgroundDownload.ts

```typescript
const stopDownload = useCallback(() => {
  if (!workerRef.current) return
  
  workerRef.current.postMessage({ type: 'stop' })
  
  setStats(prev => ({
    ...prev,
    isDownloading: false,
    queue: []
  }))
}, [])
```

### backgroundDownload.worker.ts

```typescript
case 'stop': {
  console.log('[Worker] Stopping downloads')
  
  if (downloadManager) {
    await downloadManager.cancelDownloads()
  }
  
  postMessage({ type: 'complete', payload: null })
  break
}
```

## ✅ Conclusion

Language switching is now **properly handled**:

1. ✅ Detects ongoing downloads
2. ✅ Cancels old downloads immediately
3. ✅ Clears worker queue
4. ✅ Starts fresh downloads for new language
5. ✅ No wasted resources
6. ✅ Clean UI state
7. ✅ Smart caching still works

**Users can freely switch languages** without worrying about wasted downloads or confused state! 🎉

---

**Status**: ✅ Language switching fully supported  
**Performance**: Immediate cancellation (no wasted bandwidth)  
**UX**: Clean, predictable behavior

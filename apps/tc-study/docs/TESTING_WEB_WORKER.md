# Testing the Web Worker - Verification Guide

## 🧪 Quick Verification Steps

### Step 1: Check Worker Initialization

Open your browser console (F12) and look for:

```
[useBackgroundDownload] Worker initialized
[Worker] Background Download Worker loaded and ready
```

If you see these messages, the worker loaded successfully! ✅

### Step 2: Trigger a Download

Add this test component to your app:

```tsx
// Add to any page temporarily
import { useBackgroundDownload } from './hooks'

function WorkerTest() {
  const { startDownload, stats, isDownloading } = useBackgroundDownload({
    debug: true  // Enable debug mode
  })
  
  const handleTest = () => {
    console.log('🧪 Testing worker...')
    startDownload(['unfoldingWord/en/ult'])
  }
  
  return (
    <div style={{ padding: '20px', background: '#f0f0f0' }}>
      <h3>Worker Test Panel</h3>
      <button onClick={handleTest}>Test Worker Download</button>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </div>
  )
}
```

### Step 3: Watch Console Output

After clicking the button, you should see:

```
🧪 Testing worker...
[useBackgroundDownload] Starting downloads: ['unfoldingWord/en/ult']
[Worker] Initializing services...
[Worker] Initialization complete
[Worker] Starting downloads: { resourceKeys: [...], skipExisting: true }
[Worker] Download queue: { count: 1, order: [...] }
📦 Using ZIP method for unfoldingWord/en/ult (zipball available)
📥 Downloading unfoldingWord/en/ult with method: zip
✅ Downloaded unfoldingWord/en/ult
[Worker] ✅ Downloaded unfoldingWord/en/ult
```

If you see messages from `[Worker]`, the worker is running! ✅

---

## 🔍 Detailed Verification Methods

### Method 1: Check Worker Thread in DevTools

1. Open Chrome DevTools (F12)
2. Go to **Sources** tab
3. Look for **Threads** panel (right side)
4. You should see:
   - `Main` (main thread)
   - `backgroundDownload.worker.ts` (worker thread)

**Screenshot location:**
```
Sources → Threads → backgroundDownload.worker.ts
```

If you see the worker thread, it's loaded! ✅

---

### Method 2: Check Network Activity

1. Open **Network** tab in DevTools
2. Start a download
3. Look for requests to:
   - `https://git.door43.org/.../zipball` (ZIP downloads)
   - `https://git.door43.org/.../raw/...` (individual files)

**What to verify:**
- ✅ Requests are happening (worker is making API calls)
- ✅ UI remains responsive (not blocking main thread)
- ✅ Progress updates appear in console

---

### Method 3: Check IndexedDB Cache

1. Open **Application** tab in DevTools
2. Expand **IndexedDB** → **tc-study-cache** → **cache-entries**
3. Start a download
4. Refresh the IndexedDB view
5. You should see new entries appearing

**What to verify:**
- ✅ Cache entries are created
- ✅ Content is saved (not empty)
- ✅ Keys follow pattern: `scripture:resourceKey:bookId`

---

### Method 4: Performance Check (UI Non-Blocking)

**Test 1: UI Responsiveness**

1. Start a large download (all 4 resources)
2. Try to:
   - Click buttons
   - Scroll the page
   - Type in text fields
   - Navigate to other pages

**Expected:** UI should remain fully responsive ✅

**If UI freezes:** Worker is not running correctly ❌

**Test 2: CPU Usage**

1. Open **Performance** tab in DevTools
2. Click record
3. Start a download
4. Wait 10 seconds
5. Stop recording

**What to look for:**
- Main thread: Should be mostly idle (light activity)
- Worker thread: Should show activity (processing)

If you see the opposite (main thread busy, worker idle), the worker isn't working ❌

---

## 🐛 Common Issues and Solutions

### Issue 1: Worker Not Loading

**Symptom:**
```
Error: Failed to construct 'Worker'
```

**Causes:**
1. Bundler doesn't support Web Workers
2. Incorrect worker path
3. CORS/CSP issues

**Solutions:**

**For Vite:**
```typescript
// vite.config.ts
export default defineConfig({
  worker: {
    format: 'es',
    plugins: [
      // Enable worker support
    ]
  }
})
```

**For Webpack:**
```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.worker\.ts$/,
        use: { loader: 'worker-loader' }
      }
    ]
  }
}
```

**For CRA (Create React App):**
CRA has built-in worker support. Just import:
```typescript
new Worker(new URL('./worker.ts', import.meta.url))
```

---

### Issue 2: Worker Loads But Doesn't Run

**Symptom:**
```
[useBackgroundDownload] Worker initialized
// But no [Worker] messages after starting download
```

**Cause:** Worker message handler not receiving messages

**Solution:** Check worker initialization:

```typescript
// In worker file, add debug:
self.onmessage = async (event: MessageEvent) => {
  console.log('[Worker] Received message:', event.data)  // Add this
  // ... rest of handler
}
```

---

### Issue 3: Downloads Happen But On Main Thread

**Symptom:**
- Console shows download logs
- UI freezes during downloads
- No `[Worker]` prefix in logs

**Cause:** Worker not initialized, falling back to main thread

**Solution:** Check worker initialization error:

```typescript
const { startDownload, stats } = useBackgroundDownload({
  debug: true
})

// Check stats.error
console.log('Worker error?', stats.error)
```

---

### Issue 4: Progress Not Updating

**Symptom:**
```
[Worker] Starting downloads...
// Then nothing
```

**Cause:** Progress callback not set up correctly

**Solution:** Verify progress callback in BackgroundDownloadManager:

```typescript
// Should be in worker initialization
downloadManager.onProgress((progress) => {
  console.log('[Worker] Progress:', progress)  // Add this
  postMessage({
    type: 'progress',
    payload: progress
  })
})
```

---

## 📊 Expected Console Output (Full Flow)

Here's what you should see for a complete successful download:

```
1. Worker Initialization
   [useBackgroundDownload] Worker initialized
   [Worker] Background Download Worker loaded and ready

2. Download Start
   [useBackgroundDownload] Starting downloads: ['unfoldingWord/en/ult']
   [Worker] Initializing services...
   [Worker] Initialization complete
   [Worker] Starting downloads: { resourceKeys: [...], skipExisting: true }

3. Queue Processing
   [Worker] Download queue: { count: 1, order: [...] }
   
4. Method Selection
   📦 Using ZIP method for unfoldingWord/en/ult (zipball available)
   📥 Downloading unfoldingWord/en/ult with method: zip
   
5. Progress Updates
   [useBackgroundDownload] Worker message: progress {...}
   [Worker] Progress: { loaded: 10, total: 66, percentage: 15 }
   [Worker] Progress: { loaded: 20, total: 66, percentage: 30 }
   [Worker] Progress: { loaded: 30, total: 66, percentage: 45 }
   ...
   
6. Completion
   ✅ Downloaded unfoldingWord/en/ult
   [Worker] ✅ Downloaded unfoldingWord/en/ult
   [useBackgroundDownload] Worker message: complete {...}
```

**Key indicators:**
- ✅ `[Worker]` prefix = Running in worker thread
- ✅ Progress updates = Communication working
- ✅ Main thread logs = React hook receiving messages

---

## 🧪 Automated Test Script

Copy this into your browser console:

```javascript
// Quick Worker Test
(async function testWorker() {
  console.log('🧪 Starting Worker Test...')
  
  // Check if worker-related globals exist
  if (typeof Worker === 'undefined') {
    console.error('❌ Worker API not available')
    return
  }
  console.log('✅ Worker API available')
  
  // Check if catalog manager exists
  const catalogManager = window.__catalogManager__
  if (!catalogManager) {
    console.error('❌ Catalog manager not initialized')
    return
  }
  console.log('✅ Catalog manager found')
  
  // Check if we have resources
  const resources = await catalogManager.getAllResources()
  console.log(`✅ Found ${resources.length} resources in catalog`)
  
  if (resources.length === 0) {
    console.log('ℹ️  No resources to download. Add some resources first.')
    return
  }
  
  // Try to trigger a download via React hook
  console.log('ℹ️  To test worker:')
  console.log('1. Use the WorkerTest component (see docs)')
  console.log('2. Or add <AutoBackgroundDownloader debug={true} /> to your app')
  console.log('3. Watch for [Worker] messages in console')
  
  console.log('🎉 Basic checks passed! Worker should work.')
})()
```

---

## 📈 Performance Benchmarks

Run this test to verify performance:

```typescript
function BenchmarkWorker() {
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const { startDownload, stats, isDownloading } = useBackgroundDownload({
    debug: true
  })
  
  const handleBenchmark = () => {
    setStartTime(Date.now())
    startDownload(['unfoldingWord/en/ult'])
  }
  
  useEffect(() => {
    if (!isDownloading && startTime > 0 && endTime === 0) {
      setEndTime(Date.now())
    }
  }, [isDownloading, startTime, endTime])
  
  const duration = endTime > 0 ? (endTime - startTime) / 1000 : 0
  
  return (
    <div>
      <button onClick={handleBenchmark}>Benchmark Download</button>
      {duration > 0 && (
        <div>
          <p>Duration: {duration.toFixed(2)} seconds</p>
          <p>Expected: 5-10 seconds (ZIP method)</p>
          <p>{duration < 10 ? '✅ Good performance!' : '⚠️ Slower than expected'}</p>
        </div>
      )}
    </div>
  )
}
```

**Expected Results:**
- Scripture (ZIP): 5-10 seconds ✅
- Translation Words (ZIP): 10-20 seconds ✅
- Translation Academy (ZIP): 5-15 seconds ✅
- TW Links (Individual): 30-60 seconds ✅

---

## ✅ Final Verification Checklist

- [ ] Console shows `[Worker] Background Download Worker loaded and ready`
- [ ] Console shows `[Worker]` prefix on download logs
- [ ] DevTools shows worker thread in Sources → Threads
- [ ] UI remains responsive during downloads
- [ ] Progress updates appear in real-time
- [ ] IndexedDB shows cached content after download
- [ ] Network tab shows API requests happening
- [ ] No errors in console
- [ ] Download completes successfully

If all checked, your worker is working! 🎉

---

## 🆘 Still Having Issues?

1. **Enable all debug flags:**
   ```tsx
   <AutoBackgroundDownloader debug={true} />
   ```

2. **Check bundler config:**
   - Vite: Worker support enabled by default
   - Webpack: Needs worker-loader
   - CRA: Built-in support

3. **Verify imports:**
   ```typescript
   // Should be:
   new Worker(new URL('../workers/backgroundDownload.worker.ts', import.meta.url), { type: 'module' })
   
   // NOT:
   new Worker('../workers/backgroundDownload.worker.ts')  // Won't work!
   ```

4. **Check browser support:**
   - Chrome: ✅ Full support
   - Firefox: ✅ Full support
   - Safari: ✅ Full support
   - Edge: ✅ Full support
   - IE11: ❌ No support

5. **Look for CSP headers:**
   ```
   Content-Security-Policy: worker-src 'self'
   ```
   Make sure worker-src allows same-origin workers.

---

Need more help? Check these files:
- `useBackgroundDownload.ts` - React hook implementation
- `backgroundDownload.worker.ts` - Worker implementation
- `BackgroundDownloadManager.ts` - Download orchestration

Good luck! 🚀

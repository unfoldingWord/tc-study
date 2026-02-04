# How to See Worker Activity

## 🎯 Quick Start

1. **Navigate to**: `http://localhost:3000/read` (or port 4200)
2. **Select a language** from the dropdown (e.g., "English")
3. **Watch the console** and the **green progress banner**

---

## 📊 What You Should See

### 1️⃣ Before Selecting Language

**Console**:
```
[useBackgroundDownload] Worker initialized
[Worker] Background Download Worker loaded and ready
```

**UI**: 
- No progress banner
- Empty panels saying "Select a language to load resources"

---

### 2️⃣ After Selecting Language

#### Step 1: Resource Discovery (Immediate)

**Console**:
```
📚 Auto-loading all tc-ready resources for language: en
🔍 Catalog search request: {language: 'en', topic: 'tc-ready', ...}
📦 Catalog search returned 6 results for en
```

**UI**:
- Loading spinner appears
- "Loading resources..." message

#### Step 2: Resource Loading (1-3 seconds)

**Console**:
```
Loading resource: unfoldingWord/en/ult (type: scripture)
Loading resource: unfoldingWord/en/ust (type: scripture)
Loading resource: unfoldingWord/en/twl (type: words-links)
Loading resource: unfoldingWord/en/tw (type: words)
Loading resource: unfoldingWord/en/ta (type: ta)
...
✅ All resources loaded for en
📊 Scripture: 2 resources
📊 Non-scripture: 4 resources
```

**UI**:
- Loading spinner visible
- Resources start appearing in panels

#### Step 3: Download Trigger (After 1 second delay)

**Console**:
```
🔄 Starting background downloads for 6 resources
[useBackgroundDownload] Starting downloads: [
  "unfoldingWord/en/ult",
  "unfoldingWord/en/ust",
  "unfoldingWord/en/twl",
  "unfoldingWord/en/tw",
  "unfoldingWord/en/ta",
  "unfoldingWord/en/obs"
]
```

**UI**:
- **Green progress banner appears** at the top:
  ```
  🔄 Downloading for offline: 0 of 6 resources (0%)
  ```

#### Step 4: Worker Initialization (1-2 seconds)

**Console**:
```
[Worker] Received message: {
  type: 'start',
  payload: {
    resourceKeys: [...],
    skipExisting: true
  }
}
[Worker] Initializing services...
[Worker] Services initialized successfully
[Worker] Download queue: {
  count: 6,
  order: [
    { key: "unfoldingWord/en/ult", priority: 1 },
    { key: "unfoldingWord/en/ust", priority: 1 },
    { key: "unfoldingWord/en/twl", priority: 10 },
    { key: "unfoldingWord/en/tw", priority: 20 },
    { key: "unfoldingWord/en/ta", priority: 30 },
    { key: "unfoldingWord/en/obs", priority: 50 }
  ]
}
```

**UI**:
- Green progress banner shows: `🔄 Downloading for offline: 0 of 6 resources (0%)`
- Spinner animating

#### Step 5: Active Downloads (Several seconds to minutes)

**Console** (for each resource):
```
📦 Using ZIP method for unfoldingWord/en/ult (zipball available)
[useBackgroundDownload] Progress: {
  completedResources: 0,
  totalResources: 6,
  currentResource: "unfoldingWord/en/ult",
  overallProgress: 0
}
✅ Downloaded unfoldingWord/en/ult
[useBackgroundDownload] Progress: {
  completedResources: 1,
  totalResources: 6,
  currentResource: "unfoldingWord/en/ust",
  overallProgress: 16
}
📦 Using ZIP method for unfoldingWord/en/ust (zipball available)
✅ Downloaded unfoldingWord/en/ust
[useBackgroundDownload] Progress: {
  completedResources: 2,
  totalResources: 6,
  overallProgress: 33
}
```

**UI** (updates continuously):
```
🔄 Downloading for offline: 1 of 6 resources (16%)
   Current: ust

🔄 Downloading for offline: 2 of 6 resources (33%)
   Current: twl

🔄 Downloading for offline: 3 of 6 resources (50%)
   Current: tw
```

#### Step 6: Completion

**Console**:
```
[useBackgroundDownload] Progress: {
  completedResources: 6,
  totalResources: 6,
  overallProgress: 100
}
[useBackgroundDownload] Downloads complete!
[Worker] All downloads complete
```

**UI**:
- **Green progress banner disappears** (downloads complete!)
- Resources are now fully cached for offline use

---

## 🔍 Debugging: Not Seeing Activity?

### Problem: Worker initializes but nothing happens

**Check**:
1. ✅ Did you select a language?
   - The dropdown at the top of the page
   - Downloads only start AFTER language selection

2. ✅ Check console for this specific message:
   ```
   🔄 Starting background downloads for N resources
   ```
   - If you DON'T see this, downloads never started
   - If you DO see this but no worker activity, there's a communication issue

3. ✅ Check if resources were found:
   ```
   📦 Catalog search returned N results
   ```
   - If N = 0, no resources to download
   - Check if the language has tc-ready resources

### Problem: "Starting downloads" appears but worker doesn't respond

**Check**:
1. Worker initialization:
   ```
   [Worker] Received message: { type: 'start', ... }
   ```
   - If missing, worker isn't receiving messages

2. Check browser console for errors:
   ```
   [Worker] Error: ...
   ```

3. Check Network tab:
   - Should see requests to `git.door43.org/api/v1/...`
   - If no network requests, downloads aren't actually running

### Problem: Downloads are slow or stuck

**Check**:
1. Network speed:
   - ZIP files can be 10-50MB each
   - Check Network tab for request status

2. Check if using ZIP or individual:
   ```
   📦 Using ZIP method for ... (zipball available)
   📄 Using individual method for ... (no zipball)
   ```
   - ZIP is faster but larger single download
   - Individual is slower but more granular

3. Check for errors:
   ```
   ❌ Failed to download ...
   ```

---

## 🎨 Visual Guide

### UI States

#### Before Language Selection
```
┌─────────────────────────────────────┐
│  [Select Language ▼]                │
├─────────────────────────────────────┤
│                                     │
│  Select a language to load          │
│  resources                          │
│                                     │
└─────────────────────────────────────┘
```

#### During Downloads
```
┌─────────────────────────────────────┐
│  [English ▼]                        │
├─────────────────────────────────────┤
│  🔄 Downloading for offline:        │
│     2 of 6 resources (33%)          │
│     Current: twl                    │ ← GREEN BANNER
├─────────────────────────────────────┤
│  Scripture │ Translation Resources  │
│  ────────  │ ───────────────────   │
│  Genesis 1 │ abomination           │
│  ...       │ ...                   │
└─────────────────────────────────────┘
```

#### After Downloads Complete
```
┌─────────────────────────────────────┐
│  [English ▼]                        │
├─────────────────────────────────────┤
│  Scripture │ Translation Resources  │
│  ────────  │ ───────────────────   │
│  Genesis 1 │ abomination           │
│  ...       │ ...                   │
└─────────────────────────────────────┘
```
(Green banner disappears)

---

## 📝 Console Filter Tips

### Show Only Worker Activity

In browser console, click "Filter" and enter:
```
[Worker]
```

### Show Only Progress Updates

Filter:
```
Progress
```

### Show Only Download Completions

Filter:
```
Downloaded
```

### Show All Download-Related

Filter:
```
download OR worker OR progress
```

---

## ✅ Expected Timeline

For a typical 6-resource download:

| Time | Event |
|------|-------|
| 0s | Select language |
| 0-1s | Catalog search |
| 1-2s | Resources load into UI |
| 2-3s | Download trigger (1s delay) |
| 3-4s | Worker initializes |
| 4-30s | Scripture downloads (ZIP, large) |
| 30-45s | TWL downloads |
| 45-60s | TW downloads |
| 60-90s | TA downloads |
| 90s | Complete! |

**Total**: ~1-2 minutes for 6 resources (depends on network speed)

---

## 🎯 Quick Test

1. **Open**: `http://localhost:3000/read`
2. **Open console**: F12 or Cmd+Option+I
3. **Select**: "English" from dropdown
4. **Within 5 seconds, you should see**:
   ```
   📚 Auto-loading all tc-ready resources for language: en
   🔄 Starting background downloads for 6 resources
   [Worker] Received message: { type: 'start', ... }
   [Worker] Download queue: { count: 6, ... }
   📦 Using ZIP method for ...
   ```
5. **Look at top of page**: Green progress banner
6. **Wait 1-2 minutes**: Should see "Downloaded" messages

**If you see all of this** → ✅ Worker is active!  
**If something is missing** → See "Debugging" section above

---

## 🔧 Additional Debugging Tools

### Check IndexedDB (Downloaded Content)

1. Open DevTools → Application tab (Chrome) or Storage tab (Firefox)
2. Expand IndexedDB
3. Look for `bt-synergy-cache` database
4. Check `resources` and `content` stores
5. Each downloaded resource should have entries

### Check LocalStorage (Catalog)

1. Open DevTools → Application/Storage tab
2. Expand Local Storage
3. Look for entries like `resource:unfoldingWord/en/ult`
4. These are catalog metadata entries

### Force Re-download

1. Clear IndexedDB: DevTools → Application → IndexedDB → Right-click → Delete
2. Clear LocalStorage: DevTools → Application → Local Storage → Right-click → Clear
3. Refresh page
4. Select language again
5. Should re-download everything

---

## 📞 Still Not Working?

Check:
1. ✅ Worker file exists: `apps/tc-study/src/workers/backgroundDownload.worker.ts`
2. ✅ Hook file exists: `apps/tc-study/src/hooks/useBackgroundDownload.ts`
3. ✅ No console errors
4. ✅ Network tab shows API requests
5. ✅ Language has tc-ready resources

If all else fails, check:
```javascript
// In SimplifiedReadView.tsx, add after line 770:
console.log('DEBUG: allResourceKeys:', allResourceKeys)
console.log('DEBUG: isBackgroundDownloading:', isBackgroundDownloading)
console.log('DEBUG: downloadStats:', downloadStats)
```

This will help identify where the flow breaks!

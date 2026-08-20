# Background Downloads - Quick Start

## 🚀 Get Started in 2 Minutes

### Step 1: Enable Automatic Downloads

Add to your `App.tsx` or root component:

```tsx
import { AutoBackgroundDownloader } from './components/AutoBackgroundDownloader'

function App() {
  return (
    <CatalogProvider>
      {/* Add this line ⬇️ */}
      <AutoBackgroundDownloader enabled={true} />
      
      {/* Your app content */}
    </CatalogProvider>
  )
}
```

**That's it!** Resources will now download automatically in the background.

---

## 📖 Common Use Cases

### Use Case 1: Fully Automatic (Set It and Forget It)

```tsx
<AutoBackgroundDownloader 
  enabled={true}
  delayMs={2000}       // Wait 2s after resources loaded
  skipExisting={true}   // Don't re-download cached content
  showNotification={false}
/>
```

**Best for**: Most apps, especially when you want zero user interaction.

---

### Use Case 2: Manual Download Button

```tsx
import { useBackgroundDownload } from './hooks'

function DownloadButton() {
  const { startDownload, isDownloading, stats } = useBackgroundDownload({
    skipExisting: true
  })
  
  const handleClick = () => {
    startDownload([
      'unfoldingWord/en/ult',
      'unfoldingWord/en/tw'
    ])
  }
  
  return (
    <div>
      <button onClick={handleClick} disabled={isDownloading}>
        {isDownloading ? 'Downloading...' : 'Download for Offline Use'}
      </button>
      
      {stats.progress && (
        <p>{stats.progress.overallProgress}% complete</p>
      )}
    </div>
  )
}
```

**Best for**: Settings pages, onboarding flows, explicit user actions.

---

### Use Case 3: Pre-Built UI Panel

```tsx
import { BackgroundDownloadPanel } from './components/BackgroundDownloadPanel'

function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      
      {/* Complete UI with progress, stats, and controls */}
      <BackgroundDownloadPanel />
    </div>
  )
}
```

**Best for**: Settings/preferences pages where you want a complete UI.

---

## 🎛️ Configuration Options

### AutoBackgroundDownloader Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable automatic downloads |
| `delayMs` | number | `2000` | Delay before starting (milliseconds) |
| `skipExisting` | boolean | `true` | Skip resources already cached |
| `showNotification` | boolean | `false` | Show toast when downloads start |
| `debug` | boolean | `false` | Enable console logging |

### useBackgroundDownload Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoStart` | boolean | `false` | Auto-start on mount (not recommended) |
| `skipExisting` | boolean | `true` | Skip resources already cached |
| `debug` | boolean | `false` | Enable console logging |

---

## 🐛 Quick Debugging

### Enable Debug Output

```tsx
<AutoBackgroundDownloader 
  enabled={true}
  debug={true}  // ⬅️ Add this
/>
```

You'll see console output like:
```
[AutoBackgroundDownloader] New resources detected: { previous: 0, current: 4, new: 4 }
[AutoBackgroundDownloader] Starting background downloads for: [...]
[Worker] Initializing services...
[Worker] Download queue: { count: 4, order: [...] }
📦 Using ZIP method for unfoldingWord/en/ult (zipball available)
✅ Downloaded unfoldingWord/en/ult
```

### Check IndexedDB Cache

1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** > **tc-study-cache**
4. Click **cache-entries**
5. See all cached resources

---

## ⚡ Performance Tips

### Tip 1: Always Enable `skipExisting`
```tsx
skipExisting={true}  // Saves time and bandwidth!
```

### Tip 2: Set Reasonable Delay
```tsx
delayMs={2000}  // Not too fast (0ms), not too slow (10000ms)
```

### Tip 3: Use ZIP Method When Available
The system auto-detects this, but you can verify:
```tsx
// Check if resource has zipball
console.log(metadata.release?.zipball_url)
// If present, ZIP method will be used automatically
```

---

## 📊 Expected Download Times

| Resource | Books/Entries | Method | Time | API Requests |
|----------|---------------|--------|------|--------------|
| Scripture (66 books) | 66 | ZIP ⚡ | 5-10s | 1 |
| Translation Words | ~1,500 | ZIP ⚡ | 10-20s | 1 |
| Translation Academy | ~100 | ZIP ⚡ | 5-15s | 1 |
| TW Links (66 books) | 66 | Individual | 30-60s | 66 |

**Total for 4 resources**: ~50-105 seconds (0.8-1.75 minutes)

---

## 🎯 Priority Order (Automatic)

Resources download in this order:

1. **Scripture** (priority: 1) - Most important
2. **TW Links** (priority: 10) - Needed for linking
3. **Translation Words** (priority: 20) - Reference material
4. **Translation Academy** (priority: 30) - Training content

You don't need to configure this - it's automatic!

---

## 🚨 Common Issues

### Issue: "Worker failed to load"
**Solution**: Make sure you're using a bundler that supports Web Workers (Vite, Webpack 5+)

### Issue: "Downloads are slow"
**Solution**: 
1. Check if ZIP method is being used: `debug={true}`
2. Verify network connection
3. Make sure `skipExisting={true}`

### Issue: "Nothing happens"
**Solution**:
1. Enable debug: `debug={true}`
2. Check browser console for errors
3. Verify resources are in catalog: `catalogManager.getAllResources()`

---

## 📚 More Information

- **Complete Guide**: [BACKGROUND_DOWNLOADS_IMPLEMENTATION_GUIDE.md](./BACKGROUND_DOWNLOADS_IMPLEMENTATION_GUIDE.md)
- **System Overview**: [BACKGROUND_DOWNLOADS_OVERVIEW.md](./BACKGROUND_DOWNLOADS_OVERVIEW.md)
- **Implementation Complete**: [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)

---

## ✅ Checklist

- [ ] Add `<AutoBackgroundDownloader />` to App.tsx
- [ ] Test by loading some resources
- [ ] Verify downloads in console (enable debug)
- [ ] Check IndexedDB for cached content
- [ ] Test offline functionality (disable network, reload)

**You're done!** 🎉

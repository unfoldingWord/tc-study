# Web Worker "window is not defined" Fix

## 🐛 The Problem

Error when initializing the background download worker:

```
Uncaught ReferenceError: window is not defined
    at @react-refresh:599:1
```

### Root Cause

Web Workers run in a separate global context (`WorkerGlobalScope`) that doesn't have access to:
- ❌ `window`
- ❌ `document`
- ❌ `localStorage` (different from main thread)
- ❌ DOM APIs
- ❌ React's Hot Module Replacement (HMR) code

**The issue**: When importing resource type definitions, we were also importing React components (viewers), which included HMR code that tries to access `window`.

### Original Code (Broken)

```typescript
// ❌ This imports React components with HMR code
import { 
  scriptureResourceType, 
  translationWordsResourceType,
  translationWordsLinksResourceType,
  translationAcademyResourceType 
} from '../resourceTypes'

// Then trying to register them
resourceTypeRegistry.register(scriptureResourceType) // Fails!
```

## ✅ The Solution

**Principle**: Workers should only import what they need - loaders, not viewers!

### 1. **Remove Resource Type Imports**

```typescript
// ❌ REMOVED: Don't import resource types (they have React components)
// import { scriptureResourceType, ... } from '../resourceTypes'

// ✅ KEPT: Only import loaders (pure TypeScript, no React)
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { TranslationWordsLoader } from '@bt-synergy/translation-words-loader'
import { TranslationWordsLinksLoader } from '@bt-synergy/translation-words-links-loader'
import { TranslationAcademyLoader } from '@bt-synergy/translation-academy-loader'
```

### 2. **Manually Register Loaders**

Instead of using `ResourceTypeRegistry` (which requires full resource type definitions), directly register loaders:

```typescript
// Create loader instances
const scriptureLoader = new ScriptureLoader({
  cacheAdapter,
  catalogAdapter,
  door43Client,
  debug: false
})

// Register directly with CatalogManager
catalogManager.registerLoader('scripture', scriptureLoader)

// Repeat for all loaders...
```

### 3. **Create Minimal Priority Registry**

`BackgroundDownloadManager` needs resource type priorities for sorting the download queue. Create a minimal mock:

```typescript
// Minimal resource type registry for priority lookups only
const resourceTypeRegistry = {
  get: (type: string) => {
    const priorities: Record<string, number> = {
      'scripture': 1,
      'words-links': 10,
      'words': 20,
      'ta': 30
    }
    return {
      downloadPriority: priorities[type] || 50
    }
  }
}
```

### 4. **Add Worker Context Check**

Ensure the file only runs in a worker:

```typescript
// Ensure we're running in a worker context
if (typeof WorkerGlobalScope === 'undefined' || !(self instanceof WorkerGlobalScope)) {
  console.error('[Worker] ERROR: This file should only run in a Web Worker context!')
}
```

## 📊 Before vs After

### Before (Broken)

```
Worker File
  ├─ Import resource type definitions
  │   ├─ Scripture resource type
  │   │   ├─ ScriptureLoader ✅
  │   │   └─ ScriptureViewer (React component) ❌
  │   │       └─ @react-refresh (HMR code) ❌
  │   │           └─ Tries to access window ❌❌❌
  │   └─ ...
  └─ 💥 Error: window is not defined
```

### After (Fixed)

```
Worker File
  ├─ Import loaders only
  │   ├─ ScriptureLoader ✅ (pure TypeScript)
  │   ├─ TranslationWordsLoader ✅
  │   ├─ TranslationWordsLinksLoader ✅
  │   └─ TranslationAcademyLoader ✅
  ├─ Manually register loaders
  ├─ Create minimal priority registry
  └─ ✅ Works perfectly!
```

## 🎯 Key Principles

### 1. **Separation of Concerns**

**Main Thread** (has `window`, `document`, React):
- UI components (viewers)
- React rendering
- User interaction
- DOM manipulation

**Worker Thread** (no `window`, no React):
- Data loading (loaders)
- Network requests
- Data processing
- Heavy computation

### 2. **Import Only What You Need**

```typescript
// ✅ Good: Import specific functionality
import { ScriptureLoader } from '@bt-synergy/scripture-loader'

// ❌ Bad: Import entire module with UI components
import { scriptureResourceType } from '../resourceTypes'
```

### 3. **Mock Minimal Interfaces**

If a function needs a complex object but only uses a few methods:

```typescript
// Instead of full ResourceTypeRegistry
const resourceTypeRegistry = {
  get: (type: string) => ({ downloadPriority: getPriority(type) })
}
```

## 🧪 Testing

### Verify the Fix

1. **Start the app**: `npm start`
2. **Open browser console**
3. **Navigate to**: `/read`
4. **Select a language**: e.g., "English"
5. **Look for**:
   ```
   [Worker] Initializing services...
   [Worker] Initialization complete
   ```
6. **Should NOT see**: "window is not defined" error

### Console Output (Success)

```
[useBackgroundDownload] Worker initialized
✅ All resources loaded for en
🔄 Starting background downloads for 6 resources
[useBackgroundDownload] Starting downloads: [...]
[Worker] Initializing services...
[Worker] Initialization complete
[Worker] Starting downloads: { resourceKeys: [...], skipExisting: true }
[Worker] Download queue: { count: 6, order: [...] }
📦 Using ZIP method for unfoldingWord/en/ult (zipball available)
✅ Downloaded unfoldingWord/en/ult
```

## 📝 Files Changed

### backgroundDownload.worker.ts

**Removed**:
- ❌ Import of `ResourceTypeRegistry`
- ❌ Import of resource type definitions
- ❌ `ResourceTypeRegistry` instantiation
- ❌ `resourceTypeRegistry.register()` calls

**Added**:
- ✅ Direct loader instantiation
- ✅ Manual `catalogManager.registerLoader()` calls
- ✅ Minimal priority registry mock
- ✅ Worker context check

## 🔧 Alternative Solutions (Not Used)

### Alternative 1: Split Resource Type Definitions

Could split resource types into separate files:
- `resourceType.loaders.ts` - Just loaders
- `resourceType.viewers.ts` - Just viewers

**Why not used**: More complex, requires refactoring multiple packages.

### Alternative 2: Conditional Imports

Could use dynamic imports to avoid loading viewers:

```typescript
if (typeof window === 'undefined') {
  // Worker context - import only loaders
} else {
  // Main thread - import everything
}
```

**Why not used**: Dynamic imports complicate the code, harder to maintain.

### Alternative 3: Separate Worker Build

Could create a separate build configuration for workers that excludes React:

**Why not used**: More build complexity, not necessary for this fix.

## ✅ Conclusion

**Problem**: Worker tried to import React components → HMR code → `window.undefined` error  
**Solution**: Import only loaders, manually register, mock minimal interfaces  
**Result**: Worker runs cleanly without access to browser APIs ✅

## 🎓 Lessons Learned

1. **Workers are isolated** - No browser APIs, no React, no HMR
2. **Import carefully** - Only import what's needed in each context
3. **Separate concerns** - Keep UI code out of workers
4. **Mock smartly** - Create minimal mocks for complex dependencies
5. **Test thoroughly** - Verify worker initialization succeeds

---

**Status**: ✅ Fixed  
**Test**: `npm start` → Navigate to `/read` → Select language → No errors!  
**Performance**: Unchanged (same functionality, different imports)

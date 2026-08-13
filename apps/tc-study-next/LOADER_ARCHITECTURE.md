# Loader Architecture

## Problem

Previously, resource loaders had to be registered in **two separate places**:

1. **Main Thread** (`src/components/ResourceTypeInitializer.tsx`)
   - Registers resource types with viewers (UI components)
   
2. **Background Download Worker** (`src/workers/backgroundDownload.worker.ts`)
   - Registers loaders for offline downloading

This duplication was error-prone and required updating multiple files when adding new resource types.

## Solution

We now use a **shared configuration file** as the single source of truth:

```
src/config/loaderConfig.ts
```

This file defines:
- Loader IDs
- Display names  
- Download priorities
- Import paths

Both the main thread and worker import from this shared config, ensuring consistency.

## Architecture

### Shared Configuration (`loaderConfig.ts`)

```typescript
export const LOADER_CONFIGS: LoaderConfig[] = [
  {
    id: 'scripture',
    name: 'Scripture',
    loaderImport: '@bt-synergy/scripture-loader',
    downloadPriority: 2,
  },
  {
    id: 'tn',
    name: 'Translation Notes',
    loaderImport: '@bt-synergy/translation-notes-loader',
    downloadPriority: 1,
  },
  // ... more loaders
]
```

### Main Thread Registration

`ResourceTypeInitializer.tsx` imports resource type definitions (which include both loaders AND viewers):

```typescript
import { scriptureResourceType, translationNotesResourceType } from '../resourceTypes'

registry.register(scriptureResourceType)
registry.register(translationNotesResourceType)
// ...
```

### Worker Registration

`backgroundDownload.worker.ts` manually creates loader instances (no React components):

```typescript
import { ScriptureLoader, TranslationNotesLoader } from '@bt-synergy/...'
import { getDownloadPriority } from '../config/loaderConfig'

const scriptureLoader = new ScriptureLoader({ ... })
loaderRegistry.registerLoader('scripture', scriptureLoader)

// Priority lookup uses shared config
const priority = getDownloadPriority('scripture') // Returns 2
```

## Why Not Fully Unified?

You might ask: "Why not have workers use the same registry as the main thread?"

**Constraints:**
1. **Web Workers can't access React** - Workers run in a separate context without `window`/`document`
2. **Resource type definitions include viewers** - These are React components that require browser APIs
3. **Message passing only** - Workers communicate via serializable data (can't share object references)

**Current Compromise:**
- Shared config for **IDs and priorities**
- Separate registration for **loader instances**
- Manual imports in both places (but at least we know what to import from the shared config)

## Adding a New Resource Type

When adding a new resource type (e.g., Translation Questions):

### 1. Update Shared Config (`loaderConfig.ts`)

```typescript
{
  id: 'questions',
  name: 'Translation Questions',
  loaderImport: '@bt-synergy/translation-questions-loader',
  downloadPriority: 25,
}
```

### 2. Create Resource Type Definition

```typescript
// src/resourceTypes/translationQuestions.ts
export const translationQuestionsResourceType: ResourceTypeDefinition = {
  id: 'questions',
  loader: TranslationQuestionsLoader,
  viewer: TranslationQuestionsViewer,
  // ...
}
```

### 3. Register in Main Thread

```typescript
// src/components/ResourceTypeInitializer.tsx
import { translationQuestionsResourceType } from '../resourceTypes'
registry.register(translationQuestionsResourceType)
```

### 4. Register in Worker

```typescript
// src/workers/backgroundDownload.worker.ts
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'

const translationQuestionsLoader = new TranslationQuestionsLoader({ ... })
catalogManager.registerResourceType(translationQuestionsLoader)
loaderRegistry.registerLoader('questions', translationQuestionsLoader)
```

### 5. Add to App Dependencies

```json
// apps/tc-study/package.json
{
  "dependencies": {
    "@bt-synergy/translation-questions-loader": "workspace:*"
  }
}
```

## Future Improvements

**Potential enhancements:**
1. **Dynamic loader imports** - Worker could receive loader class names and import them dynamically
2. **Loader factory** - Centralized factory that creates loader instances for both contexts
3. **Validation** - Ensure worker loaders match those defined in `LOADER_CONFIGS`
4. **Auto-generation** - Script to generate worker registration code from shared config

**Why not implemented yet:**
- Dynamic imports in workers add complexity
- Current solution is "good enough" and explicit
- Type safety would be harder with dynamic approaches

## Benefits

✅ **Single source of truth** for loader IDs and priorities  
✅ **Consistency** between main thread and worker  
✅ **Documentation** of all available loaders in one place  
✅ **Easier to maintain** than scattered hardcoded values  
⚠️ **Still requires manual updates** in 3 places (config, main thread, worker)

## Checklist for Adding Loaders

- [ ] Update `src/config/loaderConfig.ts`
- [ ] Create resource type definition file
- [ ] Register in `ResourceTypeInitializer.tsx`
- [ ] Register in `backgroundDownload.worker.ts`
- [ ] Add to `package.json` dependencies
- [ ] Test in both UI and background downloads

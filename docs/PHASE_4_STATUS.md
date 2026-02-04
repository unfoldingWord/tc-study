# Phase 4 Status: Resource Migration

**Date**: December 30, 2025  
**Status**: 🚧 IN PROGRESS

---

## 🎯 Goal

Migrate existing resource types from `apps/tc-study/src/resourceTypes/` to self-contained packages using the new v2.0 architecture with automatic enhancement.

---

## 📊 Resources to Migrate

| Resource | Loader | Viewer | Status |
|----------|--------|--------|--------|
| **Scripture** | ✅ `@bt-synergy/scripture-loader` | ⏳ In `apps/tc-study/src/components/resources/` | 🚧 In Progress |
| **Translation Words** | ✅ `@bt-synergy/translation-words-loader` | ⏳ In `apps/tc-study/src/components/resources/` | ⏳ Pending |
| **Translation Words Links** | ✅ `@bt-synergy/translation-words-links-loader` | ⏳ In `apps/tc-study/src/components/resources/` | ⏳ Pending |

---

## ✅ What's Complete

### Phase 1-3 Foundation
- ✅ `@bt-synergy/resource-panels` - Inter-panel communication
- ✅ `@bt-synergy/resource-signals` - Standard signal definitions
- ✅ `@bt-synergy/resource-types` v2.0 - Auto-enhancement
- ✅ `@bt-synergy/resource-cli` - Code generation tool

### Existing Loaders (Already Packaged)
- ✅ `@bt-synergy/scripture-loader` - USFM parsing and caching
- ✅ `@bt-synergy/translation-words-loader` - TW article loading
- ✅ `@bt-synergy/translation-words-links-loader` - TSV link parsing

### Package Structure
- ✅ `packages/scripture-resource/` exists (partial)
  - ✅ `src/resourceType.ts` - Resource definition
  - ✅ `src/signals/` - Custom signals
  - ❌ `src/loader/` - Missing (needs to reference `@bt-synergy/scripture-loader`)
  - ❌ `src/viewer/` - Missing (needs migration from app)

---

## 🚧 Current Task: Scripture Resource

### What Needs to Happen

1. **Update `packages/scripture-resource/` with v2.0 API**
   - ✅ Package structure exists
   - ⏳ Update `resourceType.ts` to use `communication` config
   - ⏳ Create `src/loader/index.ts` (re-export from `@bt-synergy/scripture-loader`)
   - ⏳ Create `src/viewer/` directory
   - ⏳ Copy `ScriptureViewer` from app to package
   - ⏳ Update viewer to use `EnhancedViewerProps`
   - ⏳ Define signal handlers in `communication` config
   - ⏳ Build package

2. **Update App to Use New Package**
   - ⏳ Update import in `apps/tc-study/src/contexts/CatalogContext.tsx`
   - ⏳ Change from `../resourceTypes/scripture` to `@bt-synergy/scripture-resource`
   - ⏳ Test in app

3. **Clean Up Old Code**
   - ⏳ Remove `apps/tc-study/src/resourceTypes/scripture/`
   - ⏳ Remove `apps/tc-study/src/components/resources/ScriptureViewer*.tsx`

---

## 📝 Migration Pattern

For each resource, follow this pattern:

### Step 1: Generate Package (if needed)
```bash
cd tools/resource-cli
node dist/index.js create [resource-name] \
  --platforms web \
  --subjects "[Door43 Subject]" \
  --description "[Description]"
```

### Step 2: Update Resource Type Definition

**Before (v1.0 in app)**:
```typescript
export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  loader: ScriptureLoader,
  viewer: ScriptureViewer, // Plain viewer
})
```

**After (v2.0 in package)**:
```typescript
export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  loader: ScriptureLoader,
  viewer: ScriptureViewer, // Auto-enhanced!
  
  communication: {
    metadata: {
      type: 'scripture',
      tags: ['bible', 'primary'],
    },
    handlers: [
      {
        signalType: 'verse-navigation',
        handler: (signal, context) => {
          context.props.onNavigate?.(signal.verse)
        }
      }
    ],
    emits: ['verse-navigation', 'token-click'],
  },
})
```

### Step 3: Create Loader Re-export

```typescript
// packages/[resource]-resource/src/loader/index.ts
export { [Resource]Loader } from '@bt-synergy/[resource]-loader'
```

### Step 4: Migrate Viewer

```typescript
// packages/[resource]-resource/src/viewer/[Resource]Viewer.tsx
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

export const [Resource]Viewer: React.FC<EnhancedViewerProps> = ({
  resource,
  sendSignal, // Auto-available!
  resourceId,
}) => {
  // Your viewer implementation
}
```

### Step 5: Update App Imports

```typescript
// apps/tc-study/src/contexts/CatalogContext.tsx
// Before:
import { scriptureResourceType } from '../resourceTypes/scripture'

// After:
import { scriptureResourceType } from '@bt-synergy/scripture-resource'
```

### Step 6: Test & Clean Up

- Test resource loads correctly
- Test signal communication works
- Remove old code from app

---

## 🎯 Next Steps

### Immediate (Scripture)
1. Update `packages/scripture-resource/src/resourceType.ts` with v2.0 API
2. Create `src/loader/index.ts` (re-export)
3. Create `src/viewer/ScriptureViewer.tsx` (copy + update)
4. Build package
5. Update app imports
6. Test thoroughly

### Short-term (Other Resources)
1. Repeat for Translation Words
2. Repeat for Translation Words Links
3. Clean up old code

### Final
1. Remove `apps/tc-study/src/resourceTypes/` directory
2. Remove `apps/tc-study/src/components/resources/` directory
3. Remove `withPanelCommunication` HOC (no longer needed!)
4. Update documentation

---

## 📊 Estimated Timeline

| Task | Time | Status |
|------|------|--------|
| Scripture migration | 2-3 hours | 🚧 In Progress |
| Translation Words migration | 1-2 hours | ⏳ Pending |
| Translation Words Links migration | 1-2 hours | ⏳ Pending |
| Testing & cleanup | 1 hour | ⏳ Pending |
| **Total** | **5-8 hours** | **~20% Complete** |

---

## 🎁 Benefits After Migration

### Before (Current State)
```
apps/tc-study/src/
├── resourceTypes/
│   ├── scripture/index.ts
│   ├── translationWords.ts
│   ├── translationWordsLinks.ts
│   └── withPanelCommunication.tsx  ← Manual HOC
└── components/resources/
    ├── ScriptureViewer.tsx
    ├── TranslationWordsViewer.tsx
    └── WordsLinksViewer.tsx
```

**Issues**:
- Resource code scattered across app
- Manual HOC wrapping required
- Not reusable across apps
- Hard to maintain

### After (Target State)
```
packages/
├── scripture-resource/
│   └── src/
│       ├── resourceType.ts      ← Auto-enhanced
│       ├── loader/index.ts
│       └── viewer/ScriptureViewer.tsx
├── translation-words-resource/
│   └── src/...
└── translation-words-links-resource/
    └── src/...

apps/tc-study/src/
└── contexts/CatalogContext.tsx
    └── import { scriptureResourceType } from '@bt-synergy/scripture-resource'
```

**Benefits**:
- ✅ Self-contained packages
- ✅ Automatic enhancement (no HOC!)
- ✅ Reusable across apps
- ✅ Easy to maintain
- ✅ Easy to test
- ✅ Ready for mobile app

---

## 🚀 When Complete

After Phase 4, we'll have:

1. **3 Self-Contained Resource Packages**
   - `@bt-synergy/scripture-resource`
   - `@bt-synergy/translation-words-resource`
   - `@bt-synergy/translation-words-links-resource`

2. **Clean App Structure**
   - No scattered resource code
   - Simple imports from packages
   - No manual HOC wrapping

3. **Ready for Mobile**
   - Same packages work on React Native
   - Just add `.native.tsx` viewers
   - Zero code duplication

4. **Easy to Extend**
   - Use CLI to generate new resources
   - Follow established pattern
   - Best practices enforced

---

**Status**: 🚧 **Phase 4 In Progress - ~20% Complete**

**Next**: Complete scripture resource migration and test in app.

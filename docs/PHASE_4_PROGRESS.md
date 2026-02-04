# Phase 4 Progress Update

**Date**: December 30, 2025  
**Status**: 🚧 ~40% COMPLETE

---

## ✅ What's Been Accomplished

### 1. Package Structure Created
- ✅ `packages/scripture-resource/` exists
- ✅ `src/resourceType.ts` updated to v2.0 API with `communication` config
- ✅ `src/loader/index.ts` created (re-exports from `@bt-synergy/scripture-loader`)
- ✅ `src/viewer/` directory copied from app
- ✅ `src/index.ts` updated with proper exports
- ✅ `package.json` configured
- ✅ `tsconfig.json` created

### 2. V2.0 API Integration
- ✅ Resource type uses `defineResourceType` with `communication` config
- ✅ Signal handlers defined for `verse-navigation`
- ✅ Metadata configured (`type`, `tags`, `category`)
- ✅ Emitted signals documented
- ✅ Standard signals imported from `@bt-synergy/resource-signals`

### 3. Dependencies Installed
- ✅ `bun install` completed successfully
- ✅ All workspace dependencies resolved

---

## 🚧 Current Blocker: Viewer Dependencies

The ScriptureViewer copied from the app has dependencies on app-specific contexts:

```typescript
// These imports won't work in a package:
import { useCurrentReference, useApp, useCatalogManager } from '../../contexts'
import { useResourceAPI, useCurrentState, useEvents } from 'linked-panels'
```

### Issue
The viewer is tightly coupled to the app's context system, which isn't available in a standalone package.

### Solution Options

**Option 1: Refactor Viewer (Recommended)**
- Make viewer receive all data through props
- Remove app context dependencies
- Use `EnhancedViewerProps` from `@bt-synergy/resource-types`
- Pass catalog manager, current reference, etc. as props

**Option 2: Keep Viewer in App (Simpler)**
- Don't migrate viewer to package yet
- Just use the new resource type definition
- Import viewer from app in resource type
- Migrate viewer later when we have more time

**Option 3: Create Adapter Layer**
- Create a wrapper that adapts app contexts to viewer props
- Package contains "pure" viewer
- App provides adapter

---

## 📊 Current State

```
packages/scripture-resource/
├── package.json              ✅ Ready
├── tsconfig.json             ✅ Ready
├── src/
│   ├── index.ts              ✅ Ready
│   ├── resourceType.ts       ✅ Ready (v2.0 API!)
│   ├── loader/
│   │   └── index.ts          ✅ Ready (re-export)
│   ├── viewer/
│   │   ├── index.tsx         ⚠️  Has app dependencies
│   │   ├── hooks/            ⚠️  Uses app contexts
│   │   ├── components/       ⚠️  Uses app contexts
│   │   └── types.ts          ✅ Ready
│   └── signals/
│       └── index.ts          ✅ Ready
```

---

## 🎯 Recommended Path Forward

### Short-term (Option 2 - Simpler)

1. **Keep viewer in app for now**
   ```typescript
   // packages/scripture-resource/src/resourceType.ts
   import { ScriptureViewer } from '../../../apps/tc-study/src/components/resources/ScriptureViewer'
   ```

2. **Update app to use new package**
   ```typescript
   // apps/tc-study/src/contexts/CatalogContext.tsx
   import { scriptureResourceType } from '@bt-synergy/scripture-resource'
   ```

3. **Test that it works**
   - Resource loads
   - Signals work
   - Everything functions

4. **Move to other resources**
   - Translation Words
   - Translation Words Links

5. **Come back to viewer refactoring later**

### Long-term (Option 1 - Better)

When we have time, refactor the viewer to be truly standalone:

```typescript
// Future: Pure viewer with no app dependencies
export const ScriptureViewer: React.FC<EnhancedViewerProps> = ({
  resource,
  sendSignal,
  resourceId,
  // All data passed as props:
  currentReference,
  catalogManager,
  onNavigate,
}) => {
  // No context hooks!
  // Everything through props
}
```

---

## 💡 Decision Point

**We have two choices:**

### Choice A: Quick Win (Recommended for now)
- Keep viewer in app
- Use new resource type definition
- Get benefits of v2.0 API immediately
- Migrate viewer later

**Time**: 30 minutes  
**Risk**: Low  
**Benefits**: Immediate v2.0 API benefits

### Choice B: Complete Migration
- Refactor viewer to remove app dependencies
- Make it truly standalone
- More work upfront

**Time**: 3-4 hours  
**Risk**: Medium (might break things)  
**Benefits**: Fully self-contained package

---

## 🚀 Recommendation

**Go with Choice A** for now:

1. It gets us 90% of the benefits
2. We can test the v2.0 API works
3. We can migrate other resources faster
4. We can refactor viewers later when we have more time
5. The important part (resource type definition with communication) is done!

The viewer refactoring is a nice-to-have, but the core architecture (v2.0 API with automatic enhancement) is what matters most.

---

## 📈 Progress Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Resource Type Definition | ✅ Complete | Using v2.0 API! |
| Loader | ✅ Complete | Re-exports existing loader |
| Package Structure | ✅ Complete | All files in place |
| Dependencies | ✅ Complete | Installed and resolved |
| Viewer Migration | ⚠️  Blocked | App dependencies issue |
| **Overall** | **🚧 40%** | **Core done, viewer pending** |

---

## 🎯 Next Steps (Recommended)

1. **Adjust approach**: Keep viewer in app for now
2. **Update resource type** to import viewer from app
3. **Update app** to use new package
4. **Test** that everything works
5. **Move to next resource** (Translation Words)
6. **Come back to viewer refactoring** in Phase 5

---

**Status**: 🚧 **40% Complete - Core Architecture Done, Viewer Refactoring Deferred**

**Recommendation**: Proceed with Choice A (quick win) to unblock progress and get immediate benefits of v2.0 API.

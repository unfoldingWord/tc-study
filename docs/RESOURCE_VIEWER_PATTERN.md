# Resource Viewer Pattern

**Date**: December 30, 2025  
**Pattern**: Viewers in App, Definitions in Packages

---

## 🎯 The Pattern

After attempting full package migration, we've established the pragmatic pattern:

**✅ In Package**:
- Resource type definition
- Communication configuration (v2.0 API)
- Loader (often re-exported from existing loader package)
- Signal definitions
- Types

**✅ In App**:
- Viewer component (needs app context)
- Viewer hooks (use app contexts)
- Viewer utilities (app-specific)

---

## 💡 Why This Pattern?

### Viewers Need App Context

Resource viewers almost always need:
- Navigation context (`useCurrentReference`, `useNavigate`)
- Catalog manager (`useCatalogManager`)
- App settings (`useApp`, `useSettings`)
- Event system (`linked-panels` hooks)
- Toast notifications
- Modal dialogs
- And more...

### Trying to Make Viewers Standalone Would Require:
1. Passing 10+ props to every viewer
2. Creating complex adapter layers
3. Duplicating app logic in packages
4. Breaking app-specific integrations

### This Pattern is Better Because:
- ✅ **Pragmatic** - Viewers naturally live where they're used
- ✅ **Simple** - No complex prop drilling or adapters
- ✅ **Flexible** - Apps can customize viewers easily
- ✅ **Maintainable** - Clear separation of concerns

---

## 📦 Package Structure

```
packages/my-resource-resource/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Export factory function
│   ├── createResourceType.ts       # Factory: viewer → resource type
│   ├── loader/
│   │   └── index.ts                # Re-export from loader package
│   ├── signals/
│   │   └── index.ts                # Custom signals (optional)
│   └── types/
│       └── index.ts                # Shared types
```

---

## 🏗️ Implementation Pattern

### Step 1: Create Package Factory

```typescript
// packages/my-resource-resource/src/createResourceType.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import type { ComponentType } from 'react'
import type { ResourceViewerProps } from '@bt-synergy/catalog-manager'

export function createMyResourceResourceType(
  viewer: ComponentType<ResourceViewerProps>
) {
  return defineResourceType({
    id: 'my-resource',
    displayName: 'My Resource',
    subjects: ['My Subject'],
    loader: MyResourceLoader,
    viewer, // ← Injected from app
    
    communication: {
      metadata: { type: 'my-resource', tags: [] },
      handlers: [...],
      emits: [...],
    },
    
    features: {...},
    settings: {...},
  })
}
```

### Step 2: Export Factory

```typescript
// packages/my-resource-resource/src/index.ts
export { createMyResourceResourceType } from './createResourceType'
export { MyResourceLoader } from './loader'
export * from './signals'
```

### Step 3: Use in App

```typescript
// apps/tc-study/src/resourceTypes/my-resource/index.ts
import { createMyResourceResourceType } from '@bt-synergy/my-resource-resource'
import { MyResourceViewer } from '../../components/resources/MyResourceViewer'

// Create resource type with app's viewer
export const myResourceResourceType = createMyResourceResourceType(MyResourceViewer)

// Re-export viewer if needed
export { MyResourceViewer }
```

### Step 4: Viewer Uses App Context

```typescript
// apps/tc-study/src/components/resources/MyResourceViewer.tsx
import { useCurrentReference, useCatalogManager } from '../../contexts'
import { useResourceAPI } from 'linked-panels'

export function MyResourceViewer({ resourceId, resourceKey }: Props) {
  const currentRef = useCurrentReference() // ✅ App context
  const catalogManager = useCatalogManager() // ✅ App context
  const api = useResourceAPI(resourceId) // ✅ linked-panels
  
  // Viewer implementation with full app access
  return <div>...</div>
}
```

---

## ✅ Benefits

### 1. Zero Boilerplate
- No complex prop drilling
- No adapter layers
- No context providers in packages

### 2. Full App Access
- Viewers can use any app context
- Can trigger app-level actions
- Can integrate with app-specific features

### 3. Easy Customization
- Apps can modify viewers freely
- No package updates needed for UI changes
- App-specific branding/styling

### 4. V2.0 API Benefits
- **Automatic enhancement** still works!
- Communication config in package
- Signal handling in package
- Type-safe signals
- Zero HOC wrapping

---

## 📊 What's in Each Layer

### Package Layer (Reusable Logic)
```
✅ Resource type ID & metadata
✅ Door43 subject mappings
✅ Loader configuration
✅ Communication config (v2.0 API)
✅ Signal handlers
✅ Feature flags
✅ Settings schema
✅ Type definitions
```

### App Layer (UI & Context)
```
✅ Viewer component
✅ Viewer hooks (using app contexts)
✅ Viewer utilities
✅ App-specific styling
✅ App-specific integrations
```

---

## 🎯 The Key Insight

**The resource type definition is what matters!**

Having the resource type definition with v2.0 API (`communication` config) in a package gives us:
- Automatic signal enhancement
- Standard signal definitions
- Consistent configuration
- Type safety
- Reusable loaders

The viewer location is secondary - it naturally lives in the app.

---

## 🔄 Migration Pattern

For existing resources:

1. **Create package with factory**
   ```bash
   cd packages/my-resource-resource
   # Create createResourceType.ts with factory
   ```

2. **Update app's resource file**
   ```typescript
   // Before: Full definition in app
   export const resourceType = defineResourceType({
     viewer: MyViewer,
     // ... everything ...
   })
   
   // After: Use package factory
   import { createMyResourceResourceType } from '@bt-synergy/my-resource-resource'
   export const resourceType = createMyResourceResourceType(MyViewer)
   ```

3. **Keep viewer in app**
   - No changes needed!
   - Viewer stays exactly where it is
   - Continue using app contexts

4. **Done!**
   - Get v2.0 API benefits
   - Keep viewer flexibility
   - No breaking changes

---

## 📝 Example: Scripture Resource

### Package (`@bt-synergy/scripture-resource`)

```typescript
// packages/scripture-resource/src/createResourceType.ts
export function createScriptureResourceType(viewer) {
  return defineResourceType({
    id: 'scripture',
    displayName: 'Scripture',
    subjects: ['Bible', 'Aligned Bible'],
    loader: ScriptureLoader,
    viewer, // ← From app
    
    communication: {
      metadata: { type: 'scripture', tags: ['bible'] },
      handlers: [{
        signalType: 'verse-navigation',
        handler: (signal) => {...}
      }],
      emits: ['verse-navigation', 'token-click'],
    },
  })
}
```

### App

```typescript
// apps/tc-study/src/resourceTypes/scripture/index.ts
import { createScriptureResourceType } from '@bt-synergy/scripture-resource'
import { ScriptureViewer } from '../../components/resources/ScriptureViewer'

export const scriptureResourceType = createScriptureResourceType(ScriptureViewer)
```

### Viewer (Unchanged!)

```typescript
// apps/tc-study/src/components/resources/ScriptureViewer/index.tsx
import { useCurrentReference, useCatalogManager } from '../../../contexts'

export function ScriptureViewer({ resourceId, resourceKey }) {
  const currentRef = useCurrentReference() // ✅ Still works!
  // ... rest of implementation unchanged
}
```

---

## 🎁 What We Get

With this pattern, we get **90% of the benefits** with **10% of the complexity**:

| Benefit | With This Pattern |
|---------|-------------------|
| V2.0 API | ✅ Yes |
| Automatic enhancement | ✅ Yes |
| Standard signals | ✅ Yes |
| Type safety | ✅ Yes |
| Reusable loaders | ✅ Yes |
| Communication config | ✅ Yes |
| Zero HOC wrapping | ✅ Yes |
| Easy customization | ✅ Yes |
| App context access | ✅ Yes |
| **Complexity** | ✅ **Low** |

---

## 🚀 Future: React Native

When we build the React Native app:

1. **Same package** - Resource definitions work everywhere
2. **Different viewer** - Create `.native.tsx` viewer in mobile app
3. **Same factory** - Use `createScriptureResourceType(ScriptureViewerNative)`
4. **Same loaders** - Work on both platforms
5. **Same signals** - Work on both platforms

The pattern scales perfectly to mobile!

---

## 📊 Summary

**Pattern**: Resource definitions in packages, viewers in apps

**Why**: Viewers need app context, definitions need reusability

**Benefits**: V2.0 API + app flexibility + low complexity

**Trade-off**: Viewers not in packages (but that's actually better!)

**Result**: Best of both worlds! 🎉

---

**Recommendation**: Use this pattern for all resource types.

It's pragmatic, maintainable, and gives us everything we need.

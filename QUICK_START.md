# Quick Start - Resource Type Development

## 🚀 Add a New Resource Type (5 Minutes)

### Option 1: Plugin Package (Recommended)

```bash
# 1. Create package structure
mkdir -p packages/my-resource-resource/src/{loader,viewer,types}
cd packages/my-resource-resource
```

```json
// 2. Create package.json
{
  "name": "@bt-synergy/my-resource-resource",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "dependencies": {
    "@bt-synergy/resource-types": "workspace:*",
    "@bt-synergy/resource-panels": "workspace:*"
  }
}
```

```typescript
// 3. Create src/viewer/MyViewer.tsx
import { withPanelCommunication } from '@bt-synergy/resource-panels'

function MyViewerBase({ resourceId, sendSignal }) {
  return <div>My Resource Viewer</div>
}

export const MyViewer = withPanelCommunication(
  MyViewerBase,
  'my-resource-type',
  {
    sends: ['verse-navigation'],
    receives: {
      'verse-navigation': (props, signal) => {
        console.log('Navigate to:', signal.verse)
      }
    }
  }
)
```

```typescript
// 4. Create src/resourceType.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { MyLoader } from './loader'
import { MyViewer } from './viewer'

export const myResourceType = defineResourceType({
  id: 'my-resource-type',
  displayName: 'My Resource',
  icon: 'BookOpen',
  subjects: ['My Subject'],
  loader: MyLoader,
  viewer: MyViewer,
  signals: {
    sends: ['verse-navigation'],
    receives: ['verse-navigation']
  }
})
```

```typescript
// 5. Create src/index.ts
export { myResourceType } from './resourceType'
```

```bash
# 6. Build
pnpm build

# 7. Use in app
cd apps/tc-study
pnpm add @bt-synergy/my-resource-resource
```

```typescript
// 8. Register in CatalogContext.tsx
import { myResourceType } from '@bt-synergy/my-resource-resource'
resourceTypeRegistry.register(myResourceType)
```

**Done! 🎉**

---

### Option 2: In-App (Current Way)

```typescript
// 1. Create viewer with HOC
import { withPanelCommunication } from '../resourceTypes'

function MyViewerBase({ resourceId, sendSignal }) {
  return <div>My Viewer</div>
}

export const MyViewer = withPanelCommunication(
  MyViewerBase,
  'my-resource-type',
  { sends: [...], receives: {...} }
)

// 2. Create resourceType.ts
export const myResourceType = defineResourceType({
  id: 'my-resource-type',
  viewer: MyViewer,
  // ...
})

// 3. Register
resourceTypeRegistry.register(myResourceType)
```

**Done! 🎉**

---

## 📡 Send Signals

```typescript
// Broadcast to all
sendSignal<VerseNavigationSignal>('verse-navigation', {
  verse: { book: 'JHN', chapter: 3, verse: 16 }
})

// To specific panel
sendToPanel<Signal>('panel-2', 'signal-type', data)

// To specific resource
sendToResource<Signal>('resource-123', 'signal-type', data)
```

---

## 📥 Receive Signals

```typescript
// Automatic via HOC config
withPanelCommunication(Component, 'type', {
  receives: {
    'verse-navigation': (props, signal) => {
      // Handle signal
    }
  }
})

// Or manual
useSignalHandler<VerseNavigationSignal>(
  'verse-navigation',
  resourceId,
  (signal) => {
    // Handle signal
  }
)
```

---

## 🎯 Available Signals

```typescript
import { STUDIO_SIGNAL_REGISTRY } from '@app/signals/studioSignals'

// See all available signals
Object.keys(STUDIO_SIGNAL_REGISTRY)
// → ['verse-navigation', 'token-click', 'entry-link-click', ...]

// Get signal info
const info = STUDIO_SIGNAL_REGISTRY['verse-navigation']
// → { description, typicalSenders, typicalReceivers, example }
```

**Standard Signals:**
- `verse-navigation` - Navigate to verse
- `token-click` - Word clicked
- `entry-link-click` - Resource link clicked
- `text-selection` - Text selected
- `scroll-sync` - Sync scrolling
- `resource-loaded` - Content loaded
- `resource-error` - Error occurred

---

## 🧪 Test Your Resource

```bash
# 1. Start app
cd apps/tc-study
pnpm dev

# 2. Navigate to test page
open http://localhost:3000/test

# 3. Add your resource to a panel
# 4. Send signals and verify they work
# 5. Check Signal Monitor for activity
```

---

## 📚 Full Documentation

- **Plugin Packages**: `docs/RESOURCE_TYPE_PACKAGES.md`
- **In-App Development**: `apps/tc-study/RESOURCE_TYPE_DEVELOPMENT.md`
- **Architecture**: `RESOURCE_TYPE_ARCHITECTURE.md`
- **Migration**: `apps/tc-study/MIGRATING_TO_PACKAGES.md`
- **Library**: `packages/resource-panels/README.md`

---

## 💡 Tips

1. **Use Standard Signals** - Prefer `studioSignals` over custom
2. **Type Everything** - Use TypeScript generics: `<VerseNavigationSignal>`
3. **Debug Mode** - Enable in HOC config to see signal flow
4. **Follow Template** - Use scripture-resource as example
5. **Test in Isolation** - Build package tests first
6. **Document** - Add README with usage examples

---

**Questions?** See the full documentation or check the examples in `apps/resource-panels-spike` and `apps/tc-study`.

# Resource Type Architecture - Plugin System

## 🎯 Overview

BT Synergy uses a **plugin-based architecture** where each resource type is a self-contained package that can be independently developed, tested, versioned, and distributed.

## 📦 Package Structure

```
packages/
├── scripture-resource/              # Complete Scripture resource
│   ├── loader/                      # Data loading
│   ├── viewer/                      # UI component  
│   ├── signals/                     # Custom signals (if any)
│   ├── types/                       # TypeScript types
│   ├── resourceType.ts              # Registration definition
│   └── index.ts                     # Public API
│
├── translation-words-resource/      # Complete TW resource
│   └── ... (same structure)
│
├── resource-panels/                 # Infrastructure
│   └── ... (communication system)
│
└── resource-types/                  # Base type system
    └── ... (registration framework)
```

## ✨ Benefits

### For Developers

- **🎯 Clear Structure** - Consistent package layout across all resource types
- **♻️ Reusable** - Use packages across multiple apps (mobile, web, desktop)
- **🧪 Testable** - Test resource types in complete isolation
- **📖 Self-Documenting** - Each package has its own README
- **🚀 Easy to Start** - Clear template to follow

### For the Platform

- **🔌 Modular** - Add/remove resource types without affecting others
- **📈 Scalable** - No limit to number of resource types
- **🔄 Versioned** - Independent release cycles per resource type
- **🌐 Extensible** - Community can contribute new resource types
- **⚡ Lazy Loadable** - Load only the resources you need

### For Users

- **⚡ Faster** - Only load what's needed
- **🔧 Customizable** - Choose which resource types to install
- **🆕 More Choice** - Access to community resource types
- **🔒 Reliable** - Isolated packages reduce breakage

## 🏗️ How It Works

### 1. Each Resource Type is a Package

```typescript
// packages/scripture-resource/src/index.ts
export { scriptureResourceType } from './resourceType'
export { ScriptureViewer } from './viewer'
export { ScriptureLoader } from './loader'
export type * from './types'
```

### 2. Apps Import and Register

```typescript
// apps/tc-study/src/contexts/CatalogContext.tsx
import { scriptureResourceType } from '@bt-synergy/scripture-resource'
import { translationWordsResourceType } from '@bt-synergy/translation-words-resource'

// Register all resource types
resourceTypeRegistry.register(scriptureResourceType)
resourceTypeRegistry.register(translationWordsResourceType)
```

### 3. Everything Just Works™

- Viewers render automatically when resources are added to panels
- Inter-panel communication works out of the box
- Loaders fetch data seamlessly
- Type safety enforced throughout

## 📋 Creating a New Resource Type Package

### Quick Start

```bash
# 1. Create package
mkdir -p packages/my-resource-resource/src/{loader,viewer,types}

# 2. Create files (see template below)
# - package.json
# - src/loader/MyResourceLoader.ts
# - src/viewer/MyResourceViewer.tsx
# - src/resourceType.ts
# - src/index.ts

# 3. Build
cd packages/my-resource-resource
pnpm build

# 4. Use in app
cd apps/tc-study
pnpm add @bt-synergy/my-resource-resource

# 5. Register
// In CatalogContext.tsx
import { myResourceType } from '@bt-synergy/my-resource-resource'
resourceTypeRegistry.register(myResourceType)

# 6. Done!
```

See **[docs/RESOURCE_TYPE_PACKAGES.md](./docs/RESOURCE_TYPE_PACKAGES.md)** for complete guide.

## 🎨 Resource Type Template

```typescript
// packages/[name]-resource/src/resourceType.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { withPanelCommunication } from '@bt-synergy/resource-panels'
import { MyLoader } from './loader'
import { MyViewerBase } from './viewer'

// Wrap viewer with panel communication
const MyViewer = withPanelCommunication(
  MyViewerBase,
  'my-resource-type',
  {
    sends: ['verse-navigation'],
    receives: {
      'verse-navigation': (props, signal) => {
        // Handle signal
      }
    }
  }
)

export const myResourceType = defineResourceType({
  id: 'my-resource-type',
  displayName: 'My Resource',
  description: 'What this resource does',
  icon: 'BookOpen',
  
  subjects: ['My Subject'],
  aliases: ['my-resource'],
  
  loader: MyLoader,
  viewer: MyViewer,
  
  signals: {
    sends: ['verse-navigation', 'token-click'],
    receives: ['verse-navigation']
  },
  
  features: {
    highlighting: true,
    search: true,
    navigation: true
  }
})
```

## 🔌 Available Packages

### Official Packages

| Package | Status | Description |
|---------|--------|-------------|
| `@bt-synergy/scripture-resource` | ✅ Designed | Bible texts with word-level interaction |
| `@bt-synergy/translation-words-resource` | 🚧 Planned | Biblical term definitions |
| `@bt-synergy/translation-notes-resource` | 🚧 Planned | Translation notes and helps |
| `@bt-synergy/translation-questions-resource` | 🚧 Planned | Comprehension questions |
| `@bt-synergy/translation-academy-resource` | 🚧 Planned | Translation training articles |

### Community Packages

Community members can create and publish their own resource type packages!

## 🧩 Inter-Panel Communication

Each resource package automatically gets inter-panel communication via `@bt-synergy/resource-panels`:

```typescript
// In your viewer component
function MyViewer({ sendSignal, sendToPanel, sendToResource }) {
  
  // Send to all resources
  sendSignal<VerseNavigationSignal>('verse-navigation', {
    verse: { book: 'JHN', chapter: 3, verse: 16 }
  })
  
  // Send to specific panel
  sendToPanel<Signal>('panel-2', 'signal-type', data)
  
  // Send to specific resource
  sendToResource<Signal>('resource-123', 'signal-type', data)
}
```

Standard signals defined in app, custom signals can be added per package.

## 📊 Comparison

### Before: Monolithic

```
apps/tc-study/
├── src/
│   ├── resourceTypes/          ← All definitions here
│   ├── components/resources/   ← All viewers here
│   ├── loaders/                ← Some loaders here
│   └── ...
```

**Issues:**
- Everything coupled together
- Hard to test in isolation
- No versioning per resource type
- Can't reuse across apps
- All-or-nothing loading

### After: Plugin Architecture

```
packages/
├── scripture-resource/         ← Self-contained
├── translation-words-resource/ ← Independent
└── ...                         ← Modular

apps/tc-study/
└── Just imports and registers
```

**Benefits:**
- Complete independence
- Easy to test
- Independent versioning
- Reusable across apps
- Lazy loadable

## 🔄 Migration Path

We're migrating existing resource types to packages:

1. **Phase 1**: Design architecture ✅
2. **Phase 2**: Create scripture-resource package
3. **Phase 3**: Migrate other resource types
4. **Phase 4**: Create package templates
5. **Phase 5**: Enable community packages

See **[apps/tc-study/MIGRATING_TO_PACKAGES.md](./apps/tc-study/MIGRATING_TO_PACKAGES.md)** for details.

## 📚 Documentation

- **[docs/RESOURCE_TYPE_PACKAGES.md](./docs/RESOURCE_TYPE_PACKAGES.md)** - Complete package creation guide
- **[apps/tc-study/MIGRATING_TO_PACKAGES.md](./apps/tc-study/MIGRATING_TO_PACKAGES.md)** - Migration guide
- **[apps/tc-study/RESOURCE_TYPE_DEVELOPMENT.md](./apps/tc-study/RESOURCE_TYPE_DEVELOPMENT.md)** - Current development guide
- **[packages/resource-panels/README.md](./packages/resource-panels/README.md)** - Communication system docs

## 🎯 Best Practices

1. **One Resource Type Per Package** - Keep packages focused
2. **Use Standard Signals** - Prefer app signals over custom ones
3. **Document Thoroughly** - Include README with examples
4. **Test in Isolation** - Ensure package works standalone
5. **Minimize Dependencies** - Only depend on what you need
6. **Follow Template** - Use consistent structure across packages
7. **Version Properly** - Follow semver for breaking changes

## 🚀 Getting Started

**Want to create a new resource type?**

1. Read [docs/RESOURCE_TYPE_PACKAGES.md](./docs/RESOURCE_TYPE_PACKAGES.md)
2. Follow the template structure
3. Build and test your package
4. Register in your app
5. Enjoy full inter-panel communication!

**Want to contribute to existing packages?**

1. Browse packages in `packages/*-resource/`
2. Read the package README
3. Make your changes
4. Test thoroughly
5. Submit a PR

---

**Questions?** See the documentation links above or open an issue!

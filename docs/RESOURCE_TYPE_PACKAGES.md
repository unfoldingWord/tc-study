# Resource Type Package Architecture

## Overview

Each resource type is a **self-contained package** that can be independently developed, versioned, and distributed. This plugin-style architecture provides clean separation of concerns and allows community contributions.

## Benefits

### For the Platform
- ✅ **Modularity** - Each resource is independent
- ✅ **Scalability** - Easy to add new resource types
- ✅ **Maintainability** - Clear boundaries and responsibilities
- ✅ **Versioning** - Independent release cycles
- ✅ **Lazy Loading** - Load only what's needed

### For Developers
- ✅ **Clear structure** - Consistent package layout
- ✅ **Reusability** - Use across multiple apps
- ✅ **Testability** - Test in isolation
- ✅ **Documentation** - Self-contained docs
- ✅ **Community** - Easy to contribute new types

## Package Structure

Each resource type package follows this structure:

```
packages/[resource-name]-resource/
├── src/
│   ├── loader/              # Data loading
│   │   ├── index.ts
│   │   └── [ResourceName]Loader.ts
│   ├── viewer/              # UI component
│   │   ├── index.tsx
│   │   ├── [ResourceName]Viewer.tsx
│   │   └── components/      # Sub-components
│   ├── signals/             # Custom signals (optional)
│   │   └── index.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── utils/               # Helper functions (optional)
│   │   └── index.ts
│   ├── resourceType.ts      # Registration definition
│   └── index.ts             # Public API
├── README.md                # Package documentation
├── package.json             # Dependencies and metadata
└── tsconfig.json            # TypeScript config
```

## Creating a New Resource Type Package

### Step 1: Create Package Directory

```bash
mkdir -p packages/my-resource-resource/src/{loader,viewer,signals,types}
cd packages/my-resource-resource
```

### Step 2: Create package.json

```json
{
  "name": "@bt-synergy/my-resource-resource",
  "version": "1.0.0",
  "description": "Complete [Resource Name] resource type",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./viewer": {
      "types": "./dist/viewer/index.d.ts",
      "import": "./dist/viewer/index.js"
    },
    "./loader": {
      "types": "./dist/loader/index.d.ts",
      "import": "./dist/loader/index.js"
    }
  },
  "dependencies": {
    "@bt-synergy/resource-types": "workspace:*",
    "@bt-synergy/resource-panels": "workspace:*",
    "react": "^19.2.0"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

### Step 3: Create Loader

```typescript
// src/loader/MyResourceLoader.ts
import type { ResourceCache } from '@bt-synergy/resource-cache'

export class MyResourceLoader {
  constructor(
    private resourceKey: string,
    private cache: ResourceCache
  ) {}
  
  async loadContent(location: string): Promise<any> {
    // Implement loading logic
    // 1. Check cache
    // 2. Fetch from API if needed
    // 3. Parse/transform data
    // 4. Cache result
    // 5. Return content
  }
}
```

### Step 4: Create Viewer with Panel Communication

```typescript
// src/viewer/MyResourceViewer.tsx
import { withPanelCommunication, type WithPanelCommunicationProps } from '@bt-synergy/resource-panels'
import type { VerseNavigationSignal } from './signals'

interface MyResourceViewerProps extends WithPanelCommunicationProps {
  resourceId: string
  resourceKey: string
}

function MyResourceViewerBase({
  resourceId,
  resourceKey,
  sendSignal,      // Injected by withPanelCommunication
  sendToPanel,
  sendToResource
}: MyResourceViewerProps) {
  
  const handleUserAction = () => {
    // Send signals to other resources
    sendSignal<VerseNavigationSignal>('verse-navigation', {
      verse: { book: 'JHN', chapter: 3, verse: 16 }
    })
  }
  
  return (
    <div>
      {/* Your UI */}
    </div>
  )
}

// Wrap with panel communication
export const MyResourceViewer = withPanelCommunication(
  MyResourceViewerBase,
  'my-resource-type',
  {
    sends: ['verse-navigation', 'custom-signal'],
    receives: {
      'verse-navigation': (props, signal) => {
        // Handle incoming navigation
      }
    }
  }
)
```

### Step 5: Define Resource Type

```typescript
// src/resourceType.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { MyResourceLoader } from './loader'
import { MyResourceViewer } from './viewer'

export const myResourceType = defineResourceType({
  id: 'my-resource-type',
  displayName: 'My Resource',
  description: 'Description of what this resource does',
  icon: 'BookOpen',
  
  subjects: ['My Subject'],
  aliases: ['my-resource', 'myres'],
  
  loader: MyResourceLoader,
  viewer: MyResourceViewer,
  
  signals: {
    sends: ['verse-navigation', 'custom-signal'],
    receives: ['verse-navigation', 'other-signal']
  },
  
  features: {
    highlighting: true,
    search: true,
    navigation: true
  },
  
  settings: {
    // User-configurable settings
  },
  
  version: '1.0.0',
  author: 'Your Name',
  license: 'MIT'
})
```

### Step 6: Create Public API

```typescript
// src/index.ts
export { myResourceType } from './resourceType'
export { MyResourceViewer } from './viewer'
export { MyResourceLoader } from './loader'
export type * from './types'
export * from './signals'
```

### Step 7: Write Documentation

```markdown
# @bt-synergy/my-resource-resource

Description of your resource type.

## Installation

\`\`\`bash
pnpm add @bt-synergy/my-resource-resource
\`\`\`

## Usage

\`\`\`tsx
import { myResourceType } from '@bt-synergy/my-resource-resource'
resourceTypeRegistry.register(myResourceType)
\`\`\`

## Features
## Signals
## Configuration
## Examples
```

## Using Resource Packages in Apps

### Installation

```bash
# In your app
pnpm add @bt-synergy/scripture-resource
pnpm add @bt-synergy/translation-words-resource
```

### Registration

```typescript
// src/contexts/CatalogContext.tsx
import { scriptureResourceType } from '@bt-synergy/scripture-resource'
import { translationWordsResourceType } from '@bt-synergy/translation-words-resource'

// Register all resource types
resourceTypeRegistry.register(scriptureResourceType)
resourceTypeRegistry.register(translationWordsResourceType)
// ... register more as needed
```

That's it! The app now supports these resource types with full inter-panel communication.

## Package Dependencies

### Required Dependencies

All resource packages should depend on:

```json
{
  "dependencies": {
    "@bt-synergy/resource-types": "workspace:*",      // Base type system
    "@bt-synergy/resource-panels": "workspace:*",     // Communication
    "@bt-synergy/resource-cache": "workspace:*"       // Caching
  }
}
```

### Optional Dependencies

Add as needed:

```json
{
  "dependencies": {
    "@bt-synergy/usfm-processor": "workspace:*",      // For USFM parsing
    "@bt-synergy/door43-api": "workspace:*",          // For Door43 API
    "@bt-synergy/markdown-processor": "workspace:*"   // For Markdown
  }
}
```

## Signal Definitions

### Using Standard Signals

Most resource types should use the standard signals defined in the app:

```typescript
// Use signals from the app
import type { VerseNavigationSignal, TokenClickSignal } from '@app/signals/studioSignals'
```

### Defining Custom Signals

Only if you have unique communication needs:

```typescript
// src/signals/index.ts
import type { BaseSignal } from '@bt-synergy/resource-panels'

export interface MyCustomSignal extends BaseSignal {
  type: 'my-custom-signal'
  customData: {
    foo: string
    bar: number
  }
}
```

## Testing

### Unit Tests

Test loader and utility functions in isolation:

```typescript
// src/loader/__tests__/MyResourceLoader.test.ts
import { MyResourceLoader } from '../MyResourceLoader'

describe('MyResourceLoader', () => {
  it('loads content correctly', async () => {
    const loader = new MyResourceLoader(resourceKey, cache)
    const content = await loader.loadContent('chapter1')
    expect(content).toBeDefined()
  })
})
```

### Integration Tests

Test in a real app environment (in apps/tc-study test page).

## Publishing

### Internal Packages (Workspace)

For packages within the monorepo, use `workspace:*` protocol:

```json
{
  "dependencies": {
    "@bt-synergy/my-resource-resource": "workspace:*"
  }
}
```

### External Packages (npm)

For community packages:

```bash
pnpm build
pnpm publish --access public
```

## Example Packages

### Official Packages

- `@bt-synergy/scripture-resource` - Bible texts
- `@bt-synergy/translation-words-resource` - Term definitions
- `@bt-synergy/translation-notes-resource` - Translation notes
- `@bt-synergy/translation-questions-resource` - Comprehension questions

### Community Packages

Community members can create and publish their own resource type packages following this structure.

## Migration Guide

### Migrating Existing Resource Types

To convert an existing resource type to a package:

1. **Create package directory**
   ```bash
   mkdir -p packages/[resource]-resource/src
   ```

2. **Move files**
   - Loader: `apps/tc-study/src/loaders/` → `packages/[resource]-resource/src/loader/`
   - Viewer: `apps/tc-study/src/components/resources/` → `packages/[resource]-resource/src/viewer/`
   - Types: Extract to `packages/[resource]-resource/src/types/`

3. **Create resourceType.ts**
   - Move definition from `apps/tc-study/src/resourceTypes/`

4. **Update imports**
   - In app: `import { resourceType } from '@bt-synergy/[resource]-resource'`

5. **Update registration**
   - No changes needed - just import and register

## Best Practices

1. **Keep packages focused** - One resource type per package
2. **Use standard signals** - Only create custom signals when absolutely necessary
3. **Document thoroughly** - Include examples and usage guides
4. **Version carefully** - Follow semver for API changes
5. **Test in isolation** - Ensure package works standalone
6. **Minimize dependencies** - Only depend on what you actually use
7. **Export selectively** - Only expose what consumers need

## Troubleshooting

**Package not found?**
- Check package.json name matches import
- Run `pnpm install` in workspace root
- Verify exports in package.json

**Types not working?**
- Ensure `types` field in package.json points correctly
- Check tsconfig.json includes src files
- Run `pnpm build` to generate .d.ts files

**Signals not working?**
- Verify withPanelCommunication is used
- Check signal type strings match exactly
- Enable debug mode to see signal flow

## Resources

- [Resource Type System Docs](../packages/resource-types/README.md)
- [Resource Panels Docs](../packages/resource-panels/README.md)
- [Example: Scripture Resource](../packages/scripture-resource/)
- [App Integration Guide](../apps/tc-study/RESOURCE_TYPE_DEVELOPMENT.md)

---

**Ready to create your own resource type package?** Follow the steps above and you'll have a fully-functional, independently-versioned resource type in no time!

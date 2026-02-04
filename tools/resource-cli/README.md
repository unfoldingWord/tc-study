# @bt-synergy/resource-cli

**CLI tool for generating BT-Synergy resource types**

Automatically scaffolds resource types with:
- ✅ **Two modes**: External packages OR internal app modules
- ✅ Cross-platform support (Web + React Native)
- ✅ Type-safe signal communication
- ✅ Automatic enhancement with panel communication
- ✅ Best practices baked in

## Installation

```bash
# From the monorepo root
cd tools/resource-cli
bun install
bun run build
```

## Usage

### Create a New Resource Type

The CLI supports **two modes**:

1. **External Package** - Standalone `@bt-synergy/my-resource-resource` package
2. **Internal App Module** - Resource type in `apps/tc-study/src/resourceTypes/`

```bash
# Interactive mode (recommended - auto-detects if in app directory)
node dist/index.js create

# Or specify options directly
node dist/index.js create my-resource \
  --platforms web native \
  --description "My Resource Type" \
  --subjects "My Subject"
```

### Command Options

```
create [name]              Create a new resource type

Options:
  -p, --platforms <platforms...>     Target platforms (web, native) (default: ["web"])
  -d, --description <description>    Package description
  -s, --subjects <subjects...>       Door43 subjects
  -l, --location-type <type>         Location type: external or internal
  --skip-install                     Skip dependency installation
  --skip-git                         Skip git initialization
  -h, --help                         Display help
```

## Two Modes Explained

### 1. External Package Mode

**When to use:**
- Creating a reusable resource type for multiple apps
- Need to publish to npm/registry
- Want full control over versioning
- Building third-party plugins

**Structure:**
```
packages/my-resource-resource/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── resourceType.ts
    ├── loader/
    ├── viewer/
    ├── types/
    └── signals/
```

**Registration:**
```typescript
import { myResourceResourceType } from '@bt-synergy/my-resource-resource'
resourceTypeRegistry.register(myResourceResourceType)
```

### 2. Internal App Module Mode

**When to use:**
- Creating app-specific resource types
- Prototyping new resource types
- Need tight integration with app contexts
- Faster iteration during development

**Structure:**
```
apps/tc-study/src/resourceTypes/myResource/
├── index.ts
└── resourceType.ts
```

**Registration:**
Auto-discovered! The app automatically finds and registers internal resource types.

**Benefits:**
- ✅ No package.json needed
- ✅ Direct access to app contexts (CatalogContext, etc.)
- ✅ Faster iteration (no package builds)
- ✅ Auto-registration via directory scanning

### Examples

**External package (web-only):**
```bash
# Run from monorepo root
node tools/resource-cli/dist/index.js create translation-notes \
  --location-type external \
  --platforms web \
  --subjects "Translation Notes"
```

**Internal app module (cross-platform):**
```bash
# Run from apps/tc-study directory
node ../../tools/resource-cli/dist/index.js create scripture \
  --location-type internal \
  --platforms web native \
  --subjects "Bible" "Aligned Bible"
```

**Interactive mode (auto-detects):**
```bash
# Detects if in app directory and offers both options
node dist/index.js create my-resource
```

## Generated Structure

### External Package Structure

```
packages/my-resource-resource/
├── package.json              # Package configuration
├── tsconfig.json             # TypeScript config
├── README.md                 # Package documentation
└── src/
    ├── index.ts              # Main entry point
    ├── resourceType.ts       # Resource type definition
    ├── loader/
    │   └── index.ts          # Resource loader
    ├── viewer/
    │   ├── MyResourceViewer.tsx        # Web viewer (if --platforms web)
    │   └── MyResourceViewer.native.tsx # Native viewer (if --platforms native)
    ├── types/
    │   └── index.ts          # TypeScript types
    └── signals/
        └── index.ts          # Custom signal definitions
```

### Internal App Module Structure

```
apps/tc-study/src/resourceTypes/myResource/
├── index.ts              # Exports resource type
└── resourceType.ts       # Resource type definition (viewer imported from app)
```

**Note:** For internal modules, the viewer component lives in your app's components directory:
```
apps/tc-study/src/components/resources/MyResourceViewer.tsx
```

## Generated Files

### 1. `resourceType.ts`

Defines the resource type with:
- ID, display name, description
- Door43 subject mappings
- Loader and viewer references
- Communication configuration
- Feature flags

```typescript
export const myResourceResourceType = defineResourceType({
  id: 'myResource',
  displayName: 'MyResource',
  subjects: ['My Subject'],
  loader: MyResourceLoader,
  viewer: MyResourceViewer,
  communication: {
    metadata: { type: 'myResource', tags: [] },
    handlers: [],
    emits: [],
  },
  features: {
    highlighting: false,
    bookmarking: false,
    search: false,
    navigation: false,
  },
})
```

### 2. `loader/index.ts`

Resource loader implementation:
- Load resource by ID
- Cache management
- Book/section loading
- Cache status checking

### 3. `viewer/MyResourceViewer.tsx`

React component for displaying the resource:
- Receives `EnhancedViewerProps` (includes `sendSignal`, etc.)
- Platform-specific (``.tsx for web, `.native.tsx` for React Native)
- Pre-configured with signal communication

### 4. `signals/index.ts`

Custom signal definitions:
- Define resource-specific signals
- Export signal types
- Import standard signals from `@bt-synergy/resource-signals`

### 5. `types/index.ts`

TypeScript type definitions:
- Resource data structure
- Loader configuration
- Custom interfaces

## Development Workflow

### External Package Workflow

After generating an external package:

1. **Implement the loader** (`src/loader/index.ts`):
   ```typescript
   async load(resourceId: string): Promise<MyResource> {
     // Fetch from network
     // Parse data
     // Cache result
     return resource
   }
   ```

2. **Implement the viewer** (`src/viewer/`):
   ```typescript
   export const MyResourceViewer: React.FC<EnhancedViewerProps> = ({
     resource,
     sendSignal // Auto-available!
   }) => {
     return <div>{resource.title}</div>
   }
   ```

3. **Define signals** (`src/signals/index.ts`):
   ```typescript
   export interface MyNavigationSignal extends BaseSignal {
     type: 'my-navigation'
     target: string
   }
   ```

4. **Build the package**:
   ```bash
   cd packages/my-resource-resource
   bun build
   ```

5. **Register in your app**:
   ```typescript
   import { myResourceResourceType } from '@bt-synergy/my-resource-resource'
   
   resourceTypeRegistry.register(myResourceResourceType)
   ```

### Internal App Module Workflow

After generating an internal module:

1. **Create the viewer component** in your app:
   ```typescript
   // apps/tc-study/src/components/resources/MyResourceViewer.tsx
   export const MyResourceViewer: React.FC<EnhancedViewerProps> = ({
     resource,
     sendSignal,
     // Access app contexts directly!
   }) => {
     const catalogManager = useCatalogManager()
     return <div>{resource.title}</div>
   }
   ```

2. **Update the resource type** to import the viewer:
   ```typescript
   // apps/tc-study/src/resourceTypes/myResource/resourceType.ts
   import { MyResourceViewer } from '@/components/resources/MyResourceViewer'
   
   export const myResourceResourceType = defineResourceType({
     // ...
     viewer: MyResourceViewer,
   })
   ```

3. **No registration needed** - Auto-discovered!

The app automatically scans `src/resourceTypes/` and registers all found resource types.

## Cross-Platform Development

### Web-only Resource

```bash
node dist/index.js create my-resource --platforms web
```

Generates:
- `viewer/MyResourceViewer.tsx` - Uses React DOM

### Native-only Resource

```bash
node dist/index.js create my-resource --platforms native
```

Generates:
- `viewer/MyResourceViewer.native.tsx` - Uses React Native

### Cross-platform Resource

```bash
node dist/index.js create my-resource --platforms web native
```

Generates:
- `viewer/MyResourceViewer.web.tsx` - Web UI
- `viewer/MyResourceViewer.native.tsx` - Native UI

The resource type definition automatically handles platform detection:

```typescript
viewer: {
  web: MyResourceViewerWeb,
  native: MyResourceViewerNative
}
```

## Best Practices

### 1. Use Standard Signals

Import from `@bt-synergy/resource-signals` when possible:

```typescript
import { VerseNavigationSignal, TokenClickSignal } from '@bt-synergy/resource-signals'
```

### 2. Document Custom Signals

Add JSDoc comments to custom signals:

```typescript
/**
 * Emitted when user navigates to a note entry
 */
export interface NoteNavigationSignal extends BaseSignal {
  type: 'note-navigation'
  noteId: string
}
```

### 3. Keep Loaders Platform-Agnostic

Loaders should work on both web and mobile:
- Use standard APIs only
- Avoid browser-specific APIs
- Use the provided cache/catalog adapters

### 4. Optimize Viewer Performance

- Use React.memo for expensive renders
- Implement virtualization for long lists
- Lazy load heavy components

### 5. Test on Both Platforms

If creating a cross-platform resource:
- Test web viewer in browser
- Test native viewer on iOS/Android
- Verify shared logic works everywhere

## Troubleshooting

### CLI not found

Make sure you've built the CLI:
```bash
cd tools/resource-cli
bun run build
```

### TypeScript errors in generated code

The generated code is a template. You'll need to implement the loader and viewer logic. The TypeScript errors guide you to what needs implementation.

### Platform-specific issues

- Web: Ensure you're not using React Native components
- Native: Ensure you're not using DOM APIs or CSS classes

## Related Packages

- **[@bt-synergy/resource-types](../../packages/resource-types)** - Resource type system
- **[@bt-synergy/resource-signals](../../packages/resource-signals)** - Standard signals
- **[@bt-synergy/resource-panels](../../packages/resource-panels)** - Panel communication

## License

MIT


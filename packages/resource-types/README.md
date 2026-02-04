# @bt-synergy/resource-types

**Cross-platform resource type definitions with automatic panel communication**

This package provides the core infrastructure for defining resource types in BT-Synergy applications. It supports both Web (React) and Mobile (React Native) platforms with automatic panel communication capabilities.

## Features

- ✅ **Cross-Platform Support** - Single API for Web and React Native
- ✅ **Platform-Specific Viewers** - Define separate UI for web and mobile
- ✅ **Auto-Communication** - Automatic signal injection into viewers
- ✅ **Type-Safe** - Full TypeScript support
- ✅ **Plugin Architecture** - Self-contained resource packages
- ✅ **Zero Boilerplate** - No manual HOC wrapping needed

## Installation

```bash
pnpm add @bt-synergy/resource-types
```

## Quick Start

### Basic Resource Type

```typescript
import { defineResourceType } from '@bt-synergy/resource-types'
import { ScriptureLoader } from './loader'
import { ScriptureViewer } from './viewer'

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  displayName: 'Scripture',
  subjects: ['Bible', 'Aligned Bible'],
  loader: ScriptureLoader,
  viewer: ScriptureViewer,
})
```

### With Panel Communication

```typescript
import { defineResourceType } from '@bt-synergy/resource-types'
import { VerseNavigationSignal, TokenClickSignal } from '@bt-synergy/resource-signals'

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  displayName: 'Scripture',
  subjects: ['Bible', 'Aligned Bible'],
  loader: ScriptureLoader,
  viewer: ScriptureViewer,
  
  // Automatic panel communication
  communication: {
    metadata: {
      type: 'scripture',
      tags: ['bible', 'text'],
    },
    
    // Signals this resource handles
    handlers: [
      {
        signalType: 'verse-navigation',
        handler: (signal: VerseNavigationSignal, context) => {
          // Auto-called when signal received
          context.props.onNavigate?.(signal.verse)
        },
      },
    ],
    
    // Signals this resource emits (for documentation)
    emits: ['verse-navigation', 'token-click'],
  },
})
```

### Platform-Specific Viewers

```typescript
import { defineResourceType } from '@bt-synergy/resource-types'
import { ScriptureViewerWeb } from './viewer.web'
import { ScriptureViewerNative } from './viewer.native'

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  displayName: 'Scripture',
  subjects: ['Bible', 'Aligned Bible'],
  loader: ScriptureLoader,
  
  // Platform-specific viewers
  viewer: {
    web: ScriptureViewerWeb,    // Uses React DOM
    native: ScriptureViewerNative // Uses React Native
  },
  
  communication: {
    // ... communication config
  },
})
```

## Enhanced Viewer Props

When you define a resource type with `communication` config, your viewer automatically receives these additional props:

```typescript
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

const MyViewer: React.FC<EnhancedViewerProps> = ({
  // Standard props
  resource,
  settings,
  
  // Auto-injected communication props
  sendSignal,      // Send signal to any resource
  sendToPanel,     // Send signal to specific panel
  sendToResource,  // Send signal to specific resource
  resourceId,      // This resource's ID in panel system
}) => {
  const handleTokenClick = (token: string) => {
    // Send signal - no manual setup needed!
    sendSignal<TokenClickSignal>('token-click', {
      token,
      position: { line: 1, column: 5 },
    })
  }
  
  return <div onClick={() => handleTokenClick('word')}>...</div>
}
```

## API Reference

### `defineResourceType(definition)`

Creates a resource type definition with validation and auto-enhancement.

**Parameters:**
- `definition: ResourceTypeDefinition` - The resource type configuration

**Returns:**
- `ResourceTypeDefinition` - Validated definition ready for registration

### `ResourceTypeDefinition`

```typescript
interface ResourceTypeDefinition {
  // Identification
  id: string
  displayName: string
  description?: string
  icon?: string
  
  // Door43 mapping
  subjects: string[]
  aliases?: string[]
  
  // Data layer
  loader: new (config: any) => ResourceLoader
  loaderConfig?: LoaderConfig
  
  // UI layer
  viewer: ComponentType<ResourceViewerProps> | PlatformViewers
  
  // Communication (optional)
  communication?: CommunicationConfig
  
  // Features & settings
  features?: ResourceTypeFeatures
  settings?: ResourceTypeSettings
  
  // Metadata
  version?: string
  author?: string
  license?: string
}
```

### `CommunicationConfig`

```typescript
interface CommunicationConfig {
  // Resource metadata for filtering
  metadata?: Partial<ResourceMetadata>
  
  // Signal handlers
  handlers?: SignalHandlerConfig[]
  
  // Emitted signals (documentation)
  emits?: string[]
  
  // Enable/disable communication
  enabled?: boolean
}
```

### `SignalHandlerConfig`

```typescript
interface SignalHandlerConfig<T extends BaseSignal = BaseSignal> {
  signalType: string
  handler: (signal: T, context: HandlerContext) => void
  fromFilter?: ResourceFilter
}

interface HandlerContext {
  props: ResourceViewerProps
  api: ResourceAPI
  panel: Panel
}
```

### `PlatformViewers`

```typescript
interface PlatformViewers {
  web: ComponentType<ResourceViewerProps>
  native: ComponentType<ResourceViewerProps>
}
```

## Cross-Platform Development

### File Structure

```
packages/my-resource/
├── src/
│   ├── index.ts              # Main entry
│   ├── resourceType.ts       # Resource definition
│   ├── loader.ts             # Shared loader
│   ├── viewer.web.tsx        # Web viewer
│   ├── viewer.native.tsx     # Native viewer
│   └── signals/
│       └── index.ts          # Custom signals
└── package.json
```

### Shared Logic, Platform UI

```typescript
// loader.ts - Works everywhere
export class MyLoader implements ResourceLoader {
  async load(id: string) {
    // Platform-agnostic logic
    return fetchData(id)
  }
}

// viewer.web.tsx - Web-specific
export const MyViewerWeb: React.FC<ResourceViewerProps> = ({ resource }) => {
  return <div className="web-styles">{resource.data}</div>
}

// viewer.native.tsx - Native-specific
import { View, Text } from 'react-native'

export const MyViewerNative: React.FC<ResourceViewerProps> = ({ resource }) => {
  return (
    <View style={styles.container}>
      <Text>{resource.data}</Text>
    </View>
  )
}

// resourceType.ts - Platform-agnostic definition
import { MyViewerWeb } from './viewer.web'
import { MyViewerNative } from './viewer.native'

export const myResourceType = defineResourceType({
  id: 'my-resource',
  displayName: 'My Resource',
  subjects: ['Custom'],
  loader: MyLoader,
  viewer: {
    web: MyViewerWeb,
    native: MyViewerNative,
  },
})
```

## Examples

### Scripture Resource

```typescript
import { defineResourceType } from '@bt-synergy/resource-types'
import {
  VerseNavigationSignal,
  TokenClickSignal,
  TextSelectionSignal,
} from '@bt-synergy/resource-signals'

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  displayName: 'Scripture',
  description: 'Biblical text resources',
  icon: 'book-open',
  subjects: ['Bible', 'Aligned Bible'],
  
  loader: ScriptureLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50,
  },
  
  viewer: {
    web: ScriptureViewerWeb,
    native: ScriptureViewerNative,
  },
  
  communication: {
    metadata: {
      type: 'scripture',
      tags: ['bible', 'text', 'primary'],
      category: 'source-text',
    },
    
    handlers: [
      {
        signalType: 'verse-navigation',
        handler: (signal: VerseNavigationSignal, { props }) => {
          props.onNavigate?.(signal.verse)
        },
      },
      {
        signalType: 'text-selection',
        fromFilter: { type: 'scripture' }, // Only from other scripture
        handler: (signal: TextSelectionSignal, { api }) => {
          api.highlightText(signal.range)
        },
      },
    ],
    
    emits: ['verse-navigation', 'token-click', 'text-selection'],
  },
  
  features: {
    highlighting: true,
    bookmarking: true,
    search: true,
    navigation: true,
  },
  
  settings: {
    fontSize: {
      type: 'number',
      label: 'Font Size',
      default: 16,
      min: 12,
      max: 24,
    },
    showVerseNumbers: {
      type: 'boolean',
      label: 'Show Verse Numbers',
      default: true,
    },
  },
  
  version: '1.0.0',
  author: 'BT-Synergy Team',
  license: 'MIT',
})
```

### Translation Notes Resource

```typescript
export const notesResourceType = defineResourceType({
  id: 'translation-notes',
  displayName: 'Translation Notes',
  subjects: ['Translation Notes'],
  
  loader: NotesLoader,
  viewer: NotesViewer, // Single viewer for both platforms
  
  communication: {
    metadata: {
      type: 'notes',
      tags: ['helps', 'secondary'],
      category: 'translation-helps',
    },
    
    handlers: [
      {
        signalType: 'verse-navigation',
        handler: (signal, { api }) => {
          api.loadNotes(signal.verse)
        },
      },
      {
        signalType: 'token-click',
        fromFilter: { type: 'scripture' }, // Only listen to scripture
        handler: (signal, { api }) => {
          api.showWordNotes(signal.token)
        },
      },
    ],
    
    emits: ['entry-link-click'],
  },
})
```

## Migration Guide

### From Manual HOC Wrapping

**Before:**
```typescript
// Old way - manual wrapping
import { withPanelCommunication } from './withPanelCommunication'

const BaseViewer = ({ resource }) => <div>...</div>

export const EnhancedViewer = withPanelCommunication(BaseViewer, {
  handlers: [...],
  metadata: {...},
})

export const resourceType = {
  viewer: EnhancedViewer,
  // ...
}
```

**After:**
```typescript
// New way - automatic enhancement
const MyViewer = ({ resource, sendSignal }) => {
  // sendSignal is automatically available!
  return <div>...</div>
}

export const resourceType = defineResourceType({
  viewer: MyViewer,
  communication: {
    handlers: [...],
    metadata: {...},
  },
})
```

### From Single Platform to Cross-Platform

**Before:**
```typescript
export const resourceType = defineResourceType({
  viewer: MyViewer, // Only works on web
})
```

**After:**
```typescript
// Create platform-specific viewers
// viewer.web.tsx
export const MyViewerWeb = ({ resource }) => (
  <div className="web-styles">...</div>
)

// viewer.native.tsx
import { View } from 'react-native'
export const MyViewerNative = ({ resource }) => (
  <View style={styles.native}>...</View>
)

// resourceType.ts
export const resourceType = defineResourceType({
  viewer: {
    web: MyViewerWeb,
    native: MyViewerNative,
  },
})
```

## Best Practices

### 1. Use Standard Signals

```typescript
// ✅ Good - use standard signals
import { VerseNavigationSignal } from '@bt-synergy/resource-signals'

communication: {
  handlers: [{
    signalType: 'verse-navigation',
    handler: (signal: VerseNavigationSignal, ctx) => {...}
  }]
}

// ❌ Bad - custom signal without definition
communication: {
  handlers: [{
    signalType: 'my-custom-signal', // Not documented
    handler: (signal: any, ctx) => {...}
  }]
}
```

### 2. Document Emitted Signals

```typescript
// ✅ Good - document what you emit
communication: {
  emits: ['verse-navigation', 'token-click'],
  handlers: [...]
}

// ❌ Bad - undocumented emissions
// Developers won't know what signals you send
```

### 3. Use Metadata for Filtering

```typescript
// ✅ Good - rich metadata
communication: {
  metadata: {
    type: 'scripture',
    tags: ['bible', 'primary'],
    category: 'source-text',
    language: 'en',
  }
}

// ❌ Bad - minimal metadata
communication: {
  metadata: { type: 'scripture' }
}
```

### 4. Platform-Specific When Needed

```typescript
// ✅ Good - different UX for platforms
viewer: {
  web: ScriptureViewerWeb,    // Desktop-optimized
  native: ScriptureViewerNative // Touch-optimized
}

// ⚠️ OK - same viewer if UI is simple
viewer: SimpleViewer // Works on both
```

## Troubleshooting

### Signals Not Received

**Problem:** Handler not being called

**Solution:** Check metadata and filters
```typescript
// Sender
sendSignal<MySignal>('my-signal', { data })

// Receiver - make sure metadata matches
communication: {
  metadata: { type: 'correct-type' }, // Must match sender's type
  handlers: [{
    signalType: 'my-signal', // Must match exactly
    handler: (signal) => {...}
  }]
}
```

### TypeScript Errors

**Problem:** `Property 'sendSignal' does not exist`

**Solution:** Use `EnhancedViewerProps` type
```typescript
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

const MyViewer: React.FC<EnhancedViewerProps> = ({ sendSignal }) => {
  // Now TypeScript knows about sendSignal
}
```

### Platform Detection Issues

**Problem:** Wrong viewer loaded

**Solution:** Check build configuration
- Web: Ensure bundler resolves `.web.tsx` correctly
- Native: Ensure Metro resolves `.native.tsx` correctly

## Related Packages

- **[@bt-synergy/resource-panels](../resource-panels)** - Panel communication system
- **[@bt-synergy/resource-signals](../resource-signals)** - Standard signal definitions
- **[@bt-synergy/catalog-manager](../catalog-manager)** - Resource loading and caching

## License

MIT

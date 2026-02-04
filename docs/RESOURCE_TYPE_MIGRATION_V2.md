# Resource Type Migration Guide v2.0

This guide helps you migrate to the new `@bt-synergy/resource-types` v2.0 API with automatic communication enhancement and cross-platform support.

## What's New in v2.0

### ✨ Major Features

1. **Automatic Communication Enhancement**
   - No more manual HOC wrapping
   - Signal props automatically injected
   - Cleaner, simpler code

2. **Cross-Platform Support**
   - Single API for Web and React Native
   - Platform-specific viewers
   - Shared business logic

3. **Integrated Signal System**
   - Built-in `@bt-synergy/resource-signals` support
   - Type-safe signal handling
   - Automatic signal discovery

4. **Enhanced Type Safety**
   - Better TypeScript support
   - `EnhancedViewerProps` type
   - Full IntelliSense

## Migration Steps

### Step 1: Update Dependencies

```json
{
  "dependencies": {
    "@bt-synergy/resource-types": "^0.2.0",
    "@bt-synergy/resource-signals": "^0.1.0"
  }
}
```

### Step 2: Remove Manual HOC Wrapping

**Before (v1.0):**

```typescript
// OLD: Manual wrapping
import { withPanelCommunication } from './withPanelCommunication'

const BaseViewer = ({ resource }) => {
  return <div>{resource.name}</div>
}

const EnhancedViewer = withPanelCommunication(BaseViewer, {
  metadata: { type: 'scripture' },
  handlers: [
    {
      signalType: 'verse-navigation',
      handler: (signal, context) => {
        context.props.onNavigate?.(signal.verse)
      }
    }
  ],
  emits: ['verse-navigation']
})

export const scriptureResourceType = {
  id: 'scripture',
  viewer: EnhancedViewer,
  // ...
}
```

**After (v2.0):**

```typescript
// NEW: Automatic enhancement
import { defineResourceType } from '@bt-synergy/resource-types'
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'
import { VerseNavigationSignal } from '@bt-synergy/resource-signals'

const ScriptureViewer: React.FC<EnhancedViewerProps> = ({ 
  resource, 
  sendSignal // Automatically available!
}) => {
  return <div>{resource.name}</div>
}

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  viewer: ScriptureViewer,
  communication: {
    metadata: { type: 'scripture' },
    handlers: [
      {
        signalType: 'verse-navigation',
        handler: (signal: VerseNavigationSignal, context) => {
          context.props.onNavigate?.(signal.verse)
        }
      }
    ],
    emits: ['verse-navigation']
  },
  // ...
})
```

### Step 3: Update Viewer Props Type

**Before:**

```typescript
interface MyViewerProps extends ResourceViewerProps {
  sendSignal?: (signal: any) => void
  sendToPanel?: (panelId: string, signal: any) => void
  // ... manual prop definitions
}

const MyViewer: React.FC<MyViewerProps> = (props) => {
  // ...
}
```

**After:**

```typescript
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

const MyViewer: React.FC<EnhancedViewerProps> = ({
  resource,
  settings,
  sendSignal,      // Auto-typed!
  sendToPanel,     // Auto-typed!
  sendToResource,  // Auto-typed!
  resourceId,      // Auto-typed!
}) => {
  // ...
}
```

### Step 4: Use Standard Signals

**Before:**

```typescript
// Custom signal definitions scattered everywhere
interface MyCustomSignal {
  type: 'verse-navigation'
  verse: { book: string; chapter: number; verse: number }
  // ...
}
```

**After:**

```typescript
// Use standard signals from @bt-synergy/resource-signals
import { 
  VerseNavigationSignal,
  TokenClickSignal,
  TextSelectionSignal 
} from '@bt-synergy/resource-signals'

// Type-safe signal sending
sendSignal<VerseNavigationSignal>('verse-navigation', {
  verse: { book: 'JHN', chapter: 3, verse: 16 }
})
```

### Step 5: Add Cross-Platform Support (Optional)

If you're planning to support React Native:

**Create platform-specific viewers:**

```typescript
// viewer.web.tsx
export const ScriptureViewerWeb: React.FC<EnhancedViewerProps> = ({ resource }) => {
  return (
    <div className="scripture-viewer">
      {/* Web-specific UI */}
    </div>
  )
}

// viewer.native.tsx
import { View, Text } from 'react-native'

export const ScriptureViewerNative: React.FC<EnhancedViewerProps> = ({ resource }) => {
  return (
    <View style={styles.container}>
      {/* Native-specific UI */}
    </View>
  )
}

// resourceType.ts
import { ScriptureViewerWeb } from './viewer.web'
import { ScriptureViewerNative } from './viewer.native'

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  viewer: {
    web: ScriptureViewerWeb,
    native: ScriptureViewerNative
  },
  // ...
})
```

## Complete Example Migration

### Before (v1.0)

```typescript
// src/resourceTypes/scripture/index.tsx
import { withPanelCommunication } from '../withPanelCommunication'

const ScriptureViewerBase = ({ resource, onNavigate }) => {
  return (
    <div>
      <h1>{resource.name}</h1>
      {/* ... */}
    </div>
  )
}

const ScriptureViewer = withPanelCommunication(ScriptureViewerBase, {
  metadata: { type: 'scripture', tags: ['bible'] },
  handlers: [
    {
      signalType: 'verse-navigation',
      handler: (signal, context) => {
        context.props.onNavigate?.(signal.verse)
      }
    },
    {
      signalType: 'token-click',
      fromFilter: { type: 'scripture' },
      handler: (signal, context) => {
        context.api.highlightToken(signal.token)
      }
    }
  ],
  emits: ['verse-navigation', 'token-click']
})

export const scriptureResourceType = {
  id: 'scripture',
  displayName: 'Scripture',
  subjects: ['Bible', 'Aligned Bible'],
  loader: ScriptureLoader,
  viewer: ScriptureViewer,
}
```

### After (v2.0)

```typescript
// packages/scripture-resource/src/index.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'
import {
  VerseNavigationSignal,
  TokenClickSignal
} from '@bt-synergy/resource-signals'
import { ScriptureLoader } from './loader'

const ScriptureViewer: React.FC<EnhancedViewerProps> = ({ 
  resource, 
  sendSignal,
  onNavigate 
}) => {
  const handleVerseClick = (verse: any) => {
    sendSignal<VerseNavigationSignal>('verse-navigation', { verse })
  }

  return (
    <div>
      <h1>{resource.name}</h1>
      {/* ... */}
    </div>
  )
}

export const scriptureResourceType = defineResourceType({
  id: 'scripture',
  displayName: 'Scripture',
  subjects: ['Bible', 'Aligned Bible'],
  loader: ScriptureLoader,
  viewer: ScriptureViewer,
  
  communication: {
    metadata: { 
      type: 'scripture', 
      tags: ['bible', 'primary'],
      category: 'source-text'
    },
    handlers: [
      {
        signalType: 'verse-navigation',
        handler: (signal: VerseNavigationSignal, context) => {
          context.props.onNavigate?.(signal.verse)
        }
      },
      {
        signalType: 'token-click',
        fromFilter: { type: 'scripture' },
        handler: (signal: TokenClickSignal, context) => {
          context.api.highlightToken(signal.token)
        }
      }
    ],
    emits: ['verse-navigation', 'token-click']
  },
  
  features: {
    highlighting: true,
    navigation: true,
  },
  
  version: '1.0.0',
})
```

## Breaking Changes

### 1. HOC Wrapper Removed

The `withPanelCommunication` HOC is no longer needed. Communication is now automatic via `defineResourceType`.

**Migration:** Move HOC config to `communication` property.

### 2. Props Type Changed

Manual prop interfaces replaced with `EnhancedViewerProps`.

**Migration:** Update component prop types.

### 3. Signal Handler Context

Handler context now includes `{ props, api }` instead of `{ props, api, panel }`.

**Migration:** Remove `panel` references from handlers.

### 4. useSignal Hook Signature

The hook signature has changed for lifecycle parameter.

**Before:** `useSignal(type, { lifecycle: 'ephemeral' })`  
**After:** `useSignal(type, 'ephemeral')`

**Migration:** Update all `useSignal` calls.

## Common Issues

### Issue 1: TypeScript Errors on `sendSignal`

**Problem:**
```typescript
Property 'sendSignal' does not exist on type 'ResourceViewerProps'
```

**Solution:**
```typescript
// Use EnhancedViewerProps
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

const MyViewer: React.FC<EnhancedViewerProps> = ({ sendSignal }) => {
  // Now TypeScript knows about sendSignal
}
```

### Issue 2: Signals Not Received

**Problem:** Handler not being called.

**Solution:** Check metadata and signal types match exactly:

```typescript
// Sender
communication: {
  metadata: { type: 'scripture' }
}

// Receiver
communication: {
  handlers: [{
    signalType: 'verse-navigation', // Must match exactly
    fromFilter: { type: 'scripture' }, // Must match sender's type
    handler: (signal) => {...}
  }]
}
```

### Issue 3: Platform Detection Not Working

**Problem:** Wrong viewer loaded on mobile/web.

**Solution:** Ensure file extensions are correct:
- Web: `viewer.web.tsx`
- Native: `viewer.native.tsx`

And bundler is configured to resolve platform-specific files.

## Checklist

- [ ] Updated `@bt-synergy/resource-types` to v2.0
- [ ] Installed `@bt-synergy/resource-signals`
- [ ] Removed `withPanelCommunication` HOC
- [ ] Updated viewer props to `EnhancedViewerProps`
- [ ] Moved communication config to `defineResourceType`
- [ ] Replaced custom signals with standard signals
- [ ] Updated `useSignal` hook calls
- [ ] Tested signal sending/receiving
- [ ] (Optional) Created platform-specific viewers
- [ ] Updated tests
- [ ] Updated documentation

## Next Steps

1. **Review Standard Signals** - Check `@bt-synergy/resource-signals` for available signals
2. **Test Communication** - Verify signals work between resources
3. **Plan Mobile Support** - If needed, create platform-specific viewers
4. **Update Documentation** - Document your resource's signals and handlers

## Need Help?

- See `packages/resource-types/README.md` for full API reference
- See `packages/scripture-resource/` for complete example
- See `docs/CROSS_PLATFORM_ARCHITECTURE.md` for platform details
- See `@bt-synergy/resource-signals` README for signal catalog

## Timeline

- **v1.0**: Manual HOC wrapping, custom signals
- **v2.0**: Automatic enhancement, standard signals, cross-platform
- **v3.0** (planned): CLI tool, auto-registration, enhanced discovery

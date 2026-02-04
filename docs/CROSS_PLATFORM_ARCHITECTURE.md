# Cross-Platform Architecture (Web + React Native)

## Overview

BT Synergy resource types are designed to work seamlessly across platforms:
- **Web** - React DOM (tc-study web app)
- **Mobile** - React Native (tc-study mobile app)
- **Desktop** - Electron (future)

## Core Principle: Shared Logic, Platform-Specific UI

```
┌─────────────────────────────────────────┐
│  Resource Package                       │
├─────────────────────────────────────────┤
│                                         │
│  ✅ Shared (Works Everywhere)          │
│  ├── Loader (data fetching)            │
│  ├── Business Logic                    │
│  ├── Signal Definitions                │
│  ├── Types                             │
│  └── Utilities                         │
│                                         │
│  🎨 Platform-Specific                  │
│  ├── Viewer.web.tsx      (React DOM)   │
│  └── Viewer.native.tsx   (React Native)│
│                                         │
└─────────────────────────────────────────┘
```

## Package Structure

### Multi-Platform Resource Package

```
packages/scripture-resource/
├── src/
│   ├── loader/                    ← ✅ Shared
│   │   └── ScriptureLoader.ts    (Works everywhere)
│   │
│   ├── viewer/                    ← 🎨 Platform-specific
│   │   ├── ScriptureViewer.web.tsx
│   │   ├── ScriptureViewer.native.tsx
│   │   ├── shared/               ← Shared components
│   │   │   └── useScriptureData.ts
│   │   └── index.ts              ← Conditional exports
│   │
│   ├── types/                     ← ✅ Shared
│   │   └── index.ts
│   │
│   ├── signals/                   ← ✅ Shared
│   │   └── index.ts
│   │
│   ├── utils/                     ← ✅ Shared
│   │   └── formatting.ts
│   │
│   ├── resourceType.ts            ← ✅ Shared config
│   └── index.ts                   ← Platform exports
│
└── package.json                   ← Conditional exports
```

### Conditional Exports (package.json)

```json
{
  "name": "@bt-synergy/scripture-resource",
  "exports": {
    ".": {
      "react-native": "./dist/index.native.js",
      "default": "./dist/index.web.js"
    },
    "./loader": {
      "types": "./dist/loader/index.d.ts",
      "default": "./dist/loader/index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts",
      "default": "./dist/types/index.js"
    }
  },
  "react-native": "./dist/index.native.js",
  "main": "./dist/index.web.js"
}
```

### Platform-Specific Viewer Exports

```typescript
// src/viewer/index.ts

// Conditional export based on platform
export { ScriptureViewer } from './ScriptureViewer.web'
// OR (when building for React Native)
export { ScriptureViewer } from './ScriptureViewer.native'

// Shared hooks work everywhere
export { useScriptureData } from './shared/useScriptureData'
```

## Platform-Agnostic Infrastructure

### 1. Resource Signals (Pure JS)

```typescript
// packages/resource-signals/ - Works everywhere!
export interface VerseNavigationSignal extends BaseSignal {
  type: 'verse-navigation'
  verse: {
    book: string
    chapter: number
    verse?: number
  }
}

// No platform-specific code
// Used by both web and mobile
```

### 2. Resource Types System (Pure JS)

```typescript
// packages/resource-types/ - Platform-agnostic
export function defineResourceType(config: ResourceTypeConfig) {
  return {
    id: config.id,
    loader: config.loader,        // ✅ Same on all platforms
    viewer: config.viewer,         // 🎨 Platform-specific
    signals: config.signals,       // ✅ Same on all platforms
    // ...
  }
}
```

### 3. Resource Loaders (Pure JS)

```typescript
// packages/scripture-resource/src/loader/
// Works on web AND mobile - no platform-specific code!
export class ScriptureLoader {
  async loadChapter(book: string, chapter: number) {
    // Fetch from API (works everywhere)
    // Parse USFM (works everywhere)
    // Cache data (platform adapter handles storage)
    return content
  }
}
```

## Platform-Specific Components

### Web Viewer (React DOM)

```tsx
// packages/scripture-resource/src/viewer/ScriptureViewer.web.tsx
import { defineViewer } from '@bt-synergy/resource-types/web'

export const ScriptureViewer = defineViewer({
  platform: 'web',
  component: ({ resource, sendSignal }) => {
    return (
      <div className="scripture-viewer">
        {/* Web-specific UI with Tailwind, HTML elements */}
        <div onClick={() => sendSignal(...)}>
          Click me
        </div>
      </div>
    )
  }
})
```

### Mobile Viewer (React Native)

```tsx
// packages/scripture-resource/src/viewer/ScriptureViewer.native.tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { defineViewer } from '@bt-synergy/resource-types/native'

export const ScriptureViewer = defineViewer({
  platform: 'native',
  component: ({ resource, sendSignal }) => {
    return (
      <View style={styles.container}>
        {/* React Native UI */}
        <TouchableOpacity onPress={() => sendSignal(...)}>
          <Text>Click me</Text>
        </TouchableOpacity>
      </View>
    )
  }
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  }
})
```

## Platform Adapters

### Storage Adapter

```typescript
// Platform-agnostic interface
export interface StorageAdapter {
  get(key: string): Promise<any>
  set(key: string, value: any): Promise<void>
  delete(key: string): Promise<void>
}

// Web implementation
// packages/storage-adapter-web/
export class WebStorageAdapter implements StorageAdapter {
  async get(key: string) {
    // Use IndexedDB
  }
}

// Mobile implementation
// packages/storage-adapter-native/
export class NativeStorageAdapter implements StorageAdapter {
  async get(key: string) {
    // Use AsyncStorage or SQLite
  }
}
```

### Network Adapter

```typescript
// Web: uses fetch
// Mobile: uses fetch or custom native module

export interface NetworkAdapter {
  fetch(url: string, options?: RequestInit): Promise<Response>
}
```

### File System Adapter

```typescript
// Web: uses File API
// Mobile: uses react-native-fs

export interface FileSystemAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
}
```

## Resource Panels (Cross-Platform)

```typescript
// packages/resource-panels/
// Core logic is platform-agnostic
export { useSignal, useSignalHandler } from './hooks'

// Platform-specific UI hooks
// packages/resource-panels/web/
export { LinkedPanel, LinkedPanelsContainer } from './components.web'

// packages/resource-panels/native/
export { LinkedPanel, LinkedPanelsContainer } from './components.native'
```

## App Structure

### Web App

```
apps/tc-study/                    (Web)
├── package.json
│   "dependencies": {
│     "@bt-synergy/scripture-resource": "*",  ← Auto-uses .web
│     "@bt-synergy/storage-adapter-web": "*"
│   }
├── src/
│   └── contexts/
│       └── CatalogContext.tsx    ← Auto-loads web viewers
```

### Mobile App

```
apps/tc-study-mobile/             (React Native)
├── package.json
│   "dependencies": {
│     "@bt-synergy/scripture-resource": "*",  ← Auto-uses .native
│     "@bt-synergy/storage-adapter-native": "*"
│   }
├── src/
│   └── contexts/
│       └── CatalogContext.tsx    ← Auto-loads native viewers
```

## Build Configuration

### Web Build

```json
// apps/tc-study/vite.config.ts
export default {
  resolve: {
    alias: {
      // No special configuration needed
      // Vite uses "default" export from packages
    }
  }
}
```

### Mobile Build

```json
// apps/tc-study-mobile/metro.config.js
module.exports = {
  resolver: {
    // Metro uses "react-native" export from packages
    resolverMainFields: ['react-native', 'browser', 'main']
  }
}
```

## Creating Cross-Platform Resource Packages

### CLI Command

```bash
# Create resource package with platform support
pnpm resource create my-resource --platforms web,native

# Generates:
packages/my-resource-resource/
├── src/
│   ├── loader/                      ← Shared
│   ├── viewer/
│   │   ├── MyViewer.web.tsx        ← Web version
│   │   ├── MyViewer.native.tsx     ← Mobile version
│   │   └── shared/                 ← Shared logic
│   └── resourceType.ts              ← Shared config
└── package.json                     ← Conditional exports
```

### Shared Business Logic

```typescript
// src/viewer/shared/useMyResourceData.ts
// ✅ Works on web AND mobile!
import { useState, useEffect } from 'react'

export function useMyResourceData(resourceKey: string) {
  const [data, setData] = useState(null)
  
  useEffect(() => {
    // Fetch data using shared loader
    // Logic is identical on all platforms
  }, [resourceKey])
  
  return { data, loading }
}
```

### Web-Specific UI

```tsx
// src/viewer/MyViewer.web.tsx
import { useMyResourceData } from './shared/useMyResourceData'

export function MyViewer({ resource }) {
  const { data } = useMyResourceData(resource.key)
  
  return (
    <div className="p-4">
      {/* Tailwind CSS, HTML elements */}
      <div className="text-lg font-bold">{data?.title}</div>
    </div>
  )
}
```

### Mobile-Specific UI

```tsx
// src/viewer/MyViewer.native.tsx
import { View, Text, StyleSheet } from 'react-native'
import { useMyResourceData } from './shared/useMyResourceData'

export function MyViewer({ resource }) {
  const { data } = useMyResourceData(resource.key)
  
  return (
    <View style={styles.container}>
      {/* React Native components */}
      <Text style={styles.title}>{data?.title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold' }
})
```

## Testing Strategy

### Shared Logic Tests

```typescript
// __tests__/loader.test.ts
// Run on both web and mobile
import { ScriptureLoader } from '../loader'

describe('ScriptureLoader', () => {
  it('loads chapter', async () => {
    const loader = new ScriptureLoader(resourceKey, cache)
    const chapter = await loader.loadChapter('GEN', 1)
    expect(chapter).toBeDefined()
  })
})
```

### Platform-Specific Tests

```typescript
// __tests__/viewer.web.test.tsx
import { render } from '@testing-library/react'
import { ScriptureViewer } from '../viewer/ScriptureViewer.web'

// __tests__/viewer.native.test.tsx
import { render } from '@testing-library/react-native'
import { ScriptureViewer } from '../viewer/ScriptureViewer.native'
```

## Migration Path

### Phase 1: Infrastructure (Now)
- Create platform-agnostic signal system
- Create platform-agnostic resource types
- Set up conditional exports

### Phase 2: Web Resources (Now)
- Migrate all resources to packages
- Use `.web.tsx` extension for viewers
- Test thoroughly on web

### Phase 3: Mobile App (Future)
- Create React Native app
- Create `.native.tsx` viewers
- Reuse ALL loaders and business logic
- Test thoroughly on mobile

### Phase 4: Shared Components (Future)
- Extract reusable logic to shared hooks
- Create platform adapter layer
- Build component library for both platforms

## Best Practices

1. **Keep Logic Platform-Agnostic**
   - Loaders: ✅ Always shared
   - Business logic: ✅ Always shared
   - UI: 🎨 Platform-specific

2. **Use Shared Hooks**
   ```typescript
   // ✅ Good - works everywhere
   export function useScriptureData() { ... }
   
   // Use in both .web.tsx and .native.tsx
   ```

3. **Conditional Exports**
   ```json
   {
     "exports": {
       ".": {
         "react-native": "./native.js",
         "default": "./web.js"
       }
     }
   }
   ```

4. **Platform Detection**
   ```typescript
   import { Platform } from 'react-native'  // Mobile
   // Or detect in web via navigator
   ```

5. **Shared Types**
   ```typescript
   // ✅ One type definition for all platforms
   export interface ScriptureContent {
     book: string
     chapter: number
     verses: Verse[]
   }
   ```

## Benefits

### For Developers
- ✅ **Write once, use everywhere** - Loaders and logic shared
- ✅ **Platform-specific polish** - Native UI on each platform
- ✅ **Type safety** - Same types across platforms
- ✅ **Easy testing** - Test logic once, UI per platform

### For Users
- ✅ **Native experience** - Feels native on each platform
- ✅ **Consistent behavior** - Same functionality everywhere
- ✅ **Fast performance** - Platform-optimized UI

### For the Platform
- ✅ **Code reuse** - 70-80% shared across platforms
- ✅ **Maintainable** - Fix bugs once, applies everywhere
- ✅ **Scalable** - Easy to add new platforms
- ✅ **Future-proof** - Ready for desktop, TV, etc.

## Example: Full Cross-Platform Package

See `packages/scripture-resource/` for complete example with:
- Shared loader ✅
- Web viewer (.web.tsx) 🎨
- Mobile viewer (.native.tsx) 🎨
- Shared hooks and utils ✅
- Conditional exports ✅

---

**Result: Write loaders once, create UI twice, support all platforms!** 🎯

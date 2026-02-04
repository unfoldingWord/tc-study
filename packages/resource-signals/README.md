# @bt-synergy/resource-signals

Platform-agnostic signal definitions for resource inter-communication.

Works identically on **Web** and **React Native**.

## Installation

```bash
pnpm add @bt-synergy/resource-signals
```

## Usage

```typescript
import { 
  VerseNavigationSignal,
  SIGNAL_REGISTRY 
} from '@bt-synergy/resource-signals'

// Use in any platform (web or mobile)
sendSignal<VerseNavigationSignal>('verse-navigation', {
  verse: { book: 'JHN', chapter: 3, verse: 16 }
})
```

## Available Signals

### Navigation
- `verse-navigation` - Navigate to specific verse
- `book-navigation` - Navigate to book/chapter

### Content Interaction
- `token-click` - Word clicked
- `text-selection` - Text selected

### Links & References
- `entry-link-click` - Resource link clicked
- `cross-reference` - Cross-reference activated

### Lifecycle
- `resource-loaded` - Content loaded
- `resource-error` - Error occurred
- `content-change` - Content edited

### Synchronization
- `scroll-sync` - Sync scrolling

## Signal Discovery

```typescript
import { SIGNAL_REGISTRY } from '@bt-synergy/resource-signals'

// List all signals
const signals = Object.keys(SIGNAL_REGISTRY)

// Get signal info
const info = SIGNAL_REGISTRY['verse-navigation']
console.log(info.description)
console.log(info.typicalSenders)
console.log(info.typicalReceivers)
```

## Custom Signals

While standard signals cover most use cases, you can define custom signals:

```typescript
import type { BaseSignal } from '@bt-synergy/resource-signals'

export interface MyCustomSignal extends BaseSignal {
  type: 'my-custom-signal'
  myData: {
    foo: string
    bar: number
  }
}
```

## Cross-Platform

This package contains **zero** platform-specific code. All signals work identically on web and mobile!

```typescript
// Works on web ✅
// Works on React Native ✅
// Works on any future platform ✅
sendSignal<VerseNavigationSignal>('verse-navigation', data)
```

## License

MIT

# @bt-synergy/resource-panels

High-level wrapper around `@bt-toolkit/linked-panels` for building interactive, communicating resources in the BT Synergy ecosystem.

## Features

- ✅ **Type-safe signal system** with IntelliSense support
- ✅ **Simple, intuitive hooks** for common use cases  
- ✅ **Flexible multi-dimensional filtering** - tags, categories, languages, custom metadata
- ✅ **Message lifecycle management** - persistent and ephemeral messages
- ✅ **Signal discovery** - easily see what signals other resources send
- ✅ **Scales to any number of panels** - 2, 4, 10+ panels with same API
- ✅ **Best practices baked in** - no need to repeat boilerplate
- ✅ **Great developer experience** - minimal code, maximum clarity

## Table of Contents

- [Quick Start](#quick-start)
- [Key Concepts](#key-concepts)
- [Available Signals](#available-signals)
- [Core Hooks](#core-hooks)
- [Message Lifecycle](#message-lifecycle-persistent-vs-ephemeral)
- [Flexible Multi-Dimensional Filtering](#flexible-multi-dimensional-filtering)
- [Signal Discovery](#signal-discovery)
- [Adding a New Resource Type](#adding-a-new-resource-type)
- [Advanced Patterns](#advanced-patterns)
- [Documentation](#documentation)
- [Examples](#examples)

## Why This Package?

While `@bt-toolkit/linked-panels` provides the low-level messaging infrastructure, `@bt-synergy/resource-panels` adds significant developer experience improvements:

| Feature | `linked-panels` (Low-Level) | `resource-panels` (High-Level) |
|---------|----------------------------|--------------------------------|
| **Type Safety** | Manual types | ✅ Built-in TypeScript types with IntelliSense |
| **Filtering** | Manual checks in handlers | ✅ Automatic multi-dimensional filtering |
| **Lifecycle** | Manual cleanup | ✅ Automatic ephemeral/persistent management |
| **Boilerplate** | Significant | ✅ Minimal - one-line send/receive |
| **Discoverability** | None | ✅ Signal registry with metadata |
| **Scalability** | Manual panel management | ✅ Works with 2-100+ panels |
| **Backward Compat** | N/A | ✅ Wraps `linked-panels` API |

## Quick Start

### 1. Install

```bash
bun add @bt-synergy/resource-panels
```

### 2. Define Your Signal Types

Create signals that match YOUR needs - the library is flexible!

```tsx
// myapp/signals.ts
import { BaseSignal } from '@bt-synergy/resource-panels'

// Define whatever signals make sense for your app
export interface WordClickSignal extends BaseSignal {
  type: 'word-click'
  word: {
    text: string
    id: string
    reference: string
  }
}

export interface NavigateSignal extends BaseSignal {
  type: 'navigate'
  target: {
    book: string
    chapter: number
  }
}

// Add as many signal types as you need!
```

### 3. Define Your Resource Metadata

```tsx
import { ResourceMetadata } from '@bt-synergy/resource-panels'

const myResourceMetadata: ResourceMetadata = {
  type: 'scripture',
  tags: ['NT', 'Gospel'],
  language: 'en',
  // Add whatever fields you need
  custom: {
    version: '2.0',
    audience: 'translators'
  }
}
```

### 4. Send Signals

```tsx
import { useSignal } from '@bt-synergy/resource-panels'
import { WordClickSignal } from './myapp/signals'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToFiltered, sendToAll } = useSignal<WordClickSignal>(
    'word-click',
    resourceId,
    myResourceMetadata
  )
  
  const handleWordClick = (word: string, id: string, ref: string) => {
    // Send to filtered resources
    sendToFiltered(
      { language: 'en', tags: ['lexical'] },
      {
        lifecycle: 'event',
        word: {
          text: word,
          id: id,
          reference: ref
        }
      }
    )
  }
  
  return (
    <span onClick={() => handleWordClick('λόγος', 'G3056', 'JHN 1:1')}>
      λόγος
    </span>
  )
}
```

### 5. Receive Signals

```tsx
import { useSignalHandler } from '@bt-synergy/resource-panels'
import { WordClickSignal } from './myapp/signals'

function LexiconViewer({ resourceId }: { resourceId: string }) {
  const [currentWord, setCurrentWord] = useState<string | null>(null)
  
  useSignalHandler<WordClickSignal>(
    'word-click',
    resourceId,
    (signal) => {
      setCurrentWord(signal.word.id)
      loadDefinition(signal.word.id)
    },
    {
      resourceMetadata: {
        type: 'lexicon',
        language: 'en',
        tags: ['lexical']
      },
      fromFilter: {
        language: 'en' // Only from English resources
      }
    }
  )
  
  return <div>{currentWord && <Definition wordId={currentWord} />}</div>
}
```

## Using Example Signals (Optional)

We provide example signal definitions for Bible/translation apps, but you're not required to use them!

```tsx
// Option 1: Use our examples as-is
import { TokenClickSignal, VerseNavigationSignal } from '@bt-synergy/resource-panels/examples'

// Option 2: Adapt them to your needs
import type { TokenClickSignal as ExampleToken } from '@bt-synergy/resource-panels/examples'

interface MyTokenClick extends ExampleToken {
  // Add your own fields
  customData: string
}

// Option 3: Ignore them and define your own (recommended!)
import { BaseSignal } from '@bt-synergy/resource-panels'

interface MySignal extends BaseSignal {
  type: 'my-event'
  // Your structure
}
```

## Philosophy

This library provides **generic infrastructure**, not prescriptive signal definitions.

✅ **You define** what signals your resources send  
✅ **You define** what data structure makes sense  
✅ **You define** how resources communicate  

The library gives you:

- Type-safe messaging hooks
- Multi-dimensional filtering
- Message lifecycle management
- Signal discovery tools (optional)

We provide **example signals** for Bible/translation apps, but they're completely optional!

## Key Concepts

### Signals

**Signals** are type-safe messages that resources send to communicate with each other.

**You define your own signal types** by extending `BaseSignal`:

```tsx
import { BaseSignal } from '@bt-synergy/resource-panels'

interface MySignal extends BaseSignal {
  type: 'my-custom-event'  // Your signal name
  myData: {
    // Your data structure
    field1: string
    field2: number
  }
}
```

Every signal has:

- **Type** - Identifies the signal (you choose the name)
- **Lifecycle** - `'event'`, `'request'`, or `'response'`
- **Data** - Your custom payload
- **Metadata** - Source resource info (type, tags, language, etc.)
- **Persistence** - Optional - ephemeral (default) or persistent

### Resource Metadata

**Metadata** describes your resource's characteristics for intelligent filtering:

```typescript
{
  type: 'scripture',           // Resource type
  tags: ['OT', 'Torah'],       // Custom categorization
  language: 'en',              // Language code
  categories: ['study'],       // Categories
  testament: 'OT',             // For Bible resources
  owner: 'unfoldingWord',      // Organization
  custom: { ... }              // Your own fields
}
```

### Filtering

**Filters** let you target signals to specific resources:

```typescript
// Send only to English OT study resources
sendToFiltered(
  { language: 'en', testament: 'OT', categories: ['study'] },
  { ...signalData }
)
```

**Filter matching:**

- All specified fields must match (AND logic)
- Arrays use OR logic (any match)
- No filter = broadcast to all

### Message Lifecycle

- **Ephemeral** (default) - Cleared when resource navigates away
- **Persistent** - Stays until explicitly cleared - good for context (current verse, selection)

### Multi-Panel Communication

The system scales to any number of panels:

```
Panel 1 (Scripture) → Sends token-click → Panels 2,3,4 receive if they match filter
Panel 2 (Words) → Sends link-click → Panel 1 receives
Panel 3 (Notes) → Sends verse-nav → All panels receive
```

## Example Signals (Optional)

**You define your own signals!** But if you're building a Bible/translation app, we provide examples you can use or adapt.

Import from `@bt-synergy/resource-panels/examples`:

### Example 1: `TokenClickSignal` - Word/Token Click

```ts
import { TokenClickSignal } from '@bt-synergy/resource-panels/examples'

// Example structure - adapt to your needs!
{
  type: 'token-click',
  lifecycle: 'event',
  token: {
    id: 'token-123',
    content: 'λόγος',
    semanticId: 'G3056',
    verseRef: 'JHN 1:1',
    position: 4
  }
}
```

### Example 2: `LinkClickSignal` - Hyperlink Click

```ts
import { LinkClickSignal } from '@bt-synergy/resource-panels/examples'

{
  type: 'link-click',
  lifecycle: 'event',
  link: {
    url: 'rc://en/tw/dict/bible/kt/love',
    text: 'love'
  }
}
```

### Example 3: `VerseNavigationSignal` - Navigate to Verse

```ts
import { VerseNavigationSignal } from '@bt-synergy/resource-panels/examples'

{
  type: 'verse-navigation',
  lifecycle: 'event',
  reference: {
    book: 'JHN',
    chapter: 3,
    verse: 16
  }
}
```

### See All Examples

```tsx
import {
  TokenClickSignal,
  LinkClickSignal,
  VerseNavigationSignal,
  ResourceLoadRequestSignal,
  SelectionChangeSignal
} from '@bt-synergy/resource-panels/examples'
```

**Remember**: These are just examples! Define signals that match YOUR use case.

## Core Hooks

### `useSignal<T>(signalType, resourceId)`

Simplified hook for sending signals.

```tsx
const { sendSignal, sendToAll, sendToPanel, sendToResource } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId
)

// Send to all resources
sendToAll({ lifecycle: 'event', token: { ... } })

// Send to specific panel
sendToPanel('panel-2', { lifecycle: 'event', token: { ... } })

// Send to specific resource
sendToResource('en_tn', { lifecycle: 'event', token: { ... } })
```

### `useSignalHandler<T>(signalType, resourceId, handler, options?)`

Type-safe signal reception with filtering.

```tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    // Handle the signal
    console.log('Token:', signal.token.content)
  },
  {
    // Only handle signals from specific resources
    fromResources: ['en_ult', 'en_ust'],
    
    // Only handle signals targeted to this resource
    onlyTargeted: false,
    
    // Enable debug logging
    debug: true
  }
)
```

### `useMultiSignalHandler(signalTypes[], resourceId, handler, options?)`

Handle multiple signal types with one handler.

```tsx
useMultiSignalHandler(
  ['token-click', 'link-click'],
  resourceId,
  (signal) => {
    switch (signal.type) {
      case 'token-click':
        handleTokenClick(signal as TokenClickSignal)
        break
      case 'link-click':
        handleLinkClick(signal as LinkClickSignal)
        break
    }
  }
)
```

### `useResourcePanel(resourceId)`

Low-level hook with full panel API access.

```tsx
const panel = useResourcePanel(resourceId)

// Send any signal
panel.send<TokenClickSignal>({
  type: 'token-click',
  lifecycle: 'event',
  token: { ... }
})

// Access panel info
console.log(panel.panel) // Current panel
console.log(panel.resource) // Current resource

// Access low-level API
panel.api.messaging.sendToAll(...)
```

## Message Lifecycle: Persistent vs Ephemeral

Messages can be either **ephemeral** (default, cleared on navigation) or **persistent** (stay until manually cleared).

### Ephemeral Messages (Default)

Automatically cleared when the resource navigates away. Perfect for:

- User clicks (token-click, link-click)
- One-time actions
- Event triggers

```tsx
// Default behavior - ephemeral
sendToAll({
  lifecycle: 'event',
  token: { ... }
  // No persistent flag = ephemeral
})
```

### Persistent Messages

Stay in memory until explicitly cleared. Perfect for:

- Current verse/chapter context
- Active selections or filters
- Shared state across resources

```tsx
// Persistent message
sendToAll({
  lifecycle: 'event',
  persistent: true,        // Stays until cleared
  id: 'current-verse',     // Required for persistent messages
  reference: { ... }
})
```

### Managing Persistent Messages

```tsx
import { useSignalStore } from '@bt-synergy/resource-panels'

function MyViewer({ resourceId }: { resourceId: string }) {
  const {
    getLatestSignal,      // Get most recent persistent signal
    getSignalsOfType,     // Get all persistent signals of a type
    clearAllSignals,      // Clear all persistent signals
    clearSignalsOfType,   // Clear persistent signals of a type
    clearSignal,          // Clear specific signal by ID
    hasSignalsOfType,     // Check if any persistent signals exist
    getSignalCount        // Get count of persistent signals
  } = useSignalStore(resourceId)
  
  // Get current verse from persistent messages
  const currentVerse = getLatestSignal<VerseNavigationSignal>('verse-navigation')
  
  // Clear all persistent messages on unmount
  useEffect(() => {
    return () => clearAllSignals()
  }, [clearAllSignals])
}
```

### Auto-Cleanup on Navigation

```tsx
import { useSignalCleanup } from '@bt-synergy/resource-panels'

function MyResourceViewer({ resourceId }: { resourceId: string }) {
  // Automatically clears ephemeral messages when component unmounts
  useSignalCleanup(resourceId)
  
  // ... rest of component
}
```

**📖 See [Message Lifecycle Guide](./docs/MESSAGE_LIFECYCLE.md) for complete documentation and patterns.**

## Flexible Multi-Dimensional Filtering

Send signals using flexible filters - not just by resource type, but by **tags, categories, languages, and custom metadata**:

```tsx
import { useSignal, TokenClickSignal, ResourceMetadata } from '@bt-synergy/resource-panels'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  // Define rich metadata about this resource
  const metadata: ResourceMetadata = {
    type: 'scripture',
    tags: ['OT', 'Torah', 'Pentateuch'],
    language: 'en',
    testament: 'OT',
    owner: 'unfoldingWord'
  }
  
  const { sendToFiltered, sendToResourceType } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    metadata // Pass full metadata
  )
  
  const handleWordClick = (word: string, strongsId: string) => {
    // Send to English lexical resources
    sendToFiltered({
      language: 'en',
      type: ['translation-words', 'lexicon']
    }, {
      lifecycle: 'event',
      token: {
        id: `token-${Date.now()}`,
        content: word,
        semanticId: strongsId,
        verseRef: currentVerse,
        position: wordIndex
      }
    })
    
    // Or use type-only shorthand
    sendToResourceType(['translation-words'], { ... })
  }
}
```

Receiving resources automatically filter by metadata:

```tsx
import { useSignalHandler, TokenClickSignal, ResourceMetadata } from '@bt-synergy/resource-panels'

function TranslationWordsViewer({ resourceId }: { resourceId: string }) {
  const myMetadata: ResourceMetadata = {
    type: 'translation-words',
    language: 'en',
    tags: ['OT'],
    categories: ['lexical']
  }
  
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      // Only receives if metadata matches filter
      loadArticle(signal.token.semanticId)
    },
    {
      resourceMetadata: myMetadata,
      fromFilter: {
        testament: 'OT',  // Only from OT resources
        language: 'en'     // Only from English resources
      },
      debug: true
    }
  )
}
```

**Benefits:**

- ✅ **Multi-dimensional filtering** - type, tags, categories, languages, custom fields
- ✅ **Reduce noise** - resources only receive relevant signals
- ✅ **No manual filtering** - automatic metadata matching
- ✅ **Clear intent** - explicit about who should receive
- ✅ **Flexible taxonomies** - not limited to resource types

**Filter by:**

- `type` - Resource types (`'scripture'`, `'translation-words'`, etc.)
- `tags` - Custom tags (`['OT', 'NT']`, `['poetry', 'narrative']`)
- `categories` - Categories (`['study', 'reference']`)
- `language` - Language codes (`'en'`, `'es'`, `'fr'`)
- `testament` - Testament (`'OT'`, `'NT'`, `'both'`)
- `owner` - Organization (`'unfoldingWord'`, `'Door43'`)
- `custom` - Your own metadata fields

**📖 See [Flexible Filtering Guide](./docs/FLEXIBLE_FILTERING.md) for complete documentation and patterns.**

## Signal Discovery

### Finding Signals for Your Resource

```ts
import { getSignalsReceivedBy, getSignalsSentBy } from '@bt-synergy/resource-panels'

// What signals should my Scripture Viewer send?
const signalsToSend = getSignalsSentBy('Scripture')
// Returns: ['token-click', 'verse-navigation', 'selection-change']

// What signals should my Translation Words Viewer listen for?
const signalsToReceive = getSignalsReceivedBy('Translation Words')
// Returns: ['token-click', 'link-click', 'verse-navigation']
```

### Searching Signals

```ts
import { searchSignals } from '@bt-synergy/resource-panels'

// Search by keyword
const wordSignals = searchSignals('word')
// Returns all signals related to words

const navigationSignals = searchSignals('navigate')
// Returns navigation-related signals
```

### Getting Signal Metadata

```ts
import { getSignalMetadata } from '@bt-synergy/resource-panels'

const meta = getSignalMetadata('token-click')
console.log(meta.name) // "Token Click"
console.log(meta.description) // "Sent when..."
console.log(meta.useCases) // ["Show translation words...", ...]
console.log(meta.commonSenders) // ["Scripture Viewer", ...]
console.log(meta.commonReceivers) // ["Translation Words Viewer", ...]
console.log(meta.example) // Example signal payload
```

## Adding Communication to Your Resource

### Step 1: Define Your Signals

Ask: "What should this resource communicate?"

```typescript
// myapp/signals.ts
import { BaseSignal } from '@bt-synergy/resource-panels'

// Define signals for YOUR use case
export interface MyWordClickSignal extends BaseSignal {
  type: 'word-select'
  word: {
    text: string
    id: string
    // Whatever data you need
  }
}

export interface MyNavigationSignal extends BaseSignal {
  type: 'go-to'
  target: {
    // Your structure
  }
}
```

### Step 2: Define Resource Metadata

```typescript
import { ResourceMetadata } from '@bt-synergy/resource-panels'

const myResourceMetadata: ResourceMetadata = {
  type: 'lexicon',
  language: 'en',
  tags: ['dictionary', 'reference'],
  // Add whatever makes sense
}
```

### Step 3: Send Signals

```tsx
import { useSignal } from '@bt-synergy/resource-panels'
import { MyWordClickSignal } from './myapp/signals'

function MyLexicon({ resourceId }: { resourceId: string }) {
  const { sendToFiltered } = useSignal<MyWordClickSignal>(
    'word-select',
    resourceId,
    myResourceMetadata
  )
  
  const handleWordClick = (word: string, id: string) => {
    sendToFiltered(
      { language: 'en' },  // Only to English resources
      {
        lifecycle: 'event',
        word: { text: word, id: id }
      }
    )
  }
  
  return <div onClick={() => handleWordClick('λόγος', 'G3056')}>...</div>
}
```

### Step 4: Receive Signals

```tsx
import { useSignalHandler } from '@bt-synergy/resource-panels'
import { MyWordClickSignal, MyNavigationSignal } from './myapp/signals'

function MyLexicon({ resourceId }: { resourceId: string }) {
  // Handle word selections
  useSignalHandler<MyWordClickSignal>(
    'word-select',
    resourceId,
    (signal) => {
      loadDefinition(signal.word.id)
    },
    {
      resourceMetadata: myResourceMetadata,
      fromFilter: { language: 'en' }  // Only from English resources
    }
  )
  
  // Handle navigation
  useSignalHandler<MyNavigationSignal>(
    'go-to',
    resourceId,
    (signal) => {
      navigateTo(signal.target)
    },
    {
      resourceMetadata: myResourceMetadata
    }
  )
  
  return <div>...</div>
}
```

### Step 5: Test

Use `/test/panels` route to verify:

1. Your resource sends signals correctly
2. Your resource receives signals correctly  
3. Filtering works as expected
4. Signal Monitor shows correct activity

**Remember**: You define the signals, data structure, and communication patterns!

## Advanced Patterns

### Conditional Signal Handling

```tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    // Only handle if it's a Greek word
    if (signal.token.semanticId.startsWith('G')) {
      loadGreekDefinition(signal.token.semanticId)
    }
  }
)
```

### Debounced Signal Sending

```tsx
const { sendSignal } = useSignal<SelectionChangeSignal>('selection-change', resourceId)

const debouncedSend = useMemo(
  () => debounce((selection: string) => {
    sendSignal({
      lifecycle: 'event',
      selection: { text: selection }
    })
  }, 300),
  [sendSignal]
)
```

### Signal Chaining

```tsx
// Resource A sends token-click
// Resource B receives it and sends link-click
useSignalHandler<TokenClickSignal>('token-click', resourceId, (signal) => {
  const wordId = signal.token.semanticId
  const { sendSignal } = useSignal<LinkClickSignal>('link-click', resourceId)
  
  // Find related article and send link-click
  const article = findArticle(wordId)
  if (article) {
    sendSignal({
      lifecycle: 'event',
      link: {
        url: `rc://en/tw/dict/bible/kt/${wordId}`,
        text: signal.token.content,
        resourceType: 'translation-words'
      }
    })
  }
})
```

## Best Practices

1. **Always use TypeScript types** - The signal types provide safety and IntelliSense
2. **Include meaningful data** - Fill in optional fields like `transliteration` and `meaning`
3. **Test with Signal Monitor** - Use `/test/panels` to verify communication
4. **Document your signals** - Add JSDoc comments explaining what your resource sends/receives
5. **Filter signals appropriately** - Use `fromResources` or `onlyTargeted` to avoid processing irrelevant signals
6. **Handle errors gracefully** - Wrap signal handling in try-catch
7. **Use debug mode during development** - Enable `{ debug: true }` to see signal flow

## TypeScript Tips

### Get IntelliSense for Signals

```ts
import type { TokenClickSignal, LinkClickSignal } from '@bt-synergy/resource-panels'

// TypeScript will now autocomplete signal properties
const handleSignal = (signal: TokenClickSignal) => {
  signal.token. // <- IntelliSense shows: content, semanticId, verseRef, etc.
}
```

### Create Custom Signals

```ts
import type { BaseSignal } from '@bt-synergy/resource-panels'

export interface CustomSignal extends BaseSignal {
  type: 'custom-event'
  customData: {
    // Your custom fields
  }
}

// Use it like built-in signals
const { sendSignal } = useSignal<CustomSignal>('custom-event', resourceId)
```

## Migration from Direct linked-panels Usage

### Before

```tsx
import { useResourceAPI, useMessaging } from '@bt-toolkit/linked-panels'

function MyViewer({ resourceId }: { resourceId: string }) {
  const api = useResourceAPI(resourceId)
  const apiRef = useRef(api)
  apiRef.current = api
  
  useMessaging({
    resourceId,
    eventTypes: ['token-click'],
    onEvent: (message: any) => {
      // Manual filtering, type casting, error handling
      if (message.type === 'token-click' && message.token) {
        handleToken(message.token)
      }
    }
  })
  
  const sendToken = () => {
    const event = {
      type: 'token-click',
      lifecycle: 'event',
      sourceResourceId: resourceId,
      timestamp: Date.now(),
      token: { ... }
    }
    ;(apiRef.current.messaging as any).sendToAll(event)
  }
}
```

### After

```tsx
import { useSignal, useSignalHandler, TokenClickSignal } from '@bt-synergy/resource-panels'

function MyViewer({ resourceId }: { resourceId: string }) {
  const { sendSignal } = useSignal<TokenClickSignal>('token-click', resourceId)
  
  useSignalHandler<TokenClickSignal>('token-click', resourceId, (signal) => {
    handleToken(signal.token)
  })
  
  const sendToken = () => {
    sendSignal({
      lifecycle: 'event',
      token: { ... }
    })
  }
}
```

## Documentation

Comprehensive guides are available in the `docs/` directory:

### Getting Started

- **[Defining Custom Signals](./docs/DEFINING_CUSTOM_SIGNALS.md)** ⭐ Start here! Learn how to create your own signal types

### Core Features

- **[Flexible Filtering](./docs/FLEXIBLE_FILTERING.md)** - Multi-dimensional filtering by tags, categories, languages, and custom metadata
- **[Message Lifecycle](./docs/MESSAGE_LIFECYCLE.md)** - Persistent vs ephemeral messages
- **[Multi-Panel Architecture](./docs/MULTI_PANEL_ARCHITECTURE.md)** - Scale to 3, 4, 10+ panels

### Legacy/Examples

- **[Resource Type Filtering](./docs/RESOURCE_TYPE_FILTERING.md)** - Example patterns for type-based filtering (uses example signals)

## Examples

See `apps/tc-study/src/components/resources/` for real-world examples:

- `ScriptureViewer/` - Sends token-click, verse-navigation
- `TranslationWordsViewer/` - Receives token-click, link-click (if implemented)
- `TranslationNotesViewer/` - Receives verse-navigation (if implemented)

Example components:

- `apps/tc-study/src/components/examples/SimpleResourceExample.tsx` - Basic usage
- `apps/tc-study/src/components/examples/PersistentMessagesExample.tsx` - Message lifecycle
- `apps/tc-study/src/components/examples/ResourceTypeFilteringExample.tsx` - Type filtering

## Testing

Use the Panel Communication Test page at `/test/panels` to:

- Test signal sending and receiving
- View the Signal Monitor to see all messages
- Switch between mock and real resources
- Verify two-way communication

## API Summary

### Sending Signals

```tsx
const { sendToAll, sendToPanel, sendToResource, sendToFiltered, sendToResourceType } = 
  useSignal<T>(signalType, resourceId, metadata)

sendToAll(data)                              // Broadcast to everyone
sendToPanel('panel-2', data)                 // Send to specific panel
sendToResource('resource-id', data)          // Send to specific resource
sendToFiltered(filter, data)                 // Send to filtered resources
sendToResourceType(['type1', 'type2'], data) // Convenience for type filtering
```

### Receiving Signals

```tsx
useSignalHandler<T>(
  signalType,
  resourceId,
  handler,
  {
    resourceMetadata: { ... },     // Your resource's metadata
    fromFilter: { ... },            // Filter sources
    fromResources: ['id1', 'id2'],  // Filter specific resources
    onlyTargeted: boolean,          // Only if targetResourceId matches
    debug: boolean                  // Enable debug logging
  }
)
```

### Managing Persistent Messages

```tsx
const { getLatestSignal, getSignalsOfType, clearAllSignals, clearSignalsOfType, clearSignal } = 
  useSignalStore(resourceId)
```

### Filter Criteria

```tsx
interface ResourceFilter {
  type?: ResourceType | ResourceType[]         // Resource types
  tags?: string | string[]                     // Custom tags
  categories?: string | string[]               // Categories
  language?: string | string[]                 // Language codes
  testament?: 'OT' | 'NT' | 'both'            // Testament
  subject?: string | string[]                  // Subject
  scope?: string | string[]                    // Scope pattern
  owner?: string | string[]                    // Owner/organization
  custom?: Record<string, any>                 // Custom fields
}
```

## Performance Tips

1. **Use filters** - Reduce message volume with `sendToFiltered()` instead of `sendToAll()`
2. **Use ephemeral messages** - Default behavior, automatic cleanup
3. **Batch updates** - Debounce frequent signals (e.g., selection changes)
4. **Clean up persistent messages** - Use `useSignalCleanup()` or manual cleanup
5. **Use debug mode selectively** - Only in development, not production

## Common Gotchas

### ❌ Don't: Send to all when you mean specific types

```tsx
// Bad - everyone receives, most ignore
sendToAll({ token: { ... } })
```

### ✅ Do: Use filters

```tsx
// Good - only relevant resources receive
sendToFiltered({ type: ['translation-words', 'lexicon'] }, { token: { ... } })
```

### ❌ Don't: Forget to specify resource metadata

```tsx
// Bad - can't receive filtered messages
useSignalHandler('token-click', resourceId, handler)
```

### ✅ Do: Always provide metadata

```tsx
// Good - can participate in filtering
useSignalHandler('token-click', resourceId, handler, {
  resourceMetadata: { type: 'translation-words', language: 'en' }
})
```

### ❌ Don't: Use persistent messages for everything

```tsx
// Bad - memory leak
sendToAll({ persistent: true, token: { ... } })
```

### ✅ Do: Use persistent only for context

```tsx
// Good - persistent for context, ephemeral for actions
sendToAll({ persistent: true, id: 'current-verse', reference: { ... } }) // Context
sendToAll({ token: { ... } }) // Action (ephemeral by default)
```

## Troubleshooting

### Signals not being received?

1. Check `debug: true` in `useSignalHandler` to see filter logs
2. Verify `resourceMetadata` matches `targetFilter`
3. Ensure resource is listening for correct signal type
4. Check Signal Monitor at `/test/panels`

### Messages piling up?

1. Use ephemeral messages (default) for one-time actions
2. Clear persistent messages with `clearAllSignals()` or `useSignalCleanup()`
3. Check for memory leaks with persistent messages

### TypeScript errors?

1. Ensure you're importing the correct signal type
2. Use `Omit<T, ...>` if needed to exclude auto-filled fields
3. Check signal interface matches your data structure

## Contributing

### Adding a New Signal Type

1. Add the interface to `src/signals/types.ts`
2. Add metadata to `src/signals/registry.ts` with sender/receiver types
3. Export from `src/signals/index.ts`
4. Update this README with usage examples
5. Add the signal to existing resources that should send/receive it

### Improving Documentation

- All markdown files in `docs/` directory
- README updates for new features
- JSDoc comments in source code
- Example components in `apps/tc-study/src/components/examples/`

### Running Tests

```bash
# Run test page
cd apps/tc-study
bun dev
# Navigate to http://localhost:5173/test/panels
```

## License

MIT

---

**Built with ❤️ for the BT Synergy ecosystem**

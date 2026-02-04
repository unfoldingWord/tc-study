# Resource Communication Developer Guide

This guide explains how to build interactive resources that communicate with each other using the `@bt-synergy/resource-panels` library.

## Overview

Resources in TC Study can communicate through a **signal system**. When a user interacts with one resource (e.g., clicks a word in the Bible), other resources can react (e.g., show the definition in Translation Words).

The `@bt-synergy/resource-panels` library provides:
- ✅ Type-safe signal sending and receiving
- ✅ Easy-to-use React hooks
- ✅ Signal discovery (find what signals other resources send)
- ✅ IntelliSense/autocomplete support
- ✅ No boilerplate code

## Quick Example

### Sending a Signal

```tsx
import { useSignal, TokenClickSignal } from '@bt-synergy/resource-panels'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId)
  
  const handleWordClick = (word: string, strong: string) => {
    sendToAll({
      lifecycle: 'event',
      token: {
        id: `token-${Date.now()}`,
        content: word,
        semanticId: strong,
        verseRef: 'JHN 1:1',
        position: 1
      }
    })
  }
  
  return <span onClick={() => handleWordClick('λόγος', 'G3056')}>λόγος</span>
}
```

### Receiving a Signal

```tsx
import { useSignalHandler, TokenClickSignal } from '@bt-synergy/resource-panels'

function TranslationWordsViewer({ resourceId }: { resourceId: string }) {
  const [currentWord, setCurrentWord] = useState<string | null>(null)
  
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      setCurrentWord(signal.token.semanticId) // e.g., 'G3056'
      loadWordArticle(signal.token.semanticId)
    }
  )
  
  return <div>{currentWord && <WordArticle wordId={currentWord} />}</div>
}
```

## Available Signals

### 1. `token-click` - Word/Token Click

**When to send:** User clicks a word in Scripture, original language text, or any tokenized content

**Common receivers:** Translation Words, Translation Notes, Lexicons

```ts
{
  type: 'token-click',
  lifecycle: 'event',
  token: {
    content: 'λόγος',           // The word itself
    semanticId: 'G3056',        // Strong's number or semantic ID
    verseRef: 'JHN 1:1',        // Bible reference
    position: 4,                // Position in verse
    transliteration: 'logos',   // Optional
    meaning: 'word'             // Optional
  }
}
```

**Example usage:**
```tsx
const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId)

// When user clicks a word:
sendToAll({
  lifecycle: 'event',
  token: {
    id: `token-${Date.now()}`,
    content: wordData.text,
    semanticId: wordData.strong,
    verseRef: `${book} ${chapter}:${verse}`,
    position: wordData.index
  }
})
```

### 2. `link-click` - Hyperlink Click

**When to send:** User clicks a hyperlink to another resource

**Common receivers:** Any resource (depends on link type)

```ts
{
  type: 'link-click',
  lifecycle: 'event',
  link: {
    url: 'rc://en/tw/dict/bible/kt/love',
    text: 'love',
    resourceType: 'translation-words',
    resourceId: 'en_tw'
  }
}
```

**Example usage:**
```tsx
const { sendToAll } = useSignal<LinkClickSignal>('link-click', resourceId)

// When user clicks a link:
sendToAll({
  lifecycle: 'event',
  link: {
    url: linkData.href,
    text: linkData.text,
    resourceType: 'translation-words',
    resourceId: 'en_tw'
  }
})
```

### 3. `verse-navigation` - Navigate to Verse

**When to send:** User navigates to a different verse

**Common receivers:** All Scripture-related resources (Bible, Notes, Words, Questions)

```ts
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

**Example usage:**
```tsx
const { sendToAll } = useSignal<VerseNavigationSignal>('verse-navigation', resourceId)

// When verse changes:
sendToAll({
  lifecycle: 'event',
  reference: {
    book: currentRef.book,
    chapter: currentRef.chapter,
    verse: currentRef.verse
  }
})
```

### 4. `resource-load-request` - Request Resource Load

**When to send:** Need to open a specific resource in response to user action

**Common receivers:** ResourcePanelsProvider (system-level)

```ts
{
  type: 'resource-load-request',
  lifecycle: 'request',
  resourceId: 'en_tw_love',
  panelId: 'panel-2',  // Optional
  context: {
    from: 'link-click'
  }
}
```

### 5. `selection-change` - Text Selection

**When to send:** User selects text in a resource

**Common receivers:** Translation Notes, Translation Words, Context menus

```ts
{
  type: 'selection-change',
  lifecycle: 'event',
  selection: {
    text: 'For God so loved the world',
    reference: { book: 'JHN', chapter: 3, verse: 16 },
    startOffset: 0,
    endOffset: 28
  }
}
```

## Hooks API

### `useSignal<T>(signalType, resourceId)`

Hook for sending signals.

```tsx
const { 
  sendToAll,        // Send to all resources
  sendToPanel,      // Send to specific panel
  sendToResource,   // Send to specific resource
  panel             // Access to panel API
} = useSignal<TokenClickSignal>('token-click', resourceId)

// Send to all resources
sendToAll({
  lifecycle: 'event',
  token: { ... }
})

// Send to specific panel
sendToPanel('panel-2', {
  lifecycle: 'event',
  token: { ... }
})

// Send to specific resource
sendToResource('en_tn', {
  lifecycle: 'event',
  token: { ... }
})
```

### `useSignalHandler<T>(signalType, resourceId, handler, options?)`

Hook for receiving signals with optional filtering.

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
    
    // Enable debug logging (useful during development)
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
    if (signal.type === 'token-click') {
      handleTokenClick(signal as TokenClickSignal)
    } else if (signal.type === 'link-click') {
      handleLinkClick(signal as LinkClickSignal)
    }
  },
  { debug: true }
)
```

## Adding Signals to a Resource

### Step 1: Identify What to Send

Ask: "What user interactions should other resources know about?"

Examples:
- **Scripture Viewer**: Word clicks, verse navigation, text selection
- **Translation Notes**: Verse navigation when user clicks a note link
- **Translation Words**: Link clicks to related words

### Step 2: Identify What to Receive

Ask: "What events from other resources should this resource react to?"

Examples:
- **Translation Words**: Receive `token-click` → show word definition
- **Translation Notes**: Receive `verse-navigation` → show notes for that verse
- **Scripture Viewer**: Receive `verse-navigation` → navigate to verse

### Step 3: Implement

```tsx
import { 
  useSignal, 
  useSignalHandler, 
  TokenClickSignal, 
  VerseNavigationSignal 
} from '@bt-synergy/resource-panels'

function MyResourceViewer({ resourceId }: { resourceId: string }) {
  // === SENDING ===
  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>('token-click', resourceId)
  const { sendToAll: sendVerseNav } = useSignal<VerseNavigationSignal>('verse-navigation', resourceId)
  
  // === RECEIVING ===
  useSignalHandler<TokenClickSignal>('token-click', resourceId, (signal) => {
    // React to token clicks
  })
  
  useSignalHandler<VerseNavigationSignal>('verse-navigation', resourceId, (signal) => {
    // React to verse navigation
  })
  
  return <div>...</div>
}
```

## Signal Discovery

### Find what signals a resource type should send

```tsx
import { getSignalsSentBy } from '@bt-synergy/resource-panels'

const signals = getSignalsSentBy('Scripture')
// Returns: ['token-click', 'verse-navigation', 'selection-change']
```

### Find what signals a resource type should receive

```tsx
import { getSignalsReceivedBy } from '@bt-synergy/resource-panels'

const signals = getSignalsReceivedBy('Translation Words')
// Returns: ['token-click', 'link-click', 'verse-navigation']
```

### Search signals by keyword

```tsx
import { searchSignals } from '@bt-synergy/resource-panels'

const wordSignals = searchSignals('word')
// Returns all signals related to words
```

### Get signal metadata

```tsx
import { getSignalMetadata } from '@bt-synergy/resource-panels'

const meta = getSignalMetadata('token-click')
console.log(meta.name)           // "Token Click"
console.log(meta.description)    // "Sent when..."
console.log(meta.useCases)       // ["Show word definition", ...]
console.log(meta.commonSenders)  // ["Scripture Viewer", ...]
console.log(meta.commonReceivers)// ["Translation Words", ...]
console.log(meta.example)        // Example payload
```

## Testing

### Use the Panel Communication Test Page

1. Navigate to `/test/panels`
2. Load your resource in a panel
3. Test sending signals with the "Send Token" button
4. Load another resource in the second panel
5. Verify signals are received correctly
6. Check the Signal Monitor to see all messages

### Enable Debug Logging

```tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => { ... },
  { debug: true } // <-- Enable this during development
)
```

This will log:
- When the listener is registered
- When signals are received
- When signals are filtered out
- Any errors in handling

## Best Practices

1. **Always use TypeScript types** - They provide IntelliSense and catch errors
2. **Include optional fields** - Fill in `transliteration`, `meaning`, etc. when available
3. **Test with real resources** - Don't just test with mock data
4. **Filter signals appropriately** - Use `fromResources` to only handle relevant signals
5. **Handle errors gracefully** - Wrap signal handling in try-catch
6. **Enable debug mode during development** - Makes debugging much easier
7. **Document what your resource sends/receives** - Help other developers

## Common Patterns

### Conditional Signal Handling

```tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    // Only handle Greek words
    if (signal.token.semanticId.startsWith('G')) {
      loadGreekDefinition(signal.token.semanticId)
    }
  }
)
```

### Debounced Signal Sending

```tsx
const { sendToAll } = useSignal<SelectionChangeSignal>('selection-change', resourceId)

const debouncedSend = useMemo(
  () => debounce((text: string) => {
    sendToAll({
      lifecycle: 'event',
      selection: { text }
    })
  }, 300),
  [sendToAll]
)
```

### Signal Chaining

```tsx
// Receive token-click, then send link-click
useSignalHandler<TokenClickSignal>('token-click', resourceId, (signal) => {
  const { sendToAll: sendLink } = useSignal<LinkClickSignal>('link-click', resourceId)
  
  const article = findArticle(signal.token.semanticId)
  if (article) {
    sendLink({
      lifecycle: 'event',
      link: {
        url: article.url,
        text: signal.token.content,
        resourceType: 'translation-words'
      }
    })
  }
})
```

## Examples

See these files for real implementations:
- `src/components/examples/SimpleResourceExample.tsx` - Basic example
- `src/components/test/PanelSystemTest.tsx` - Test environment
- `src/components/resources/ScriptureViewer/` - Production Scripture viewer

## Troubleshooting

### Signals not being received

1. Check the Signal Monitor at `/test/panels`
2. Enable `debug: true` in `useSignalHandler`
3. Verify the signal type matches exactly (case-sensitive)
4. Check console for validation errors

### Signals sent multiple times

1. Ensure hooks are at the top level (not in callbacks)
2. Check dependencies in `useCallback` or `useMemo`
3. Verify you're not creating new signal instances on every render

### TypeScript errors

1. Ensure you're importing types from `@bt-synergy/resource-panels`
2. Check that signal data matches the interface exactly
3. Use `as const` for literal types if needed

## Further Reading

- [Resource-Panels Package README](../../packages/resource-panels/README.md)
- [Linked Panels Documentation](https://github.com/yourusername/linked-panels)
- [Signal Registry Source Code](../../packages/resource-panels/src/signals/registry.ts)


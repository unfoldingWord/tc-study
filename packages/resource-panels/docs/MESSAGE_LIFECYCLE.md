# Message Lifecycle and Persistence

This guide explains how to use persistent and ephemeral messages in the resource-panels system.

## Message Types

### Ephemeral Messages (Default)

**Characteristics:**
- Cleared automatically when resource navigates away
- One-time delivery
- Used for actions and events

**When to use:**
- User clicks (token-click, link-click)
- One-time notifications
- Action triggers that don't need to persist

**Example:**
```tsx
// Send ephemeral token-click (persistent is undefined/false by default)
sendToAll({
  lifecycle: 'event',
  token: {
    id: 'token-123',
    content: 'λόγος',
    semanticId: 'G3056',
    verseRef: 'JHN 1:1',
    position: 1
  }
  // persistent: false is default
})
```

### Persistent Messages

**Characteristics:**
- Stay in memory until explicitly cleared
- Survive resource navigation
- Can be queried anytime
- Must include an `id` for tracking

**When to use:**
- Current verse/chapter context
- Active selections or filters
- Shared state across resources
- Navigation context that should persist

**Example:**
```tsx
// Send persistent verse-navigation
sendToAll({
  lifecycle: 'event',
  persistent: true,
  id: 'current-verse', // Required for persistent messages
  reference: {
    book: 'JHN',
    chapter: 3,
    verse: 16
  }
})
```

## Sending Messages

### Ephemeral Message (Auto-cleared on Navigation)

```tsx
import { useSignal, TokenClickSignal } from '@bt-synergy/resource-panels'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId)
  
  const handleWordClick = (word: string) => {
    // This message will be automatically cleared when user navigates away
    sendToAll({
      lifecycle: 'event',
      // persistent: false (default)
      token: {
        id: `token-${Date.now()}`,
        content: word,
        semanticId: 'G3056',
        verseRef: 'JHN 1:1',
        position: 1
      }
    })
  }
}
```

### Persistent Message (Stays Until Cleared)

```tsx
import { useSignal, VerseNavigationSignal } from '@bt-synergy/resource-panels'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<VerseNavigationSignal>('verse-navigation', resourceId)
  
  const handleVerseChange = (book: string, chapter: number, verse: number) => {
    // This message persists across resource navigation
    sendToAll({
      lifecycle: 'event',
      persistent: true,
      id: 'current-verse', // Use consistent ID to replace previous verse
      reference: { book, chapter, verse }
    })
  }
}
```

## Receiving and Managing Messages

### Basic Handler (Works with Both Types)

```tsx
import { useSignalHandler, TokenClickSignal } from '@bt-synergy/resource-panels'

function TranslationWordsViewer({ resourceId }: { resourceId: string }) {
  // Handle both ephemeral and persistent token-click messages
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      // This runs for every message received
      console.log('Token clicked:', signal.token.content)
      
      // Persistent messages are automatically stored
      // Ephemeral messages are not stored
      loadWordArticle(signal.token.semanticId)
    }
  )
}
```

### Accessing Persistent Messages

```tsx
import { 
  useSignalHandler, 
  useSignalStore,
  VerseNavigationSignal 
} from '@bt-synergy/resource-panels'

function TranslationNotesViewer({ resourceId }: { resourceId: string }) {
  const {
    getLatestSignal,     // Get most recent persistent signal
    getSignalsOfType,    // Get all persistent signals of a type
    clearAllSignals,     // Clear all persistent signals
    clearSignalsOfType,  // Clear persistent signals of a type
    clearSignal,         // Clear specific signal by ID
    hasSignalsOfType,    // Check if any persistent signals exist
    getSignalCount       // Get count of persistent signals
  } = useSignalStore(resourceId)
  
  // Handle new verse navigation (ephemeral or persistent)
  useSignalHandler<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    (signal) => {
      navigateToVerse(signal.reference)
    }
  )
  
  // Get the current verse from persistent messages
  useEffect(() => {
    const currentVerse = getLatestSignal<VerseNavigationSignal>('verse-navigation')
    if (currentVerse) {
      console.log('Current verse:', currentVerse.reference)
      loadNotesForVerse(currentVerse.reference)
    }
  }, [])
  
  // Clear all persistent messages when component unmounts
  useEffect(() => {
    return () => clearAllSignals()
  }, [clearAllSignals])
}
```

## Auto-Cleanup on Navigation

Use `useSignalCleanup` to automatically clear ephemeral messages when navigating:

```tsx
import { useSignalCleanup } from '@bt-synergy/resource-panels'

function MyResourceViewer({ resourceId }: { resourceId: string }) {
  // Automatically clears all non-persistent signals when this component unmounts
  useSignalCleanup(resourceId)
  
  // ... rest of component
}
```

## Common Patterns

### Pattern 1: Current Context (Persistent)

Use persistent messages to maintain context across resource changes:

```tsx
// Scripture viewer sends current verse
function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<VerseNavigationSignal>('verse-navigation', resourceId)
  
  const handleVerseChange = (ref: Reference) => {
    sendToAll({
      lifecycle: 'event',
      persistent: true,
      id: 'current-verse',
      reference: ref
    })
  }
}

// Other resources can always query the current verse
function TranslationWordsViewer({ resourceId }: { resourceId: string }) {
  const { getLatestSignal } = useSignalStore(resourceId)
  
  useEffect(() => {
    // Get current verse even after navigation
    const verse = getLatestSignal<VerseNavigationSignal>('verse-navigation')
    if (verse) {
      loadWordsForVerse(verse.reference)
    }
  }, [])
}
```

### Pattern 2: One-Time Actions (Ephemeral)

Use ephemeral messages for actions that don't need persistence:

```tsx
function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId)
  
  const handleWordClick = (word: string) => {
    // Ephemeral - just triggers an action, doesn't persist
    sendToAll({
      lifecycle: 'event',
      // persistent: false (default)
      token: { ... }
    })
  }
}
```

### Pattern 3: Replacing Previous State

Use consistent IDs to replace previous persistent messages:

```tsx
const { sendToAll } = useSignal<SelectionChangeSignal>('selection-change', resourceId)

const handleSelectionChange = (text: string) => {
  sendToAll({
    lifecycle: 'event',
    persistent: true,
    id: 'current-selection', // Same ID replaces previous selection
    selection: { text }
  })
}

// Later, clear when selection is removed
const { clearSignal } = useSignalStore(resourceId)
clearSignal('selection-change', 'current-selection')
```

### Pattern 4: Clearing on Specific Events

```tsx
function MyResourceViewer({ resourceId }: { resourceId: string }) {
  const { clearSignalsOfType, clearAllSignals } = useSignalStore(resourceId)
  
  const handleReset = () => {
    // Clear only verse navigation signals
    clearSignalsOfType('verse-navigation')
  }
  
  const handleClearAll = () => {
    // Clear all persistent signals
    clearAllSignals()
  }
}
```

### Pattern 5: Conditional Persistence

```tsx
function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<VerseNavigationSignal>('verse-navigation', resourceId)
  const [keepContext, setKeepContext] = useState(true)
  
  const handleVerseChange = (ref: Reference) => {
    sendToAll({
      lifecycle: 'event',
      persistent: keepContext, // Conditionally persistent
      id: keepContext ? 'current-verse' : undefined,
      reference: ref
    })
  }
}
```

## Querying Persistent Messages

### Get All Signals of a Type

```tsx
const { getSignalsOfType } = useSignalStore(resourceId)

// Get all persistent verse navigations
const verseHistory = getSignalsOfType<VerseNavigationSignal>('verse-navigation')

console.log(`Visited ${verseHistory.length} verses`)
verseHistory.forEach(signal => {
  console.log(signal.reference)
})
```

### Get Latest Signal

```tsx
const { getLatestSignal } = useSignalStore(resourceId)

// Get most recent verse navigation
const currentVerse = getLatestSignal<VerseNavigationSignal>('verse-navigation')

if (currentVerse) {
  console.log('Current verse:', currentVerse.reference)
}
```

### Check for Signals

```tsx
const { hasSignalsOfType, getSignalCount } = useSignalStore(resourceId)

if (hasSignalsOfType('verse-navigation')) {
  const count = getSignalCount('verse-navigation')
  console.log(`${count} verse navigation(s) in history`)
}
```

## Clearing Messages

### Clear All Persistent Signals

```tsx
const { clearAllSignals } = useSignalStore(resourceId)

// Clear everything (useful on reset or unmount)
clearAllSignals()
```

### Clear Signals of a Type

```tsx
const { clearSignalsOfType } = useSignalStore(resourceId)

// Clear only verse navigation signals
clearSignalsOfType('verse-navigation')
```

### Clear Specific Signal

```tsx
const { clearSignal } = useSignalStore(resourceId)

// Clear the "current-verse" signal
clearSignal('verse-navigation', 'current-verse')
```

## Best Practices

1. **Use Ephemeral by Default**
   - Only make messages persistent when you need them to survive navigation
   - Ephemeral messages are automatically cleaned up

2. **Always Use IDs for Persistent Messages**
   - Required for clearing specific messages
   - Use consistent IDs to replace previous state (e.g., 'current-verse')

3. **Clean Up on Unmount**
   - Use `useSignalCleanup(resourceId)` or manually clear persistent messages
   - Prevents memory leaks

4. **Document Message Persistence**
   - Clearly indicate in JSDoc which messages should be persistent
   - Update signal registry with persistence recommendations

5. **Test Both Scenarios**
   - Test that ephemeral messages don't persist across navigation
   - Test that persistent messages survive navigation

## Examples

See:
- `apps/tc-study/src/components/examples/PersistentMessagesExample.tsx` - Complete example
- `apps/tc-study/src/components/resources/ScriptureViewer/` - Production usage
- `/test/panels` - Test page for verification

## Migration

Existing code continues to work - all messages are ephemeral by default (same behavior as before).

To make a message persistent, simply add:
```ts
{
  ...messageData,
  persistent: true,
  id: 'unique-id' // Required
}
```


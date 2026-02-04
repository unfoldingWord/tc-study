# Resource Type Filtering and Grouping

This guide explains how to use resource types to control which resources receive and handle signals.

## Overview

Every signal can include:
- `sourceResourceType`: The type of resource that sent the signal
- `targetResourceTypes`: Array of resource types that should receive the signal

This enables:
- **Targeted communication**: Send signals only to specific resource types
- **Smart filtering**: Resources automatically ignore irrelevant signals
- **Type-based grouping**: Group resources by type (scripture, lexicons, notes, etc.)

## Resource Types

Predefined types in `ResourceType`:

```typescript
type ResourceType =
  | 'scripture'              // Bible, Aligned Bible
  | 'translation-words'      // Translation Words articles
  | 'translation-words-links'// Translation Words Links (TSV)
  | 'translation-notes'      // Translation Notes
  | 'translation-questions'  // Translation Questions
  | 'translation-academy'    // Translation Academy articles
  | 'lexicon'                // Lexicons/Dictionaries
  | 'original-language'      // Greek NT, Hebrew OT
  | 'commentary'             // Commentaries
  | 'study-notes'            // Study notes/annotations
  | 'cross-references'       // Cross-reference resources
  | 'concordance'            // Concordances
  | 'atlas'                  // Maps/Atlas resources
  | 'media'                  // Audio/Video resources
  | 'custom'                 // Custom resource types
  | string                   // Allow any string
```

## Sending Signals with Resource Types

### 1. Specify Your Resource Type

When using hooks, pass your resource type:

```tsx
import { useSignal, TokenClickSignal } from '@bt-synergy/resource-panels'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const { sendToAll, sendToResourceType } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    'scripture' // <-- Your resource type
  )
  
  // All signals sent will automatically include sourceResourceType: 'scripture'
}
```

### 2. Broadcast to All Resources

```tsx
// Send to all resources (anyone can handle)
sendToAll({
  lifecycle: 'event',
  token: {
    id: 'token-123',
    content: 'λόγος',
    semanticId: 'G3056',
    verseRef: 'JHN 1:1',
    position: 1
  }
})
```

### 3. Send to Specific Resource Types

```tsx
// Only Translation Words and Lexicons should handle this
sendToResourceType(['translation-words', 'lexicon'], {
  lifecycle: 'event',
  token: {
    id: 'token-123',
    content: 'λόγος',
    semanticId: 'G3056',
    verseRef: 'JHN 1:1',
    position: 1
  }
})
```

## Receiving and Filtering Signals

### 1. Specify Your Resource Type

```tsx
import { useSignalHandler, TokenClickSignal } from '@bt-synergy/resource-panels'

function TranslationWordsViewer({ resourceId }: { resourceId: string }) {
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      // Handle the token click
      loadWordArticle(signal.token.semanticId)
    },
    {
      resourceType: 'translation-words', // <-- Your resource type
      debug: true
    }
  )
}
```

**What happens:**
- If a signal has `targetResourceTypes`, it's only handled if `'translation-words'` is in that array
- If a signal has no `targetResourceTypes`, it's handled (broadcast to all)

### 2. Filter by Sender Type

Only handle signals from specific resource types:

```tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    loadWordArticle(signal.token.semanticId)
  },
  {
    resourceType: 'translation-words',
    fromResourceTypes: ['scripture', 'original-language'], // Only from these types
    debug: true
  }
)
```

**Result:** Only handles token clicks from Scripture or Original Language resources.

## Common Patterns

### Pattern 1: Word Click from Scripture to Lexical Resources

**Scripture sends:**
```tsx
// ScriptureViewer.tsx
const { sendToResourceType } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  'scripture'
)

const handleWordClick = (word: string, strongsId: string) => {
  // Only send to lexical resources
  sendToResourceType(['translation-words', 'lexicon', 'original-language'], {
    lifecycle: 'event',
    token: {
      id: `token-${Date.now()}`,
      content: word,
      semanticId: strongsId,
      verseRef: currentVerse,
      position: wordIndex
    }
  })
}
```

**Translation Words receives:**
```tsx
// TranslationWordsViewer.tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    loadArticleForStrongs(signal.token.semanticId)
  },
  {
    resourceType: 'translation-words', // Will receive because it's in targetResourceTypes
    debug: true
  }
)
```

**Commentaries ignore it:**
```tsx
// CommentaryViewer.tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    // This never fires because 'commentary' is not in targetResourceTypes
  },
  {
    resourceType: 'commentary', // Not in ['translation-words', 'lexicon', 'original-language']
    debug: true
  }
)
```

### Pattern 2: Verse Navigation to Bible-Related Resources

```tsx
// ScriptureViewer.tsx - Send only to resources that care about verses
const { sendToResourceType } = useSignal<VerseNavigationSignal>(
  'verse-navigation',
  resourceId,
  'scripture'
)

const handleVerseChange = (ref: Reference) => {
  sendToResourceType(
    ['scripture', 'translation-notes', 'translation-questions', 'commentary'],
    {
      lifecycle: 'event',
      persistent: true,
      id: 'current-verse',
      reference: ref
    }
  )
}
```

### Pattern 3: Link Clicks to Article Resources

```tsx
// Any resource with links - Send only to resources that can open articles
const { sendToResourceType } = useSignal<LinkClickSignal>(
  'link-click',
  resourceId,
  myResourceType
)

const handleLinkClick = (url: string, text: string) => {
  sendToResourceType(
    ['translation-academy', 'translation-words', 'translation-notes'],
    {
      lifecycle: 'event',
      link: {
        url,
        text,
        type: 'article'
      }
    }
  )
}
```

### Pattern 4: Accept from Any, Send to Specific

```tsx
// Lexicon receives from any scripture-type resource
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    lookupWord(signal.token.semanticId)
  },
  {
    resourceType: 'lexicon',
    fromResourceTypes: ['scripture', 'original-language', 'aligned-bible'], // From any of these
    debug: true
  }
)

// But when lexicon wants to navigate scripture, target only scripture
const { sendToResourceType } = useSignal<VerseNavigationSignal>(
  'verse-navigation',
  resourceId,
  'lexicon'
)

sendToResourceType(['scripture'], {
  lifecycle: 'event',
  reference: { book: 'JHN', chapter: 1, verse: 1 }
})
```

## Signal Flow Example

```
┌─────────────┐
│  Scripture  │ sourceResourceType: 'scripture'
│   Viewer    │
└──────┬──────┘
       │ Token Click Signal
       │ targetResourceTypes: ['translation-words', 'lexicon']
       │
       ├────────────────────────────────────┐
       │                                    │
       ▼                                    ▼
┌──────────────┐                    ┌──────────────┐
│ Translation  │ ✅ Receives        │   Lexicon    │ ✅ Receives
│    Words     │ resourceType:      │              │ resourceType:
│              │ 'translation-words'│              │ 'lexicon'
└──────────────┘ (matches)          └──────────────┘ (matches)

       ┌──────────────┐
       │  Commentary  │ ❌ Ignores
       │              │ resourceType: 'commentary'
       └──────────────┘ (not in targetResourceTypes)
```

## Debugging

Enable debug mode to see filtering in action:

```tsx
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    console.log('Handling token click:', signal)
  },
  {
    resourceType: 'translation-words',
    fromResourceTypes: ['scripture'],
    debug: true // <-- Shows all received signals and why they're filtered
  }
)
```

**Console output:**
```
📨 [tw-en-1] Received token-click: { ... }
🚫 [tw-en-1] Ignoring token-click from type commentary (not in fromResourceTypes filter)

📨 [tw-en-1] Received token-click: { ... }
✅ [tw-en-1] Handling token-click from scripture
```

## Best Practices

### 1. Always Specify Resource Type

Every resource should declare its type:

```tsx
const { sendSignal } = useSignal<MySignal>(
  'my-signal',
  resourceId,
  'scripture' // <-- Always specify
)

useSignalHandler<MySignal>(
  'my-signal',
  resourceId,
  handleSignal,
  {
    resourceType: 'scripture' // <-- Always specify
  }
)
```

### 2. Use Specific Types Over Broadcast

**❌ BAD - Broadcasts noise to everyone:**
```tsx
// Every resource receives this, even if they don't care
sendToAll({
  lifecycle: 'event',
  token: { ... }
})
```

**✅ GOOD - Only relevant resources receive:**
```tsx
// Only lexical resources handle this
sendToResourceType(['translation-words', 'lexicon'], {
  lifecycle: 'event',
  token: { ... }
})
```

### 3. Document Expected Senders/Receivers

In signal registry metadata:

```typescript
registerSignal({
  type: 'token-click',
  lifecycle: 'event',
  description: 'User clicked on a word token',
  commonSenders: ['scripture', 'original-language'],
  commonReceivers: ['translation-words', 'lexicon', 'concordance'],
  // ...
})
```

### 4. Group Related Resources

Create arrays for common groups:

```tsx
// groups.ts
export const LEXICAL_RESOURCES: ResourceType[] = [
  'translation-words',
  'lexicon',
  'concordance',
  'original-language'
]

export const BIBLE_RESOURCES: ResourceType[] = [
  'scripture',
  'aligned-bible'
]

export const STUDY_RESOURCES: ResourceType[] = [
  'translation-notes',
  'translation-questions',
  'translation-academy',
  'commentary'
]

// Usage:
sendToResourceType(LEXICAL_RESOURCES, { ... })
```

### 5. Test with Multiple Resource Types

```tsx
// PanelSystemTest.tsx - Test different resource types together
const testResources = [
  { id: 'scripture-1', type: 'scripture' },
  { id: 'tw-1', type: 'translation-words' },
  { id: 'commentary-1', type: 'commentary' }
]

// Verify:
// - Scripture sends to TW, TW receives ✅
// - Scripture doesn't spam commentary ✅
// - TW can send verse nav to scripture ✅
```

## Migration Guide

### Before (No Type Filtering)

```tsx
// Everyone receives everything
const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId)

sendToAll({ token: { ... } })

// Resource has to manually filter
useSignalHandler<TokenClickSignal>('token-click', resourceId, (signal) => {
  // Is this relevant to me? 🤔
  if (signal.token.semanticId.startsWith('G')) {
    // Handle it
  }
})
```

### After (With Type Filtering)

```tsx
// Only send to relevant resources
const { sendToResourceType } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  'scripture'
)

sendToResourceType(['translation-words', 'lexicon'], { token: { ... } })

// Resource automatically filtered
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  (signal) => {
    // This only fires if we're a target type - no manual checks needed!
    loadArticle(signal.token.semanticId)
  },
  {
    resourceType: 'translation-words'
  }
)
```

## Examples

See:
- `apps/tc-study/src/components/examples/ResourceTypeFilteringExample.tsx` - Working demo
- `apps/tc-study/src/components/resources/ScriptureViewer/` - Production usage
- `/test/panels` - Test page

## API Reference

### `sendToResourceType(types, signalData)`

```typescript
sendToResourceType(
  targetTypes: ResourceType[],  // Resource types that should receive
  signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp' | 'targetResourceTypes'>
): void
```

### `useSignalHandler` Options

```typescript
{
  resourceType?: ResourceType        // This resource's type (for targetResourceTypes filtering)
  fromResourceTypes?: ResourceType[] // Only handle signals from these types
  fromResources?: string[]           // Only handle signals from these specific resources
  onlyTargeted?: boolean             // Only handle if targetResourceId matches
  debug?: boolean                    // Log all received signals
}
```

### Signal Fields

```typescript
interface BaseSignal {
  sourceResourceType?: ResourceType    // Type of resource that sent this
  targetResourceTypes?: ResourceType[] // Types that should receive this
  // ... other fields
}
```


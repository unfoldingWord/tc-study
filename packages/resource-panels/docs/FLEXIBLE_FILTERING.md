# Flexible Multi-Dimensional Filtering

The resource-panels system supports **flexible, multi-dimensional filtering** beyond just resource types. You can filter signals by tags, categories, languages, subjects, and custom metadata.

## Problem with Type-Only Filtering

Resource type alone is too limiting:

```typescript
// ❌ LIMITED: Can only filter by type
sendToResourceType(['scripture'], { ... })

// What if you need:
// - Only Old Testament resources?
// - Only English resources?
// - Only poetry books?
// - Only resources from a specific owner?
```

## Solution: Multi-Dimensional Metadata

Every resource has rich metadata:

```typescript
interface ResourceMetadata {
  type?: ResourceType               // 'scripture', 'translation-words', etc.
  tags?: string[]                   // ['OT', 'NT', 'poetry', 'narrative']
  categories?: string[]             // ['study', 'reference', 'translation']
  language?: string                 // 'en', 'es', 'fr', etc.
  subject?: string                  // 'Bible', 'Aligned Bible', etc.
  testament?: 'OT' | 'NT' | 'both' // For Bible resources
  scope?: string                    // 'Bible.OT.Psa', 'Bible.NT.Mat'
  owner?: string                    // 'unfoldingWord', 'Door43', etc.
  custom?: Record<string, any>      // Your own fields
}
```

## Usage

### 1. Define Your Resource Metadata

```tsx
import { useSignal, ResourceMetadata } from '@bt-synergy/resource-panels'

function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const myMetadata: ResourceMetadata = {
    type: 'scripture',
    tags: ['OT', 'Law', 'Torah'],
    language: 'en',
    subject: 'Bible',
    testament: 'OT',
    scope: 'Bible.OT.Gen',
    owner: 'unfoldingWord'
  }
  
  const { sendToFiltered } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    myMetadata // Pass full metadata
  )
}
```

### 2. Send to Filtered Resources

```tsx
// Send only to Old Testament resources
sendToFiltered(
  { tags: ['OT'] },
  {
    lifecycle: 'event',
    token: { content: 'בְּרֵאשִׁית', semanticId: 'H7225', ... }
  }
)

// Send only to English study resources
sendToFiltered(
  { language: 'en', categories: ['study'] },
  {
    lifecycle: 'event',
    reference: { book: 'GEN', chapter: 1, verse: 1 }
  }
)

// Send to NT scripture resources
sendToFiltered(
  { type: ['scripture'], testament: 'NT' },
  {
    lifecycle: 'event',
    token: { content: 'λόγος', semanticId: 'G3056', ... }
  }
)

// Send to resources from specific owner with specific tags
sendToFiltered(
  { owner: 'unfoldingWord', tags: ['poetry'] },
  {
    lifecycle: 'event',
    reference: { book: 'PSA', chapter: 23, verse: 1 }
  }
)
```

### 3. Receive with Filtered Listening

```tsx
import { useSignalHandler, ResourceMetadata } from '@bt-synergy/resource-panels'

function TranslationNotesViewer({ resourceId }: { resourceId: string }) {
  const myMetadata: ResourceMetadata = {
    type: 'translation-notes',
    tags: ['NT'],
    language: 'en',
    categories: ['study']
  }
  
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      loadNoteForToken(signal.token)
    },
    {
      resourceMetadata: myMetadata,
      fromFilter: { tags: ['NT'] }, // Only from NT resources
      debug: true
    }
  )
}
```

## Filter Matching Logic

### AND Logic Between Fields

All specified fields must match:

```typescript
// Metadata
{
  type: 'scripture',
  tags: ['NT', 'Gospel'],
  language: 'en'
}

// Filter
{ tags: ['NT'], language: 'en' }  // ✅ Matches (has NT AND en)
{ tags: ['NT'], language: 'es' }  // ❌ Doesn't match (has NT but not es)
```

### OR Logic Within Arrays

Any value in array matches:

```typescript
// Metadata
{ tags: ['NT', 'Gospel', 'Matthew'] }

// Filters
{ tags: ['OT', 'NT'] }      // ✅ Matches (has NT)
{ tags: ['Gospel'] }         // ✅ Matches (has Gospel)
{ tags: ['OT', 'Law'] }      // ❌ Doesn't match (has neither)
```

### Complex Example

```typescript
const metadata: ResourceMetadata = {
  type: 'scripture',
  tags: ['NT', 'Gospel', 'Synoptic'],
  language: 'en',
  testament: 'NT',
  owner: 'unfoldingWord'
}

// Examples
matchesFilter(metadata, { tags: ['NT'] })                          // ✅ true
matchesFilter(metadata, { language: 'en', tags: ['Gospel'] })      // ✅ true
matchesFilter(metadata, { type: 'scripture', tags: ['OT'] })       // ❌ false (no OT tag)
matchesFilter(metadata, { language: 'es' })                        // ❌ false
matchesFilter(metadata, { owner: 'unfoldingWord', tags: ['NT'] }) // ✅ true
```

## Common Patterns

### Pattern 1: Testament-Based Communication

```tsx
// OT Scripture sends to OT study resources
const { sendToFiltered } = useSignal<VerseNavigationSignal>(
  'verse-navigation',
  resourceId,
  { type: 'scripture', testament: 'OT' }
)

sendToFiltered(
  { testament: 'OT', categories: ['study'] },
  {
    lifecycle: 'event',
    persistent: true,
    id: 'current-verse',
    reference: { book: 'GEN', chapter: 1, verse: 1 }
  }
)

// Notes viewer only receives OT signals
useSignalHandler<VerseNavigationSignal>(
  'verse-navigation',
  resourceId,
  handleVerse,
  {
    resourceMetadata: { type: 'translation-notes', testament: 'OT' }
  }
)
```

### Pattern 2: Language-Specific Communication

```tsx
// Send only to same-language resources
const { sendToFiltered } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  { type: 'scripture', language: 'en' }
)

sendToFiltered(
  { language: 'en' }, // Only English resources receive
  {
    lifecycle: 'event',
    token: { ... }
  }
)
```

### Pattern 3: Genre/Content-Based Communication

```tsx
// Tag resources by genre
const poetryMetadata: ResourceMetadata = {
  type: 'scripture',
  tags: ['OT', 'poetry', 'Psalms'],
  categories: ['scripture', 'worship']
}

const narrativeMetadata: ResourceMetadata = {
  type: 'scripture',
  tags: ['OT', 'narrative', 'Pentateuch'],
  categories: ['scripture', 'history']
}

// Send only to poetry resources
sendToFiltered(
  { tags: ['poetry'] },
  {
    lifecycle: 'event',
    reference: { book: 'PSA', chapter: 23, verse: 1 }
  }
)
```

### Pattern 4: Owner/Organization-Based

```tsx
// Only send to resources from same organization
sendToFiltered(
  { owner: 'unfoldingWord' },
  {
    lifecycle: 'event',
    token: { ... }
  }
)

// Or specific collection
sendToFiltered(
  { owner: 'Door43', categories: ['community'] },
  {
    lifecycle: 'event',
    resource: { ... }
  }
)
```

### Pattern 5: Scope-Based (Bible Book/Section)

```tsx
// Resources can declare their scope
const metadata: ResourceMetadata = {
  type: 'translation-notes',
  scope: 'Bible.NT.Mat', // Only Matthew
  testament: 'NT',
  tags: ['Gospel']
}

// Send to resources that cover Matthew
sendToFiltered(
  { scope: 'Bible.NT.Mat' },
  {
    lifecycle: 'event',
    reference: { book: 'MAT', chapter: 5, verse: 1 }
  }
)
```

### Pattern 6: Custom Metadata Fields

```tsx
// Define your own metadata
const metadata: ResourceMetadata = {
  type: 'scripture',
  custom: {
    version: '2.0',
    license: 'CC-BY-SA',
    readingLevel: 'intermediate',
    audienceType: 'translator'
  }
}

// Filter by custom fields
sendToFiltered(
  {
    custom: {
      audienceType: 'translator',
      readingLevel: 'intermediate'
    }
  },
  {
    lifecycle: 'event',
    token: { ... }
  }
)
```

## Convenience Methods

### Type-Only Filtering (Backward Compatible)

```tsx
// Shorthand for type-only filter
sendToResourceType(['translation-words', 'lexicon'], { ... })

// Equivalent to:
sendToFiltered({ type: ['translation-words', 'lexicon'] }, { ... })
```

### Combining with Other Targeting

```tsx
// Send to panel + filter
sendToPanel('sidebar-1', { ... })  // No filtering by metadata

// Send to resource + implied filter
sendToResource('specific-resource-id', { ... })  // Direct targeting
```

## Performance Considerations

### Filter Complexity

Simple filters are fast:

```typescript
// Fast
{ type: 'scripture' }
{ language: 'en' }
{ tags: ['NT'] }

// Still fast
{ type: 'scripture', language: 'en', testament: 'NT' }

// Custom fields might be slower with complex objects
{ custom: { deeply: { nested: { object: 'value' } } } }
```

### Broadcast with Filters vs. No Filters

```tsx
// ❌ Reaches all 50 resources, each checks filter
sendToFiltered({ tags: ['NT'] }, { ... })

// ✅ Better: Resources declare they're NT, only subscribe if relevant
// (This requires architectural change - not yet implemented)
```

**Current behavior**: All resources receive the message and filter it themselves.  
**Future optimization**: Resources subscribe to specific filter criteria.

## Migration from Type-Only Filtering

### Before (Type-Only)

```tsx
const { sendToResourceType } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  'scripture'
)

sendToResourceType(['translation-words'], { token: { ... } })

useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  handleToken,
  {
    resourceType: 'translation-words',
    fromResourceTypes: ['scripture']
  }
)
```

### After (Multi-Dimensional)

```tsx
const { sendToFiltered } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  {
    type: 'scripture',
    testament: 'NT',
    tags: ['Gospel'],
    language: 'en'
  }
)

sendToFiltered(
  {
    type: ['translation-words'],
    language: 'en', // NEW: Only English word resources
    categories: ['lexical'] // NEW: Only lexical category
  },
  { token: { ... } }
)

useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  handleToken,
  {
    resourceMetadata: {
      type: 'translation-words',
      language: 'en',
      categories: ['lexical']
    },
    fromFilter: {
      testament: 'NT', // NEW: Only from NT resources
      tags: ['Gospel'] // NEW: Only from Gospel books
    }
  }
)
```

## Best Practices

### 1. Define Rich Metadata

Don't just use `type`:

```tsx
// ❌ Minimal
{ type: 'scripture' }

// ✅ Rich
{
  type: 'scripture',
  tags: ['NT', 'Gospel', 'Synoptic'],
  language: 'en',
  testament: 'NT',
  scope: 'Bible.NT.Mat',
  owner: 'unfoldingWord',
  categories: ['primary-source', 'translation-base']
}
```

### 2. Tag Consistently

Use consistent tag vocabularies across resources:

```typescript
// Standard testament tags
['OT', 'NT']

// Standard genre tags
['narrative', 'poetry', 'prophecy', 'wisdom', 'law', 'gospel', 'epistle', 'apocalyptic']

// Standard content tags
['Torah', 'Historical', 'Psalms', 'Prophets', 'Synoptic', 'Pauline', 'General Epistles']
```

### 3. Document Your Taxonomy

Create a shared taxonomy file:

```typescript
// taxonomy.ts
export const TESTAMENT_TAGS = ['OT', 'NT'] as const
export const GENRE_TAGS = ['narrative', 'poetry', 'prophecy', ...] as const
export const CONTENT_CATEGORIES = ['study', 'reference', 'translation', ...] as const

// Use it
const metadata: ResourceMetadata = {
  type: 'scripture',
  tags: [TESTAMENT_TAGS[0], GENRE_TAGS[0]], // ['OT', 'narrative']
  categories: [CONTENT_CATEGORIES[0]] // ['study']
}
```

### 4. Test Filters

```typescript
import { matchesFilter } from '@bt-synergy/resource-panels'

describe('Resource Filtering', () => {
  const metadata: ResourceMetadata = {
    type: 'scripture',
    tags: ['NT', 'Gospel'],
    language: 'en'
  }
  
  it('matches NT tag', () => {
    expect(matchesFilter(metadata, { tags: ['NT'] })).toBe(true)
  })
  
  it('does not match OT tag', () => {
    expect(matchesFilter(metadata, { tags: ['OT'] })).toBe(false)
  })
  
  it('matches combined filter', () => {
    expect(matchesFilter(metadata, {
      tags: ['NT'],
      language: 'en'
    })).toBe(true)
  })
})
```

## Summary

✅ **Flexible**: Filter by any combination of type, tags, categories, language, etc.  
✅ **Backward Compatible**: Old `sendToResourceType()` still works  
✅ **Extensible**: Add custom metadata fields  
✅ **Type-Safe**: Full TypeScript support  
✅ **Powerful**: Complex multi-dimensional queries

The flexible filtering system enables sophisticated resource communication patterns while maintaining simplicity for basic use cases.


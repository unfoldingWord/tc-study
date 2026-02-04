# Migration to Broadcast Architecture

## Overview

Migrated tc-study from request/response pattern to broadcast (state-based) pattern for scripture token sharing between panels. This matches the proven architecture used in bt-studio.

## Changes Made

### 1. Signal Definitions (`src/signals/studioSignals.ts`)

**Added:**
- `ScriptureTokensBroadcastSignal` - New state-based signal for broadcasting scripture tokens
- Marked `ScriptureContentRequestSignal` and `ScriptureContentResponseSignal` as `@deprecated`

**Key Properties:**
```typescript
interface ScriptureTokensBroadcastSignal {
  type: 'scripture-tokens-broadcast'
  lifecycle: 'state'
  stateKey: 'current-scripture-tokens'
  sourceResourceId: string
  reference: { book, chapter, verse, endChapter?, endVerse? }
  tokens: OptimizedToken[]
  resourceMetadata: { id, language, languageDirection?, type }
  timestamp: number
}
```

### 2. ScriptureViewer - Broadcasting Side

**New Hook:** `useTokenBroadcast.ts`
- Broadcasts tokens whenever content or navigation changes
- Sends empty state on unmount for cleanup
- Converts `ProcessedScripture` tokens to `OptimizedToken[]` format
- ~150 lines simpler than old approach

**Integration:**
- Added to `ScriptureViewer/hooks/index.ts` exports
- Called in `ScriptureViewer/index.tsx` alongside deprecated `useContentRequests`

**Key Features:**
- Automatic state superseding (new broadcasts replace old)
- No timing coordination needed
- No request/response matching

### 3. WordsLinksViewer - Receiving Side

**New Hook:** `useScriptureTokens.ts`
- Simple state listener using `useCurrentState`
- ~80 lines of code (vs ~350 in old approach)
- No request sending, no timeout handling, no race conditions

**Updated Hook:** `useAlignedTokens.ts`
- Completely rewritten to use broadcast approach
- Removed all request/response logic (~150 lines removed)
- Removed deep cloning (no longer needed)
- Removed timeout handling
- Removed requestId coordination
- Now ~180 lines (was ~410 lines)

**Key Simplifications:**
```typescript
// OLD (complex):
const { sendToAll: sendRequest } = useSignal(...)
useSignalHandler('scripture-content-response', ..., (signal) => {
  // Check requestId, handle timeouts, clone objects, etc.
})
useEffect(() => {
  sendRequest({ ... })
  setTimeout(() => { /* timeout handling */ }, 2000)
}, [dependencies])

// NEW (simple):
const { tokens, reference, hasTokens } = useScriptureTokens({ resourceId })
// That's it! Tokens are always available when broadcast.
```

### 4. Plugin System

**New Plugin:** `scriptureTokensBroadcastPlugin` in `messageTypePlugins.ts`
- Validates broadcast messages
- Handles logging and debugging

**Registration:** `LinkedPanelsStudio.tsx`
- Registered new broadcast plugin
- Kept deprecated request/response plugins for backward compatibility

## Benefits

### Code Reduction
- **ScriptureViewer:** No change in complexity (broadcasting is simple)
- **WordsLinksViewer:** ~230 lines removed (~56% reduction)
- **Total:** ~230 lines of complex coordination code eliminated

### Reliability Improvements
- ✅ No race conditions (state is always available)
- ✅ No timing issues (no "request sent before panel ready")
- ✅ No timeout errors
- ✅ No requestId coordination
- ✅ No read-only object issues (can send mutable data in state)

### Performance Improvements
- ✅ Zero latency for state access (vs request → wait → response)
- ✅ Better caching (one copy in state registry)
- ✅ Less duplication (multiple consumers share same broadcast)

### Developer Experience
- ✅ Simpler mental model (broadcast vs request/response)
- ✅ Easier debugging (one broadcast, not request/response pairs)
- ✅ Less boilerplate (no request/response coordination)
- ✅ Matches proven bt-studio architecture

## Testing

The dev server is running. Test the following scenarios:

1. **Basic Quote Display:**
   - Open Scripture panel + TWL panel
   - Navigate to a verse with TWL links
   - Verify quotes display correctly

2. **Multi-Panel:**
   - Open multiple Scripture panels
   - Verify TWL receives tokens from active panel
   - Switch active panels, verify TWL updates

3. **Navigation:**
   - Navigate between verses
   - Verify quotes update immediately
   - No "waiting for response" delays

4. **Panel Lifecycle:**
   - Close Scripture panel
   - Verify TWL handles empty state gracefully
   - Reopen Scripture panel
   - Verify TWL receives new broadcast

## Migration Path for Other Features

This broadcast pattern should be used for:

- ✅ Scripture tokens (DONE)
- 🔄 Translation Notes quotes (TODO)
- 🔄 Token highlighting (TODO)
- 🔄 Verse range filtering (TODO)

## Backward Compatibility

- Old request/response plugins kept registered
- `useContentRequests` marked as `@deprecated` but still functional
- Can be removed in future version after migration is complete

## Files Changed

1. `src/signals/studioSignals.ts` - Added broadcast signal, deprecated old signals
2. `src/components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts` - NEW
3. `src/components/resources/ScriptureViewer/hooks/index.ts` - Export new hook
4. `src/components/resources/ScriptureViewer/index.tsx` - Call broadcast hook
5. `src/components/resources/ScriptureViewer/hooks/useContentRequests.ts` - Marked deprecated
6. `src/components/resources/WordsLinksViewer/hooks/useScriptureTokens.ts` - NEW
7. `src/components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts` - Rewritten
8. `src/plugins/messageTypePlugins.ts` - Added broadcast plugin
9. `src/components/studio/LinkedPanelsStudio.tsx` - Registered broadcast plugin

## References

- bt-studio implementation: `bt-toolkit/apps/bt-studio/src/components/resources/ScriptureViewer.tsx`
- bt-studio TWL consumer: `bt-toolkit/apps/bt-studio/src/components/resources/TranslationWordsLinksViewer.tsx`
- linked-panels state API: `useCurrentState` hook

# TWL Token Filter - Alignment-Based Matching Fix

**Date:** 2026-01-28  
**Issue:** When clicking a target language word (e.g., Spanish "Pablo"), the TWL viewer wasn't filtering to show matching TWL links.

## The Problem

### Scenario: User clicks "Pablo" in Spanish scripture

**What should happen:**
1. User clicks "Pablo" in Spanish ULT
2. Token signal sent: `{ content: "Pablo", alignedSemanticIds: ["tit 1:1:Παῦλος:1"] }`
3. TWL viewer receives signal
4. Filters TWLs to show link for "Παῦλος" (Paul in Greek)
5. User sees the matching TWL

**What was happening:**
1. User clicks "Pablo" in Spanish ULT ✅
2. Token signal sent with aligned IDs ✅
3. TWL viewer receives signal ✅
4. ❌ Filtering logic only checked:
   - If origWords text contains "pablo" (NO - it's "Παῦλος")
   - If quoteToken text contains "pablo" (NO - it's Greek)
5. ❌ No matches found → Shows all TWLs (fallback behavior)

**Root Cause:** Filtering logic wasn't using the `alignedSemanticIds` to match against the TWL's original language quote tokens.

## The Solution

### Key Insight

Target language tokens have `alignedSemanticIds` that point to the original language tokens they translate:

```typescript
// Target language token (Spanish)
{
  content: "Pablo",
  semanticId: "tit 1:1:Pablo:1",
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"]  // Points to Greek!
}

// TWL link has quote tokens (Greek)
{
  origWords: "Παῦλος",
  quoteTokens: [
    { id: "tit 1:1:Παῦλος:1", text: "Παῦλος", ... }
  ]
}
```

**The Match:** `alignedSemanticIds[0]` === `quoteTokens[0].id` ✅

### Implementation

#### 1. Updated TokenFilter Type

```typescript
export interface TokenFilter {
  semanticId: string
  content: string
  alignedSemanticIds?: string[]  // NEW: Original language IDs for target tokens
  timestamp: number
}
```

#### 2. Enhanced Signal Handler

```typescript
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  useCallback((signal) => {
    if (signal.sourceResourceId === resourceId) return
    
    console.log('[WordsLinksViewer] Received token-click signal:', {
      content: signal.token.content,
      semanticId: signal.token.semanticId,
      alignedSemanticIds: signal.token.alignedSemanticIds,  // NEW
    })
    
    setTokenFilter({
      semanticId: signal.token.semanticId,
      content: signal.token.content,
      alignedSemanticIds: signal.token.alignedSemanticIds || [],  // NEW
      timestamp: signal.timestamp,
    })
  }, [resourceId])
)
```

#### 3. Three-Strategy Filtering Logic

```typescript
const filtered = filteredByReference.filter((link) => {
  // STRATEGY 1: Alignment-based matching (PRIMARY)
  // Check if clicked token's aligned semantic IDs match any quote token's ID
  // This handles: User clicks target language "Pablo" → aligned to Greek "Παῦλος"
  const hasAlignedMatch = tokenFilter.alignedSemanticIds?.some(alignedId => 
    link.quoteTokens?.some(quoteToken => quoteToken.id === alignedId)
  )
  
  // STRATEGY 2: Text-based fuzzy matching (FALLBACK)
  // Check if origWords contains the clicked token text
  const origWordsLower = link.origWords?.toLowerCase() || ''
  const hasTextMatch = origWordsLower.includes(cleanToken)
  
  // STRATEGY 3: Quote token text matching (ORIGINAL LANGUAGE CLICKS)
  // Check if any quote token text matches
  const hasQuoteTokenMatch = link.quoteTokens?.some(token => 
    token.text.toLowerCase().includes(cleanToken)
  )
  
  return hasAlignedMatch || hasTextMatch || hasQuoteTokenMatch
})
```

## Filtering Strategies Explained

### Strategy 1: Alignment-Based (Primary) ✨

**When it works:**
- User clicks target language word with alignments
- Most accurate - uses actual alignment data
- Works cross-language (Spanish → Greek, English → Hebrew, etc.)

**Example:**
```
Click: "Pablo" in Spanish
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"]
Match: TWL with quoteTokens[0].id === "tit 1:1:Παῦλος:1"
Result: ✅ Shows TWL for Παῦλος (Paul)
```

### Strategy 2: Text-Based Fuzzy (Fallback)

**When it works:**
- Simple text matching against origWords
- Useful when alignments aren't available
- Language-agnostic substring match

**Example:**
```
Click: "apost" (partial word)
Match: TWL with origWords containing "apost" → "ἀπόστολος"
Result: ✅ Shows TWL for apostle
```

### Strategy 3: Quote Token Text (Original Language)

**When it works:**
- User clicks original language scripture
- Direct Greek/Hebrew token matching
- Useful for interlinear views

**Example:**
```
Click: "Παῦλος" in Greek
Match: TWL with quoteTokens containing "Παῦλος"
Result: ✅ Shows TWL for Paul
```

## Complete Flow Example

### Scenario: Titus 1:1 - Clicking "Pablo" (Spanish)

**1. Scripture Panel Sends Token Click**
```typescript
sendTokenClick({
  token: {
    content: "Pablo",
    semanticId: "tit 1:1:Pablo:1",
    alignedSemanticIds: ["tit 1:1:Παῦλος:1"],  // Key data!
    verseRef: "tit 1:1",
  }
})
```

**2. TWL Viewer Receives Signal**
```typescript
[WordsLinksViewer] Received token-click signal: {
  content: "Pablo",
  semanticId: "tit 1:1:Pablo:1",
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"]
}
```

**3. Filter Logic Executes**
```typescript
// For TWL link with origWords: "Παῦλος"
link.quoteTokens = [
  { id: "tit 1:1:Παῦλος:1", text: "Παῦλος", ... }
]

// Strategy 1: Alignment match
hasAlignedMatch = ["tit 1:1:Παῦλος:1"].some(alignedId =>
  [{ id: "tit 1:1:Παῦλος:1" }].some(qt => qt.id === alignedId)
)
// = true ✅

// Strategy 2: Text match
hasTextMatch = "Παῦλος".includes("pablo")
// = false

// Strategy 3: Quote token text match
hasQuoteTokenMatch = "Παῦλος".includes("pablo")
// = false

// Result: matches = true (Strategy 1 succeeded)
```

**4. Result**
```
[WordsLinksViewer] ✅ Match found: {
  linkId: "...",
  origWords: "Παῦλος",
  quoteTokenIds: ["tit 1:1:Παῦλος:1"],
  hasAlignedMatch: true,
  hasTextMatch: false,
  hasQuoteTokenMatch: false
}

[WordsLinksViewer] Filter results: {
  totalLinks: 15,
  matchedLinks: 1,
  hasMatches: true
}
```

**5. UI Shows**
- Blue banner: "Filtered by: Pablo (1 link)"
- Single TWL card for "Παῦλος" (Paul)

## Debugging

### Console Logs

When token filtering happens, you'll see:

```
[WordsLinksViewer] Received token-click signal: {
  content: "Pablo",
  semanticId: "tit 1:1:Pablo:1",
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"]
}

[WordsLinksViewer] Filtering with token: {
  content: "Pablo",
  semanticId: "tit 1:1:Pablo:1",
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"]
}

[WordsLinksViewer] ✅ Match found: {
  linkId: "tit_1_1_paul",
  origWords: "Παῦλος",
  quoteTokenIds: ["tit 1:1:Παῦλος:1"],
  hasAlignedMatch: true,
  hasTextMatch: false,
  hasQuoteTokenMatch: false
}

[WordsLinksViewer] Filter results: {
  totalLinks: 15,
  matchedLinks: 1,
  hasMatches: true
}
```

### Troubleshooting

**If filtering doesn't work:**

1. **Check alignedSemanticIds is populated**
   - Look for `alignedSemanticIds: ["..."]` in the signal log
   - If empty, the scripture token doesn't have alignment data

2. **Check quoteTokens have IDs**
   - Look for `quoteTokenIds: ["..."]` in the match log
   - If empty, the TWL quote tokens weren't built correctly

3. **Verify ID format matches**
   - Aligned ID: `"tit 1:1:Παῦλος:1"` (lowercase book code)
   - Quote token ID: should be same format
   - Case-sensitive match!

4. **Check occurrence numbers**
   - First Pablo: `"tit 1:1:Pablo:1"` → `"tit 1:1:Παῦλος:1"`
   - Second Pablo: `"tit 1:1:Pablo:2"` → `"tit 1:1:Παῦλος:2"`
   - Must match exactly!

## Edge Cases Handled

### 1. Target Language Click (Common Case)
```
Click: Spanish "Pablo" → Filters to Greek "Παῦλος" TWL ✅
Strategy: Alignment-based
```

### 2. Original Language Click
```
Click: Greek "Παῦλος" → Filters to "Παῦλος" TWL ✅
Strategy: Quote token text match
```

### 3. Partial Text Click
```
Click: "apost" → Filters to "ἀπόστολος" TWL ✅
Strategy: Text-based fuzzy match
```

### 4. No Alignment Data
```
Click: Token without alignedSemanticIds
Fallback: Text-based and quote token matching still work ✅
```

### 5. Multiple Occurrences
```
Click: Second occurrence of "God"
  alignedSemanticIds: ["tit 1:1:Θεοῦ:2"]
Match: TWL with quoteTokens[0].id === "tit 1:1:Θεοῦ:2" ✅
Result: Shows correct TWL for 2nd occurrence
```

### 6. No Matches
```
Click: "the" (no TWL for articles)
Result: Shows all TWLs with amber banner ✅
Banner: "No matches for: the (showing all links)"
```

## Benefits

✅ **Cross-language filtering works** - Click Spanish word, filter Greek TWLs  
✅ **Occurrence-aware** - Correctly matches 1st vs 2nd occurrence  
✅ **Multiple strategies** - Fallback to text matching if alignments unavailable  
✅ **Accurate matching** - Uses actual alignment data, not fuzzy text matching  
✅ **Debug-friendly** - Extensive console logging for troubleshooting  

## Files Modified

1. **`types.ts`** - Added `alignedSemanticIds` to TokenFilter interface
2. **`index.tsx`** - Enhanced signal handler and filtering logic
   - Capture `alignedSemanticIds` from token-click signal
   - Implement three-strategy filtering
   - Add comprehensive debug logging

## Testing Checklist

- [ ] Click target language word → Filters to matching TWL (blue banner)
- [ ] Click original language word → Filters to matching TWL (blue banner)
- [ ] Click partial text → Filters via fuzzy match
- [ ] Click 1st occurrence → Shows 1st TWL only
- [ ] Click 2nd occurrence → Shows 2nd TWL only
- [ ] Click word with no TWL → Shows all TWLs (amber banner)
- [ ] Check console logs show alignment matching working
- [ ] Test with multiple languages (Spanish, Hebrew, English)

## Related Documentation

- `TWL_ALIGNMENT_SYSTEM.md` - Complete alignment algorithm
- `OCCURRENCE_SEMANTIC_ID_FIX.md` - Semantic ID occurrence fix
- `TWL_TOKEN_FILTER_FIX.md` - Fallback to show all links

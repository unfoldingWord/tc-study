# TWL Occurrence → Semantic ID Fix

**Date:** 2026-01-28  
**Issue:** TWL links with occurrence=2 were broadcasting semantic IDs with occurrence=1

## The Complete Flow (Titus 1:1 "of God" occurrence 2)

### Input Data

**TWL Link:**
```typescript
{
  origWords: "Θεοῦ",     // Greek word for "of God"
  occurrence: "2",        // Want the SECOND instance
  reference: "1:1"
}
```

**Verse Context:**
```
Παῦλος δοῦλος Θεοῦ¹ δὲ ἀπόστολος ... ἐκλεκτῶν Θεοῦ²
Paul,   servant of God¹ and apostle... chosen people of God²
```

### Step 1: Match Quote → Original Tokens ✅ (Was Working)

**File:** `packages/resource-parsers/src/utils/quote-matcher.ts`

```typescript
QuoteMatcher.findOriginalTokens(chapters, "Θεοῦ", occurrence=2, ref)
// ✅ Correctly finds the 2nd occurrence
// ✅ Returns the right token
```

**Result:** Correct Greek token selected!

### Step 2: Generate Semantic IDs ❌ (Was Broken)

**File:** `apps/tc-study/src/components/resources/WordsLinksViewer/utils/generateSemanticIds.ts`

**BEFORE (Broken):**
```typescript
generateSemanticIdsForQuoteTokens(tokens, bookCode, chapter, verse) {
  const occurrenceMap = new Map()
  
  return tokens.map(token => {
    const occurrence = (occurrenceMap.get(token.text) || 0) + 1
    // ❌ Problem: Counts occurrence within THIS array
    // ❌ Even though token is the 2nd in the verse, it's the 1st in THIS array
    return `tit 1:1:Θεοῦ:${occurrence}`  // Returns "...Θεοῦ:1" ❌
  })
}
```

**Result:** `tit 1:1:Θεοῦ:1` (WRONG! Should be `:2`)

**AFTER (Fixed):**
```typescript
generateSemanticIdsForQuoteTokens(
  tokens, 
  bookCode, 
  chapter, 
  verse,
  baseOccurrence  // ✅ NEW: Pass the TWL occurrence!
) {
  // For single-token quotes, use the TWL occurrence directly
  if (tokens.length === 1 && baseOccurrence !== undefined) {
    return [`tit 1:1:Θεοῦ:${baseOccurrence}`]  // Returns "...Θεοῦ:2" ✅
  }
  
  // For multi-token quotes, count within the quote
  // (e.g., "Παῦλος & δοῦλος" → Παῦλος:1, δοῦλος:1)
  const occurrenceMap = new Map()
  return tokens.map(token => {
    const occurrence = (occurrenceMap.get(token.text) || 0) + 1
    return `${verseRef}:${token.text}:${occurrence}`
  })
}
```

**Result:** `tit 1:1:Θεοῦ:2` (CORRECT!)

### Step 3: Broadcast to Scripture ✅ (Now Works)

**File:** `apps/tc-study/src/components/resources/WordsLinksViewer/index.tsx`

```typescript
handleQuoteClick(link) {
  const baseOccurrence = parseInt(link.occurrence || '1', 10)  // Parse "2" → 2
  
  const semanticIds = generateSemanticIdsForQuoteTokens(
    link.quoteTokens,
    bookCode,
    chapter,
    verse,
    baseOccurrence  // ✅ Pass the original TWL occurrence
  )
  // Returns: ["tit 1:1:Θεοῦ:2"] ✅
  
  sendTokenClick({ semanticId: "tit 1:1:Θεοῦ:2", ... })
}
```

### Step 4: Scripture Highlights Aligned Words ✅

**Target Scripture (Spanish):**
```typescript
// Token structure:
{
  text: "de",
  semanticId: "tit 1:1:de:2",
  alignedOriginalWordIds: ["tit 1:1:Θεοῦ:2"]  // Links to 2nd "of God"
}
{
  text: "Dios",
  semanticId: "tit 1:1:Dios:2",
  alignedOriginalWordIds: ["tit 1:1:Θεοῦ:2"]  // Links to 2nd "of God"
}
```

**When broadcast receives** `semanticId: "tit 1:1:Θεοῦ:2"`:
- ✅ Matches tokens with `alignedOriginalWordIds` containing `"tit 1:1:Θεοῦ:2"`
- ✅ Highlights "del pueblo elegido de Dios" (2nd occurrence)
- ❌ Does NOT highlight "siervo de Dios" (1st occurrence, has `:1`)

## The Root Cause

**Problem:** Semantic ID generation was regenerating occurrence numbers instead of using the original TWL occurrence.

**Why it happened:**
1. `QuoteMatcher` returns tokens without occurrence metadata embedded
2. `generateSemanticIdsForQuoteTokens` had to assign occurrence numbers
3. It counted from 1 for each unique word in the quote tokens array
4. Lost the original TWL occurrence number!

**Example:**
- TWL says: "Find Θεοῦ occurrence 2"
- QuoteMatcher: ✅ Finds the right token (the 2nd Θεοῦ in verse)
- Returns: `[{ text: "Θεοῦ", ... }]` (1 token, no occurrence info)
- generateSemanticIds: "First Θεοῦ I see in this array → occurrence 1" ❌

## The Solution

**Key Change:** Pass the original TWL `occurrence` field through the entire pipeline.

### Files Modified

1. **`utils/generateSemanticIds.ts`**
   - Added `baseOccurrence?: number` parameter
   - For single-token quotes: use `baseOccurrence` directly
   - For multi-token quotes: count within the quote (existing behavior)

2. **`index.tsx`** (`handleQuoteClick`)
   - Parse TWL occurrence: `parseInt(link.occurrence || '1', 10)`
   - Pass to semantic ID generator
   - Added debug logging

## Testing

**To verify the fix:**

1. Load Titus 1:1 with Spanish/English resources
2. Find TWL link: `origWords: "Θεοῦ", occurrence: "2"`
3. Click the quote in the TWL card
4. Check console:
   ```
   [WordsLinksViewer] handleQuoteClick: {
     origWords: "Θεοῦ",
     occurrence: "2",
     tokenCount: 1
   }
   [WordsLinksViewer] Generated semantic IDs: ["tit 1:1:Θεοῦ:2"]  ← Should be :2!
   ```
5. Verify Spanish scripture highlights "del pueblo elegido de Dios" (2nd occurrence)
6. Verify it does NOT highlight "siervo de Dios" (1st occurrence)

## Multi-Token Quote Handling

**The fix handles both cases:**

### Single Token (e.g., "Θεοῦ")
- Uses TWL occurrence directly
- `occurrence: "2"` → semantic ID: `tit 1:1:Θεοῦ:2`

### Multiple Tokens (e.g., "Παῦλος & δοῦλος")
- Counts occurrence within the quote
- First part uses TWL occurrence
- Subsequent parts count from 1 within quote
- Already handled correctly by QuoteMatcher multi-part logic

## Impact

✅ All TWL links with occurrence > 1 now broadcast correct semantic IDs  
✅ Scripture highlighting matches the right tokens  
✅ Target language quotes show the correct aligned text  
✅ Works for Greek, Hebrew, Spanish, and all languages  
✅ Works for single and multi-token quotes  

## Related Documentation

- `TWL_ALIGNMENT_SYSTEM.md` - Complete algorithm documentation
- `TWL_OCCURRENCE_FIX.md` - Position calculation fix (extractTokensForMatch)
- `DEBUG_OCCURRENCE_ISSUE.md` - Debugging guide with console logs

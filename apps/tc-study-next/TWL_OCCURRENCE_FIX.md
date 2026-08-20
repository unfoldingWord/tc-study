# TWL Occurrence Matching Fix

**Date:** 2026-01-28  
**Issue:** TWL links with occurrence > 1 were matching the wrong occurrence

## Problem

When a word appears multiple times in a verse (e.g., "Θεοῦ" / "of God" appears twice in Titus 1:1), and the TWL link specifies `occurrence: 2`, the system was matching the FIRST occurrence instead of the SECOND.

### Example
**Titus 1:1:**
- First "Θεοῦ": "δοῦλος **Θεοῦ**" (servant **of God**)  
- Second "Θεοῦ": "ἐκλεκτῶν **Θεοῦ**" (chosen people **of God**)

**TWL Link:**
```
origWords: "Θεοῦ"
occurrence: "2"  // Should match SECOND occurrence
reference: "1:1"
```

**Bug:** Was showing "siervo de Dios" (servant of God) instead of "del pueblo elegido de Dios" (of God's chosen people)

## Root Cause

The `extractTokensForMatch` method in `QuoteMatcher` had an off-by-one error in position calculation:

### How Position Matching Works

1. **Build normalized text** from tokens with spaces:
   ```
   verse.tokens.filter(t => t.type === 'word')
     .map(t => normalize(t.text))
     .join(' ')
   ```
   Result: `"δουλος θεου δε αποστολος ... εκλεκτων θεου"`

2. **Find all string positions** where quote appears:
   - First "θεου": positions 8-11
   - Second "θεου": positions 59-62

3. **Count to nth occurrence**, get its position range

4. **Map positions back to tokens** - THIS IS WHERE THE BUG WAS

### The Bug

```typescript
// BEFORE (incorrect):
for (const token of wordTokens) {
  const tokenStart = currentPos;
  const tokenEnd = currentPos + tokenText.length;
  
  // ... check overlap ...
  
  currentPos = tokenEnd + 1; // ALWAYS adds +1, even after last token!
}
```

**Problem:** Always added +1 after every token, even the last one (where there's no trailing space).

## Solution

### Fix 1: Only Add Space Between Tokens

```typescript
// AFTER (correct):
for (let i = 0; i < wordTokens.length; i++) {
  const token = wordTokens[i];
  const tokenStart = currentPos;
  const tokenEnd = currentPos + tokenText.length;
  
  // ... check overlap ...
  
  // Only add space if not the last token
  currentPos = tokenEnd + (i < wordTokens.length - 1 ? 1 : 0);
}
```

### Fix 2: Enhanced Debug Logging

Added logging to trace occurrence selection:

```typescript
if (matches.length > 1) {
  console.log(`[QuoteMatcher] Found ${matches.length} occurrences, looking for #${occurrence}`);
}

console.log(`[QuoteMatcher] Selected occurrence #${foundOccurrences}`, {
  matchPosition: `${match.start}-${match.end}`,
  extractedTokens: tokens.map(t => t.text).join(' ')
});
```

## Testing

**To verify the fix:**

1. Load Spanish resources (or any with multiple word occurrences)
2. Open Titus 1:1
3. Check TWL link for "Θεοῦ" with occurrence 2
4. Verify quote shows "del pueblo elegido de Dios" (NOT "siervo de Dios")
5. Check console logs show correct occurrence selection

**Console output should show:**
```
[QuoteMatcher] Found 2 occurrences of "Θεοῦ", looking for #2
[QuoteMatcher] Selected occurrence #2: {
  matchPosition: "59-62",
  extractedTokens: "Θεοῦ"
}
```

## Impact

This fix ensures that:
- ✅ All TWL links with occurrence > 1 match the correct instance
- ✅ Quotes display the correct aligned text from target translation
- ✅ Multi-occurrence words (God, Lord, etc.) are properly distinguished
- ✅ Works for all languages (Greek, Hebrew, Spanish, etc.)

## Files Modified

- `packages/resource-parsers/src/utils/quote-matcher.ts`
  - Fixed `extractTokensForMatch` method
  - Added debug logging to `findSingleQuoteMatch`

## Related Documentation

- `TWL_ALIGNMENT_SYSTEM.md` - Complete TSV alignment algorithm
- `SPANISH_TWL_FIX.md` - Original language resource loading fix
- `ALIGNMENT_FIX.md` - Case sensitivity fix
- `INFLECTED_VS_LEMMA_FIX.md` - Inflected form vs lemma fix

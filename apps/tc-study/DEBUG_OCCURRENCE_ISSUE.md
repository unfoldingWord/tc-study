# Debugging TWL Occurrence Matching Issue

**Status:** Investigating  
**Issue:** TWL links with occurrence=2 are matching the first occurrence instead of the second

## Enhanced Debug Logging Added

I've added comprehensive console logging to trace the exact flow of occurrence matching. The logs will show:

### 1. Verse Search Log
```
[QuoteMatcher] Verse 1 - Searching for "Θεοῦ" (normalized: "θεου"), occurrence 2:
```
Shows:
- Which verse is being searched
- Original quote and normalized quote
- Requested occurrence number
- The full verse text
- All word tokens

### 2. Multiple Occurrences Found
```
[QuoteMatcher] Found 2 occurrences in verse 1:
```
Shows each match found:
- Index (1st, 2nd, etc.)
- Start/end position in normalized text
- The matched text substring

### 3. Occurrence Selection Process
```
[QuoteMatcher] Found occurrence #1 of "Θεοῦ" at positions 8-11, looking for #2
[QuoteMatcher] Found occurrence #2 of "Θεοῦ" at positions 59-62, looking for #2
```
Shows each occurrence as it's found and whether it matches the target

### 4. Selected Occurrence
```
[QuoteMatcher] ✅ Selected occurrence #2 of "Θεοῦ": {
  requestedOccurrence: 2,
  foundOccurrence: 2,
  matchPosition: "59-62",
  extractedTokens: "Θεοῦ"
}
```
Shows the final selected tokens

## How to Debug

### Step 1: Refresh Browser
```bash
# The resource-parsers package has been rebuilt with enhanced logging
# Refresh the browser to load the new code
```

### Step 2: Open Dev Console
- F12 or Right-click → Inspect
- Go to Console tab
- Filter by `[QuoteMatcher]` to see only quote-matcher logs

### Step 3: Load Test Case
1. Load Spanish resources (or English with UGNT)
2. Open Titus 1:1
3. Look for TWL link with `origWords: "Θεοῦ"` and `occurrence: "2"`

### Step 4: Check Console Output

**Expected Flow for "Θεοῦ" occurrence 2:**

```
[QuoteMatcher] Verse 1 - Searching for "Θεοῦ", occurrence 2:
  verseText: "παυλος δουλος θεου δε αποστολος ... εκλεκτων θεου"
  matchesFound: 2

[QuoteMatcher] Found 2 occurrences in verse 1:
  1. start: 17, end: 21, matchedText: "θεου"  ← First "of God"
  2. start: 69, end: 73, matchedText: "θεου"  ← Second "of God"

[QuoteMatcher] Found occurrence #1 at positions 17-21, looking for #2
[QuoteMatcher] Found occurrence #2 at positions 69-73, looking for #2

[QuoteMatcher] ✅ Selected occurrence #2:
  matchPosition: "69-73"
  extractedTokens: "Θεοῦ"  ← Should be the SECOND Θεοῦ token
```

### Step 5: Verify Token Extraction

Check that the extracted token has the correct semantic ID:
- First "Θεοῦ": `tit 1:1:Θεοῦ:1`
- Second "Θεοῦ": `tit 1:1:Θεοῦ:2` ← Should get this one

## Common Issues to Check

### Issue 1: Position Calculation Off
If `extractedTokens` shows the wrong word, the bug is in `extractTokensForMatch`:
- Position calculation doesn't match text construction
- Spaces not counted correctly
- Off-by-one error

### Issue 2: Text Matching Wrong
If the positions look wrong, the bug is in `findQuoteOccurrencesInText`:
- Normalization inconsistency
- indexOf not finding all occurrences
- Match positions calculated incorrectly

### Issue 3: Occurrence Counting Wrong
If it selects occurrence #1 instead of #2, the bug is in the counting logic:
- `foundOccurrences++` happening at wrong time
- `startPosition` filter removing wrong matches
- Multi-part quote handling interfering

## What to Report

Please share:
1. **Full console output** for the failing TWL link
2. **Expected** vs **Actual** tokens selected
3. **Semantic IDs** of the tokens found
4. **Target quote** that's displayed (should match occurrence 2, not 1)

## Files Modified

- `packages/resource-parsers/src/utils/quote-matcher.ts`
  - Added comprehensive logging to trace occurrence selection
  - Package rebuilt and ready to test

## Next Steps

Based on console output, we'll:
1. Identify exactly where the logic breaks
2. Fix the specific issue (position calc, text matching, or counting)
3. Verify with test cases for occurrence 1, 2, 3, etc.

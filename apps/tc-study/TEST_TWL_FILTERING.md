# Testing TWL Token Filtering

## Quick Test Steps

### 1. Refresh Browser
- Make sure dev server is running
- Refresh to load updated code

### 2. Open Titus 1:1
- Load Spanish and Greek panels
- Open TWL viewer panel

### 3. Test Scenario 1: Click "Pablo" (1st occurrence)

**Expected Console Output:**
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

**Expected UI:**
- Blue banner: "Filtered by: Pablo (1 link)"
- Shows single TWL card for "Παῦλος"

### 4. Test Scenario 2: Click "Dios" (2nd occurrence - "of God")

**Expected:**
- Filters to TWL for 2nd occurrence of "Θεοῦ"
- Shows TWL with occurrence: "2"

### 5. Test Scenario 3: Click "the" or "a"

**Expected:**
- Amber banner: "No matches for: the (showing all links)"
- Shows all TWLs for the verse

### 6. Test Scenario 4: Clear filter

**Expected:**
- Filter banner disappears
- Shows all TWLs

## What to Look For

### ✅ Success Indicators

1. **Console shows alignedSemanticIds**
   - Not empty array
   - Proper format: `"tit 1:1:Παῦλος:1"`

2. **Match found with hasAlignedMatch: true**
   - Primary strategy working
   - Accurate cross-language matching

3. **UI shows filtered list**
   - Blue banner
   - Correct TWL card(s)

### ❌ Problem Indicators

1. **alignedSemanticIds is empty**
   - Problem: Scripture tokens don't have alignment data
   - Check: Scripture resource has ZALN alignment markers

2. **quoteTokenIds is empty**
   - Problem: TWL quote tokens not built
   - Check: Original language content loaded

3. **No match found but should match**
   - Problem: ID format mismatch
   - Check: Book code case (should be lowercase)
   - Check: Occurrence numbers match

## Debug Commands

### Check if filtering is working
```javascript
// In browser console
// After clicking a word, check the tokenFilter state
```

### Force clear filter
```javascript
// Click the [×] button in the banner
```

### Check current TWL links
```javascript
// Look for [TWL-DEBUG] logs in console
// Shows quoteTokens and semantic IDs
```

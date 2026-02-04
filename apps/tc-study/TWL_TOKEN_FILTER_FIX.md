# TWL Token Filter - Fallback to Show All Links

**Date:** 2026-01-28  
**Issue:** When a user clicked a word in scripture that had no matching TWL links, the TWL viewer showed an empty list instead of showing all available TWLs for the current verse range.

## The Problem

### Before (Broken Behavior)

1. User clicks a word in scripture (e.g., "the")
2. Token click signal sent to TWL viewer
3. TWL viewer filters links by that token
4. No TWL links match "the"
5. ❌ **Shows empty list** - confusing for the user

**User Experience:**
- Clicking certain words made TWLs "disappear"
- User didn't know if there were no TWLs at all or just no matches
- Had to manually clear the filter to see TWLs again

### After (Fixed Behavior)

1. User clicks a word in scripture (e.g., "the")
2. Token click signal sent to TWL viewer
3. TWL viewer filters links by that token
4. No TWL links match "the"
5. ✅ **Shows all TWLs for current verse range** - helpful fallback
6. ✅ **Banner indicates "No matches" with amber styling** - clear feedback

**User Experience:**
- Clicking any word shows relevant TWLs or all available TWLs
- Clear visual feedback when no matches found
- Still shows the filter is active (can clear if desired)
- Never shows an empty list unless there are truly no TWLs

## The Solution

### Files Modified

#### 1. `index.tsx` - Main filtering logic

**Changed from:**
```typescript
const displayLinks = useMemo(() => {
  if (!tokenFilter) return filteredByReference
  
  const filtered = filteredByReference.filter((link) => {
    // ... filtering logic ...
  })
  
  return filtered  // ❌ Returns empty array if no matches
}, [filteredByReference, tokenFilter])
```

**Changed to:**
```typescript
const { displayLinks, hasMatches } = useMemo(() => {
  if (!tokenFilter) {
    return { displayLinks: filteredByReference, hasMatches: true }
  }
  
  const filtered = filteredByReference.filter((link) => {
    // ... filtering logic ...
  })
  
  const hasMatches = filtered.length > 0
  return {
    displayLinks: hasMatches ? filtered : filteredByReference,  // ✅ Fallback to all
    hasMatches,  // ✅ Track if we found matches
  }
}, [filteredByReference, tokenFilter])
```

**Key Changes:**
- Returns both `displayLinks` and `hasMatches` flag
- If no matches found, returns `filteredByReference` (all TWLs for current range)
- Tracks whether actual matches were found for UI feedback

#### 2. `TokenFilterBanner.tsx` - Visual feedback

**Added `hasMatches` prop:**
```typescript
interface TokenFilterBannerProps {
  tokenFilter: TokenFilter
  displayLinksCount: number
  hasMatches: boolean  // ✅ NEW
  onClearFilter: () => void
}
```

**Visual States:**

**When matches found (blue theme):**
```
🔷 Filtered by: "apostle" (3 links)              [×]
```

**When no matches (amber theme):**
```
🟧 No matches for: "the" (showing all links)    [×]
```

**Styling:**
- Blue background/border when matches found
- Amber background/border when no matches (warning style)
- Clear message: "No matches for: [token] (showing all links)"
- Link count only shown when matches found

## Filtering Logic

### How Token Matching Works

```typescript
const filtered = filteredByReference.filter((link) => {
  const origWordsLower = link.origWords?.toLowerCase() || ''
  
  // Check against quoteTokens if available
  const hasTokenMatch = link.quoteTokens?.some(token => 
    token.text.toLowerCase().includes(cleanToken) || 
    String(token.id) === tokenFilter.semanticId
  )
  
  return origWordsLower.includes(cleanToken) || hasTokenMatch
})
```

**Matches when:**
1. TWL `origWords` contains the clicked token text (partial match)
2. Any quote token text contains the clicked token text (partial match)
3. Any quote token ID exactly matches the semantic ID (exact match)

**Example - Titus 1:1:**

**User clicks "apostle" in ULT:**
- Token: `{ content: "apostle", semanticId: "tit 1:1:apostle:1" }`
- Matches TWL: `{ origWords: "ἀπόστολος" }` ✅
- Shows: 1 filtered link

**User clicks "the" in ULT:**
- Token: `{ content: "the", semanticId: "tit 1:1:the:1" }`
- No TWL with `origWords` containing "the" ❌
- Shows: All 15+ TWLs for Titus 1:1 with amber banner

## User Scenarios

### Scenario 1: Click a Key Biblical Term
```
User clicks: "apostle" → Filters to 1 TWL (blue banner)
Result: See TWL for ἀπόστολος (apostle)
```

### Scenario 2: Click a Common Article/Particle
```
User clicks: "the" → No matches → Shows all TWLs (amber banner)
Result: See all 15+ TWLs for the verse
Banner: "No matches for: the (showing all links)"
```

### Scenario 3: Click Another Key Term
```
User clicks: "God" → Filters to 2 TWLs (blue banner)
Result: See TWLs for both occurrences of Θεοῦ
```

### Scenario 4: Clear Filter
```
User clicks [×] button → Filter cleared → Shows all TWLs (no banner)
Result: Back to default view
```

## Edge Cases Handled

1. **No TWLs exist for verse range**
   - Shows empty state message (not affected by this fix)

2. **Token filter active but changed verse**
   - Filter automatically cleared when reference changes
   - See line 96-99 in index.tsx

3. **Self-referential clicks**
   - TWL viewer ignores its own token-click signals
   - See line 78-80: `if (signal.sourceResourceId === resourceId) return`

4. **Multiple panels filtering**
   - Each panel maintains its own filter state
   - Independent filtering across multiple TWL panels

## Benefits

✅ **Never shows empty list** (unless truly no TWLs exist)  
✅ **Clear visual feedback** (amber = no matches, blue = filtered)  
✅ **Better discoverability** (users see what TWLs are available)  
✅ **Reduced confusion** (no more "where did my TWLs go?")  
✅ **Consistent behavior** (clicking any word always shows something useful)  

## Testing Checklist

- [ ] Click a key biblical term → See filtered list (blue banner)
- [ ] Click a common word → See all TWLs (amber banner)
- [ ] Check banner shows correct message for each state
- [ ] Clear filter → Banner disappears
- [ ] Change verse → Filter auto-clears
- [ ] Multiple TWL panels → Each filters independently
- [ ] Empty verse (no TWLs) → Shows empty state (not affected)

## Related Documentation

- `TWL_ALIGNMENT_SYSTEM.md` - Complete alignment algorithm
- `OCCURRENCE_SEMANTIC_ID_FIX.md` - Semantic ID occurrence fix

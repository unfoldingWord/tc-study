# TWL Token Matching Algorithm - Complete Flow

**Date:** 2026-01-28

## Overview

This document explains how TWL viewer matches clicked scripture tokens to TWL links to filter the displayed list.

## The Complete Flow

### Step 1: User Clicks Token in Scripture

**Example:** User clicks "Pablo" in Spanish ULT (Titus 1:1)

**Scripture Panel Sends:**
```typescript
sendTokenClick({
  token: {
    content: "Pablo",
    semanticId: "tit 1:1:Pablo:1",
    alignedSemanticIds: ["tit 1:1:Παῦλος:1"],  // KEY: Points to Greek!
    verseRef: "tit 1:1",
  }
})
```

### Step 2: TWL Viewer Receives Signal

**File:** `index.tsx` - `useSignalHandler<TokenClickSignal>`

```typescript
setTokenFilter({
  semanticId: "tit 1:1:Pablo:1",
  content: "Pablo",
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"],  // Stored for matching
  timestamp: Date.now(),
})
```

### Step 3: Filtering Logic Executes

**File:** `index.tsx` - `displayLinks` useMemo

**Input:**
- `tokenFilter` - What the user clicked
- `filteredByReference` - All TWL links for current verse range

**Process:** Filter TWL links using three strategies:

#### Strategy 1: Alignment-Based Matching (PRIMARY) ✨

```typescript
const hasAlignedMatch = tokenFilter.alignedSemanticIds?.some(alignedId => {
  const alignedIdLower = alignedId.toLowerCase()  // "tit 1:1:παῦλος:1"
  
  return link.quoteTokens?.some(quoteToken => {
    const quoteTokenIdLower = String(quoteToken.id).toLowerCase()  // "tit 1:1:παῦλος:1"
    return quoteTokenIdLower === alignedIdLower  // Match!
  })
})
```

**How it works:**
1. Get `alignedSemanticIds` from clicked token (target language → original language mapping)
2. Normalize to lowercase (because quoteToken.id uses UPPERCASE book codes)
3. Check if any TWL link's `quoteTokens[].id` matches (after lowercasing)
4. If match found → This TWL is relevant to the clicked word!

**Key Data Structures:**

**Clicked Token (Target Language - Spanish):**
```typescript
{
  content: "Pablo",
  alignedSemanticIds: ["tit 1:1:Παῦλος:1"]  // lowercase book code
}
```

**TWL Link (Original Language - Greek):**
```typescript
{
  origWords: "Παῦλος",
  occurrence: "1",
  quoteTokens: [
    {
      id: "TIT 1:1:Παῦλος:1",  // UPPERCASE book code (from QuoteMatcher)
      text: "Παῦλος",
      ...
    }
  ]
}
```

**Matching:**
```typescript
"tit 1:1:Παῦλος:1".toLowerCase()  === "tit 1:1:παῦλος:1"  ✅
"TIT 1:1:Παῦλος:1".toLowerCase()  === "tit 1:1:παῦλος:1"  ✅
// MATCH!
```

#### Strategy 2: Text-Based Fuzzy Matching (FALLBACK)

```typescript
const hasTextMatch = link.origWords?.toLowerCase().includes(
  tokenFilter.content.toLowerCase().trim()
)
```

**How it works:**
1. Get the clicked token's text content
2. Check if TWL's `origWords` contains that text (substring match)
3. Case-insensitive

**Example:**
```
Click: "apost"
Match: TWL with origWords "ἀπόστολος" (contains "apost") ✅
```

#### Strategy 3: Quote Token Text Matching (ORIGINAL LANGUAGE)

```typescript
const hasQuoteTokenMatch = link.quoteTokens?.some(token => 
  token.text.toLowerCase().includes(tokenFilter.content.toLowerCase())
)
```

**How it works:**
1. Check if any quote token's text contains the clicked token text
2. Useful when user clicks original language scripture directly

**Example:**
```
Click: "Παῦλος" in Greek panel
Match: TWL with quoteTokens containing "Παῦλος" ✅
```

### Step 4: Display Results

**If matches found:**
```typescript
displayLinks = filtered  // Show only matching TWLs
hasMatches = true
// Blue banner: "Filtered by: Pablo (1 link)"
```

**If no matches:**
```typescript
displayLinks = filteredByReference  // Show ALL TWLs (fallback)
hasMatches = false
// Amber banner: "No matches for: the (showing all links)"
```

## Critical Bug Fix: Case-Insensitive Matching

### The Problem

**QuoteMatcher** (in `resource-parsers` package) generates IDs with **UPPERCASE** book codes:
```typescript
quoteToken.id = "TIT 1:1:Παῦλος:1"  // From QuoteMatcher
//               ^^^
//             UPPERCASE
```

**Scripture tokens** have **lowercase** semantic IDs:
```typescript
alignedSemanticIds = ["tit 1:1:Παῦλος:1"]  // From scripture panel
//                     ^^^
//                   lowercase
```

**Original comparison (BROKEN):**
```typescript
quoteToken.id === alignedId
// "TIT 1:1:Παῦλος:1" === "tit 1:1:Παῦλος:1"
// false ❌
```

### The Fix

**Normalize both to lowercase before comparing:**
```typescript
String(quoteToken.id).toLowerCase() === alignedId.toLowerCase()
// "tit 1:1:παῦλος:1" === "tit 1:1:παῦλος:1"
// true ✅
```

**Why `String()`?**
- Safety check in case `id` is a number
- Ensures `.toLowerCase()` works

**Why lowercase both?**
- Greek letters also have uppercase/lowercase (Π vs π)
- Ensures complete case-insensitivity

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ USER CLICKS "Pablo" in Spanish Scripture                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Scripture Panel Sends Token Click Signal                    │
│ {                                                            │
│   content: "Pablo",                                          │
│   semanticId: "tit 1:1:Pablo:1",                            │
│   alignedSemanticIds: ["tit 1:1:Παῦλος:1"] ◄─── KEY DATA!   │
│ }                                                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ TWL Viewer Receives Signal & Stores in tokenFilter          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Filter TWL Links (3 Strategies)                             │
│                                                              │
│ FOR EACH TWL Link:                                           │
│   1. Alignment Match? (Primary)                             │
│      alignedIds: ["tit 1:1:Παῦλος:1"]                      │
│      quoteToken.id: "TIT 1:1:Παῦλος:1"                     │
│      Compare (lowercase): MATCH! ✅                          │
│                                                              │
│   2. Text Match? (Fallback)                                 │
│      "pablo" in "Παῦλος"? NO                                │
│                                                              │
│   3. Quote Token Text Match?                                │
│      "pablo" in "Παῦλος"? NO                                │
│                                                              │
│   Result: MATCH (Strategy 1 succeeded)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Display Filtered Results                                     │
│                                                              │
│ ┌────────────────────────────────────────────────────┐      │
│ │ 🔷 Filtered by: Pablo (1 link)                [×] │      │
│ └────────────────────────────────────────────────────┘      │
│                                                              │
│ ┌────────────────────────────────────────────────────┐      │
│ │ Παῦλος (Paul)                                      │      │
│ │ "Pablo" - ULT                                      │      │
│ └────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Why This Approach Works

### 1. Accurate Cross-Language Matching
- Uses actual alignment data from USFM
- Not based on fuzzy text matching
- Handles language differences (Spanish → Greek)

### 2. Occurrence-Aware
- First "Pablo" → First "Παῦλος" ✅
- Second "de Dios" → Second "Θεοῦ" ✅
- Uses occurrence numbers in semantic IDs

### 3. Multiple Strategies for Robustness
- Primary: Alignment-based (most accurate)
- Fallback 1: Text matching (when alignments unavailable)
- Fallback 2: Quote token text (original language clicks)

### 4. Case-Insensitive for Compatibility
- Handles different ID formats from different sources
- Works with both uppercase and lowercase book codes
- Normalizes Greek/Hebrew character case

## Debugging

### Console Output (Success)

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

[WordsLinksViewer] Sample TWL link structure: {
  origWords: "Παῦλος",
  occurrence: "1",
  hasQuoteTokens: true,
  quoteTokensCount: 1,
  firstQuoteToken: { id: "TIT 1:1:Παῦλος:1", text: "Παῦλος", ... }
}

[WordsLinksViewer] Checking Pablo link: {
  quoteTokenId: "TIT 1:1:Παῦλος:1",
  quoteTokenIdLower: "tit 1:1:παῦλος:1",
  alignedId: "tit 1:1:Παῦλος:1",
  alignedIdLower: "tit 1:1:παῦλος:1",
  matches: true  ◄─── SUCCESS!
}

[WordsLinksViewer] ✅ Match found: {
  linkId: "...",
  origWords: "Παῦλος",
  quoteTokenIds: ["TIT 1:1:Παῦλος:1"],
  hasAlignedMatch: true,
  hasTextMatch: false,
  hasQuoteTokenMatch: false
}

[WordsLinksViewer] Filter results: {
  totalLinks: 12,
  matchedLinks: 1,
  hasMatches: true
}
```

### Troubleshooting

**Problem: No matches found**

1. **Check alignedSemanticIds is populated:**
   ```
   alignedSemanticIds: []  ❌ Empty - no alignment data
   alignedSemanticIds: ["tit 1:1:Παῦλος:1"]  ✅ Good
   ```

2. **Check quoteTokens exist:**
   ```
   hasQuoteTokens: false  ❌ Quote tokens not built
   hasQuoteTokens: true   ✅ Good
   ```

3. **Check ID formats match (after lowercasing):**
   ```
   quoteTokenIdLower: "tit 1:1:παῦλος:1"
   alignedIdLower: "tit 1:1:παῦλος:1"
   matches: true ✅
   ```

4. **Check book code format:**
   - Should be 3-letter code: "tit", "jhn", "mat"
   - Not full name: "titus" ❌

5. **Check occurrence numbers match:**
   - First occurrence: `:1`
   - Second occurrence: `:2`
   - Must match exactly

## Related Documentation

- `TWL_ALIGNMENT_SYSTEM.md` - Complete 3-layer alignment algorithm
- `OCCURRENCE_SEMANTIC_ID_FIX.md` - Occurrence number fix
- `TWL_TOKEN_FILTER_FIX.md` - Fallback to show all links
- `TWL_TOKEN_FILTER_ALIGNMENT_FIX.md` - Alignment-based matching implementation

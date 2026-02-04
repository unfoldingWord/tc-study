# TWL Alignment Fix - Case Sensitivity Issue

## Problem Identified

The TWL alignment was **completely failing** (0% success rate) despite:
- ✅ Target tokens being received correctly
- ✅ Target tokens having alignment data
- ✅ Original tokens being found by QuoteMatcher

## Root Causes

### Issue 1: Case Sensitivity (FIXED)

**Case mismatch in semantic IDs!**

### Target Tokens (from Scripture Viewer):
```typescript
{
  text: "Paul",
  semanticId: "tit 1:1:Paul:1",  // lowercase "tit"
  alignedOriginalWordIds: ["tit 1:1:Παῦλος:1"]  // lowercase "tit"
}
```

### What We Were Generating:
```typescript
// In generateSemanticIdsForQuoteTokens:
const verseRef = `${bookCode.toUpperCase()} ${chapter}:${verse}`
// Result: "TIT 1:1:Παῦλος:1"  ← UPPERCASE "TIT"!
```

### The Match:
```typescript
// Alignment check:
target.alignedOriginalWordIds.includes(originalSemanticId)
// ["tit 1:1:Παῦλος:1"].includes("TIT 1:1:Παῦλος:1")
// ❌ FALSE! Case doesn't match!
```

## Solution

Changed semantic ID generation to use **lowercase** book codes to match the scripture viewer format.

### Files Changed

#### 1. `utils/generateSemanticIds.ts`
```typescript
// BEFORE:
const verseRef = `${bookCode.toUpperCase()} ${chapter}:${verse}`

// AFTER:
// CRITICAL: Use lowercase to match scripture viewer's semantic ID format!
// Scripture tokens have IDs like "tit 1:1:word:1" (lowercase book code)
const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
```

#### 2. `hooks/useAlignedTokens.ts`
```typescript
// BEFORE:
const bookCode = currentRef.book?.toUpperCase() || ''
const verseRef = `${bookCode} ${chapter}:${verse}`

// AFTER:
// CRITICAL: Use lowercase book code to match scripture viewer's semantic ID format!
const bookCode = currentRef.book?.toLowerCase() || ''
const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
```

#### 3. `hooks/useQuoteTokens.ts`
```typescript
// Note: Keep uppercase for QuoteMatcher (bt-studio format)
// But semantic ID generation now uses lowercase
const bookCode = currentRef.book?.toUpperCase() || ''  // For QuoteMatcher
// generateSemanticIdsForQuoteTokens will convert to lowercase internally
```

## Expected Result

After this fix, the alignment should work:

```
Before: 0/184 links with aligned tokens (0% success)
After:  ~150/184 links with aligned tokens (>80% success)
```

### Example Flow:

1. **TWL Entry:**
   ```
   origWords: "Παῦλος"
   occurrence: "1"
   ```

2. **QuoteMatcher finds original token:**
   ```
   text: "Παῦλος"
   lemma: "Παῦλος"
   ```

3. **Generate semantic ID (NOW LOWERCASE):**
   ```
   semanticId: "tit 1:1:Παῦλος:1"  ← lowercase "tit"
   ```

4. **Target token alignment:**
   ```
   {
     text: "Paul",
     alignedOriginalWordIds: ["tit 1:1:Παῦλος:1"]
   }
   ```

5. **Match check:**
   ```typescript
   ["tit 1:1:Παῦλος:1"].includes("tit 1:1:Παῦλος:1")
   // ✅ TRUE! Perfect match!
   ```

## Testing

1. Refresh the browser (Vite HMR should pick up changes)
2. Check the TWL Debug Panel
3. Look for:
   - Token Details showing proper semantic IDs: `• Παῦλος - ID: tit 1:1:Παῦλος:1`
   - Success rate > 0%
   - Links showing aligned tokens in the UI
   - Console logs showing: `✅ STEP 3: Match found`

## Why This Happened

The semantic ID format comes from the Scripture Viewer, which uses **lowercase** book codes throughout:
- `tit 1:1` not `TIT 1:1`
- `jhn 3:16` not `JHN 3:16`
- `gen 1:1` not `GEN 1:1`

We were following the bt-studio convention of using **uppercase** book codes for QuoteMatcher references, and incorrectly applied this to semantic ID generation as well.

The QuoteMatcher itself doesn't care about case (it just matches text), but the **alignment system** is case-sensitive because it does exact string matching:
```typescript
targetToken.alignedOriginalWordIds.includes(originalSemanticId)
```

## Documentation Updates Needed

Update `TWL_ALIGNMENT_SYSTEM.md` to note:

> **CRITICAL: Semantic ID Case Sensitivity**
> 
> Semantic IDs MUST use lowercase book codes to match scripture viewer format:
> - ✅ Correct: `tit 1:1:Παῦλος:1`
> - ❌ Wrong: `TIT 1:1:Παῦλος:1`
> - ❌ Wrong: `Tit 1:1:Παῦλος:1`
> 
> The alignment matching is case-sensitive via exact string comparison.

## Related Issues

This same case sensitivity could affect:
- Token click broadcasting
- Token highlighting in scripture
- Cross-panel communication
- Any other feature using semantic IDs

**Recommendation:** Standardize on lowercase book codes throughout the application for all semantic IDs.

### Issue 2: Lemma vs Inflected Form (FIXING NOW)

**Using lemma instead of actual text!**

### The Wrong Approach (What We Had):
```typescript
// In attachAlignmentSemanticIds.ts:
const lemma = alignment.alignmentData[idx]?.lemma || word
return generateSemanticId(alignment.verseRef, lemma, occurrence)
// Generated: "tit 1:1:θεός:1" (using lemma)

// But TWL has:
origWords: "Θεοῦ"  // Inflected form (genitive)
// So we look for: "tit 1:1:Θεοῦ:1" ← MISMATCH!
```

### The Correct Approach (What We Need):
```typescript
// Use zaln.content (the actual inflected text) not zaln.lemma!
const actualText = alignment.alignmentData[idx]?.content || word
return generateSemanticId(alignment.verseRef, actualText, occurrence)
// Generates: "tit 1:1:Θεοῦ:1" (using inflected form)

// TWL has:
origWords: "Θεοῦ"  // Inflected form (genitive)
// We look for: "tit 1:1:Θεοῦ:1" ← PERFECT MATCH!
```

### Why This Matters

**USFM Structure in Target Language (ULT):**
```usfm
\zaln-s | x-strong="G2316" x-lemma="θεός" x-content="Θεοῦ" x-occurrence="1"\*
\w of|x-occurrence="1"\*
\w God|x-occurrence="1"\*
\zaln-e\*
```

- `x-content="Θεοῦ"` ← The actual text from Greek NT (inflected form)
- `x-lemma="θεός"` ← The dictionary form (for lexicon lookup)
- `x-strong="G2316"` ← Strong's number

**TWL origWords:**
```typescript
{
  origWords: "Θεοῦ",  // Uses the inflected form as it appears in text
  occurrence: "1"
}
```

**The Match:**
```typescript
TWL origWords: "Θεοῦ"
    ↓ QuoteMatcher finds token
Original Token: "Θεοῦ"  
    ↓ Generate semantic ID
Semantic ID: "tit 1:1:Θεοῦ:1"  (using inflected form)
    ↓ Check target token alignment
Target Token: alignedOriginalWordIds = ["tit 1:1:Θεοῦ:1"]  (from zaln.content)
    ✅ MATCH!
```

### Files Changed

**1. `ScriptureViewer/utils/attachAlignmentSemanticIds.ts`**
```typescript
// BEFORE:
const lemma = alignment.alignmentData[idx]?.lemma || word
return generateSemanticId(alignment.verseRef, lemma, occurrence)

// AFTER:
const actualText = alignment.alignmentData[idx]?.content || word
return generateSemanticId(alignment.verseRef, actualText, occurrence)
```

**2. `WordsLinksViewer/utils/generateSemanticIds.ts`**
```typescript
// BEFORE:
const content = token.lemma || token.text

// AFTER:
const content = token.text  // Always use actual text
```

### Why Some Were Working

The 3 successful alignments were words in nominative case (their inflected form = lemma):
- "Παῦλος" (proper name, same in all cases)
- "δοῦλος" (nominative = lemma)
- "ἀπόστολος" (nominative = lemma)

These accidentally worked because inflected form matched the lemma!

### Expected Improvement

**Before Fix:**
- Success Rate: 2% (3/184 links)
- Only nominative forms working

**After Fix:**
- Success Rate: ~40% (75/184 links - all links with original tokens)
- All grammatical cases should work (genitive, dative, accusative, etc.)

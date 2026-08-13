# Critical Fix: Use Inflected Forms (Content) Not Lemmas

## The Problem

We were using **lemmas** (dictionary forms) for semantic IDs, but TWL origWords and USFM `\w` markers contain **inflected forms** (actual text as written).

## Understanding the Data

### Original Language USFM (UGNT - Greek NT)

Original language texts use `\w` markers:
```usfm
\w Θεοῦ|x-lemma="θεός" x-strong="G2316" x-occurrence="1"\w*
```

- Text content: **"Θεοῦ"** (genitive case - "of God")
- Lemma attribute: "θεός" (nominative case - dictionary form)
- This is the actual word as written in the Greek text

### Target Language USFM (ULT - English)

Target language texts use `\zaln` (alignment) markers:
```usfm
\zaln-s | x-strong="G2316" x-lemma="θεός" x-content="Θεοῦ" x-occurrence="1"\*
\w of|x-occurrence="1"\*
\w God|x-occurrence="1"\*
\zaln-e\*
```

- `x-content="Θεοῦ"` ← **The actual inflected text from original**
- `x-lemma="θεός"` ← The dictionary form (for reference)
- `x-strong="G2316"` ← Strong's number

**Key Insight:** `x-content` contains the **inflected form** as it appears in the original text!

### TWL Data Structure

```typescript
{
  reference: "1:1",
  origWords: "Θεοῦ",  // ← Inflected form (genitive)
  occurrence: "1"
}
```

TWL uses the **inflected form** - the actual text as it appears!

## The Matching Chain

```
TWL origWords: "Θεοῦ" (inflected - genitive)
    ↓
Original Token: "Θεοῦ" (from \w marker text)
    ↓
Semantic ID: "tit 1:1:Θεοῦ:1" (using inflected form)
    ↓
Target Token alignedOriginalWordIds: ["tit 1:1:Θεοῦ:1"] (from zaln x-content)
    ✅ MATCH!
```

## Why Using Lemmas Failed

### Example: Word "God" in Different Cases

Greek "θεός" has multiple forms:
- Nominative: θεός (subject)
- Genitive: Θεοῦ (of God)
- Dative: Θεῷ (to/for God)
- Accusative: Θεόν (God as object)

If we use lemmas, ALL these become "θεός" in semantic IDs:
```
"Θεοῦ" → lemma "θεός" → semantic ID "tit 1:1:θεός:1"
"Θεῷ"  → lemma "θεός" → semantic ID "tit 1:1:θεός:1"
"Θεόν" → lemma "θεός" → semantic ID "tit 1:1:θεός:1"
```

But TWL has specific inflected forms:
```
TWL: origWords "Θεοῦ" → looks for "tit 1:1:Θεοῦ:1" ← NOT "tit 1:1:θεός:1"!
```

## The Fix

### Change 1: attachAlignmentSemanticIds.ts

```typescript
// BEFORE:
const lemma = alignment.alignmentData[idx]?.lemma || word
return generateSemanticId(alignment.verseRef, lemma, occurrence)

// AFTER:  
const actualText = alignment.alignmentData[idx]?.content || word
return generateSemanticId(alignment.verseRef, actualText, occurrence)
```

### Change 2: generateSemanticIds.ts

```typescript
// BEFORE:
const content = token.lemma || token.text

// AFTER:
const content = token.text  // Always use actual inflected text
```

## Testing the Fix

### Before:
```
Success: Παῦλος, δοῦλος, ἀπόστολος (3 links)
Failed: Θεοῦ, Ἰησοῦ, Χριστοῦ, etc. (72 links)
Success Rate: 2% (3/184)
```

**Why these 3 worked:** They happened to be in nominative case (inflected form = lemma)

### After:
```
Success: All inflected forms should match
Expected Success Rate: ~40% (75/184 - all links with original tokens found)
```

## Alignment Data Fields Reference

### In USFM alignmentData:
```typescript
interface AlignmentData {
  strong: string    // "G2316" - Strong's number
  lemma: string     // "θεός" - Dictionary form (nominative)
  morph: string     // "N....GMS" - Morphology
  occurrence: string // "1" - Which occurrence
  occurrences: string // "1" - Total occurrences
  content: string   // "Θεοῦ" - ACTUAL INFLECTED TEXT ← USE THIS!
}
```

### Purpose of Each Field:
- **content**: For alignment matching (what we need!)
- **lemma**: For lexicon lookup and study tools
- **strong**: For Strong's concordance lookup
- **morph**: For grammar analysis
- **occurrence/occurrences**: For distinguishing repeated words

## Impact on Documentation

Updated `TWL_ALIGNMENT_SYSTEM.md` to emphasize:
1. Semantic IDs use **inflected forms** (content), not lemmas
2. TWL origWords contains inflected forms
3. Target alignment uses `zaln.content` (inflected form)
4. Lemmas are for dictionary lookup, not for matching

## Related Implications

This same principle applies to:
- Translation Notes (TN) - uses inflected forms in `quote` field
- Any TSV resource - origWords/quote = inflected forms
- Token highlighting - must match actual text
- Cross-panel communication - uses inflected forms

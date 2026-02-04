# TSV Resources Alignment System

## Overview

This document describes the universal alignment algorithm used for all TSV-based translation resources, including:
- **Translation Words Links (TWL)** - Links to translation word articles
- **Translation Notes (TN)** - Translator notes and explanations
- Future TSV resources

The alignment system connects three layers of data to display target language scripture quotes:

```
TSV Quote/origWords → Original Language Tokens → Target Language Tokens → Display
```

This same algorithm works across all TSV resources because they share a common structure with quote text and occurrence numbers.

## The Three Data Layers

### 1. TSV Resource Data (TWL / Translation Notes)

**Source:** Door43 TSV resources
- Translation Words Links: `unfoldingWord/en/twl`
- Translation Notes: `unfoldingWord/en/tn`

**Common TSV Structure (TWL Example):**
```typescript
{
  reference: "1:1",           // Chapter:Verse
  id: string,                 // Unique identifier
  origWords: "Παῦλος",       // Original language text (Greek/Hebrew)
  occurrence: "1",            // Which occurrence of this word in the verse (as string)
  twLink: "rc://*/tw/dict/bible/names/paul"  // Resource-specific data
}
```

**Common TSV Structure (Translation Notes Example):**
```typescript
{
  reference: "1:1",           // Chapter:Verse
  id: string,                 // Unique identifier
  quote: "Παῦλος",           // Original language text (Greek/Hebrew) - SAME as origWords!
  occurrence: "1",            // Which occurrence of this word in the verse (as string)
  note: "...",               // Resource-specific data
  tags: "...",
  supportReference: "..."
}
```

**Key Fields (Common to All TSV Resources):**
- `origWords` / `quote`: The original language text (Greek/Hebrew) that this entry refers to
  - TWL uses `origWords`
  - Translation Notes uses `quote`
  - Both serve the same purpose!
- `occurrence`: Critical for matching the correct instance when a word appears multiple times
  - Always stored as a string (e.g., "1", "2")
  - Must be parsed to integer for matching: `parseInt(occurrence) || 1`
- `reference`: Which verse this entry applies to (format: "chapter:verse")

### 2. Original Language Tokens

**Source:** Parsed from original language scripture (Hebrew Bible, Greek NT)

**Structure:**
```typescript
{
  text: "Παῦλος",                    // The word
  semanticId: "TIT 1:1:Παῦλος:1",   // Unique identifier
  occurrence: 1,                      // Which occurrence in the verse
  verseRef: "TIT 1:1",               // Verse reference
  lemma: "Παῦλος",                   // Dictionary form
  strong: "G3972",                    // Strong's number
  morph: "N....NMS"                   // Morphology
}
```

**Purpose:** These are the "bridge" between TWL and target language. The `semanticId` is the key for alignment.

**Semantic ID Format:** `{bookCode} {chapter}:{verse}:{word}:{occurrence}`
- Example: `TIT 1:1:Παῦλος:1`
- The occurrence number matches the TWL `occurrence` field

### 3. Target Language Tokens

**Source:** Parsed from target language scripture (ULT, UST, etc.)

**Structure:**
```typescript
{
  text: "Paul",                            // The translated word
  semanticId: "TIT 1:1:Paul:1",           // Unique identifier for this token
  occurrence: 1,                           // Which occurrence in the verse
  verseRef: "TIT 1:1",                    // Verse reference
  alignedOriginalWordIds: [                // KEY: Links to original language
    "TIT 1:1:Παῦλος:1"
  ]
}
```

**Critical Field:** `alignedOriginalWordIds` - Contains semantic IDs of original language tokens that this target token translates.

## The Universal TSV Alignment Flow

This algorithm works for **all TSV resources** (TWL, Translation Notes, etc.) because they share the same core structure.

### Step 1: TSV Quote → Original Language Tokens

**Implementation:** `QuoteMatcher.findOriginalTokens()` (from bt-studio)

**Input:** Quote text + occurrence number + verse reference
- TWL: Uses `origWords` field
- Translation Notes: Uses `quote` field
- Any TSV: Any field containing original language text

**Algorithm:**
1. Take quote text (e.g., "Παῦλος")
2. Handle multi-part quotes separated by `&`:
   - First quote uses specified occurrence
   - Subsequent quotes use occurrence 1
   - Search sequentially (next quote starts after previous match)
3. Use QuoteMatcher to find matching tokens in original language scripture
4. Match based on:
   - Normalized word text (handles Hebrew vowel points, Greek diacritics)
   - Verse reference
   - **Occurrence number** (critical!)
   - Position in text (for sequential multi-part quotes)

**Example:**
```typescript
// Single quote
TSV Entry: { origWords: "Παῦλος", occurrence: "1", reference: "1:1" }
↓
Original Token: {
  text: "Παῦλος",
  semanticId: "TIT 1:1:Παῦλος:1",
  occurrence: 1
}

// Multi-part quote (e.g., "Παῦλος & ἀπόστολος")
TSV Entry: { quote: "Παῦλος & ἀπόστολος", occurrence: "2", reference: "1:1" }
↓
// First part uses occurrence 2, second part uses occurrence 1 after first match
Original Tokens: [
  { text: "Παῦλος", semanticId: "TIT 1:1:Παῦλος:2", occurrence: 2 },
  { text: "ἀπόστολος", semanticId: "TIT 1:1:ἀπόστολος:1", occurrence: 1 }
]
```

**Special Handling:**
- **Hebrew text**: Removes vowel points, cantillation marks, maqaf
- **Greek text**: Normalizes diacritics, lowercase comparison
- **Flexible matching**: For Hebrew, allows words in different order if exact match fails

### Step 2: Original Language Tokens → Target Language Tokens

**Implementation:** `QuoteMatcher.findAlignedTokens()` (from bt-studio)

**Algorithm:**
1. Extract semantic IDs from original language tokens found in Step 1
2. Get verses in the target language for the reference range
3. For each original token:
   - Find corresponding verse in target language
   - Search through all target tokens in that verse
   - Check if target token's `align` array contains the original token's semantic ID
4. Collect all matching target tokens

**Example:**
```typescript
Original Token: {
  id: "TIT 1:1:Παῦλος:1",  // This is the semantic ID
  text: "Παῦλος"
}
↓
Target Token: {
  text: "Paul",
  align: ["TIT 1:1:Παῦλος:1"]  // ✅ MATCH! Uses 'align' array
}
```

**Alignment Matching (bt-studio implementation):**
```typescript
function isTokenAlignedBySemantic(originalToken, targetToken) {
  if (!targetToken.align) return false
  
  // Check if target token's align array contains the original token's ID
  return targetToken.align.includes(originalToken.id)
}
```

**Note on Field Names:**
- bt-studio uses `align` array and `id` for semantic ID
- bt-synergy uses `alignedOriginalWordIds` and `semanticId`
- The concept is identical: target tokens reference original tokens by ID

### Step 3: Display

**Usage:** Display aligned target tokens in UI

**Display Logic:**
```typescript
// Only display if we successfully built target language tokens
{alignedTokens && alignedTokens.length > 0 && (
  <div className="quote">
    {alignedTokens.map(token => token.content || token.text).join(' ')}
  </div>
)}
```

**Visual Highlighting:**
Both bt-studio and bt-synergy support visual highlighting of matched tokens in the scripture viewer:
- Each TSV entry gets assigned a color
- Matched tokens in scripture are underlined with that color
- User can see which words the note/link refers to

## Key Concepts

### Semantic IDs

Semantic IDs are the "glue" that connects original and target language tokens.

**Format:** `{bookCode} {chapter}:{verse}:{word}:{occurrence}`

**CRITICAL - Case Sensitivity:**
> ⚠️ Semantic IDs MUST use **lowercase** book codes to match scripture viewer format!
> 
> - ✅ Correct: `tit 1:1:Παῦλος:1`
> - ❌ Wrong: `TIT 1:1:Παῦλος:1`
> - ❌ Wrong: `Tit 1:1:Παῦλος:1`
> 
> The alignment matching uses exact string comparison (`includes()`), so case matters!

**CRITICAL - Inflected Form (Content) vs Lemma:**
> ⚠️ Semantic IDs MUST use **inflected forms** (actual text) not lemmas!
> 
> Greek Example:
> - ✅ Correct: `tit 1:1:Θεοῦ:1` (inflected - genitive "of God" as written)
> - ❌ Wrong: `tit 1:1:θεός:1` (lemma - nominative dictionary form)
> 
> Hebrew Example:
> - ✅ Correct: `gen 1:1:הָאֱלֹהִים:1` (inflected - with definite article as written)
> - ❌ Wrong: `gen 1:1:אֱלֹהִים:1` (lemma - without article)
> 
> **Why:** TWL origWords contains the text as it appears in scripture (e.g., "Θεοῦ").
> The USFM `\zaln` markers in target language texts have:
> - `content`: The actual original text (e.g., "Θεοῦ") - **USE THIS!**
> - `lemma`: The dictionary form (e.g., "θεός") - NOT for matching
> - `strong`: Strong's number (e.g., "G2316")
> 
> **Example from ULT USFM:**
> ```
> \zaln-s | x-strong="G2316" x-lemma="θεός" x-content="Θεοῦ" x-occurrence="1"\*
> \w of|x-occurrence="1"\*
> \w God|x-occurrence="1"\*
> \zaln-e\*
> ```
> 
> Target token "of" gets semantic ID: `tit 1:1:Θεοῦ:1` (using `x-content`, not `x-lemma`)

**Examples:**
- Original: `tit 1:1:Παῦλος:1` (lowercase "tit")
- Target: `tit 1:1:Paul:1` (lowercase "tit")

**Why occurrence matters:**
```
Verse: "Paul, Paul went to Rome"
- First "Paul": occurrence = 1, semanticId = "...:Paul:1"
- Second "Paul": occurrence = 2, semanticId = "...:Paul:2"
```

Without occurrence numbers, we can't distinguish between multiple instances of the same word.

### Alignment Data

Alignment data comes from word alignment tools (UGNT/UHB aligned to ULT/UST).

**Stored in:** `alignedOriginalWordIds` property of target tokens

**Example Alignment:**
```typescript
// Original: "ἐν ἀρχῇ" (en arche - "in beginning")
// Target: "In the beginning"

Target Token "In": {
  alignedOriginalWordIds: ["GEN 1:1:ἐν:1"]
}

Target Token "beginning": {
  alignedOriginalWordIds: ["GEN 1:1:ἀρχῇ:1"]
}
```

**Multi-word alignments** (one target word = multiple original words):
```typescript
Target Token "beginning": {
  alignedOriginalWordIds: [
    "GEN 1:1:ἐν:1",
    "GEN 1:1:ἀρχῇ:1"
  ]
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────┐
│   TSV Resource (TWL or TN)          │
│   quote/origWords: "Παῦλος"         │
│   occurrence: "1"                   │
│   reference: "1:1"                  │
│   + resource-specific fields        │
└───────────┬─────────────────────────┘
            │
            ▼
    ┌───────────────────────────────┐
    │  STEP 1: QuoteMatcher         │
    │  findOriginalTokens()         │
    │  - Normalize text             │
    │  - Handle multi-part quotes   │
    │  - Match by occurrence        │
    └───────┬───────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ Original Language Tokens            │
│ (Hebrew Bible / Greek NT)           │
│                                     │
│ text: "Παῦλος"                      │
│ id/semanticId: "TIT 1:1:Παῦλος:1"  │
│ occurrence: 1                       │
│ lemma: "Παῦλος"                     │
│ strong: "G3972"                     │
└───────────┬─────────────────────────┘
            │
            ▼
    ┌───────────────────────────────┐
    │  STEP 2: QuoteMatcher         │
    │  findAlignedTokens()          │
    │  - Match by semantic ID       │
    │  - Check align array          │
    └───────┬───────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│  Target Language Tokens             │
│  (ULT, UST, Gateway Language)       │
│                                     │
│  text: "Paul"                       │
│  id/semanticId: "TIT 1:1:Paul:1"    │
│  align/alignedOriginalWordIds:      │
│    ["TIT 1:1:Παῦλος:1"]            │
└───────────┬─────────────────────────┘
            │
            ▼
    ┌─────────────────────────────┐
    │  STEP 3: Display            │
    │  - Show aligned tokens      │
    │  - Highlight in scripture   │
    │  - Color-code by entry      │
    └─────────────────────────────┘
```

## Common Failure Points

### 1. No Original Language Tokens Found (Step 1 Failure)

**Symptom:** TSV entries show quote/origWords but no aligned tokens

**Causes:**
- QuoteMatcher can't find the original text in the original scripture
- Occurrence number mismatch
- Text normalization issues (especially Hebrew with vowel points)
- Original language scripture not loaded or wrong testament
- Multi-part quote (`&` separator) parsing issues

**Debug:**
- Check STEP 1/STEP 2 logs for quote token building
- Verify occurrence number is valid integer
- Check text normalization (Hebrew vowel points, Greek diacritics)
- Try flexible Hebrew matching for out-of-order words

### 2. No Target Language Tokens Found (Step 2 Failure)

**Symptom:** Original tokens found but no aligned tokens

**Causes:**
- Target scripture not loaded or not broadcasting tokens
- No alignment data in target tokens (`align`/`alignedOriginalWordIds` is empty)
- Semantic ID format mismatch between original and target
- Verse reference mismatch
- Target scripture not properly aligned to original

**Debug:**
- Check STEP 3 logs for alignment matching
- Verify target tokens have `align` array populated
- Check semantic ID format matches between systems
- Verify alignment data exists for this verse

### 3. Wrong Occurrence Matched

**Symptom:** Aligned tokens show the wrong word instance

**Causes:**
- Occurrence number not being considered in matching
- Occurrence numbers not starting at 1 (off-by-one error)
- Occurrence string not parsed to integer
- Occurrence calculation differs between TSV and scripture
- Sequential multi-part quotes not handling position correctly

**Debug:**
- Verify `parseInt(occurrence) || 1` is used
- Check occurrence counting in both TSV and scripture
- For multi-part quotes, verify sequential search positions

### 4. Multi-Part Quote Issues

**Symptom:** Only first part of quote matched, or wrong parts matched

**Causes:**
- `&` separator not being split correctly
- Sequential search not starting after previous match
- Second quote using wrong occurrence (should be 1)
- Position tracking not updated between quote parts

**Debug:**
- Check quote splitting logic
- Verify sequential search position updates
- Confirm first quote uses specified occurrence, others use 1

## Implementation Files

### bt-studio (Reference Implementation)

**Core Algorithm:**
- `quote-matcher.ts` - Complete QuoteMatcher class with both steps
  - `findOriginalTokens()` - Step 1: TSV → Original Language
  - `findAlignedTokens()` - Step 2: Original → Target Language
  - Text normalization (Hebrew, Greek)
  - Multi-part quote handling (`&` separator)
  - Flexible Hebrew matching

**Components:**
- `NotesViewer.tsx` - Translation Notes implementation
- `TranslationWordsLinksViewer.tsx` - TWL implementation
- `USFMRenderer.tsx` - Scripture display with token highlighting

**Data Processors:**
- `notes-processor.ts` - TSV parsing for Translation Notes
- `Door43TranslationNotesAdapter.ts` - Notes adapter
- `Door43TranslationWordsLinksAdapter.ts` - TWL adapter
- `usfm-processor.ts` - Scripture parsing with alignment data

### bt-synergy (React Port)

**Core Hooks:**
- `useQuoteTokens.ts` - Step 1: TSV → Original Language (ports QuoteMatcher)
- `useAlignedTokens.ts` - Step 2: Original → Target Language
- `useScriptureTokens.ts` - Receives target language token broadcasts

**Utilities:**
- `buildQuoteTokens.ts` - QuoteMatcher logic (ported from bt-studio)
- `generateSemanticIds.ts` - Semantic ID generation
- `useTokenBroadcast.ts` - Scripture token broadcasting

**Components:**
- `WordLinkCard.tsx` - Displays aligned tokens for TWL
- `WordsLinksViewer/index.tsx` - Main TWL viewer
- `TWLDebugPanel.tsx` - Debug visualization

### Shared Concepts

Both implementations share:
- Semantic ID format: `{book} {chapter}:{verse}:{word}:{occurrence}`
- Occurrence-based matching
- Text normalization strategies
- Multi-part quote handling
- Alignment via semantic IDs

## Key Algorithm Details from bt-studio

### Multi-Part Quote Handling

```typescript
// Quote: "Παῦλος & ἀπόστολος", occurrence: 2

// Split by &
const quotes = quote.split('&').map(q => q.trim())
// => ["Παῦλος", "ἀπόστολος"]

// First quote uses specified occurrence (2)
const firstMatch = findMatch("Παῦλος", occurrence: 2)

// Second quote searches AFTER first match, uses occurrence 1
const secondMatch = findMatch("ἀπόστολος", occurrence: 1, startAfter: firstMatch)
```

### Text Normalization

**Hebrew:**
```typescript
function normalizeHebrewText(text: string): string {
  return text
    .replace(/־/g, ' ')           // Maqaf to space
    .replace(/[׃׀]/g, '')         // Remove punctuation
    .replace(/[\u0591-\u05AF...]/g, '')  // Remove cantillation
    .replace(/[\u05B0-\u05BC]/g, '')     // Remove vowel points
    .trim()
    .toLowerCase()
}
```

**Greek:**
```typescript
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // Remove punctuation
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim()
}
```

### Occurrence Counting

**In Scripture:**
```typescript
// Words are counted as they appear in order
// Each unique position gets an occurrence number
const occurrences = new Map<string, number>()

for (const token of tokens) {
  const normalized = normalizeText(token.text)
  const count = (occurrences.get(normalized) || 0) + 1
  occurrences.set(normalized, count)
  
  token.occurrence = count
  token.semanticId = `${book} ${chapter}:${verse}:${token.text}:${count}`
}
```

**In TSV:**
```typescript
// Occurrence is stored as string, must parse
const occurrence = Math.max(1, parseInt(tsvEntry.occurrence || '1'))
```

## TSV Resource Compatibility

This algorithm is designed to work with **any** TSV resource that has:
1. A quote/origWords field (original language text)
2. An occurrence field (which instance of the text)
3. A reference field (chapter:verse)

**Supported Resources:**
- ✅ Translation Words Links (TWL) - Uses `origWords`
- ✅ Translation Notes (TN) - Uses `quote`
- ✅ Translation Questions (TQ) - Could use `quote` if implemented
- ✅ Any future TSV format with quote+occurrence

**Unsupported Resources:**
- ❌ Resources without original language text
- ❌ Resources without occurrence numbers
- ❌ Non-TSV formats

## Testing Checklist

### Core Functionality
- [ ] TSV origWords/quote matches original language scripture
- [ ] Occurrence numbers correctly match word instances
- [ ] Original language tokens have correct semantic IDs
- [ ] Target language tokens have `align`/`alignedOriginalWordIds`
- [ ] Semantic ID format matches between original and target
- [ ] Multiple occurrences of same word handled correctly
- [ ] Multi-word phrases aligned correctly
- [ ] Target tokens displayed in correct order

### Text Normalization
- [ ] Hebrew text with vowel points matches correctly
- [ ] Hebrew text with cantillation marks matches correctly
- [ ] Greek text with diacritics matches correctly
- [ ] Punctuation in quotes handled correctly
- [ ] Whitespace differences handled correctly

### Multi-Part Quotes
- [ ] Quotes with `&` separator split correctly
- [ ] First part uses specified occurrence
- [ ] Second part uses occurrence 1
- [ ] Sequential search finds correct positions
- [ ] All parts combined into single token set

### Edge Cases
- [ ] Occurrence 1 when field is empty or "0"
- [ ] Testament detection (OT vs NT) works correctly
- [ ] Verse ranges handled correctly
- [ ] Missing alignment data fails gracefully
- [ ] Invalid occurrence values default to 1

### Cross-Resource Testing
- [ ] Works with Translation Words Links
- [ ] Works with Translation Notes
- [ ] Same tokens highlighted for same quote across resources

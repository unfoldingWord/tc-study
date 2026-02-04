# TSV Alignment Algorithm Testing

This directory contains tools for testing and demonstrating the TSV alignment algorithm with real Door43 data.

## Files

### Documentation
- **`TWL_ALIGNMENT_SYSTEM.md`** - Complete documentation of the TSV alignment algorithm

### Testing Scripts
- **`test-tsv-alignment.ts`** - Demonstrates the alignment algorithm step-by-step with detailed logging
- **`fetch-door43-data.ts`** - Fetches real data from Door43 API for testing

## Quick Start

### 1. Run with Mock Data (Immediate)

The test script includes realistic mock data that demonstrates the complete algorithm:

```bash
# Test with default data (Titus 1:1)
bun run test-tsv-alignment.ts

# Test with specific verse
bun run test-tsv-alignment.ts jhn 3 16
```

**Output:**
- Step-by-step walkthrough of the alignment process
- Detailed logging at each stage
- Visual representation of token matching
- Final aligned results

### 2. Fetch Real Data from Door43

Download actual TWL and scripture data from Door43:

```bash
# Fetch data for Titus chapter 1
bun run fetch-door43-data.ts tit 1

# Fetch data for John chapter 3
bun run fetch-door43-data.ts jhn 3
```

**Output:**
- Creates `./test-data/` directory
- Saves TWL entries, original scripture, and target scripture as JSON files
- Creates combined test file for easy loading

### 3. Test with Real Data

```bash
# Use the fetched data
bun run test-tsv-alignment.ts --file=./test-data/tit_ch1_complete.json
```

## What the Test Script Demonstrates

### Step 1: TSV Entry → Original Language Tokens

Shows how TWL `origWords` field is matched to original language (Hebrew/Greek) tokens:

```
📋 STEP 1: TSV Entry → Original Language Tokens
═══════════════════════════════════════════════

📥 Input:
  TWL Entry: { origWords: "Παῦλος", occurrence: "1", ... }
  Available Original Tokens: 5

🔢 Parsed occurrence: "1" → 1

🔤 Normalized quote: "Παῦλος" → "παυλος"

🔍 Searching for matches...
  Match 1: "Παῦλος" (semantic ID: TIT 1:1:Παῦλος:1)
  ✅ Found target occurrence 1!

✅ Step 1 Complete!
  Found 1 original token(s)
  Semantic IDs: ["TIT 1:1:Παῦλος:1"]
```

### Step 2: Original → Target Language Tokens

Shows how original tokens are aligned to target language (English) tokens via semantic IDs:

```
🔗 STEP 2: Original Tokens → Target Language Tokens
═══════════════════════════════════════════════

📥 Input:
  Original Tokens: 1
  Semantic IDs: ["TIT 1:1:Παῦλος:1"]
  Available Target Tokens: 8

🔍 Searching for aligned target tokens...
  Match: "Paul" at position 0
    Aligns to: TIT 1:1:Παῦλος:1

✅ Step 2 Complete!
  Found 1 aligned target token(s)
  Target words: Paul
```

### Final Result

Displays the complete alignment with all technical details:

```
🎉 FINAL RESULT: Complete Alignment
═══════════════════════════════════

📊 Summary:
  TSV Quote: "Παῦλος" (occurrence 1)
  ✅ Original Tokens: Παῦλος
  ✅ Target Tokens: Paul

🎯 What the User Sees:
  Original: "Παῦλος"
  Translation: "Paul"

📝 Technical Details:
  Original Token IDs:
    - TIT 1:1:Παῦλος:1 "Παῦλος" (G3972)
  Target Token IDs:
    - TIT 1:1:Paul:1 "Paul"
      Aligns to: TIT 1:1:Παῦλος:1
```

## Understanding the Output

### Color Coding (in terminal)
- **Green (✅)**: Successful match/step
- **Red (❌)**: Failed match/step
- **Yellow (⚠️)**: Warning or skipped step
- **Blue (📋, 🔗, 🎉)**: Section headers

### Key Fields Explained

**Semantic ID Format:** `{book} {chapter}:{verse}:{word}:{occurrence}`
- Example: `TIT 1:1:Παῦλος:1`
- Book: TIT (Titus)
- Chapter: 1
- Verse: 1
- Word: Παῦλος (Paul)
- Occurrence: 1 (first instance of this word in the verse)

**Occurrence Numbers:**
- Critical for distinguishing multiple instances of the same word
- TWL stores as string (`"1"`, `"2"`) - must parse to integer
- Always defaults to 1 if missing or invalid

**Aligned IDs:**
- Target tokens have `alignedOriginalWordIds` array
- Contains semantic IDs of original tokens they translate
- Used to connect original and target languages

## Testing Different Scenarios

### Test Single Word
```bash
bun run test-tsv-alignment.ts tit 1 1
# Tests: Παῦλος → Paul
```

### Test Multiple Occurrences
```bash
bun run test-tsv-alignment.ts jhn 1 1
# Tests words that appear multiple times in the same verse
```

### Test Multi-Part Quotes (with &)
```typescript
// Manually edit mock data to include:
{
  origWords: "Παῦλος & ἀπόστολος",
  occurrence: "1"
}
```

### Test Hebrew Text
```bash
bun run fetch-door43-data.ts gen 1
bun run test-tsv-alignment.ts gen 1 1
# Tests Hebrew normalization (vowel points, cantillation)
```

## Common Test Results

### ✅ Success
All steps complete, target tokens found

### ⚠️ Step 1 Failed
- Quote not found in original scripture
- Occurrence number mismatch
- Text normalization issue
- Check: Does the original scripture contain this word?

### ⚠️ Step 2 Failed
- No alignment data in target tokens
- Semantic ID mismatch
- Target scripture not aligned
- Check: Does the target have `alignedOriginalWordIds`?

## Extending the Tests

### Add Your Own Test Data

1. Create a JSON file in `./test-data/`:

```json
{
  "config": {
    "book": "tit",
    "chapter": 1
  },
  "twl": {
    "entries": [
      {
        "reference": "1:1",
        "origWords": "Παῦλος",
        "occurrence": "1",
        "twLink": "..."
      }
    ]
  },
  "original": {
    "chapters": [ /* tokens */ ]
  },
  "target": {
    "chapters": [ /* tokens */ ]
  }
}
```

2. Run the test:
```bash
bun run test-tsv-alignment.ts --file=./test-data/your-file.json
```

### Modify the Algorithm

The test scripts use simplified versions of the real algorithms for clarity. To test modifications:

1. Edit `test-tsv-alignment.ts`
2. Modify the `findOriginalTokens()` or `findAlignedTokens()` functions
3. Run the test to see results
4. Compare with the real implementation in the packages

## Integration with Real Code

These test scripts demonstrate the same algorithm used in production:

**Production Code (bt-studio):**
- `quote-matcher.ts` - Complete implementation
- `NotesViewer.tsx` - Translation Notes
- `TranslationWordsLinksViewer.tsx` - TWL

**Production Code (bt-synergy):**
- `useQuoteTokens.ts` - Step 1 implementation
- `useAlignedTokens.ts` - Step 2 implementation
- `buildQuoteTokens.ts` - QuoteMatcher port

The test scripts use simpler, more readable versions to help understand the concepts before diving into the production code.

## Troubleshooting

### "Module not found: @bt-synergy/door43-api"

Make sure you're in the monorepo root and have installed dependencies:
```bash
bun install
```

### "Test data not found"

Run the fetch script first:
```bash
bun run fetch-door43-data.ts [book] [chapter]
```

### "All tests show mock data"

This is expected! The Door43 API integration is coming soon. The mock data is realistic and demonstrates the full algorithm.

## Next Steps

1. **Read the documentation:** See `TWL_ALIGNMENT_SYSTEM.md` for complete details
2. **Run the tests:** Try different books and verses
3. **Examine the code:** Look at the production implementations
4. **Contribute:** Help add real Door43 API fetching!

## Related Files

- **Documentation:** `TWL_ALIGNMENT_SYSTEM.md`
- **Debug UI:** `src/components/resources/WordsLinksViewer/components/TWLDebugPanel.tsx`
- **Debug Instructions:** `src/components/resources/WordsLinksViewer/DEBUG_TOOL_INSTRUCTIONS.md`

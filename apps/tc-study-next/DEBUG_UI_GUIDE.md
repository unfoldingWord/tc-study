# Debug UI Guide - TWL Token Filtering

**Purpose:** Visual debugging of TWL token filtering in the UI

## What You'll See

**Refresh your browser** and click any word in scripture. Each TWL card will now show:

### 🐛 Debug IDs Section (Purple Box)
**"Clicked Token"** - What you clicked:
```
Content: Pablo
ID: tit 1:1:Pablo:1
Aligned IDs:
  tit 1:1:Παῦλος:1
```

This shows:
- The word you clicked ("Pablo")
- Its semantic ID in the target language
- **CRITICAL:** The aligned IDs pointing to original language (Greek/Hebrew)

### 📘 Quote Tokens Section (Blue Box)
**"This Link's Quote Tokens"** - What this TWL link has:
```
Quote Tokens (1):
  Παῦλος
  ID: TIT 1:1:Παῦλος:1
  Lowercase: tit 1:1:παῦλος:1
```

Shows each token in the TWL's quote:
- The Greek/Hebrew text
- The token ID (UPPERCASE book code from QuoteMatcher)
- Lowercase version (for comparison)

### ✅ Comparison Section (Green Box)
**Shows if they match:**
```
✅ tit 1:1:παῦλος:1 MATCHES!
```

or

```
❌ tit 1:1:παῦλος:1
```

## What to Look For

### ✅ Success Case (Should Match)

Click "Pablo" in Spanish:

**Purple Box (Clicked):**
- Aligned IDs: `tit 1:1:Παῦλος:1`

**Blue Box (TWL Link for "Παῦλος"):**
- ID: `TIT 1:1:Παῦλος:1`
- Lowercase: `tit 1:1:παῦλος:1`

**Green Box:**
- ✅ `tit 1:1:παῦλος:1 MATCHES!`

**UI Should Show:**
- Blue banner: "Filtered by: Pablo (1 link)"
- Only the "Παῦλος" TWL card

### ❌ Common Issues

**Issue 1: No Quote Tokens**
```
This Link's Quote Tokens (0):
  No quote tokens!
```
- **Problem:** Quote building failed
- **Check:** Original language content loaded?

**Issue 2: Empty Aligned IDs**
```
Clicked Token:
  Content: Pablo
  Aligned IDs: (none shown)
```
- **Problem:** Scripture token has no alignment data
- **Check:** USFM has ZALN markers?

**Issue 3: ID Format Mismatch**
```
Purple: tit 1:1:Pablo:1
Blue: TIT 1:1:Παῦλος:1
Green: ❌ (no match)
```
- **Problem:** Even after lowercasing, IDs don't match
- **Possible causes:**
  - Book code format different
  - Occurrence number mismatch
  - Text encoding issue (Greek letters)

**Issue 4: Case Sensitivity Not Working**
```
Purple: tit 1:1:Παῦλος:1
Blue: TIT 1:1:Παῦλος:1
Green: ❌ (should be ✅)
```
- **Problem:** Lowercase comparison not working
- **Check:** Code doing `.toLowerCase()` on both?

## Quick Test Checklist

1. **Click "Pablo"**
   - [ ] Purple box shows aligned ID
   - [ ] Blue box shows quote token ID
   - [ ] Green box shows ✅ match
   - [ ] Only 1 TWL card shown (filtered)

2. **Click "Dios" (2nd occurrence)**
   - [ ] Purple box shows `:2` in aligned ID
   - [ ] Blue box shows `:2` in quote token ID
   - [ ] Green box shows ✅ match
   - [ ] Only correct occurrence TWL shown

3. **Click "the" (no TWL)**
   - [ ] Amber banner: "No matches"
   - [ ] All TWL cards shown (fallback)

4. **Visual Check All Cards**
   - [ ] Each card shows its quote tokens
   - [ ] IDs visible and readable
   - [ ] Comparison result clear (✅/❌)

## What This Reveals

### If No Matches When Should Match:

1. **Check Purple Box:** Are alignedSemanticIds populated?
2. **Check Blue Box:** Do quote tokens exist?
3. **Check Green Box:** What's the exact comparison result?
4. **Compare IDs character-by-character:**
   - Book code: `tit` vs `TIT` (should both be lowercase in comparison)
   - Chapter/verse: `1:1` should match
   - Word: `Παῦλος` (check Greek letters match)
   - Occurrence: `:1` should match

### If Matching Works:

- Green box should show ✅ for matching cards
- Filter should show only those cards
- Blue banner should appear

## Disable Debug UI

Once filtering works, to disable:

In `index.tsx`:
```typescript
<WordLinkCard
  ...
  showDebugIds={false}  // Change to false
/>
```

Or remove the debug section entirely from `WordLinkCard.tsx`.

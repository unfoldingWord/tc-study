# Versification Implementation

## Overview
The application now supports verse counts per chapter through two pathways, ensuring accurate Book-Chapter-Verse (BCV) navigation.

## Pathways Implemented

### 1. Standard Versification (Fallback)
**Source:** `versification-specification` workspace → `org.json`

**Location:** `apps/tc-study/src/lib/versification.ts`

**Features:**
- Complete verse count data for all 66 books of the Bible
- Based on the original versification (unfoldingWord standard)
- Used as the default/fallback when content metadata is unavailable
- Includes both Old Testament and New Testament books

**API:**
```typescript
// Get verse counts for a specific book
const verses = getStandardVerseCount('gen') // [31, 25, 24, ...]

// Get all available books
const books = getStandardBooks() // ['gen', 'exo', 'lev', ...]
```

### 2. Content-Based Versification (Dynamic)
**Source:** Parsed USFM content → `metadata.chapterVerseMap`

**Implementation:** 
- `useContent.ts` hook extracts verse counts from loaded content
- `NavigationContext.updateBookVerseCount()` updates the navigation state
- Automatically applied when scripture content is loaded

**Process:**
1. User clicks on a scripture resource → sets as anchor
2. `useContent` loads USFM content for current book
3. Extracts actual verse counts from `chapterVerseMap`
4. Updates `NavigationContext` with real counts
5. BCVNavigator uses updated counts for verse grid

**Benefits:**
- Handles custom versifications (LXX, Vulgate, Ethiopian, etc.)
- Accurate for resources with alternate verse numbering
- Adapts to the actual content structure

## Integration Points

### useTOC Hook
**File:** `apps/tc-study/src/components/resources/ScriptureViewer/hooks/useTOC.ts`

**Changes:**
- Imports `getStandardVerseCount()` utility
- Populates `verses` array in `BookInfo` using standard versification
- Updates chapter counts based on verse array length

**Result:**
```typescript
{
  code: 'gen',
  name: 'GEN',
  chapters: 50,
  verses: [31, 25, 24, 26, ...] // 50 chapter verse counts
}
```

### useContent Hook
**File:** `apps/tc-study/src/components/resources/ScriptureViewer/hooks/useContent.ts`

**Changes:**
- Imports `extractVerseCountsFromContent()` utility
- Imports `useNavigation()` hook
- Extracts verse counts from `metadata.chapterVerseMap` when content loads
- Calls `navigation.updateBookVerseCount()` to update state

**Result:**
- Dynamic verse counts override standard versification
- Navigation uses actual resource structure

### NavigationContext
**File:** `apps/tc-study/src/contexts/NavigationContext.tsx`

**Changes:**
- Added `updateBookVerseCount(bookCode, verses)` action
- Updates specific book's verse count in `availableBooks` state
- Provides real-time verse count updates

**API:**
```typescript
navigation.updateBookVerseCount('gen', [31, 25, 24, ...])
```

## Versification Utilities

### File: `apps/tc-study/src/lib/versification.ts`

**Exports:**

1. **`getStandardVerseCount(bookCode: string): number[] | undefined`**
   - Returns verse counts for a book from standard versification
   - Example: `getStandardVerseCount('tit')` → `[16, 15, 15]`

2. **`getStandardBooks(): string[]`**
   - Returns all available book codes
   - Example: `['gen', 'exo', 'lev', ..., 'rev']`

3. **`extractVerseCountsFromContent(chapterVerseMap: Record<string, number>): number[]`**
   - Extracts verse counts from USFM metadata
   - Example: `{ '1': 16, '2': 15, '3': 15 }` → `[16, 15, 15]`

4. **`getVerseCount(bookCode: string, contentMetadata?: {...}): number[]`**
   - Smart function with fallback strategy:
     1. Try content metadata first
     2. Fall back to standard versification
   - Always returns valid verse counts

## BCVNavigator Integration

**File:** `apps/tc-study/src/components/studio/BCVNavigator.tsx`

**How it works:**
1. Gets `availableBooks` from `useAvailableBooks()` hook
2. Selected book's `verses` array provides verse counts per chapter
3. Generates verse grid based on actual verse counts:
   ```typescript
   bookInfo.verses.forEach((verseCount, chapterIndex) => {
     const chapter = chapterIndex + 1
     for (let verse = 1; verse <= verseCount; verse++) {
       verses.push({ chapter, verse, key: `${chapter}:${verse}` })
     }
   })
   ```
4. User can select verse ranges by clicking start and end verses
5. Supports cross-chapter ranges (e.g., TIT 1:15-2:5)

## Data Flow

```
1. User clicks scripture resource
   ↓
2. useTOC sets anchor resource
   → Populates BookInfo with standard verse counts
   ↓
3. useContent loads book content
   → Extracts actual verse counts from metadata
   → Updates NavigationContext
   ↓
4. BCVNavigator opens
   → Uses updated verse counts
   → Generates accurate verse grid
   ↓
5. User selects verses
   → Navigation uses correct verse boundaries
```

## Example Scenarios

### Scenario 1: Standard Resource (ULT, UST)
```typescript
// Initial TOC load
BookInfo { code: 'tit', chapters: 3, verses: [16, 15, 15] } // from standard

// Content loads (if standard versification)
// No update needed, counts match

// BCVNavigator displays
// 3 chapters: Ch1 (16 verses), Ch2 (15 verses), Ch3 (15 verses)
```

### Scenario 2: LXX Resource (Different Versification)
```typescript
// Initial TOC load
BookInfo { code: 'psa', chapters: 150, verses: [...] } // from standard

// Content loads (LXX has different verse counts)
metadata.chapterVerseMap: { '1': 6, '2': 12, '3': 9, ... }

// NavigationContext updates
BookInfo { code: 'psa', chapters: 150, verses: [6, 12, 9, ...] } // from LXX

// BCVNavigator displays
// Accurate LXX verse counts
```

## Benefits

### ✅ Accurate Navigation
- Verse grid matches actual resource structure
- No missing or extra verses in selection

### ✅ Flexible Versification
- Supports standard (org)
- Supports LXX, Vulgate, Ethiopian, RSO, RSC
- Adapts to any custom versification

### ✅ Performance
- Standard versification loads instantly (no API calls)
- Dynamic updates only when content changes
- Cached in NavigationContext state

### ✅ Fallback Strategy
- Always has verse counts available
- Graceful degradation if metadata missing
- Works even with incomplete data

## Future Enhancements

- [ ] Load versification from resource metadata if specified
- [ ] Support verse bridges (e.g., "1-2" in some translations)
- [ ] Highlight verses differently based on versification
- [ ] Show versification name in UI (org, lxx, vul, etc.)
- [ ] Versification comparison view

## Related Files

- `apps/tc-study/src/lib/versification.ts` - Versification utilities
- `apps/tc-study/src/contexts/NavigationContext.tsx` - Navigation state with verse counts
- `apps/tc-study/src/components/resources/ScriptureViewer/hooks/useTOC.ts` - TOC with standard versification
- `apps/tc-study/src/components/resources/ScriptureViewer/hooks/useContent.ts` - Content-based verse count extraction
- `apps/tc-study/src/components/studio/BCVNavigator.tsx` - Verse grid using verse counts
- `C:\Users\LENOVO\Git\Github\versification-specification\versification-mappings\standard-mappings\org.json` - Source data

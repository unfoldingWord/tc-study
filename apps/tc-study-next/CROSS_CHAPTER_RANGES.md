# Cross-Chapter Range Support

## Overview
The scripture viewer now fully supports cross-chapter verse ranges, matching the mobile app behavior. Users can select and view scripture passages that span multiple chapters (e.g., TIT 1:15-2:5).

## Implementation

### 1. useContent Hook
**File:** `apps/tc-study/src/components/resources/ScriptureViewer/hooks/useContent.ts`

**Changes:**
- Replaced single `currentChapter` logic with `relevantChapters` array
- Loads all chapters within the reference range
- Filters verses from each chapter based on range boundaries
- Adds `chapterNumber` metadata to each verse for rendering

**Before:**
```typescript
// Only loaded single chapter
const currentChapter = loadedContent.chapters.find(ch => ch.number === currentRef.chapter)

// Only filtered verses in that chapter
const verses = currentChapter.verses.filter(v => v.number >= start && v.number <= end)
```

**After:**
```typescript
// Loads all chapters in range
const relevantChapters = loadedContent.chapters.filter(
  ch => ch.number >= startChapter && ch.number <= endChapter
)

// Filters verses from each chapter
for (const chapter of relevantChapters) {
  const chapterVerses = chapter.verses
    .filter(v => v.number >= start && v.number <= end)
    .map(v => ({ ...v, chapterNumber: chapter.number }))
  verses.push(...chapterVerses)
}
```

**Logic:**
- Start chapter: Filter from `startVerse` to end of chapter
- Middle chapters: Include all verses
- End chapter: Filter from start of chapter to `endVerse`

### 2. ScriptureContent Component
**File:** `apps/tc-study/src/components/resources/ScriptureViewer/components/ScriptureContent.tsx`

**Changes:**
- Groups verses by chapter number
- Renders chapter headings for each chapter in the range
- Maintains visual separation between chapters

**Rendering:**
```typescript
// Group verses by chapter
const versesByChapter = displayVerses.reduce((acc, verse) => {
  const chapterNum = verse.chapterNumber || currentRef.chapter
  if (!acc[chapterNum]) acc[chapterNum] = []
  acc[chapterNum].push(verse)
  return acc
}, {})

// Render with chapter headings
{chapters.map(chapterNum => (
  <div key={chapterNum}>
    <h2>Chapter {chapterNum}</h2>
    {versesByChapter[chapterNum].map(verse => (
      <VerseRenderer verse={verse} />
    ))}
  </div>
))}
```

## Examples

### Single Chapter Range
**Reference:** `TIT 1:1-5`
- Loads: Chapter 1
- Displays: Verses 1-5 from Chapter 1
- Shows: One chapter heading (1)

### Cross-Chapter Range
**Reference:** `TIT 1:15-2:5`
- Loads: Chapters 1 and 2
- Displays:
  - Verses 15-16 from Chapter 1
  - Verses 1-5 from Chapter 2
- Shows: Two chapter headings (1, 2)

### Multi-Chapter Range
**Reference:** `ROM 1:1-3:20`
- Loads: Chapters 1, 2, and 3
- Displays:
  - All verses from Chapter 1 (starting at verse 1)
  - All verses from Chapter 2
  - Verses 1-20 from Chapter 3
- Shows: Three chapter headings (1, 2, 3)

## User Experience

### Selection in BCVNavigator
1. User opens BCVNavigator
2. Selects a book (e.g., Titus)
3. Clicks verse 15 in chapter 1 (start)
4. Clicks verse 5 in chapter 2 (end)
5. Range highlighted: 1:15, 1:16, 2:1, 2:2, 2:3, 2:4, 2:5
6. Clicks "Apply"

### Display in ScriptureViewer
```
┌─────────────────────────────────┐
│ 1                               │ ← Chapter heading
├─────────────────────────────────┤
│ 15 For this reason I left you...│
│ 16 They profess to know God... │
├─────────────────────────────────┤
│ 2                               │ ← Chapter heading
├─────────────────────────────────┤
│ 1 But you, speak the things... │
│ 2 that older men should be...  │
│ 3 that older women likewise... │
│ 4 in order that they may train.│
│ 5 to be self-controlled, pure..│
└─────────────────────────────────┘
```

## Technical Details

### Verse Metadata
Each verse in a cross-chapter range gets enhanced metadata:

```typescript
interface ProcessedVerseWithChapter extends ProcessedVerse {
  chapterNumber: number  // Added for cross-chapter support
}
```

### Chapter Boundary Detection
```typescript
// Start of range (Chapter 1, verse 15)
if (chapterNumber === startChapter) {
  chapterStartVerse = startVerse  // Start at verse 15
  chapterEndVerse = 999  // Go to end of chapter
}

// Middle chapters (would include all verses)
// No filtering needed

// End of range (Chapter 2, verse 5)
if (chapterNumber === endChapter && endVerse) {
  chapterStartVerse = 1  // Start at verse 1
  chapterEndVerse = endVerse  // End at verse 5
}
```

### Backward Compatibility
- Single chapter references work as before
- `currentChapter` is preserved (first chapter in range)
- Verses without `chapterNumber` default to `currentRef.chapter`

## Navigation Integration

### Reference Format
The system supports all standard reference formats:

```typescript
// Single verse
{ book: 'tit', chapter: 1, verse: 1 }
// → TIT 1:1

// Same-chapter range
{ book: 'tit', chapter: 1, verse: 1, endVerse: 5 }
// → TIT 1:1-5

// Cross-chapter range
{ book: 'tit', chapter: 1, verse: 15, endChapter: 2, endVerse: 5 }
// → TIT 1:15-2:5
```

### Navigation Context
NavigationContext already supports `endChapter` and `endVerse`:

```typescript
interface BCVReference {
  book: string
  chapter: number
  verse: number
  endChapter?: number
  endVerse?: number
}
```

## Benefits

### ✅ Complete Reference Support
- Single verses
- Same-chapter ranges
- Cross-chapter ranges
- Full chapter ranges

### ✅ Visual Clarity
- Chapter headings separate content
- Clear verse numbering
- Proper spacing between chapters

### ✅ Performance
- Loads only required chapters
- Efficient verse filtering
- Minimal re-rendering

### ✅ Mobile App Parity
- Same selection UX
- Same rendering approach
- Same reference format

## Testing

### Test Cases

**Test 1: Single Verse**
```
Reference: TIT 1:1
Expected: One verse from chapter 1
```

**Test 2: Same-Chapter Range**
```
Reference: TIT 1:1-5
Expected: Five verses from chapter 1, one heading
```

**Test 3: Cross-Chapter Range**
```
Reference: TIT 1:15-2:5
Expected:
  - Chapter 1: verses 15-16 (2 verses)
  - Chapter 2: verses 1-5 (5 verses)
  - Total: 7 verses, 2 headings
```

**Test 4: Full Chapter**
```
Reference: TIT 1:1-16
Expected: All 16 verses from chapter 1
```

**Test 5: Multi-Chapter Range**
```
Reference: ROM 1:1-3:20
Expected:
  - Chapter 1: all verses (32)
  - Chapter 2: all verses (29)
  - Chapter 3: verses 1-20 (20)
  - Total: 81 verses, 3 headings
```

## Related Files

- `apps/tc-study/src/components/resources/ScriptureViewer/hooks/useContent.ts` - Multi-chapter loading
- `apps/tc-study/src/components/resources/ScriptureViewer/components/ScriptureContent.tsx` - Chapter grouping and rendering
- `apps/tc-study/src/components/studio/BCVNavigator.tsx` - Cross-chapter range selection
- `apps/tc-study/src/contexts/NavigationContext.tsx` - Reference state management

## Future Enhancements

- [ ] Optimize loading (parallel chapter loading)
- [ ] Add transition animations between chapters
- [ ] Support book-level ranges (e.g., TIT-PHM)
- [ ] Show verse count indicator in UI
- [ ] Export range as formatted text

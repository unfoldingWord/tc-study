# Rendering Bible and Aligned Bible Resources

## Overview

Both **Bible** and **Aligned Bible** resources are rendered using the **same resource type** (`scriptureResourceType`) and the **same viewer component** (`ScriptureViewer`). The system automatically handles both types through subject-based matching.

## Architecture

### Single Resource Type for Both

Both Bible and Aligned Bible resources are handled by the `scriptureResourceType` plugin:

```22:28:apps/tc-study/src/resourceTypes/scripture/index.ts
  subjects: [
    'Bible',
    'Aligned Bible',
    'Greek New Testament',
    'Hebrew Old Testament',
  ],
  aliases: ['bible', 'usfm', 'scripture', 'aligned-bible'],
```

**Key Points:**
- ✅ Both `'Bible'` and `'Aligned Bible'` are in the `subjects` array
- ✅ Both use the same `ScriptureLoader` for data fetching
- ✅ Both use the same `ScriptureViewer` for rendering
- ✅ The viewer can handle alignment data (if present)

## How It Works

### 1. Resource Type Registration

When `scriptureResourceType` is registered, the `ResourceTypeRegistry` automatically:

1. **Maps subjects to resource type**:
   - `'Bible'` → `'scripture'`
   - `'Aligned Bible'` → `'scripture'`
   - `'Greek New Testament'` → `'scripture'`
   - `'Hebrew Old Testament'` → `'scripture'`

2. **Registers the loader**:
   - Creates `ScriptureLoader` instance
   - Registers with `CatalogManager` and `LoaderRegistry`

3. **Registers the viewer**:
   - Registers `ScriptureViewer` with `ViewerRegistry`
   - Creates a `canHandle` function that checks if `metadata.subject` is in the `subjects` array

### 2. Viewer Resolution

When a resource is added to a panel, `LinkedPanelsStudio` resolves the viewer:

```212:233:apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx
    // Try to get viewer from ViewerRegistry using resource metadata
    // The viewer's canHandle function checks:
    // 1. metadata.type === resourceType id (e.g., 'scripture')
    // 2. metadata.subject in subjects array (e.g., 'Bible', 'Aligned Bible')
    // 3. aliases match
    const resourceMetadata = {
      type: resource.type, // This should be 'scripture', 'words', etc.
      subject: resource.subject, // Original subject from metadata (e.g., 'Bible', 'Aligned Bible')
      resourceId: resource.id,
      key: resourceKey,
      title: resource.title,
      language: resource.language,
      owner: resource.owner,
    } as any // Type assertion needed since we're creating a partial metadata object
    
    // Try to get viewer using metadata
    let ViewerComponent = viewerRegistry.getViewer(resourceMetadata)
    
    // Fallback: if not found by metadata, try by type directly
    if (!ViewerComponent && resource.type) {
      ViewerComponent = viewerRegistry.getViewerByType(resource.type)
    }
```

**Resolution Process:**
1. Creates a metadata object with `subject: 'Bible'` or `subject: 'Aligned Bible'`
2. Calls `viewerRegistry.getViewer(resourceMetadata)`
3. `ViewerRegistry` checks each registered viewer's `canHandle()` function
4. `ScriptureViewer`'s `canHandle` returns `true` if `subject` is in `['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament']`
5. Returns `ScriptureViewer` component

### 3. Viewer Rendering

Once resolved, `ScriptureViewer` is rendered with appropriate props:

```235:255:apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx
    if (ViewerComponent) {
      // Viewer found - render it with appropriate props
      // Build props object with common props first
      const viewerProps: any = {
        resourceId: resource.id,
        resourceKey: resourceKey,
      }
      
      // Add type-specific props
      if (resource.type === 'scripture' || resource.category === 'scripture') {
        // ScriptureViewer needs additional props
        viewerProps.server = resource.server
        viewerProps.owner = resource.owner
        viewerProps.language = resource.language
        viewerProps.isAnchor = isAnchor
      } else if (resource.type === 'words-links' || resource.category === 'words-links' || resource.type === 'twl') {
        // WordsLinksViewer needs onEntryLinkClick
        viewerProps.onEntryLinkClick = handleOpenEntry
      }
      
      return <ViewerComponent {...viewerProps} />
```

**Props Passed to ScriptureViewer:**
- `resourceId`: Unique ID for this resource instance
- `resourceKey`: Catalog key (e.g., `"unfoldingWord/en_ult"`)
- `server`: Server name (e.g., `"git.door43.org"`)
- `owner`: Owner/org (e.g., `"unfoldingWord"`)
- `language`: Language code (e.g., `"en"`)
- `isAnchor`: Whether this is the anchor panel (for inter-panel communication)

### 4. Content Loading

`ScriptureViewer` loads content using `ScriptureLoader`:

```typescript
// Inside ScriptureViewer
const content = await catalogManager.loadResourceContent(
  resourceKey,
  bookCode,
  chapterNumber
)
```

**For Both Bible and Aligned Bible:**
- Uses the same `ScriptureLoader.loadContent()` method
- Returns `ProcessedScripture` format from `@bt-synergy/usfm-processor`
- Aligned Bible resources may include additional alignment data in `content.alignments`

### 5. Alignment Data Handling

`ScriptureViewer` can handle alignment data if present:

```195:203:apps/tc-study/src/components/resources/ScriptureViewer.tsx
        if (content && content.metadata && content.chapters) {
          console.log('✅ Loaded ProcessedScripture from catalog:')
          console.log('   Book:', content.metadata.bookName, `(${content.metadata.bookCode})`)
          console.log('   Chapters:', content.metadata.totalChapters, 'actual chapters in array:', content.chapters.length)
          console.log('   Verses:', content.metadata.totalVerses)
          console.log('   Paragraphs:', content.metadata.totalParagraphs)
          console.log('   Chapter-Verse Map:', Object.keys(content.metadata.chapterVerseMap).length, 'chapters')
          console.log('   Alignments:', content.alignments?.length || 0, 'global alignments')
          console.log('   Translator Sections:', content.translatorSections?.length || 0, 'sections')
          console.log('   First chapter:', content.chapters[0]?.number, 'has', content.chapters[0]?.verses?.length || 0, 'verses')
```

**Note:** Currently, alignment data is loaded but not visually displayed. Future enhancements could:
- Show word-level alignments to Greek/Hebrew
- Highlight aligned words
- Display original language words on hover

## Differences Between Bible and Aligned Bible

### Data Structure

**Regular Bible:**
- Contains translated text in USFM format
- No alignment data
- `content.alignments` is `undefined` or empty

**Aligned Bible:**
- Contains translated text in USFM format
- **Plus** alignment data linking words to original language texts
- `content.alignments` contains alignment information
- May have `relations` field in metadata pointing to Greek/Hebrew resources

### User Experience

**Currently:**
- Both render identically in `ScriptureViewer`
- Both support the same features (highlighting, search, navigation)
- Both can be used as anchor panels for inter-panel communication

**Future (Potential):**
- Aligned Bible could show original language words on hover
- Aligned Bible could highlight words that have alignments
- Aligned Bible could link to Greek/Hebrew resources

## Why This Design?

### Benefits

1. **Code Reuse**: Single viewer handles multiple related resource types
2. **Consistency**: Same UI/UX for all scripture resources
3. **Simplicity**: No need for separate `AlignedBibleViewer`
4. **Flexibility**: Can add alignment features incrementally

### Trade-offs

1. **No Special UI Yet**: Aligned Bible doesn't have unique visual features
2. **Future Separation**: If alignment features become complex, might need separate viewer

## Summary

**Bible and Aligned Bible Resources:**
- ✅ Use the same `scriptureResourceType` plugin
- ✅ Use the same `ScriptureLoader` for data
- ✅ Use the same `ScriptureViewer` for rendering
- ✅ Resolved via `ViewerRegistry` based on `subject` field
- ✅ Both support all scripture features (highlighting, search, navigation)
- 🔜 Alignment data is loaded but not yet visually displayed

**The system automatically handles both types through subject-based matching - no special configuration needed!**



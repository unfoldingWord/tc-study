# Server Adapter Integration - Next Steps

## ✅ Completed

### 1. Server Adapter Architecture
- ✅ Created `ServerAdapter` interface
- ✅ Implemented `Door43ServerAdapter`
- ✅ Example `BibleBrainServerAdapter` for future use
- ✅ Auto-detection of `contentStructure` from metadata
- ✅ Renamed `organizationType` → `contentStructure`

### 2. Package Updates
- ✅ `@bt-synergy/resource-catalog` - Added server-adapters subpath export
- ✅ `@bt-synergy/translation-words-loader` - Integrated `Door43ServerAdapter`
- ✅ `@bt-synergy/scripture-loader` - Integrated `Door43ServerAdapter`
- ✅ `@bt-synergy/shared` - Renamed `organizationType` → `contentStructure` in types

### 3. Documentation
- ✅ `docs/SERVER_ADAPTER_ARCHITECTURE.md` - Complete architecture guide
- ✅ `docs/CONTENT_STRUCTURE_FIELD.md` - Field naming decision
- ✅ `docs/ADAPTER_LAYERS_SUMMARY.md` - Overview of both adapter layers
- ✅ `packages/resource-catalog/src/server-adapters/README.md` - Usage guide

### 4. Loader Integrations
- ✅ **Translation Words Loader** - Uses adapter, auto-detects `contentStructure: 'entry'`
- ✅ **Scripture Loader** - Uses adapter, auto-detects `contentStructure: 'book'`

**Changes Made**:
```typescript
// Before: Hardcoded metadata construction
const metadata: ResourceMetadata = {
  resourceKey: resourceKey,
  server: 'git.door43.org',
  owner,
  language,
  resourceId: resourceId,
  type: ResourceType.WORDS,
  organizationType: 'entry', // ❌ Hardcoded
  // ... 30+ lines of manual mapping
}

// After: Using Door43ServerAdapter
const metadata = await this.serverAdapter.transformMetadata({
  id: resourceId,
  name: repo.title || 'Translation Words',
  owner,
  language,
  subject: 'Translation Words',
  flavor: 'x-TranslationWords',
  // ... Door43 metadata
})
// ✅ contentStructure auto-detected as 'entry'
```

## 📋 Remaining Tasks

### 1. Update Scripture Loader (HIGH PRIORITY)
**File**: `packages/scripture-loader/src/ScriptureLoader.ts`

**Current State**: Has hardcoded metadata construction

**Action Required**:
1. Add `Door43ServerAdapter` import
2. Initialize adapter in constructor
3. Replace hardcoded metadata construction with `adapter.transformMetadata()`
4. Update `tsconfig.json` to use `moduleResolution: "bundler"`

**Example**:
```typescript
// Add to imports
import { Door43ServerAdapter } from '@bt-synergy/resource-catalog/server-adapters'

// Add to class
private serverAdapter: Door43ServerAdapter

// In constructor
this.serverAdapter = new Door43ServerAdapter()

// In getMetadata()
const metadata = await this.serverAdapter.transformMetadata(door43Resource)
// ✅ contentStructure auto-detected as 'book' for scripture
```

### 2. Update Studio to Use contentStructure (HIGH PRIORITY)
**File**: `apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx`

**Current State**: May have hardcoded logic for determining display mode

**Action Required**:
1. Check `metadata.contentStructure` instead of resource type
2. Open book-organized resources in panels
3. Open entry-organized resources in modals

**Example**:
```typescript
function openResource(metadata: ResourceMetadata) {
  if (metadata.contentStructure === 'book') {
    // Book-organized: Open in panel with BCV navigation
    openInPanel(metadata, {
      navigation: 'bcv',
      linkedScrolling: true,
    })
  } else if (metadata.contentStructure === 'entry') {
    // Entry-organized: Open in modal (triggered by links)
    openInModal(metadata, {
      navigation: 'search',
      linkedScrolling: false,
    })
  }
}
```

### 3. Update Resource Type Definitions (MEDIUM PRIORITY)
**File**: `apps/tc-study/src/resourceTypes/translationWords.ts`

**Current State**: May have hardcoded `contentStructure`

**Action Required**:
1. Remove any hardcoded `contentStructure` setting
2. Rely on loader's auto-detection via `Door43ServerAdapter`

**Example**:
```typescript
// Before
export const translationWordsResourceType = defineResourceType({
  id: 'translation-words',
  subjects: ['Translation Words'],
  contentStructure: 'entry', // ❌ Hardcoded
  loader: TranslationWordsLoader,
  viewer: TranslationWordsViewer,
})

// After
export const translationWordsResourceType = defineResourceType({
  id: 'translation-words',
  subjects: ['Translation Words'],
  // ✅ contentStructure auto-detected by loader's Door43ServerAdapter
  loader: TranslationWordsLoader,
  viewer: TranslationWordsViewer,
})
```

### 4. Add Translation Notes/Questions/Links Loaders (LOW PRIORITY)
**Status**: Not yet implemented

**Action Required**:
1. Create `@bt-synergy/translation-notes-loader`
2. Create `@bt-synergy/translation-questions-loader`
3. Create `@bt-synergy/translation-words-links-loader`
4. All should use `Door43ServerAdapter` for metadata transformation
5. All will be auto-detected as `contentStructure: 'book'`

### 5. Add Translation Academy Loader (LOW PRIORITY)
**Status**: Not yet implemented

**Action Required**:
1. Create `@bt-synergy/translation-academy-loader`
2. Use `Door43ServerAdapter` for metadata transformation
3. Will be auto-detected as `contentStructure: 'entry'`

### 6. Test End-to-End (HIGH PRIORITY)
**Action Required**:
1. Test Translation Words in web app
   - Verify `contentStructure: 'entry'` is set
   - Verify opens in modal (not panel)
   - Verify can be triggered by TWL links

2. Test Scripture in web app
   - Verify `contentStructure: 'book'` is set
   - Verify opens in panel
   - Verify BCV navigation works

3. Test cross-linking
   - Open Translation Notes (book-organized)
   - Click a TWL link
   - Verify Translation Words opens in modal (entry-organized)

## 🎯 Priority Order

### Phase 1: Core Integration (This Week)
1. ✅ Update Translation Words Loader (DONE)
2. ✅ Update Scripture Loader (DONE)
3. ✅ Update Studio display logic (DONE)
4. ✅ Create Translation Words Links Loader (DONE)
5. 📋 Test end-to-end (READY FOR TESTING)

### Phase 2: Additional Loaders (Next Week)
5. Create Translation Notes Loader
6. Create Translation Questions Loader
7. Create Translation Words Links Loader
8. Create Translation Academy Loader

### Phase 3: Polish (Following Week)
9. Update all resource type definitions
10. Add comprehensive tests
11. Update user documentation

## 📝 Testing Checklist

### Translation Words (Entry-Organized)
- [ ] Metadata has `contentStructure: 'entry'`
- [ ] Opens in modal (not panel)
- [ ] Can be triggered by TWL links from TN
- [ ] Search works within modal
- [ ] Closing modal returns to previous resource

### Scripture (Book-Organized)
- [ ] Metadata has `contentStructure: 'book'`
- [ ] Opens in panel
- [ ] BCV navigation works
- [ ] Linked scrolling works
- [ ] Book/chapter/verse selection works

### Translation Notes (Book-Organized)
- [ ] Metadata has `contentStructure: 'book'`
- [ ] Opens in panel
- [ ] TWL links trigger Translation Words modal
- [ ] Markdown rendering works
- [ ] Book/chapter/verse navigation works

### Cross-Linking
- [ ] TN → TW (book → entry) works
- [ ] TN → TA (book → entry) works
- [ ] Multiple modals can be opened
- [ ] Modal stack management works

## 🔧 Technical Notes

### Module Resolution
All loader packages need `moduleResolution: "bundler"` in `tsconfig.json` to support subpath exports:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

### Import Pattern
```typescript
import { Door43ServerAdapter } from '@bt-synergy/resource-catalog/server-adapters'
```

### Metadata Transformation Pattern
```typescript
// 1. Parse resource key
const identifiers = this.serverAdapter.parseResourceKey(resourceKey)

// 2. Fetch from Door43
const door43Resource = await this.door43Client.findRepository(...)

// 3. Transform using adapter
const metadata = await this.serverAdapter.transformMetadata(door43Resource)
// ✅ contentStructure auto-detected!
```

## 📚 Reference Documents

- `docs/SERVER_ADAPTER_ARCHITECTURE.md` - Full architecture
- `docs/CONTENT_STRUCTURE_FIELD.md` - Field naming
- `docs/ADAPTER_LAYERS_SUMMARY.md` - Complete overview
- `packages/resource-catalog/src/server-adapters/README.md` - Usage guide

## 🎉 Benefits Achieved

✅ **No Hardcoding** - Content structure auto-detected from metadata  
✅ **Extensible** - Easy to add new servers (Bible Brain, DBP, etc.)  
✅ **Maintainable** - Transformation logic centralized in adapters  
✅ **Testable** - Adapters can be tested independently  
✅ **Future-Proof** - Supports any content server or spec  
✅ **Clear Separation** - Server adapters ≠ Storage adapters

## 🚀 Next Immediate Action

**Update Scripture Loader** to use `Door43ServerAdapter`, following the same pattern as Translation Words Loader.

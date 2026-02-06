# Metadata Refactoring - Current Status

## What We're Fixing

**You correctly identified the problem**: The current "fix" using `normalizeResourceInfo` is just another workaround. The real issue is architectural - we're storing the same data in two places (top-level fields AND `metadata` object).

## The Real Solution

Instead of copying data between redundant fields, we decided to:
1. **Make top-level fields the single source of truth** (`resource.title`, not `metadata.title`)
2. **Remove all fallbacks** from viewers (no more `|| 'Generic Title'`)
3. **Simplify `normalizeResourceInfo`** to just promote `metadata` fields to top-level when they arrive from Door43 API

## What's Done ✅

### Core Infrastructure
1. ✅ Simplified `normalizeResourceInfo` - now just promotes fields to top-level
2. ✅ Fixed `workspaceStore.ts` - normalizes on `addResourceToPackage()` and `loadFromCollection()`
3. ✅ Fixed browser compatibility - removed `require()` calls that were breaking in browser

### Viewer Components
4. ✅ **WordsLinksViewer** - uses `resource.title` and `resource.languageTitle` directly, no fallback
5. ✅ **TranslationNotesViewer** - uses `resource: ResourceInfo` prop correctly
6. ✅ **TranslationQuestionsViewer** - uses `resource: ResourceInfo` prop correctly (updated type from `any`)
7. ✅ **ScriptureViewer** - updated to accept `resource` prop and use `resource.title`, `resource.languageTitle`
8. ✅ **ScriptureViewer types** - added `resource: ResourceInfo` to `ScriptureViewerProps`

### View Containers
9. ✅ **SimplifiedReadView.tsx** - already passes full `resource` object to all viewers
10. ✅ **LinkedPanelsStudio.tsx** - already passes full `resource` object to all viewers

### Type Definitions
11. ✅ **ResourceInfo interface** - added `languageTitle?: string` field for consistency
12. ✅ **Search & remove** - all `|| 'Generic Title'` fallback patterns removed

## What's Remaining 🔄

1. 🔄 **Test in browser** - verify all resource headers show actual titles (scripture, notes, questions, words-links)

## For Next Agent

See `REFACTORING_INSTRUCTIONS.md` for detailed step-by-step instructions.

**Key principle**: Use `resource.title` everywhere, never `metadata?.title || 'Fallback'`

## Current Branch

`refactor/normalize-resource-metadata`

## Why This Matters

- ✨ **Cleaner architecture** - one source of truth
- 🐛 **No more generic titles** - always shows the actual resource name
- 🚀 **Less code** - no more conditional logic in every viewer
- 💪 **More maintainable** - clear data flow from API → store → viewer

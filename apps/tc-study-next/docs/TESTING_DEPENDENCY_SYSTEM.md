# Testing the Comprehensive Dependency Checking System

## Overview

The dependency checking system is now fully implemented and running. This guide will help you test all scenarios.

## Test Setup

**Server Status:** ✅ Running on terminal 5
**Port:** Check terminal 5 for the dev server URL (usually `http://localhost:5173`)

## Test Scenarios

### Test 1: TWL with TW Available on Door43

**Steps:**
1. Open the wizard (Add Resource button)
2. Select **Language:** `Spanish, Latin America (es-419)`
3. Select **Organization:** `unfoldingWord`
4. Move to **Resources** step

**Expected Result:**
```
✅ Translation Words Links card shows:
   - Green checkmark: "Dependencies OK"
   - Card is enabled (not grayed out)
   - Normal hover effects work

When you click the TWL card:
   - TWL is selected (blue border)
   - Translation Words is ALSO automatically selected
   - Console log: "🔗 Auto-selecting dependency: unfoldingWord/es-419/tw"
```

### Test 2: Resource Without Dependencies

**Steps:**
1. In the same wizard setup (es-419, unfoldingWord)
2. Look for resources like "unfoldingWord® Literal Translation"

**Expected Result:**
```
✅ Scripture resource cards show:
   - No dependency indicator (neither green nor red)
   - Card is fully enabled
   - Can be selected normally
```

### Test 3: TWL in Language Without TW

**Steps:**
1. Open wizard
2. Select a language that has TWL but NOT TW (try a smaller language)
3. Look for Translation Words Links

**Expected Result:**
```
❌ Translation Words Links card shows:
   - Red warning icon with "Missing:"
   - "• Translation Words" listed below
   - Card is grayed out (opacity-50)
   - Hover doesn't work
   - Can't be selected (cursor: not-allowed)
```

### Test 4: Console Debug Logs

**Steps:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Open wizard and select languages

**Expected Logs:**
```
🔍 Checking dependencies for all resources...
🔍 Searching for dependency: words
   Target: unfoldingWord/es-419
   1. Check workspace... ✗ Not found
   2. Check catalog... ✗ Not found
   3. Check Door43... ✓ Found: unfoldingWord/es-419/tw
   ✓ Auto-added dependency to list: unfoldingWord/es-419/tw
   Translation Words Links: ✓ All dependencies available
```

### Test 5: Dependency Auto-Selection

**Steps:**
1. Select es-419 + unfoldingWord
2. Look at both TWL and TW cards
3. Click only TWL (not TW)
4. Check both cards

**Expected Result:**
```
✅ After clicking TWL:
   - TWL card: Blue border (selected)
   - TW card: ALSO blue border (auto-selected)
   - Console: "🔗 Auto-selecting dependency: unfoldingWord/es-419/tw"
```

### Test 6: Dependency Info Modal

**Steps:**
1. Find a TWL resource
2. Click the info icon (ⓘ) in the top-right
3. Read the modal

**Expected Result:**
```
✅ Modal shows:
   - Resource title
   - Owner, language
   - README (markdown formatted)
   - License information
   - Close button works
```

## Visual Guide

### Enabled Resource with Dependencies OK
```
┌──────────────────────────────────┐
│ ⓘ                              ✓ │
│                                  │
│  Translation Words Links         │
│  unfoldingWord                   │
│  español, Latinoamérica          │
│                                  │
│  ✓ Dependencies OK               │
│                                  │
│  📦                          📄  │
└──────────────────────────────────┘
      ^                    ^
    Status              Subject Icon
   (Online)
```

### Disabled Resource with Missing Dependencies
```
┌──────────────────────────────────┐
│ ⓘ                           [X]  │
│                                  │
│  Translation Words Links         │  ← Grayed out text
│  custom-org                      │
│  Custom Language                 │
│                                  │
│  ⚠️ Missing:                     │  ← Red warning
│     • Translation Words          │
│                                  │
│  📦                          📄  │
└──────────────────────────────────┘
```

## Common Issues & Solutions

### Issue 1: No dependency check happening
**Solution:** Check console for errors. Make sure `resourceTypeRegistry` is properly loaded.

### Issue 2: All resources disabled
**Solution:** Door43 API might be down. Check network tab in DevTools.

### Issue 3: Auto-selection not working
**Solution:** Check that `autoAddedDependencies` is being set correctly. Look for logs with "🔗 Auto-selecting dependency".

### Issue 4: Dependency found but card still disabled
**Solution:** Check that the dependency is being added to `supportedResources` and the `dependenciesAvailable` flag is set to `true`.

## Performance Check

**Loading Time:**
- Initial resource load: < 2 seconds
- Dependency checks (parallel): < 1 second per language/org combo
- Door43 fetch: < 500ms per dependency

**Console Logs to Monitor:**
```
✅ Total: X resources, Y supported (excluding original languages)
🔍 Checking dependencies for all resources...
   Translation Words Links: ✓ All dependencies available
```

## Success Criteria

✅ **TWL with TW on Door43:**
   - Shows "Dependencies OK"
   - Auto-adds TW to list
   - Auto-selects TW when TWL is clicked

✅ **TWL without TW:**
   - Shows "Missing: Translation Words"
   - Card is disabled
   - Can't be selected

✅ **Resources without dependencies:**
   - No dependency indicator
   - Fully functional

✅ **Performance:**
   - Dependency checks complete quickly
   - No UI freezing
   - Parallel searches work

## Next Steps After Testing

1. ✅ Verify all test scenarios pass
2. ✅ Check console logs for proper flow
3. ✅ Test with multiple languages/orgs
4. ✅ Test with slow network (throttling in DevTools)
5. ✅ Verify UI is responsive on mobile viewport

## Feedback Welcome

If you find any issues or have suggestions:
- Check the implementation in `comprehensiveDependencySearch.ts`
- Review the UI in `ResourceSelectorStep.tsx`
- Look at the dependency definitions in `translationWordsLinks.ts`

The system is designed to be:
- **Robust**: Searches all layers
- **User-friendly**: Clear visual feedback
- **Automatic**: Auto-adds and auto-selects
- **Fast**: Parallel searches with caching

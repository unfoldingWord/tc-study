# Wizard UI Consistency Update

## Problem

The `OriginalLanguageSelectorStep` and `ResourceSelectorStep` had inconsistent styling and layouts, making the wizard feel disjointed. The original language step had:
- Overly detailed info banner
- Different color scheme (primary vs blue)
- More complex summary section
- Different card styling

## Solution

Aligned the UI design of both steps to create a consistent, clean wizard experience.

## Changes Made

### `apps/tc-study/src/components/wizard/OriginalLanguageSelectorStep.tsx`

**Header Section:**
- **Before**: Had a separate info banner explaining Aligned Bible resources
- **After**: Simplified to a single-line description that mentions auto-selection

**Resource Cards:**
- **Before**: Used `primary` color scheme and had nested checkmark in a circle
- **After**: Uses consistent `blue` color scheme matching ResourceSelectorStep
- **Before**: Complex badge system with multiple colors
- **After**: Simplified inline "✓ Recommended" indicator
- **Before**: Separate detailed owner/subject info
- **After**: Single line with owner and language code (matching ResourceSelectorStep format)

**Summary Section:**
- **Before**: Detailed summary with separate Greek/Hebrew sections and warning
- **After**: Simple selected count matching ResourceSelectorStep format

**Section Headers:**
- **Before**: Bold with custom styling and "(X of Y selected)" text
- **After**: Semibold matching ResourceSelectorStep with just "(X)" count

### Consistent Styling Across Both Steps

Both steps now share:
1. **Color scheme**: Blue (`border-blue-500`, `bg-blue-50`, `text-blue-600`)
2. **Card hover states**: `hover:border-blue-300 hover:bg-blue-50`
3. **Selected state**: Simple checkmark in top-right corner
4. **Grid layout**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3`
5. **Summary format**: Colored banner with selected count
6. **Typography**: Same font weights and sizes

## Result

✅ **Consistent visual design** across all wizard steps  
✅ **Cleaner, less cluttered UI**  
✅ **Better user experience** with familiar patterns  
✅ **Professional appearance**  
✅ **Easier maintenance** with shared styling patterns

## Visual Comparison

### Before:
- Info banner + Greek section (purple icon) + Hebrew section + detailed summary
- Primary colors, complex badges, nested checkmark circles

### After:
- Simple description + Greek section (blue icon) + Hebrew section + simple count
- Blue colors, inline indicators, simple checkmarks

Both steps now follow the same design language, making the wizard flow feel cohesive and professional.

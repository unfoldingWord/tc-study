# Page Overflow Fix

## Problem

The entire application was overflowing the screen height, causing page-level scrolling instead of just the inner elements (panels and sidebar) scrolling independently.

## Root Cause

The `Layout` component was using `min-h-screen` which allows content to grow beyond the viewport height, causing the entire page to scroll.

```typescript
// Before - WRONG
<div className="flex min-h-screen flex-col bg-gray-50">
  <header className="sticky top-0 ...">...</header>
  <main className="flex-grow">
    <Outlet />
  </main>
</div>
```

## Solution

Changed the layout to use `h-screen overflow-hidden` to constrain the entire application to the viewport height, and made the `<main>` element handle overflow properly.

### Changes Made

#### 1. Layout Component (`apps/tc-study/src/components/Layout.tsx`)

**Before:**
```typescript
<div className="flex min-h-screen flex-col bg-gray-50">
  <header className="sticky top-0 z-50 ...">
    ...
  </header>
  <main className="flex-grow">
    <Outlet />
  </main>
</div>
```

**After:**
```typescript
<div className="flex h-screen flex-col bg-gray-50 overflow-hidden">
  <header className="flex-shrink-0 border-b ...">
    ...
  </header>
  <main className="flex-1 overflow-auto">
    <Outlet />
  </main>
</div>
```

**Key Changes:**
- `min-h-screen` → `h-screen` - Constrains to exactly viewport height
- Added `overflow-hidden` - Prevents page-level scrolling
- `sticky top-0 z-50` → `flex-shrink-0` - Header doesn't need to be sticky anymore
- `flex-grow` → `flex-1 overflow-auto` - Main content can scroll if needed

#### 2. LinkedPanelsStudio Component (`apps/tc-study/src/components/studio/LinkedPanelsStudio.tsx`)

**Before:**
```typescript
<div className="h-screen flex flex-col">
  {/* Collection Banner */}
  <div className="bg-blue-50 ...">...</div>
  
  {/* Navigation Bar */}
  <div className="flex items-center ...">...</div>
  
  {/* Main Content */}
  <div className="flex-1 overflow-hidden flex">...</div>
</div>
```

**After:**
```typescript
<div className="h-full flex flex-col overflow-hidden">
  {/* Collection Banner */}
  <div className="flex-shrink-0 bg-blue-50 ...">...</div>
  
  {/* Navigation Bar */}
  <div className="flex-shrink-0 flex items-center ...">...</div>
  
  {/* Main Content */}
  <div className="flex-1 overflow-hidden flex">...</div>
</div>
```

**Key Changes:**
- `h-screen` → `h-full` - Now fits within the parent container instead of viewport
- Added `overflow-hidden` - Prevents overflow at this level
- Added `flex-shrink-0` - Prevents header elements from shrinking

## How It Works

### Layout Hierarchy

```
┌─────────────────────────────────────┐
│ Layout (h-screen overflow-hidden)   │ ← Viewport height, no overflow
│ ┌─────────────────────────────────┐ │
│ │ Header (flex-shrink-0)          │ │ ← Fixed height
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Main (flex-1 overflow-auto)     │ │ ← Grows to fill, scrolls if needed
│ │ ┌─────────────────────────────┐ │ │
│ │ │ Studio (h-full overflow-hi) │ │ │ ← Fills parent, no overflow
│ │ │ ┌─────────────────────────┐ │ │ │
│ │ │ │ Nav (flex-shrink-0)     │ │ │ │ ← Fixed height
│ │ │ └─────────────────────────┘ │ │ │
│ │ │ ┌─────────────────────────┐ │ │ │
│ │ │ │ Content (flex-1)        │ │ │ │ ← Grows to fill
│ │ │ │ ┌─────────┬─────────┐   │ │ │ │
│ │ │ │ │Sidebar  │ Panels  │   │ │ │ │
│ │ │ │ │(scroll) │(scroll) │   │ │ │ │ ← Individual scrolling
│ │ │ │ └─────────┴─────────┘   │ │ │ │
│ │ │ └─────────────────────────┘ │ │ │
│ │ └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Scrolling Behavior

### Before (❌ Wrong)
- **Page level**: Scrolled when content exceeded viewport
- **Panels**: Had their own scroll, but page scroll interfered
- **Sidebar**: Had its own scroll, but page scroll interfered
- **Result**: Double scrollbars, confusing UX

### After (✅ Correct)
- **Page level**: Never scrolls (h-screen overflow-hidden)
- **Main container**: Can scroll if a page needs it (flex-1 overflow-auto)
- **Panels**: Each panel content area scrolls independently (flex-1 overflow-auto)
- **Sidebar**: Resource list scrolls independently (flex-1 overflow-y-auto)
- **Result**: Only inner elements scroll, clean UX

## Inner Scrolling Elements

These elements now scroll independently within the fixed viewport:

1. **Sidebar Resource List**
   ```typescript
   <div className="flex-1 overflow-y-auto">
     {/* Resource cards */}
   </div>
   ```

2. **Panel Content**
   ```typescript
   <div className="flex-1 overflow-auto">
     {current.resource?.component || <EmptyPanelState />}
   </div>
   ```

3. **Main Container** (for pages that need scrolling)
   ```typescript
   <main className="flex-1 overflow-auto">
     <Outlet />
   </main>
   ```

## Benefits

1. **No Page Scrolling**: The entire app stays within the viewport
2. **Better UX**: Only relevant content scrolls (panels, sidebar list)
3. **Cleaner Layout**: No double scrollbars
4. **Responsive**: Works on all screen sizes
5. **Predictable**: Each scrollable area is clearly defined

## Testing Checklist

✅ **Studio Page**: No page-level scrolling
✅ **Sidebar**: Resource list scrolls independently
✅ **Panel 1**: Content area scrolls independently
✅ **Panel 2**: Content area scrolls independently
✅ **Header**: Always visible, no scrolling
✅ **Navigation**: Always visible, no scrolling
✅ **Other Pages**: Still work correctly with main container scrolling if needed

## CSS Classes Summary

### Container Classes
- `h-screen` - 100vh (viewport height)
- `h-full` - 100% of parent height
- `overflow-hidden` - Hide overflow, no scrollbar
- `overflow-auto` - Show scrollbar only when needed
- `overflow-y-auto` - Vertical scroll only when needed

### Flex Classes
- `flex-1` - Grow to fill available space
- `flex-shrink-0` - Don't shrink when space is constrained
- `flex-grow` - Only grow (deprecated, use flex-1)

---

**Status**: ✅ Fixed  
**Date**: 2026-01-03  
**Impact**: All pages, especially Studio

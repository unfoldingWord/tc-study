# Click-to-Add Resources Feature

## Overview

In addition to drag-and-drop, you can now add resources to panels using a simpler click-to-select method. This provides better accessibility and is easier for users who may find drag-and-drop difficult.

## How It Works

### 1. Select a Resource

Click on any resource card in the sidebar to select it. The selected resource will:
- Get a **blue border** (`border-blue-500`)
- Have a **blue background** (`bg-blue-50`)
- Show a **shadow** (`shadow-md`)

### 2. Visual Feedback

When a resource is selected, you'll see:
- The resource card is highlighted in the sidebar
- A **floating indicator** appears at the top center of the studio area saying:
  ```
  Click a panel to add [resource name]
  ```
- The panels show a **hover effect** (blue or purple tint) to indicate they can receive the selected resource

### 3. Add to Panel

Click on either Panel 1 or Panel 2 to add the selected resource to that panel. The resource will be added as a new instance, allowing the same resource to be used in multiple panels.

### 4. Deselection

You can deselect a resource by:
- Clicking the same resource again (toggles selection)
- Successfully adding the resource to a panel (auto-clears selection)
- Clicking the empty space outside the sidebar

## Implementation Details

### Key Files

- **`ResourceLibrarySidebar.tsx`**
  - Manages selection state
  - Provides `onResourceSelect` callback
  - Shows visual selection feedback

- **`LinkedPanelsStudio.tsx`**
  - Maintains `selectedResourceKey` state
  - Handles `handlePanelClick` to add resources
  - Shows floating indicator when a resource is selected
  - Adds hover effects to panels when a resource is selected

- **`useResourceManagement.ts`**
  - Provides shared `addResource` function
  - Handles instance ID generation
  - Prevents duplicate resources in the same panel

### Visual States

#### Unselected Resource Card
```tsx
border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300
```

#### Selected Resource Card
```tsx
border-blue-500 bg-blue-50 shadow-md
```

#### Panel Hover (when resource selected)
```tsx
// Panel 1
cursor-pointer hover:bg-blue-50 hover:ring-2 hover:ring-inset hover:ring-blue-300

// Panel 2
cursor-pointer hover:bg-purple-50 hover:ring-2 hover:ring-inset hover:ring-purple-300
```

## User Benefits

1. **Accessibility**: Click-based interaction is more accessible than drag-and-drop
2. **Precision**: Easier to target specific panels, especially on smaller screens
3. **Discoverability**: Visual feedback makes the feature intuitive
4. **Dual Mode**: Works alongside drag-and-drop, users can choose their preferred method
5. **Touch-Friendly**: Works better on touch devices compared to drag-and-drop

## Testing

To test this feature:

1. Open the Studio page
2. Expand the sidebar
3. Click on a resource (e.g., "ugnt")
   - ✅ Resource should get a blue highlight
   - ✅ A floating message should appear
   - ✅ Panels should show hover effects
4. Click on Panel 1
   - ✅ Resource should be added to Panel 1
   - ✅ Selection should clear
   - ✅ Floating message should disappear
5. Click the same resource again and click Panel 2
   - ✅ A new instance should be added to Panel 2
   - ✅ Both panels can show the same resource
6. Try to add the same resource to the same panel twice
   - ✅ Should be prevented (no duplicate in same panel)

## Future Enhancements

- [ ] Keyboard navigation (arrow keys to select resources, Enter to add)
- [ ] Multi-select (Ctrl+click to select multiple resources)
- [ ] Quick-add shortcuts (number keys 1-2 to add to panel 1 or 2)
- [ ] Drag preview overlay for better drag-and-drop feedback

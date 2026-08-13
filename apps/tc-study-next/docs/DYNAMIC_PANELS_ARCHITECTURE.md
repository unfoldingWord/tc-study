# Dynamic Panel Architecture

**Extensible design supporting any number of panels**

---

## 🎯 Problem

The original design hardcoded `panel1` and `panel2` throughout the codebase, making it difficult to:
- Add a 3rd, 4th, or more panels
- Dynamically configure panel layouts
- Support different workspace configurations

---

## ✅ Solution

### Dynamic Panel Configuration

Instead of:
```typescript
// ❌ Not extensible
panels: {
  panel1: string[]
  panel2: string[]
}
activeIndices: {
  panel1: number
  panel2: number
}
```

We now use:
```typescript
// ✅ Extensible!
interface PanelConfig {
  id: string           // Unique ID (e.g., 'panel-1', 'panel-2', 'panel-3')
  name: string         // Display name (e.g., 'Left Panel', 'Center Panel')
  resourceKeys: string[] // Resources in this panel
  activeIndex: number  // Active resource index
  position: number     // Display order (0 = leftmost)
}

interface WorkspacePackage {
  panels: PanelConfig[] // Array of panels - add as many as you want!
}
```

---

## 🏗️ Architecture

### Panel Operations

All operations now work with panel IDs (strings):

```typescript
interface WorkspaceActions {
  // Panel management
  addPanel: (name?: string) => string  // Add a new panel
  removePanel: (panelId: string) => void
  reorderPanels: (panelIds: string[]) => void
  renamePanel: (panelId: string, name: string) => void
  
  // Resource operations (generic)
  assignResourceToPanel: (resourceKey: string, panelId: string) => void
  removeResourceFromPanel: (resourceKey: string, panelId: string) => void
  moveResourceBetweenPanels: (resourceKey: string, fromPanelId: string, toPanelId: string) => void
  
  // Helpers
  getPanel: (panelId: string) => PanelConfig | undefined
  getPanels: () => PanelConfig[] // Get all panels, sorted by position
  getResourcesForPanel: (panelId: string) => ResourceInfo[]
  getActiveResourceForPanel: (panelId: string) => ResourceInfo | null
}
```

---

## 📊 Usage Examples

### 1. Default (2 Panels)

```typescript
const defaultPackage: WorkspacePackage = {
  panels: [
    {
      id: 'panel-1',
      name: 'Panel 1',
      resourceKeys: [],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'panel-2',
      name: 'Panel 2',
      resourceKeys: [],
      activeIndex: 0,
      position: 1,
    },
  ],
}
```

### 2. Add a 3rd Panel

```typescript
const addThirdPanel = () => {
  const workspaceStore = useWorkspaceStore.getState()
  const newPanelId = workspaceStore.addPanel('Center Panel')
  console.log('Added panel:', newPanelId) // 'panel-1234567890'
}
```

### 3. Custom Multi-Panel Layout

```typescript
const customWorkspace: WorkspacePackage = {
  panels: [
    {
      id: 'left',
      name: 'Original Languages',
      resourceKeys: ['hbo_uhb', 'el-x-koine_ugnt'],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'center',
      name: 'Translations',
      resourceKeys: ['en_ult', 'en_ust'],
      activeIndex: 0,
      position: 1,
    },
    {
      id: 'right',
      name: 'Study Resources',
      resourceKeys: ['en_tn', 'en_tw', 'en_tq'],
      activeIndex: 0,
      position: 2,
    },
  ],
}
```

---

## 🎨 UI Rendering

### Dynamic Panel Rendering

Components now dynamically render based on the panels array:

```tsx
function LinkedPanelsStudio() {
  const getPanels = useWorkspaceStore((s) => s.getPanels)
  const panels = getPanels()
  
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${panels.length}, 1fr)` }}>
      {panels.map((panel) => (
        <PanelView
          key={panel.id}
          panelId={panel.id}
          panelName={panel.name}
          resources={getResourcesForPanel(panel.id)}
          activeIndex={panel.activeIndex}
        />
      ))}
    </div>
  )
}
```

### Responsive Layouts

```tsx
// 2 panels: side-by-side
// 3 panels: three columns
// 4+ panels: grid with wrapping

const getGridLayout = (panelCount: number) => {
  if (panelCount <= 2) return 'grid-cols-2'
  if (panelCount === 3) return 'grid-cols-3'
  return 'grid-cols-2 lg:grid-cols-4' // 2x2 on mobile, 4 columns on desktop
}
```

---

## 🔄 Migration Path

### Before (Hardcoded)

```typescript
// ❌ Hardcoded panel IDs
const panel1Resources = currentPackage.panels.panel1
const panel2Resources = currentPackage.panels.panel2

assignResourceToPanel(resourceKey, 'panel1')
moveResourceBetweenPanels(resourceKey, 'panel1', 'panel2')

const isInPanel1 = panel1Resources.includes(resourceKey)
const isInPanel2 = panel2Resources.includes(resourceKey)
```

### After (Dynamic)

```typescript
// ✅ Dynamic panel IDs
const panels = getPanels()
const panel1 = panels[0]
const panel2 = panels[1]

const panel1Resources = panel1.resourceKeys
const panel2Resources = panel2.resourceKeys

assignResourceToPanel(resourceKey, panel1.id)
moveResourceBetweenPanels(resourceKey, panel1.id, panel2.id)

const sourcePanelId = panels.find(p => p.resourceKeys.includes(resourceKey))?.id
```

---

## 🚀 Future Enhancements

### 1. Panel Presets

```typescript
const presets = {
  'translation-work': {
    panels: [
      { name: 'Original', position: 0 },
      { name: 'Translation', position: 1 },
      { name: 'Resources', position: 2 },
    ],
  },
  'bible-study': {
    panels: [
      { name: 'Scripture', position: 0 },
      { name: 'Notes', position: 1 },
    ],
  },
  'advanced': {
    panels: [
      { name: 'Hebrew', position: 0 },
      { name: 'Greek', position: 1 },
      { name: 'English', position: 2 },
      { name: 'Resources', position: 3 },
    ],
  },
}
```

### 2. Split View Configurations

```typescript
interface PanelConfig {
  // ... existing fields
  layout: {
    flex: number // Relative width (1 = equal, 2 = double width)
    minWidth?: number
    maxWidth?: number
  }
}
```

### 3. Panel Groups

```typescript
interface PanelGroup {
  id: string
  name: string
  panels: PanelConfig[]
  orientation: 'horizontal' | 'vertical'
}

// Support nested layouts:
// [Panel1 | [Panel2 / Panel3]] = Panel 1 on left, Panels 2&3 stacked on right
```

### 4. User Preferences

```typescript
interface UserPreferences {
  defaultPanelCount: number
  defaultPanelNames: string[]
  panelLayoutPreset: string
  rememberLastLayout: boolean
}
```

---

## 🧪 Testing Scenarios

### Test 1: Add 3rd Panel

```typescript
test('should add third panel dynamically', () => {
  const store = useWorkspaceStore.getState()
  const panels = store.getPanels()
  expect(panels.length).toBe(2) // Default
  
  const newPanelId = store.addPanel('Panel 3')
  const updatedPanels = store.getPanels()
  expect(updatedPanels.length).toBe(3)
  expect(updatedPanels[2].id).toBe(newPanelId)
  expect(updatedPanels[2].name).toBe('Panel 3')
  expect(updatedPanels[2].position).toBe(2)
})
```

### Test 2: Reorder Panels

```typescript
test('should reorder panels', () => {
  const store = useWorkspaceStore.getState()
  const panels = store.getPanels()
  const [p1, p2] = panels.map(p => p.id)
  
  store.reorderPanels([p2, p1]) // Swap order
  
  const reordered = store.getPanels()
  expect(reordered[0].id).toBe(p2)
  expect(reordered[1].id).toBe(p1)
  expect(reordered[0].position).toBe(0)
  expect(reordered[1].position).toBe(1)
})
```

### Test 3: Remove Panel

```typescript
test('should remove panel and cleanup resources', () => {
  const store = useWorkspaceStore.getState()
  const panels = store.getPanels()
  const panelToRemove = panels[1].id
  
  // Add resource to panel
  store.assignResourceToPanel('test-resource', panelToRemove)
  
  // Remove panel
  store.removePanel(panelToRemove)
  
  const updated = store.getPanels()
  expect(updated.length).toBe(1)
  expect(updated.find(p => p.id === panelToRemove)).toBeUndefined()
})
```

---

## 📝 Implementation Status

### ✅ Completed
- [x] Refactored `WorkspaceStore` to use dynamic panels
- [x] `PanelConfig` interface with extensible design
- [x] Generic panel operations (add, remove, reorder)
- [x] Helper methods (`getPanel`, `getPanels`)
- [x] Backward-compatible with existing code
- [x] Updated `PanelAssignmentStep` to support dynamic panels
- [x] Updated `LinkedPanelsStudio` to render dynamically
- [x] Updated `EmptyPanelState` with extensible props
- [x] Updated `PanelResourceList` with extensible props
- [x] **All UI components now use dynamic panel IDs!**

### 🚧 Next Steps
- [ ] Add UI controls for adding/removing panels
- [ ] Implement panel reordering in UI (drag-and-drop)
- [ ] Add panel layout presets (2-column, 3-column, etc.)
- [ ] Test with 3+ panels in production

### 📋 See Also
- **Fix Details**: `apps/tc-study/docs/DYNAMIC_PANELS_FIX.md` - Complete bug fix report

---

## 🎯 Benefits

✅ **Scalability** - Add 3, 4, or unlimited panels  
✅ **Flexibility** - Different layouts for different workflows  
✅ **Reusability** - Same logic works for any panel  
✅ **Maintainability** - No hardcoded panel IDs  
✅ **Type Safety** - TypeScript types still enforced  
✅ **Future-Proof** - Easy to extend with new features  

---

**Ready for 3+ panel support! 🎉**

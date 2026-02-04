# Multi-Panel Architecture

The `@bt-synergy/resource-panels` system is designed to scale to **any number of panels** - 2, 3, 4, 10, or more. This document explains the architecture and provides examples.

## Architecture Overview

### Panel-Agnostic Design

The messaging system is **not limited by panel count**:

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Panel 1  │      │ Panel 2  │      │ Panel 3  │      │ Panel N  │
│ (Bible)  │      │  (Words) │      │  (Notes) │      │(Commentary)│
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     └─────────────────┴─────────────────┴─────────────────┘
                           │
                    Messaging Bus
                           │
     ┌─────────────────┬──────────────────┬─────────────────┐
     ▼                 ▼                  ▼                 ▼
  All Panels      Specific Panel    Resource Type    Specific Resource
```

### Key Concepts

1. **Dynamic Panel IDs**: Panels are identified by strings (`'panel-1'`, `'panel-2'`, `'main'`, `'sidebar'`, etc.)
2. **Broadcast Communication**: Signals can reach all panels simultaneously
3. **Targeted Communication**: Signals can target specific panels or resource types
4. **No Hard Limits**: Add as many panels as your UI can accommodate

## Configuration

### 2-Panel Configuration (Basic)

```tsx
const config: LinkedPanelsConfig = {
  resources: [
    { id: 'bible-1', component: <ScriptureViewer resourceId="bible-1" /> },
    { id: 'words-1', component: <TranslationWordsViewer resourceId="words-1" /> },
  ],
  panels: {
    'panel-1': { resourceIds: ['bible-1'] },
    'panel-2': { resourceIds: ['words-1'] },
  }
}
```

### 3-Panel Configuration

```tsx
const config: LinkedPanelsConfig = {
  resources: [
    { id: 'bible-1', component: <ScriptureViewer resourceId="bible-1" /> },
    { id: 'words-1', component: <TranslationWordsViewer resourceId="words-1" /> },
    { id: 'notes-1', component: <TranslationNotesViewer resourceId="notes-1" /> },
  ],
  panels: {
    'panel-1': { resourceIds: ['bible-1'] },
    'panel-2': { resourceIds: ['words-1'] },
    'panel-3': { resourceIds: ['notes-1'] }, // Third panel
  }
}
```

### 4+ Panel Configuration

```tsx
const config: LinkedPanelsConfig = {
  resources: [
    { id: 'bible-1', component: <ScriptureViewer resourceId="bible-1" /> },
    { id: 'bible-2', component: <ScriptureViewer resourceId="bible-2" /> },
    { id: 'words-1', component: <TranslationWordsViewer resourceId="words-1" /> },
    { id: 'notes-1', component: <TranslationNotesViewer resourceId="notes-1" /> },
    { id: 'questions-1', component: <TranslationQuestionsViewer resourceId="questions-1" /> },
    { id: 'commentary-1', component: <CommentaryViewer resourceId="commentary-1" /> },
  ],
  panels: {
    'main-left': { resourceIds: ['bible-1'] },
    'main-right': { resourceIds: ['bible-2'] },
    'sidebar-top': { resourceIds: ['words-1', 'notes-1'] }, // Multiple resources
    'sidebar-middle': { resourceIds: ['questions-1'] },
    'sidebar-bottom': { resourceIds: ['commentary-1'] },
  }
}
```

## Communication Across Multiple Panels

### Broadcast to All Panels

```tsx
// This reaches ALL resources in ALL panels
const { sendToAll } = useSignal<VerseNavigationSignal>(
  'verse-navigation',
  resourceId,
  'scripture'
)

sendToAll({
  lifecycle: 'event',
  persistent: true,
  id: 'current-verse',
  reference: { book: 'JHN', chapter: 3, verse: 16 }
})

// Result: All Scripture viewers in all panels navigate to JHN 3:16
```

### Send to Specific Panel

```tsx
const { sendToPanel } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  'scripture'
)

// Only resources in 'sidebar-top' receive this
sendToPanel('sidebar-top', {
  lifecycle: 'event',
  token: { content: 'λόγος', semanticId: 'G3056', ... }
})
```

### Send to Resource Type (Across All Panels)

```tsx
const { sendToResourceType } = useSignal<TokenClickSignal>(
  'token-click',
  resourceId,
  'scripture'
)

// All Translation Words viewers in ANY panel receive this
sendToResourceType(['translation-words'], {
  lifecycle: 'event',
  token: { content: 'λόγος', semanticId: 'G3056', ... }
})

// Result: Words viewer in panel-2, panel-5, panel-N all receive it
```

## Common Multi-Panel Layouts

### 1. Side-by-Side Comparison (2 Panels)

```
┌─────────────────┬─────────────────┐
│   Panel 1       │   Panel 2       │
│   EN Bible      │   ES Bible      │
│                 │                 │
│                 │                 │
└─────────────────┴─────────────────┘
```

**Use case**: Parallel translation study

### 2. Main + Sidebar (3 Panels)

```
┌─────────────────┬─────────────────┐
│                 │   Panel 2       │
│   Panel 1       │   Words         │
│   Bible         ├─────────────────┤
│                 │   Panel 3       │
│                 │   Notes         │
└─────────────────┴─────────────────┘
```

**Use case**: Study Bible with lexical and study resources

### 3. Quad Layout (4 Panels)

```
┌─────────────────┬─────────────────┐
│   Panel 1       │   Panel 2       │
│   Source Bible  │   Target Bible  │
├─────────────────┼─────────────────┤
│   Panel 3       │   Panel 4       │
│   Words         │   Notes         │
└─────────────────┴─────────────────┘
```

**Use case**: Translation workspace

### 4. Multi-Resource Sidebar (5+ Panels)

```
┌─────────────────┬──────┐
│                 │ P-2  │
│                 │Words │
│   Panel 1       ├──────┤
│   Main Bible    │ P-3  │
│                 │Notes │
│                 ├──────┤
│                 │ P-4  │
│                 │Quest.│
│                 ├──────┤
│                 │ P-5  │
│                 │Comm. │
└─────────────────┴──────┘
```

**Use case**: Comprehensive study interface

### 5. Flexible Grid (6+ Panels)

```
┌──────┬──────┬──────┐
│ P-1  │ P-2  │ P-3  │
│Bible │Bible │Words │
├──────┼──────┼──────┤
│ P-4  │ P-5  │ P-6  │
│Notes │Quest.│Comm. │
└──────┴──────┴──────┘
```

**Use case**: Multi-team collaboration, teaching environment

## Performance Considerations

### Message Volume

With many panels, message volume increases:

```
2 panels = moderate traffic
4 panels = higher traffic
10 panels = significant traffic
```

**Optimization strategies:**

1. **Use Resource Type Filtering**
   ```tsx
   // ❌ BAD: Everyone receives (10 panels = 10 deliveries)
   sendToAll({ ... })
   
   // ✅ GOOD: Only relevant types (2 lexicon panels = 2 deliveries)
   sendToResourceType(['translation-words', 'lexicon'], { ... })
   ```

2. **Use Specific Panel Targeting**
   ```tsx
   // Send only to specific panel
   sendToPanel('sidebar-top', { ... })
   ```

3. **Use Ephemeral Messages** (cleared automatically)
   ```tsx
   sendToAll({
     lifecycle: 'event',
     // persistent: false (default)
     // Clears automatically, doesn't accumulate
   })
   ```

### UI Performance

- **Rendering**: Each panel renders independently (React optimization applies)
- **Memory**: Persistent messages are shared across panels (single copy)
- **Updates**: Only panels with resources that match filters re-render

## Example: 4-Panel Study Interface

```tsx
import { useState } from 'react'
import { LinkedPanelsContainer, LinkedPanel } from 'linked-panels'
import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'

function FourPanelStudy() {
  const [layout, setLayout] = useState<'2x2' | '1+3'>('2x2')
  
  const config = {
    resources: [
      { id: 'source', component: <ScriptureViewer resourceId="source" resourceType="scripture" /> },
      { id: 'target', component: <ScriptureViewer resourceId="target" resourceType="scripture" /> },
      { id: 'words', component: <TranslationWordsViewer resourceId="words" resourceType="translation-words" /> },
      { id: 'notes', component: <TranslationNotesViewer resourceId="notes" resourceType="translation-notes" /> },
    ],
    panels: {
      'top-left': { resourceIds: ['source'] },
      'top-right': { resourceIds: ['target'] },
      'bottom-left': { resourceIds: ['words'] },
      'bottom-right': { resourceIds: ['notes'] },
    }
  }
  
  return (
    <div className="h-screen flex flex-col">
      <LinkedPanelsContainer config={config}>
        <div className={`flex-1 grid ${layout === '2x2' ? 'grid-cols-2 grid-rows-2' : 'grid-cols-[2fr_1fr] grid-rows-1'} gap-2 p-2`}>
          {/* Top Left */}
          <div className="border rounded overflow-hidden">
            <LinkedPanel id="top-left">
              {({ current }) => current.resource?.component}
            </LinkedPanel>
          </div>
          
          {/* Top Right */}
          <div className="border rounded overflow-hidden">
            <LinkedPanel id="top-right">
              {({ current }) => current.resource?.component}
            </LinkedPanel>
          </div>
          
          {/* Bottom Left */}
          <div className="border rounded overflow-hidden">
            <LinkedPanel id="bottom-left">
              {({ current }) => current.resource?.component}
            </LinkedPanel>
          </div>
          
          {/* Bottom Right */}
          <div className="border rounded overflow-hidden">
            <LinkedPanel id="bottom-right">
              {({ current }) => current.resource?.component}
            </LinkedPanel>
          </div>
        </div>
      </LinkedPanelsContainer>
    </div>
  )
}
```

## Dynamic Panel Management

### Adding Panels Dynamically

```tsx
function DynamicPanelApp() {
  const [panelCount, setPanelCount] = useState(2)
  
  const config = useMemo(() => {
    const panels: Record<string, PanelConfig> = {}
    const resources = []
    
    for (let i = 1; i <= panelCount; i++) {
      const resourceId = `resource-${i}`
      resources.push({
        id: resourceId,
        component: <MyResourceViewer resourceId={resourceId} />
      })
      panels[`panel-${i}`] = {
        resourceIds: [resourceId]
      }
    }
    
    return { resources, panels }
  }, [panelCount])
  
  return (
    <div>
      <button onClick={() => setPanelCount(prev => prev + 1)}>
        Add Panel
      </button>
      
      <LinkedPanelsContainer config={config}>
        {Object.keys(config.panels).map(panelId => (
          <LinkedPanel key={panelId} id={panelId}>
            {({ current }) => current.resource?.component}
          </LinkedPanel>
        ))}
      </LinkedPanelsContainer>
    </div>
  )
}
```

## Best Practices

### 1. Name Panels Semantically

```tsx
// ✅ GOOD: Semantic names
panels: {
  'main-bible': { ... },
  'sidebar-words': { ... },
  'reference-bible': { ... }
}

// ❌ BAD: Generic names with many panels
panels: {
  'panel-1': { ... },
  'panel-2': { ... },
  'panel-3': { ... },
  'panel-17': { ... } // Which panel is this?
}
```

### 2. Group Related Panels

```tsx
// Panel naming convention for complex layouts
panels: {
  'main-primary': { ... },
  'main-secondary': { ... },
  'sidebar-lexical-1': { ... },
  'sidebar-lexical-2': { ... },
  'sidebar-study-1': { ... },
  'sidebar-study-2': { ... }
}
```

### 3. Use Resource Type Filtering

With many panels, always filter by resource type:

```tsx
// Instead of sendToAll() which hits all 10 panels
sendToResourceType(['translation-words'], { ... })
```

### 4. Monitor Message Volume

```tsx
// Add debug logging in development
useSignalHandler<TokenClickSignal>(
  'token-click',
  resourceId,
  handleToken,
  {
    resourceType: 'translation-words',
    debug: process.env.NODE_ENV === 'development'
  }
)
```

### 5. Consider UI/UX with Many Panels

- **Responsive Design**: Adapt panel layout for screen size
- **Collapsible Panels**: Allow hiding panels to reduce clutter
- **Panel Tabs**: Group related panels in tabs rather than showing all
- **Split Views**: Use splitters for user-adjustable panel sizes

## Testing Multi-Panel Setups

```tsx
describe('Multi-Panel Communication', () => {
  it('should sync verse across 4 Bible panels', async () => {
    const config = {
      resources: [
        { id: 'bible-1', ... },
        { id: 'bible-2', ... },
        { id: 'bible-3', ... },
        { id: 'bible-4', ... },
      ],
      panels: {
        'panel-1': { resourceIds: ['bible-1'] },
        'panel-2': { resourceIds: ['bible-2'] },
        'panel-3': { resourceIds: ['bible-3'] },
        'panel-4': { resourceIds: ['bible-4'] },
      }
    }
    
    // Navigate panel-1
    await navigateToVerse('panel-1', 'JHN', 3, 16)
    
    // Verify all 4 panels updated
    expect(getPanelVerse('panel-1')).toBe('JHN 3:16')
    expect(getPanelVerse('panel-2')).toBe('JHN 3:16')
    expect(getPanelVerse('panel-3')).toBe('JHN 3:16')
    expect(getPanelVerse('panel-4')).toBe('JHN 3:16')
  })
})
```

## Summary

✅ **Scalable**: No hard limit on panel count
✅ **Flexible**: Dynamic panel management
✅ **Performant**: Resource type filtering reduces overhead
✅ **Simple**: Same API regardless of panel count

The system scales from 2 panels to 10+ panels without architectural changes. The key is using resource type filtering and targeted messaging to keep performance optimal.


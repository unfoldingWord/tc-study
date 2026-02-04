# ScriptureViewer Component Structure

This folder contains the refactored `ScriptureViewer` component, organized by concern.

## Folder Structure

```
ScriptureViewer/
├── index.tsx              # Main component that orchestrates everything
├── types.ts               # TypeScript interfaces and types
├── hooks/                  # Custom React hooks
│   ├── useTOC.ts          # Loads and manages Table of Contents
│   ├── useContent.ts      # Loads scripture content from catalog
│   ├── useHighlighting.ts # Manages token highlighting state
│   ├── useEvents.ts       # Handles inter-panel events
│   └── index.ts           # Hooks barrel export
├── components/            # UI components
│   ├── TokenRenderer.tsx  # Renders individual word tokens
│   ├── VerseRenderer.tsx  # Renders verses with tokens
│   ├── ScriptureHeader.tsx # Header section
│   ├── ScriptureContent.tsx # Main content area
│   ├── ScriptureDebugInfo.tsx # Debug panel
│   ├── ScriptureMetadata.tsx # Metadata panel
│   └── index.ts           # Components barrel export
└── utils/                 # Utility functions (currently empty)
```

## Architecture

### Main Component (`index.tsx`)
- Orchestrates all hooks and components
- Manages high-level component composition
- Handles prop passing between components

### Hooks
- **`useTOC`**: Manages Table of Contents loading and book availability
- **`useContent`**: Handles scripture content loading and chapter/verse filtering
- **`useHighlighting`**: Manages token highlighting state and click events
- **`useEvents`**: Listens for inter-panel events (verse-filter, etc.)

### Components
- **`TokenRenderer`**: Renders individual word tokens with highlighting
- **`VerseRenderer`**: Renders complete verses with their tokens
- **`ScriptureHeader`**: Displays resource key and current reference
- **`ScriptureContent`**: Main content area with loading/error states
- **`ScriptureDebugInfo`**: Debug panel showing internal state
- **`ScriptureMetadata`**: Metadata panel showing book information

## Benefits of This Structure

1. **Separation of Concerns**: Each file has a single, clear responsibility
2. **Reusability**: Hooks and components can be tested and reused independently
3. **Maintainability**: Easy to find and modify specific functionality
4. **Testability**: Each piece can be unit tested in isolation
5. **Readability**: Clear organization makes the codebase easier to understand

## Usage

The component is used exactly as before:

```typescript
import { ScriptureViewer } from './components/resources/ScriptureViewer'

<ScriptureViewer
  resourceId="..."
  resourceKey="..."
  isAnchor={true}
/>
```

The import path remains the same because the folder has an `index.tsx` file that serves as the entry point.



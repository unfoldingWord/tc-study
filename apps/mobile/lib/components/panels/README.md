# Panel System Integration

This directory contains the LinkedPanels integration for BT Studio.

## Architecture

The panel system follows the clean architecture principles from `ARCHITECTURE.md`:

### Current Implementation

- **UI Framework Layer**: React components with Tailwind CSS styling
- **Presentation Layer**: LinkedPanels components (`PanelSystem.tsx`)
- **Panels Layer**: LinkedPanels library integration with two-panel layout

### Panel Configuration

The system is configured with two panels:

1. **Main Panel** (`main-panel`):
   - Primary content area (flex-1)
   - Contains: Scripture Text, Translation Notes
   - Initially shows: Scripture Text

2. **Sidebar Panel** (`sidebar-panel`):
   - Secondary content area (w-80)
   - Contains: Translation Words, Translation Questions
   - Initially shows: Translation Words

### Features Implemented

- ✅ **Panel Navigation**: Previous/Next buttons with proper state management
- ✅ **State Persistence**: Automatic saving to localStorage with 7-day TTL
- ✅ **Responsive Layout**: Flexible main panel + fixed-width sidebar
- ✅ **Plugin System**: Default plugin registry for message handling
- ✅ **Resource Metadata**: Title, description, and category support

### Placeholder Resources

Currently using placeholder components that will be replaced with:

- **Scripture Text**: Bible text display component
- **Translation Notes**: Translation notes viewer
- **Translation Words**: Key term definitions
- **Translation Questions**: Comprehension questions

### Next Steps

1. Replace placeholder resources with actual components
2. Connect to Door43 API for real data
3. Integrate with existing Zustand contexts
4. Add resource-specific functionality
5. Implement inter-panel messaging

## Usage

```tsx
import { PanelSystem } from '../components/panels/PanelSystem';

function WorkspaceView() {
  return (
    <div className="h-full">
      <PanelSystem />
    </div>
  );
}
```

## Dependencies

- `linked-panels`: Panel system library
- `zustand`: State management (via linked-panels)
- `immer`: Immutable state updates (via linked-panels)


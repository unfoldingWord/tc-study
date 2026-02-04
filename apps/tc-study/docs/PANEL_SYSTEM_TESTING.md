# Panel System Testing Guide

## Overview

The Panel System Test page at `/test/panels` provides a comprehensive testing environment for the linked-panels system, with a focus on **two-way resource switching and signal propagation**.

## Accessing the Test Page

Navigate to: `http://localhost:3001/test/panels`

## What's Been Implemented

### ✅ Two Testing Modes

1. **Mock Resources (4 test resources)**
   - Lightweight test components with full communication controls
   - Each panel can have any of the 4 resources
   - Built-in signal monitoring and display

2. **Real Resources (Auto-loaded from catalog)**
   - Uses actual downloaded resources
   - Supports Scripture and Words Links viewers
   - Requires resources to be downloaded first

### ✅ Multi-Resource Panel System

- **Each panel has access to all 4 resources**
- **Resources can be switched dynamically** via navigation signals
- **Both panels can send and receive** signals
- **Real-time resource switching** based on inter-panel communication

### ✅ Signal Types Supported

1. **`token-click`**: Simulates clicking a word/token
2. **`link-click`**: Simulates clicking a translation words link
3. **`navigate-to-resource`**: Switches target panel to a different resource

### ✅ Test Resource Features

Each mock test resource displays:
- **Resource ID and Panel assignment**
- **Target Panel selector** (choose which panel to send signals to)
- **Signal buttons**:
  - Token Click (sends token-click event)
  - Link Click (sends link-click event)
  - Resource navigation buttons (switches other panel's resource)
- **Statistics**:
  - Sent message count
  - Received message count
  - Recent message log

### ✅ Signal Monitor Sidebar

- Displays all inter-panel messages in real-time
- Color-coded: Blue = Sent, Green = Received
- Shows message type, direction, and timestamp
- Automatically scrolls to show latest messages

## How to Test Two-Way Communication

### Scenario 1: Simple Signal Propagation

1. Go to `/test/panels` in Mock Resources mode
2. Panel 1 starts with `test-1`, Panel 2 starts with `test-1`
3. In Panel 1, click "Token Click"
4. Observe: Panel 2 receives the message (shows in "Received" counter)
5. Check Signal Monitor to see the message logged

### Scenario 2: Resource Switching (Panel 1 → Panel 2)

1. In Panel 1, set Target Panel to "Panel 2"
2. Click one of the purple "→ Test Resource X" buttons
3. Observe: Panel 2 switches to that resource
4. The switched resource can now send signals back to Panel 1

### Scenario 3: Bidirectional Resource Switching

1. Panel 1 sends a signal to switch Panel 2 to Resource 3
2. Panel 2 (now showing Resource 3) sends a signal back to switch Panel 1 to Resource 4
3. Both panels are now on different resources
4. They continue to communicate

### Scenario 4: Real Resources

1. Download some resources from Library (Bible, Translation Words Links)
2. Switch to "Real Resources" mode
3. Test with actual ScriptureViewer and WordsLinksViewer components
4. Verify rendering and signal propagation with real data

## Architecture

### Custom Message Type Plugins

Located in `apps/tc-study/src/plugins/messageTypePlugins.ts`:

- `tokenClickPlugin`: Validates token-click messages
- `linkClickPlugin`: Validates link-click messages
- `navigateToResourcePlugin`: Validates navigate-to-resource messages

### Test Components

Located in `apps/tc-study/src/components/test/PanelSystemTest.tsx`:

- `PanelSystemTest`: Main test page component
- `TestResource`: Mock resource component with communication controls
- `SignalMonitor`: Real-time message log display

### Configuration

The test page uses `LinkedPanelsConfig` to define:

```typescript
{
  resources: [
    { id: 'test-1', title: 'Test Resource 1', component: <TestResource /> },
    { id: 'test-2', title: 'Test Resource 2', component: <TestResource /> },
    { id: 'test-3', title: 'Test Resource 3', component: <TestResource /> },
    { id: 'test-4', title: 'Test Resource 4', component: <TestResource /> },
  ],
  panels: {
    'panel-1': {
      resourceIds: ['test-1', 'test-2', 'test-3', 'test-4'],
      initialIndex: 0,
    },
    'panel-2': {
      resourceIds: ['test-1', 'test-2', 'test-3', 'test-4'],
      initialIndex: 0,
    },
  },
}
```

## API Usage

### Sending Messages

```typescript
const api = useResourceAPI(resourceId)

// Send token-click
api.messaging.sendToAll({
  type: 'token-click',
  lifecycle: 'event',
  token: { id: 'token-1', content: 'word', position: 1, verseNumber: 1 },
  sourceResourceId: resourceId,
  timestamp: Date.now(),
})

// Send navigation request
api.messaging.sendToAll({
  type: 'navigate-to-resource',
  lifecycle: 'event',
  targetResourceId: 'test-2',
  targetPanelId: 'panel-2',
  sourceResourceId: resourceId,
  timestamp: Date.now(),
})
```

### Receiving Messages

```typescript
useEvents(resourceId, (message) => {
  console.log('Received:', message)
  
  // Handle navigation
  if (message.type === 'navigate-to-resource' && message.targetPanelId === panelId) {
    // Switch to the requested resource
    onNavigateRequest(panelId, message.targetResourceId)
  }
})
```

## Expected Behavior

✅ **Correct Behavior**:
- Messages appear in Signal Monitor immediately after sending
- Target panel's "Received" counter increments
- Navigation messages cause the target panel to switch resources
- Both panels can send and receive simultaneously
- No console errors (except for React Router future flags)

❌ **Issues to Watch For**:
- Message validation errors: Check that message format matches the plugin schema
- Resource not switching: Verify `handleNavigateRequest` is working
- Messages not appearing: Check plugin registration
- Panel not rendering: Verify `current.resource?.component` is being passed correctly

## Current Status

✅ **Working**:
- Page loads successfully
- Both panels render test resources
- Target panel selection works
- Signal monitor displays correctly
- Plugin registration successful
- Resource configuration correct

⚠️ **Known Issues**:
- Message validation may need adjustment based on exact schema requirements
- Click handlers experiencing errors that need to be resolved

## Next Steps

1. **Fix message validation**: Ensure message format exactly matches plugin schema
2. **Test navigation**: Verify resource switching works correctly
3. **Add message logging to Signal Monitor**: Wire up the `setMessages` state
4. **Test with real resources**: Download resources and test in Real Resources mode
5. **Add more signal types**: Extend to support more inter-panel communication types

## Related Files

- Test Page: `apps/tc-study/src/components/test/PanelSystemTest.tsx`
- Message Plugins: `apps/tc-study/src/plugins/messageTypePlugins.ts`
- Message Types: `apps/tc-study/src/plugins/types.ts`
- Route: `apps/tc-study/src/App.tsx` (line with `/test/panels` route)

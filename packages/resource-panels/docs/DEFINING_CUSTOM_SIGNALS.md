# Defining Custom Signals

This library is **generic infrastructure** - you define your own signals based on your needs!

## Basic Signal Definition

Every signal extends `BaseSignal`:

```typescript
import { BaseSignal } from '@bt-synergy/resource-panels'

export interface MyCustomSignal extends BaseSignal {
  type: 'my-custom-event'  // Your signal type name
  
  // Add whatever data you need
  myData: {
    field1: string
    field2: number
    field3?: boolean  // Optional fields work too
  }
}
```

## Using Your Custom Signal

```tsx
import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { MyCustomSignal } from './mySignals'

// Sending
function SenderComponent({ resourceId }: { resourceId: string }) {
  const { sendToAll } = useSignal<MyCustomSignal>('my-custom-event', resourceId)
  
  const handleAction = () => {
    sendToAll({
      lifecycle: 'event',
      myData: {
        field1: 'hello',
        field2: 42
      }
    })
  }
}

// Receiving
function ReceiverComponent({ resourceId }: { resourceId: string }) {
  useSignalHandler<MyCustomSignal>(
    'my-custom-event',
    resourceId,
    (signal) => {
      console.log(signal.myData.field1) // 'hello'
      console.log(signal.myData.field2) // 42
    }
  )
}
```

## Real-World Examples

### Example 1: Image Annotation App

```typescript
export interface AnnotationCreatedSignal extends BaseSignal {
  type: 'annotation-created'
  annotation: {
    id: string
    x: number
    y: number
    width: number
    height: number
    comment: string
    author: string
    timestamp: number
  }
}

export interface AnnotationSelectedSignal extends BaseSignal {
  type: 'annotation-selected'
  annotationId: string
  showDetails: boolean
}
```

### Example 2: Music Collaboration App

```typescript
export interface TrackPlaySignal extends BaseSignal {
  type: 'track-play'
  track: {
    id: string
    startTime: number
    tempo: number
  }
}

export interface InstrumentChangeSignal extends BaseSignal {
  type: 'instrument-change'
  instrument: {
    id: string
    type: 'guitar' | 'piano' | 'drums'
    volume: number
  }
}
```

### Example 3: Code Editor

```typescript
export interface CursorMoveSignal extends BaseSignal {
  type: 'cursor-move'
  position: {
    line: number
    column: number
    file: string
  }
  selection?: {
    start: { line: number, column: number }
    end: { line: number, column: number }
  }
}

export interface SymbolClickSignal extends BaseSignal {
  type: 'symbol-click'
  symbol: {
    name: string
    type: 'function' | 'class' | 'variable'
    definitionFile: string
    definitionLine: number
  }
}
```

### Example 4: Map/GIS App

```typescript
export interface LocationSelectSignal extends BaseSignal {
  type: 'location-select'
  location: {
    lat: number
    lng: number
    name?: string
    zoom: number
  }
}

export interface LayerToggleSignal extends BaseSignal {
  type: 'layer-toggle'
  layer: {
    id: string
    visible: boolean
    opacity: number
  }
}
```

## Best Practices

### 1. Use Descriptive Type Names

```typescript
// ✅ Good - clear and specific
type: 'user-profile-updated'
type: 'payment-completed'
type: 'document-shared'

// ❌ Bad - too vague
type: 'update'
type: 'done'
type: 'thing'
```

### 2. Group Related Signals

```typescript
// signals/userSignals.ts
export interface UserLoginSignal extends BaseSignal {
  type: 'user-login'
  // ...
}

export interface UserLogoutSignal extends BaseSignal {
  type: 'user-logout'
  // ...
}

// signals/documentSignals.ts
export interface DocumentOpenSignal extends BaseSignal {
  type: 'document-open'
  // ...
}

export interface DocumentSaveSignal extends BaseSignal {
  type: 'document-save'
  // ...
}
```

### 3. Include Useful Context

```typescript
// ✅ Good - includes context
export interface TaskCompletedSignal extends BaseSignal {
  type: 'task-completed'
  task: {
    id: string
    title: string
    completedBy: string
    completedAt: number
    duration: number  // How long it took
    previousStatus: string
  }
}

// ❌ Bad - minimal context
export interface TaskCompletedSignal extends BaseSignal {
  type: 'task-completed'
  taskId: string
}
```

### 4. Make Fields Optional When Appropriate

```typescript
export interface SearchSignal extends BaseSignal {
  type: 'search'
  query: string           // Required
  filters?: {             // Optional
    category?: string[]
    dateRange?: {
      start: Date
      end: Date
    }
  }
  pagination?: {          // Optional
    page: number
    perPage: number
  }
}
```

### 5. Use Union Types for Variants

```typescript
export interface NotificationSignal extends BaseSignal {
  type: 'notification'
  notification: {
    id: string
    timestamp: number
  } & (
    | { level: 'info', message: string }
    | { level: 'warning', message: string, action?: string }
    | { level: 'error', message: string, error: Error, stack?: string }
  )
}
```

## Signal Naming Conventions

### Event Signals

Use past tense for completed actions:

```typescript
'item-clicked'
'user-logged-in'
'file-saved'
'data-loaded'
```

### Request Signals

Use imperative for requests:

```typescript
'load-data'
'save-file'
'open-document'
'fetch-user'
```

### Response Signals

Add suffix for responses:

```typescript
'load-data-response'
'save-file-response'
'fetch-user-response'
```

Or use lifecycle field:

```typescript
// Request
{ type: 'load-data', lifecycle: 'request', ... }

// Response
{ type: 'load-data', lifecycle: 'response', ... }
```

## TypeScript Tips

### Reusable Data Types

```typescript
// Common data structures
export interface Reference {
  book: string
  chapter: number
  verse: number
}

export interface Position {
  x: number
  y: number
}

// Use in signals
export interface VerseClickSignal extends BaseSignal {
  type: 'verse-click'
  reference: Reference  // Reuse
}

export interface MarkerPlacedSignal extends BaseSignal {
  type: 'marker-placed'
  position: Position  // Reuse
  reference: Reference  // Reuse
}
```

### Generic Signals

```typescript
export interface DataUpdatedSignal<T = any> extends BaseSignal {
  type: 'data-updated'
  data: T
  timestamp: number
}

// Use with specific types
type UserUpdated = DataUpdatedSignal<{ userId: string, name: string }>
type ProductUpdated = DataUpdatedSignal<{ productId: string, price: number }>
```

### Discriminated Unions

```typescript
export type AppSignal =
  | ClickSignal
  | NavigationSignal
  | DataSignal
  | ErrorSignal

function handleSignal(signal: AppSignal) {
  switch (signal.type) {
    case 'click':
      // TypeScript knows it's ClickSignal
      console.log(signal.element)
      break
    case 'navigation':
      // TypeScript knows it's NavigationSignal
      console.log(signal.target)
      break
  }
}
```

## Optional: Creating a Signal Registry

You can create your own registry for documentation:

```typescript
// mySignalRegistry.ts
export const signalRegistry = {
  'my-custom-event': {
    name: 'My Custom Event',
    description: 'Fired when user does something',
    commonSenders: ['ComponentA', 'ComponentB'],
    commonReceivers: ['ComponentC'],
    example: {
      type: 'my-custom-event',
      lifecycle: 'event',
      myData: { ... }
    }
  }
}
```

## Migration from Example Signals

If you started with our example signals and want to customize them:

```typescript
// Before - using our example
import { TokenClickSignal } from '@bt-synergy/resource-panels/examples'

// After - your own version
import { BaseSignal } from '@bt-synergy/resource-panels'

export interface WordClickSignal extends BaseSignal {
  type: 'word-click'  // Different name
  word: {
    text: string
    id: string
    // Add your own fields
    morphology?: string
    partOfSpeech?: string
    // Remove fields you don't need
  }
}
```

## Summary

1. ✅ Extend `BaseSignal` to create your signal types
2. ✅ Define signal structure based on YOUR needs
3. ✅ Use descriptive type names
4. ✅ Include useful context in signal data
5. ✅ Group related signals into files
6. ✅ Use TypeScript features (unions, generics, etc.)
7. ✅ Create registry if you want documentation (optional)

The library is infrastructure - **you define what signals make sense for your app!**


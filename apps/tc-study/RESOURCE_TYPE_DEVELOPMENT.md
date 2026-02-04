# Resource Type Development Guide

## Overview

This guide explains how to add new resource types to tc-study with full inter-panel communication support using `@bt-synergy/resource-panels`.

## Quick Start

### 1. Create Your Viewer Component

```tsx
// src/components/resources/MyResourceViewer.tsx
import type { WithPanelCommunicationProps } from '../../resourceTypes'
import type { VerseNavigationSignal } from '../../signals/studioSignals'

interface MyResourceViewerProps extends WithPanelCommunicationProps {
  resourceId: string
  resourceKey: string
}

export function MyResourceViewerBase({ 
  resourceId, 
  resourceKey,
  sendSignal,  // ← Injected by withPanelCommunication
  sendToPanel,
  sendToResource
}: MyResourceViewerProps) {
  
  // Handle user actions by sending signals
  const handleItemClick = (verse: any) => {
    sendSignal<VerseNavigationSignal>('verse-navigation', {
      verse: { book: verse.book, chapter: verse.chapter, verse: verse.verse }
    })
  }
  
  return (
    <div>
      {/* Your UI here */}
      <button onClick={() => handleItemClick(someVerse)}>
        Navigate
      </button>
    </div>
  )
}
```

### 2. Wrap with Panel Communication

```tsx
// src/components/resources/MyResourceViewer.tsx (continued)
import { withPanelCommunication } from '../../resourceTypes'

export const MyResourceViewer = withPanelCommunication(
  MyResourceViewerBase,
  'my-resource-type',
  {
    // What signals this viewer can send
    sends: ['verse-navigation', 'token-click'],
    
    // What signals this viewer responds to
    receives: {
      'verse-navigation': (props, signal) => {
        // Handle incoming navigation
        console.log('Navigate to:', signal.verse)
      }
    },
    
    // Optional: metadata for better filtering
    metadata: (props) => ({
      language: props.language,
      subject: 'MySubject'
    }),
    
    // Optional: enable debug logging
    debug: false
  }
)
```

### 3. Register the Resource Type

```tsx
// src/resourceTypes/myResource.ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { MyResourceLoader } from '@bt-synergy/my-resource-loader'
import { MyResourceViewer } from '../components/resources/MyResourceViewer'

export const myResourceType = defineResourceType({
  id: 'my-resource-type',
  displayName: 'My Resource',
  description: 'Description of my resource',
  icon: 'BookOpen',
  
  subjects: ['My Subject'],
  aliases: ['my-resource', 'myres'],
  
  loader: MyResourceLoader,
  viewer: MyResourceViewer,  // ← Already wrapped with panel communication!
  
  features: {
    highlighting: true,
    search: true,
    navigation: true
  }
})
```

### 4. Register in CatalogContext

```tsx
// src/contexts/CatalogContext.tsx
import { myResourceType } from '../resourceTypes/myResource'

// In the initialization:
resourceTypeRegistry.register(myResourceType)
```

### 5. Export from index

```tsx
// src/resourceTypes/index.ts
export { myResourceType } from './myResource'
```

## Available Signals

See `src/signals/studioSignals.ts` for all available signals:

- `verse-navigation` - Navigate to a verse
- `token-click` - Word clicked in scripture
- `entry-link-click` - Resource entry link clicked
- `text-selection` - Text selected/highlighted
- `scroll-sync` - Sync scrolling between panels
- And more...

## Signal Discovery

Query the registry to see what signals are available:

```tsx
import { STUDIO_SIGNAL_REGISTRY } from '../signals/studioSignals'

// See all available signals
console.log(Object.keys(STUDIO_SIGNAL_REGISTRY))

// Get info about a specific signal
const signalInfo = STUDIO_SIGNAL_REGISTRY['verse-navigation']
console.log(signalInfo.description)
console.log(signalInfo.typicalSenders)
console.log(signalInfo.typicalReceivers)
```

## Advanced: Custom Signals

If the studio signals don't fit your needs, define custom signals:

```tsx
// src/signals/myCustomSignals.ts
import type { BaseSignal } from '@bt-synergy/resource-panels'

export interface MyCustomSignal extends BaseSignal {
  type: 'my-custom-signal'
  myData: {
    foo: string
    bar: number
  }
}
```

Then use it in your viewer:

```tsx
sendSignal<MyCustomSignal>('my-custom-signal', {
  myData: { foo: 'hello', bar: 42 }
})
```

## Targeted Communication

Send signals to specific targets:

```tsx
// Send to all resources (broadcast)
sendSignal<VerseNavigationSignal>('verse-navigation', { verse })

// Send to specific panel
sendToPanel<VerseNavigationSignal>('panel-2', 'verse-navigation', { verse })

// Send to specific resource
sendToResource<VerseNavigationSignal>('resource-123', 'verse-navigation', { verse })
```

## Best Practices

1. **Use Standard Signals**: Prefer `studioSignals` over custom signals for interoperability
2. **Type Safety**: Always use the generic type parameter: `sendSignal<VerseNavigationSignal>(...)`
3. **Signal Documentation**: Add your signals to the registry for discoverability
4. **Minimal Props**: Only inject `sendSignal`, `sendToPanel`, `sendToResource` - keep viewer props clean
5. **Debug Mode**: Enable debug logging during development to see signal flow
6. **Resource Metadata**: Provide accurate metadata for better signal filtering

## Testing

Test your viewer with the Panel System Test page:

1. Navigate to `/test`
2. Add your resource to a panel
3. Send signals and verify they're received
4. Check the Signal Monitor to see all communication

## Examples

See these files for complete examples:

- `src/components/test/TestResourceWithPanels.tsx` - Full example with all features
- `src/components/resources/ScriptureViewer/` - Real-world scripture viewer (TODO: update to use this system)
- `src/resourceTypes/scripture/` - Complete resource type registration

## Troubleshooting

**Signals not being received?**
- Check resourceId is correct and matches between sender/receiver
- Verify signal type string matches exactly
- Check Signal Monitor in test page
- Enable debug mode to see logs

**TypeScript errors?**
- Ensure you're importing signal types from `../signals`
- Use the generic type parameter: `sendSignal<SignalType>(...)`
- Check `WithPanelCommunicationProps` is extended correctly

**Component not rendering?**
- Check ViewerRegistry has the viewer registered
- Verify resource type ID matches across registration
- Check CatalogContext initialization logs

## Next Steps

1. Create your viewer component
2. Wrap with `withPanelCommunication`
3. Define your resource type
4. Register in CatalogContext
5. Test in Panel System Test page
6. Update this guide with your learnings!

---

**Questions?** See `packages/resource-panels/README.md` for the full library documentation.

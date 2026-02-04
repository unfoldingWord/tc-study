# @bt-synergy/navigation

Cross-platform navigation interfaces for BT Synergy apps. Works with both **React (web)** and **React Native**.

## Installation

```bash
bun add @bt-synergy/navigation
```

## Philosophy

This package provides **interface-only** navigation contracts. Your app provides the implementation, and resource viewers use the interfaces. This allows:

- ✅ **Platform independence** - Same interfaces work on web and mobile
- ✅ **Flexibility** - Apps control their routing/navigation logic
- ✅ **Type safety** - Full TypeScript support
- ✅ **Testability** - Easy to mock in tests
- ✅ **Reusability** - Resource packages work in any app

## Quick Start

### 1. App provides implementation

<details>
<summary><strong>Web Example (React Router)</strong></summary>

```tsx
// apps/tc-study/src/providers/NavigationProvider.tsx
import { NavigationContext, type NavigationProvider } from '@bt-synergy/navigation';
import { useNavigate } from 'react-router-dom';
import { type ReactNode } from 'react';

export function TCStudyNavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  
  const navigationProvider: NavigationProvider = {
    // Verse navigation
    goToVerse: (ref) => {
      navigate(`/passage/${ref.book}/${ref.chapter}:${ref.verse}`);
    },
    
    goToVerseRange: (range) => {
      navigate(`/passage/${range.start.book}/${range.start.chapter}:${range.start.verse}-${range.end.verse}`);
    },
    
    goToChapter: (book, chapter) => {
      navigate(`/passage/${book}/${chapter}`);
    },
    
    goToBook: (book) => {
      navigate(`/passage/${book}`);
    },
    
    // Resource navigation
    goToResource: (ref) => {
      if (ref.location) {
        navigate(`/resource/${ref.id}?location=${JSON.stringify(ref.location)}`);
      } else {
        navigate(`/resource/${ref.id}`);
      }
    },
    
    openInPanel: (target) => {
      // Your panel management logic
      const panelId = target.panelId || 'default';
      navigate(`/studio?panel=${panelId}&resource=${target.resourceRef.id}`);
    },
    
    openInNewPanel: (ref) => {
      // Open in new panel or window
      window.open(`/resource/${ref.id}`, '_blank');
    },
    
    // App navigation
    goToRoute: (route, params) => {
      navigate(route, { state: params });
    },
    
    openExternal: (options) => {
      window.open(options.url, options.external ? '_blank' : '_self');
    },
    
    // History
    getHistory: () => ({
      canGoBack: window.history.length > 1,
      canGoForward: false,
      currentLocation: window.location.pathname,
    }),
    
    goBack: () => {
      navigate(-1);
    },
    
    goForward: () => {
      navigate(1);
    },
    
    canGoBack: () => window.history.length > 1,
    
    canGoForward: () => false,
  };
  
  return (
    <NavigationContext.Provider value={navigationProvider}>
      {children}
    </NavigationContext.Provider>
  );
}
```

Then wrap your app:

```tsx
// apps/tc-study/src/App.tsx
import { BrowserRouter } from 'react-router-dom';
import { TCStudyNavigationProvider } from './providers/NavigationProvider';

function App() {
  return (
    <BrowserRouter>
      <TCStudyNavigationProvider>
        {/* Your app */}
      </TCStudyNavigationProvider>
    </BrowserRouter>
  );
}
```

</details>

<details>
<summary><strong>React Native Example (React Navigation)</strong></summary>

```tsx
// apps/mobile/src/providers/NavigationProvider.tsx
import { NavigationContext, type NavigationProvider } from '@bt-synergy/navigation';
import { useNavigation } from '@react-navigation/native';
import { Linking } from 'react-native';
import { type ReactNode } from 'react';

export function MobileNavigationProvider({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  
  const navigationProvider: NavigationProvider = {
    // Verse navigation
    goToVerse: (ref) => {
      navigation.navigate('Passage', { 
        book: ref.book, 
        chapter: ref.chapter, 
        verse: ref.verse 
      });
    },
    
    goToVerseRange: (range) => {
      navigation.navigate('Passage', { 
        book: range.start.book,
        chapter: range.start.chapter,
        startVerse: range.start.verse,
        endVerse: range.end.verse,
      });
    },
    
    goToChapter: (book, chapter) => {
      navigation.navigate('Passage', { book, chapter });
    },
    
    goToBook: (book) => {
      navigation.navigate('Passage', { book });
    },
    
    // Resource navigation
    goToResource: (ref) => {
      navigation.navigate('Resource', { 
        resourceId: ref.id,
        location: ref.location,
      });
    },
    
    openInPanel: (target) => {
      // Mobile might not have panels, navigate to resource
      navigation.navigate('Resource', { 
        resourceId: target.resourceRef.id 
      });
    },
    
    openInNewPanel: (ref) => {
      // Open in modal on mobile
      navigation.navigate('ResourceModal', { resourceId: ref.id });
    },
    
    // App navigation
    goToRoute: (route, params) => {
      navigation.navigate(route as any, params);
    },
    
    openExternal: async (options) => {
      await Linking.openURL(options.url);
    },
    
    // History
    getHistory: () => ({
      canGoBack: navigation.canGoBack(),
      canGoForward: false,
      currentLocation: null,
    }),
    
    goBack: () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    },
    
    goForward: () => {
      // Not typically supported in mobile
    },
    
    canGoBack: () => navigation.canGoBack(),
    
    canGoForward: () => false,
  };
  
  return (
    <NavigationContext.Provider value={navigationProvider}>
      {children}
    </NavigationContext.Provider>
  );
}
```

</details>

### 2. Resource viewers use navigation

```tsx
// packages/scripture-resource/src/ScriptureViewer.tsx
import { useNavigation, type VerseRef } from '@bt-synergy/navigation';

export function ScriptureViewer({ resourceId }: { resourceId: string }) {
  const navigation = useNavigation();
  
  const handleVerseClick = (ref: VerseRef) => {
    // Works on both web and mobile!
    navigation.goToVerse(ref);
  };
  
  const handleOpenInNewPanel = () => {
    navigation.openInNewPanel({ id: resourceId });
  };
  
  return (
    <div>
      <button onClick={() => handleVerseClick({ book: 'JHN', chapter: 3, verse: 16 })}>
        John 3:16
      </button>
      <button onClick={handleOpenInNewPanel}>
        Open in New Panel
      </button>
    </div>
  );
}
```

## Convenience Hooks

### `useVerseNavigation()`

For verse-centric resources:

```tsx
import { useVerseNavigation } from '@bt-synergy/navigation';

function ScriptureNavBar() {
  const { goToVerse, goToChapter, goToBook } = useVerseNavigation();
  
  return (
    <div>
      <button onClick={() => goToBook('GEN')}>Genesis</button>
      <button onClick={() => goToChapter('GEN', 1)}>Genesis 1</button>
      <button onClick={() => goToVerse({ book: 'GEN', chapter: 1, verse: 1 })}>
        Genesis 1:1
      </button>
    </div>
  );
}
```

### `useResourceNavigation()`

For resource management:

```tsx
import { useResourceNavigation } from '@bt-synergy/navigation';

function ResourceCard({ resourceId }) {
  const { goToResource, openInNewPanel } = useResourceNavigation();
  
  return (
    <div>
      <button onClick={() => goToResource({ id: resourceId })}>
        Open
      </button>
      <button onClick={() => openInNewPanel({ id: resourceId })}>
        New Panel
      </button>
    </div>
  );
}
```

### `useNavigationHistory()`

For history controls:

```tsx
import { useNavigationHistory } from '@bt-synergy/navigation';

function HistoryButtons() {
  const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory();
  
  return (
    <div>
      <button disabled={!canGoBack()} onClick={goBack}>
        ← Back
      </button>
      <button disabled={!canGoForward()} onClick={goForward}>
        Forward →
      </button>
    </div>
  );
}
```

### `useHasNavigation()`

For optional navigation:

```tsx
import { useHasNavigation } from '@bt-synergy/navigation';

function OptionalNavButton() {
  const hasNav = useHasNavigation();
  
  if (!hasNav) {
    return null; // Hide button if navigation not available
  }
  
  return <NavigateButton />;
}
```

## Type Definitions

### `VerseRef`

```typescript
interface VerseRef {
  book: string;    // 'GEN', 'MAT', 'gen', 'mat', etc.
  chapter: number; // 1-indexed
  verse: number;   // 1-indexed
}
```

### `ResourceRef`

```typescript
interface ResourceRef {
  id: string;
  location?: VerseRef | string; // Optional initial location
}
```

### `PanelTarget`

```typescript
interface PanelTarget {
  resourceRef: ResourceRef;
  panelId?: string;        // Target panel (undefined = default)
  createIfNeeded?: boolean; // Create panel if doesn't exist
}
```

## Testing

Mock the navigation provider in tests:

```tsx
import { NavigationContext, type NavigationProvider } from '@bt-synergy/navigation';

const mockNavigation: NavigationProvider = {
  goToVerse: vi.fn(),
  goToVerseRange: vi.fn(),
  goToChapter: vi.fn(),
  goToBook: vi.fn(),
  goToResource: vi.fn(),
  openInPanel: vi.fn(),
  openInNewPanel: vi.fn(),
  goToRoute: vi.fn(),
  openExternal: vi.fn(),
  getHistory: vi.fn(() => ({ canGoBack: true, canGoForward: false, currentLocation: null })),
  goBack: vi.fn(),
  goForward: vi.fn(),
  canGoBack: vi.fn(() => true),
  canGoForward: vi.fn(() => false),
};

function renderWithNavigation(component: React.ReactElement) {
  return render(
    <NavigationContext.Provider value={mockNavigation}>
      {component}
    </NavigationContext.Provider>
  );
}
```

## Best Practices

1. **Keep implementations simple** - Map to your app's routing system
2. **Handle edge cases** - Check `canGoBack()` before calling `goBack()`
3. **Platform differences** - Mobile and web navigation may differ (e.g., panels)
4. **Error boundaries** - Wrap navigation calls in try-catch if needed
5. **Accessibility** - Use semantic navigation (buttons, links)

## License

MIT

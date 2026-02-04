/**
 * Navigation hooks for resource viewers
 * Cross-platform (React & React Native)
 */

import { useContext, useCallback } from 'react';
import { NavigationContext } from './context';
import type { NavigationProvider, VerseRef, ResourceRef, PanelTarget } from './types';

/**
 * Access navigation functionality
 * 
 * @throws Error if used outside of NavigationContext.Provider
 * 
 * @example
 * ```tsx
 * function ScriptureViewer() {
 *   const navigation = useNavigation();
 *   
 *   const handleVerseClick = (ref: VerseRef) => {
 *     navigation.goToVerse(ref);
 *   };
 *   
 *   return <div onClick={handleVerseClick}>...</div>;
 * }
 * ```
 */
export function useNavigation(): NavigationProvider {
  const navigation = useContext(NavigationContext);
  
  if (!navigation) {
    throw new Error(
      'useNavigation must be used within a NavigationContext.Provider. ' +
      'Make sure your app provides a navigation implementation.'
    );
  }
  
  return navigation;
}

/**
 * Check if navigation is available
 * Useful for optional navigation features
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const hasNav = useHasNavigation();
 *   
 *   if (!hasNav) {
 *     return <div>Navigation not available</div>;
 *   }
 *   
 *   return <NavigationButtons />;
 * }
 * ```
 */
export function useHasNavigation(): boolean {
  const navigation = useContext(NavigationContext);
  return navigation !== null;
}

/**
 * Get verse navigation functions
 * Convenience hook for verse-centric resources
 * 
 * @example
 * ```tsx
 * function ScriptureViewer() {
 *   const { goToVerse, goToChapter } = useVerseNavigation();
 *   
 *   return (
 *     <div>
 *       <button onClick={() => goToChapter('GEN', 1)}>Genesis 1</button>
 *       <button onClick={() => goToVerse({ book: 'JHN', chapter: 3, verse: 16 })}>
 *         John 3:16
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useVerseNavigation() {
  const navigation = useNavigation();
  
  const goToVerse = useCallback(
    (ref: VerseRef) => navigation.goToVerse(ref),
    [navigation]
  );
  
  const goToVerseRange = useCallback(
    (start: VerseRef, end: VerseRef) => navigation.goToVerseRange({ start, end }),
    [navigation]
  );
  
  const goToChapter = useCallback(
    (book: string, chapter: number) => navigation.goToChapter(book, chapter),
    [navigation]
  );
  
  const goToBook = useCallback(
    (book: string) => navigation.goToBook(book),
    [navigation]
  );
  
  return {
    goToVerse,
    goToVerseRange,
    goToChapter,
    goToBook,
  };
}

/**
 * Get resource navigation functions
 * Convenience hook for resource-centric actions
 * 
 * @example
 * ```tsx
 * function ResourceCard({ resourceId }) {
 *   const { goToResource, openInNewPanel } = useResourceNavigation();
 *   
 *   return (
 *     <div>
 *       <button onClick={() => goToResource({ id: resourceId })}>
 *         Open
 *       </button>
 *       <button onClick={() => openInNewPanel({ id: resourceId })}>
 *         Open in New Panel
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useResourceNavigation() {
  const navigation = useNavigation();
  
  const goToResource = useCallback(
    (ref: ResourceRef) => navigation.goToResource(ref),
    [navigation]
  );
  
  const openInPanel = useCallback(
    (target: PanelTarget) => navigation.openInPanel(target),
    [navigation]
  );
  
  const openInNewPanel = useCallback(
    (ref: ResourceRef) => navigation.openInNewPanel(ref),
    [navigation]
  );
  
  return {
    goToResource,
    openInPanel,
    openInNewPanel,
  };
}

/**
 * Get navigation history functions
 * 
 * @example
 * ```tsx
 * function NavigationBar() {
 *   const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory();
 *   
 *   return (
 *     <div>
 *       <button disabled={!canGoBack()} onClick={goBack}>Back</button>
 *       <button disabled={!canGoForward()} onClick={goForward}>Forward</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useNavigationHistory() {
  const navigation = useNavigation();
  
  const goBack = useCallback(
    () => navigation.goBack(),
    [navigation]
  );
  
  const goForward = useCallback(
    () => navigation.goForward(),
    [navigation]
  );
  
  const canGoBack = useCallback(
    () => navigation.canGoBack(),
    [navigation]
  );
  
  const canGoForward = useCallback(
    () => navigation.canGoForward(),
    [navigation]
  );
  
  const getHistory = useCallback(
    () => navigation.getHistory(),
    [navigation]
  );
  
  return {
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    getHistory,
  };
}

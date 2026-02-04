/**
 * Platform Navigation Adapter
 * 
 * Provides a platform-agnostic interface for navigation that works on both
 * web (React Router DOM) and mobile (Expo Router).
 * 
 * This abstraction allows the NavigationContext to remain platform-independent
 * while delegating platform-specific routing to adapters.
 */

import { NavigationReference } from '../types/context';

// ============================================================================
// PLATFORM-AGNOSTIC NAVIGATION INTERFACE
// ============================================================================

export interface NavigationAdapter {
  // Platform identification
  readonly platform: 'web' | 'mobile';
  
  // URL/Route management
  getCurrentRoute: () => string;
  navigateToRoute: (route: string, replace?: boolean) => void;
  
  // Parameters (query params on web, route params on mobile)
  getRouteParams: () => Record<string, string>;
  setRouteParams: (params: Record<string, string>, replace?: boolean) => void;
  
  // History management (platform-specific)
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  
  // Event listeners for route changes
  onRouteChange: (callback: (route: string, params: Record<string, string>) => void) => () => void;
  
  // Reference conversion utilities
  referenceToRoute: (reference: NavigationReference) => string;
  routeToReference: (route: string, params: Record<string, string>) => NavigationReference | null;
}

// ============================================================================
// ROUTE UTILITIES (SHARED BETWEEN PLATFORMS)
// ============================================================================

export class NavigationRouteUtils {
  /**
   * Convert NavigationReference to route path
   * Format: /workspace/{book}/{chapter}:{verse}[-{endChapter}:{endVerse}]
   */
  static referenceToRoute(reference: NavigationReference): string {
    const { book, chapter, verse, endChapter, endVerse } = reference;
    
    let route = `/workspace/${book}/${chapter}:${verse}`;
    
    // Add range if specified
    if (endChapter && endVerse) {
      if (endChapter === chapter) {
        // Same chapter range: 1:1-5
        route += `-${endVerse}`;
      } else {
        // Cross-chapter range: 1:1-2:5
        route += `-${endChapter}:${endVerse}`;
      }
    }
    
    return route;
  }
  
  /**
   * Parse route path to NavigationReference
   */
  static routeToReference(route: string): NavigationReference | null {
    // Match: /workspace/{book}/{chapter}:{verse}[-{endChapter}:{endVerse}]
    const match = route.match(/^\/workspace\/([^\/]+)\/(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
    
    if (!match) return null;
    
    const [, book, chapterStr, verseStr, endChapterStr, endVerseStr] = match;
    const chapter = parseInt(chapterStr);
    const verse = parseInt(verseStr);
    
    const reference: NavigationReference = { book, chapter, verse };
    
    // Parse range if present
    if (endVerseStr) {
      if (endChapterStr) {
        // Cross-chapter range
        reference.endChapter = parseInt(endChapterStr);
        reference.endVerse = parseInt(endVerseStr);
      } else {
        // Same chapter range
        reference.endVerse = parseInt(endVerseStr);
      }
    }
    
    return reference;
  }
  
  /**
   * Generate query parameters for additional state
   */
  static generateQueryParams(additionalState?: Record<string, any>): Record<string, string> {
    if (!additionalState) return {};
    
    const params: Record<string, string> = {};
    
    // Convert all values to strings for URL compatibility
    Object.entries(additionalState).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params[key] = String(value);
      }
    });
    
    return params;
  }
}

// ============================================================================
// WEB ADAPTER (React Router DOM)
// ============================================================================

export class WebNavigationAdapter implements NavigationAdapter {
  readonly platform = 'web' as const;
  
  constructor(
    private navigate: (to: string, options?: { replace?: boolean }) => void,
    private location: { pathname: string; search: string },
    private searchParams: URLSearchParams,
    private setSearchParams: (params: URLSearchParams, options?: { replace?: boolean }) => void
  ) {}
  
  getCurrentRoute(): string {
    return this.location.pathname;
  }
  
  navigateToRoute(route: string, replace = false): void {
    this.navigate(route, { replace });
  }
  
  getRouteParams(): Record<string, string> {
    const params: Record<string, string> = {};
    this.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }
  
  setRouteParams(params: Record<string, string>, replace = false): void {
    const newSearchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) newSearchParams.set(key, value);
    });
    this.setSearchParams(newSearchParams, { replace });
  }
  
  canGoBack(): boolean {
    // On web, we can always attempt to go back (browser handles it)
    return window.history.length > 1;
  }
  
  canGoForward(): boolean {
    // Browser forward state is not directly accessible
    // This would need to be tracked separately if needed
    return false;
  }
  
  goBack(): void {
    window.history.back();
  }
  
  goForward(): void {
    window.history.forward();
  }
  
  onRouteChange(callback: (route: string, params: Record<string, string>) => void): () => void {
    // On web, this would be handled by React Router's route change detection
    // The NavigationContext useEffect handles this
    const handlePopState = () => {
      callback(this.getCurrentRoute(), this.getRouteParams());
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }
  
  referenceToRoute(reference: NavigationReference): string {
    return NavigationRouteUtils.referenceToRoute(reference);
  }
  
  routeToReference(route: string, params: Record<string, string>): NavigationReference | null {
    return NavigationRouteUtils.routeToReference(route);
  }
}

// ============================================================================
// MOBILE ADAPTER (Expo Router) - Future Implementation
// ============================================================================

export class MobileNavigationAdapter implements NavigationAdapter {
  readonly platform = 'mobile' as const;
  
  constructor(
    // These would be Expo Router hooks/utilities
    private router: any, // router from expo-router
    private pathname: string,
    private params: Record<string, any>
  ) {}
  
  getCurrentRoute(): string {
    return this.pathname;
  }
  
  navigateToRoute(route: string, replace = false): void {
    if (replace) {
      this.router.replace(route);
    } else {
      this.router.push(route);
    }
  }
  
  getRouteParams(): Record<string, string> {
    // Convert all params to strings
    const stringParams: Record<string, string> = {};
    Object.entries(this.params).forEach(([key, value]) => {
      stringParams[key] = String(value);
    });
    return stringParams;
  }
  
  setRouteParams(params: Record<string, string>, replace = false): void {
    // On mobile, params are typically part of the route
    // This would need to be implemented based on Expo Router patterns
    const currentRoute = this.getCurrentRoute();
    const queryString = new URLSearchParams(params).toString();
    const newRoute = queryString ? `${currentRoute}?${queryString}` : currentRoute;
    
    this.navigateToRoute(newRoute, replace);
  }
  
  canGoBack(): boolean {
    return this.router.canGoBack();
  }
  
  canGoForward(): boolean {
    // Expo Router doesn't have forward navigation like web browsers
    return false;
  }
  
  goBack(): void {
    if (this.canGoBack()) {
      this.router.back();
    }
  }
  
  goForward(): void {
    // Not supported on mobile
    console.warn('Forward navigation not supported on mobile platform');
  }
  
  onRouteChange(callback: (route: string, params: Record<string, string>) => void): () => void {
    // Expo Router would have its own route change listeners
    // This is a placeholder implementation
    return () => {};
  }
  
  referenceToRoute(reference: NavigationReference): string {
    return NavigationRouteUtils.referenceToRoute(reference);
  }
  
  routeToReference(route: string, params: Record<string, string>): NavigationReference | null {
    return NavigationRouteUtils.routeToReference(route);
  }
}

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

export class NavigationAdapterFactory {
  /**
   * Create appropriate navigation adapter based on platform
   */
  static create(platform: 'web' | 'mobile', platformSpecificDeps: any): NavigationAdapter {
    switch (platform) {
      case 'web':
        return new WebNavigationAdapter(
          platformSpecificDeps.navigate,
          platformSpecificDeps.location,
          platformSpecificDeps.searchParams,
          platformSpecificDeps.setSearchParams
        );
      
      case 'mobile':
        return new MobileNavigationAdapter(
          platformSpecificDeps.router,
          platformSpecificDeps.pathname,
          platformSpecificDeps.params
        );
      
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

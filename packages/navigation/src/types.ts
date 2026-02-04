/**
 * Cross-platform navigation types for BT Synergy apps
 * 
 * These interfaces work with both React (web) and React Native.
 * Apps provide platform-specific implementations.
 */

/**
 * Biblical verse reference
 */
export interface VerseRef {
  /** Book identifier (e.g., 'GEN', 'MAT', 'gen', 'mat') */
  book: string;
  /** Chapter number (1-indexed) */
  chapter: number;
  /** Verse number (1-indexed) */
  verse: number;
}

/**
 * Range of verses
 */
export interface VerseRange {
  start: VerseRef;
  end: VerseRef;
}

/**
 * Resource reference for navigation
 */
export interface ResourceRef {
  /** Unique resource identifier */
  id: string;
  /** Optional initial location within the resource */
  location?: VerseRef | string;
}

/**
 * Panel-specific navigation target
 */
export interface PanelTarget {
  /** Resource to open */
  resourceRef: ResourceRef;
  /** Target panel ID (undefined = current/default panel) */
  panelId?: string;
  /** Create new panel if needed */
  createIfNeeded?: boolean;
}

/**
 * External link navigation options
 */
export interface ExternalLinkOptions {
  /** URL to open */
  url: string;
  /** Open in system browser (mobile) or new tab (web) */
  external?: boolean;
  /** Optional title for the link (for accessibility) */
  title?: string;
}

/**
 * Navigation history state
 */
export interface NavigationHistory {
  canGoBack: boolean;
  canGoForward: boolean;
  currentLocation: string | VerseRef | null;
}

/**
 * Cross-platform navigation provider interface
 * 
 * Apps implement this interface to provide platform-specific navigation.
 * Resource viewers use this interface through the useNavigation hook.
 * 
 * @example Web implementation (React Router)
 * ```ts
 * const navigation: NavigationProvider = {
 *   goToVerse: (ref) => navigate(`/passage/${ref.book}/${ref.chapter}:${ref.verse}`),
 *   goToResource: (ref) => navigate(`/resource/${ref.id}`),
 *   // ...
 * }
 * ```
 * 
 * @example Mobile implementation (React Navigation)
 * ```ts
 * const navigation: NavigationProvider = {
 *   goToVerse: (ref) => navigation.navigate('Passage', { ref }),
 *   goToResource: (ref) => navigation.navigate('Resource', { resourceId: ref.id }),
 *   // ...
 * }
 * ```
 */
export interface NavigationProvider {
  // ===== VERSE NAVIGATION =====
  
  /**
   * Navigate to a specific verse
   * @param ref Verse reference
   */
  goToVerse(ref: VerseRef): void;
  
  /**
   * Navigate to a range of verses
   * @param range Verse range
   */
  goToVerseRange(range: VerseRange): void;
  
  /**
   * Navigate to a chapter (first verse)
   * @param book Book identifier
   * @param chapter Chapter number
   */
  goToChapter(book: string, chapter: number): void;
  
  /**
   * Navigate to a book (first verse of first chapter)
   * @param book Book identifier
   */
  goToBook(book: string): void;
  
  // ===== RESOURCE NAVIGATION =====
  
  /**
   * Navigate to a resource
   * @param ref Resource reference
   */
  goToResource(ref: ResourceRef): void;
  
  /**
   * Open resource in a specific panel
   * @param target Panel-specific target
   */
  openInPanel(target: PanelTarget): void;
  
  /**
   * Open resource in a new panel/window
   * @param ref Resource reference
   */
  openInNewPanel(ref: ResourceRef): void;
  
  // ===== APP NAVIGATION =====
  
  /**
   * Navigate to a route within the app
   * @param route Route path (app-specific format)
   * @param params Optional route parameters
   */
  goToRoute(route: string, params?: Record<string, any>): void;
  
  /**
   * Open an external link
   * @param options Link options
   */
  openExternal(options: ExternalLinkOptions): void;
  
  // ===== HISTORY =====
  
  /**
   * Get current navigation history state
   */
  getHistory(): NavigationHistory;
  
  /**
   * Navigate back in history
   */
  goBack(): void;
  
  /**
   * Navigate forward in history
   */
  goForward(): void;
  
  /**
   * Check if can navigate back
   */
  canGoBack(): boolean;
  
  /**
   * Check if can navigate forward
   */
  canGoForward(): boolean;
}

/**
 * Optional subset of navigation features
 * Apps can implement partial navigation if some features aren't supported
 */
export type PartialNavigationProvider = Partial<NavigationProvider>;

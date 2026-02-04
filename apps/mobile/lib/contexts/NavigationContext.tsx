/**
 * NavigationContext - Zustand-based navigation state management
 * 
 * This context manages the navigation state including:
 * - Current book and reference position
 * - Available books and their metadata
 * - URL synchronization
 * - Reference parsing and validation
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import {
  BookInfo,
  NavigationProviderProps,
  NavigationReference,
  NavigationStore,
  ResourceType,
  TranslatorSection
} from '../types/context'
import { useWorkspaceSelector, useWorkspaceStore } from './WorkspaceContext'

// ============================================================================
// NAVIGATION STATE PERSISTENCE
// ============================================================================

const NAVIGATION_STORAGE_KEY = 'bt-synergy-navigation-state'
const NAVIGATION_STATE_VERSION = '1.0.0'

interface PersistedNavigationState {
  version: string
  currentBook: string
  currentReference: NavigationReference
  availableBooks: BookInfo[]
  navigationHistory: NavigationReference[]
  historyIndex: number
  lastUpdated: string
}

// ============================================================================
// ZUSTAND STORE DEFINITION
// ============================================================================

const useNavigationStore = create<NavigationStore>()(
  devtools(
    immer((set, get) => ({
      // ========================================================================
      // INITIAL STATE
      // ========================================================================
      currentBook: 'tit',  // Updated to match new default
      currentReference: {
        book: 'tit',
        chapter: 1,
        verse: 1
      },
      
      // Persistence state
      isInitialized: false,
      isRestoring: false,
      saveTimeout: null as NodeJS.Timeout | null,
      availableBooks: [
        { code: 'gen', name: 'Genesis', testament: 'OT' },
        { code: 'exo', name: 'Exodus', testament: 'OT' },
        { code: 'mat', name: 'Matthew', testament: 'NT' },
        { code: 'jhn', name: 'John', testament: 'NT' },
        { code: 'tit', name: 'Titus', testament: 'NT' }
      ],
      
      // Navigation history - start empty, will be populated by initialization
      navigationHistory: [],
      historyIndex: -1, // Will be set to 0 when first navigation occurs
      maxHistorySize: 50,

      // ========================================================================
      // NAVIGATION ACTIONS
      // ========================================================================
      
      navigateToBook: (bookCode: string) => {
                
        const bookInfo = get().getBookInfo(bookCode)
        if (!bookInfo) {
          console.warn(`❌ Book not found: ${bookCode}`)
          return
        }

        const newReference = {
          book: bookCode,
          chapter: 1,
          verse: 1
        }

        set((state) => {
          // Handle first navigation (empty history) or add to history
          if (state.navigationHistory.length === 0) {
            // First navigation - initialize history
            state.navigationHistory = [{ ...newReference }];
            state.historyIndex = 0;
          } else {
            // Check if this is a different reference
            const currentRef = state.currentReference;
            const isSameReference = 
              currentRef.book === newReference.book &&
              currentRef.chapter === newReference.chapter &&
              currentRef.verse === newReference.verse;
            
            if (!isSameReference) {
              // Remove any forward history when navigating to a new location
              state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
              
              // Add new reference to history
              state.navigationHistory.push({ ...newReference });
              
              // Maintain max history size
              if (state.navigationHistory.length > state.maxHistorySize) {
                state.navigationHistory = state.navigationHistory.slice(-state.maxHistorySize);
              }
              
              // Update history index
              state.historyIndex = state.navigationHistory.length - 1;
            }
          }
          
          state.currentBook = bookCode
          state.currentReference = newReference
        })

        // Update URL
        get().updateURL(get().currentReference)
        
        // Save navigation state (debounced)
        get().saveNavigationState()
        
        // Note: Content loading will be handled by components that need chapter/verse data
      },

      navigateToReference: (reference: NavigationReference) => {
                
        // Validate the reference
        const bookInfo = get().getBookInfo(reference.book)
        if (!bookInfo) {
          console.warn(`❌ Invalid book: ${reference.book}`)
          return
        }

        // Validate chapter and verse ranges
        const maxChapters = bookInfo.chapters || 999 // Use a high number if chapters not available
        const chapter = Math.max(1, Math.min(reference.chapter || 1, maxChapters))
        const verse = Math.max(1, reference.verse || 1)

        const validatedReference: NavigationReference = {
          book: reference.book,
          chapter,
          verse,
          endChapter: reference.endChapter,
          endVerse: reference.endVerse
        }

        set((state) => {
          // Add to history (if not navigating via history)
          const currentRef = state.currentReference;
          const isSameReference = 
            currentRef.book === validatedReference.book &&
            currentRef.chapter === validatedReference.chapter &&
            currentRef.verse === validatedReference.verse &&
            currentRef.endChapter === validatedReference.endChapter &&
            currentRef.endVerse === validatedReference.endVerse;
          
          // Handle first navigation (empty history) or different reference
          if (state.navigationHistory.length === 0 || !isSameReference) {
            if (state.navigationHistory.length === 0) {
              // First navigation - initialize history
              state.navigationHistory = [{ ...validatedReference }];
              state.historyIndex = 0;
            } else {
              // Remove any forward history when navigating to a new location
              state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
              
              // Add new reference to history
              state.navigationHistory.push({ ...validatedReference });
              
              // Maintain max history size
              if (state.navigationHistory.length > state.maxHistorySize) {
                state.navigationHistory = state.navigationHistory.slice(-state.maxHistorySize);
              }
              
              // Update history index
              state.historyIndex = state.navigationHistory.length - 1;
            }
          }
          
          state.currentBook = reference.book
          state.currentReference = validatedReference
        })

        // Update URL
        get().updateURL(validatedReference)
        
        // Save navigation state
        get().saveNavigationState()
      },

      navigateToChapter: (chapter: number) => {
        const currentRef = get().currentReference
        const bookInfo = get().getBookInfo(currentRef.book)
        
        if (!bookInfo) {
          console.warn(`❌ No book info for: ${currentRef.book}`)
          return
        }

        const validChapter = Math.max(1, Math.min(chapter, bookInfo.chapters || 1))
        
        get().navigateToReference({
          book: currentRef.book,
          chapter: validChapter,
          verse: 1
        })
      },

      navigateToVerse: (verse: number) => {
        const currentRef = get().currentReference
        
        get().navigateToReference({
          book: currentRef.book,
          chapter: currentRef.chapter || 1,
          verse: Math.max(1, verse)
        })
      },

      navigateToRange: (startChapter: number, startVerse: number, endChapter?: number, endVerse?: number) => {
        const currentRef = get().currentReference
        
        get().navigateToReference({
          book: currentRef.book,
          chapter: startChapter,
          verse: startVerse,
          endChapter,
          endVerse
        })
      },

      // ========================================================================
      // URL SYNCHRONIZATION ACTIONS
      // ========================================================================
      
      updateURL: (reference: NavigationReference) => {
        return null
      },

      parseURLReference: (ref: string): NavigationReference | null => {
        if (!ref) return null

        try {
          // Parse reference formats:
          // - "1" -> chapter 1
          // - "1:4" -> chapter 1, verse 4
          // - "1:4-6" -> chapter 1, verses 4-6
          // - "1:4-2:6" -> chapter 1 verse 4 to chapter 2 verse 6
          
          const parts = ref.split('-')
          const startPart = parts[0]
          const endPart = parts[1]

          // Parse start reference
          const startMatch = startPart.match(/^(\d+)(?::(\d+))?$/)
          if (!startMatch) return null

          const startChapter = parseInt(startMatch[1], 10)
          const startVerse = startMatch[2] ? parseInt(startMatch[2], 10) : undefined

          let endChapter: number | undefined
          let endVerse: number | undefined

          // Parse end reference if it exists
          if (endPart) {
            const endMatch = endPart.match(/^(?:(\d+):)?(\d+)$/)
            if (endMatch) {
              endChapter = endMatch[1] ? parseInt(endMatch[1], 10) : startChapter
              endVerse = parseInt(endMatch[2], 10)
            }
          }

          const currentBook = get().currentBook

          return {
            book: currentBook,
            chapter: startChapter,
            verse: startVerse,
            endChapter,
            endVerse
          }
        } catch (error) {
          console.warn('❌ Failed to parse reference:', ref, error)
          return null
        }
      },

      // ========================================================================
      // BOOK MANAGEMENT ACTIONS
      // ========================================================================
      
      setAvailableBooks: (books: BookInfo[]) => {
                
        set((state) => {
          state.availableBooks = books
        })
      },

      getBookInfo: (bookCode: string): BookInfo | null => {
        return get().availableBooks.find(book => book.code === bookCode) || null
      },

      // Load book content and extract chapter/verse info
      // This method will be enhanced by the NavigationProvider component
      loadBookContent: async (bookCode: string) => {
                // This will be implemented via the provider component that has access to workspace
        return null
      },

      // Get chapter count from loaded content or return default
      getChapterCount: async (bookCode: string): Promise<number> => {
        const bookInfo = get().getBookInfo(bookCode)
        
        // If we already have chapter count, return it
        if (bookInfo?.chapters) {
          return bookInfo.chapters
        }
        
        // Try to load content if workspace is available
        if ((window as any).loadBookContentWithWorkspace) {
          try {
            const content = await (window as any).loadBookContentWithWorkspace(bookCode)
            return content?.chapters?.length || 1
          } catch (error) {
            console.warn(`Failed to load content for ${bookCode}:`, error)
          }
        }
        
        // Return default chapter count for common books
        const defaultChapters: Record<string, number> = {
          'tit': 3, 'phm': 1, 'jud': 1, '2jn': 1, '3jn': 1
        }
        return defaultChapters[bookCode] || 1
      },

      // Get verse count from loaded content or return default
      getVerseCount: async (bookCode: string, chapter: number): Promise<number> => {
        // Try to load content if workspace is available
        if ((window as any).loadBookContentWithWorkspace) {
          try {
            const content = await (window as any).loadBookContentWithWorkspace(bookCode)
            if (content?.chapters?.[chapter - 1]?.verses) {
              return content.chapters[chapter - 1].verses.length
            }
          } catch (error) {
            console.warn(`Failed to load content for ${bookCode}:`, error)
          }
        }
        
        // Return reasonable default
        return 31
      },

      getBookSections: async (bookCode: string): Promise<TranslatorSection[]> => {
        let workspaceSections: TranslatorSection[] | null = null
        
        // Try to load content if workspace is available
        if ((window as any).loadBookContentWithWorkspace) {
          try {
            const content = await (window as any).loadBookContentWithWorkspace(bookCode)
            
            if (content?.translatorSections && content.translatorSections.length > 0) {
              workspaceSections = content.translatorSections
            }
          } catch (error) {
            console.warn(`Failed to load sections for ${bookCode}:`, error)
          }
        }
        
        // Check if workspace sections are meaningful
        // Use default sections if:
        // 1. No workspace sections available, OR
        // 2. Only one section that covers the entire book (not useful for navigation)
        const shouldUseDefaultSections = !workspaceSections || 
          (workspaceSections.length === 1 && 
           workspaceSections[0].start.chapter === 1 && 
           workspaceSections[0].start.verse === 1 &&
           workspaceSections[0].end.verse >= 900) // Likely covers entire book
        
        if (shouldUseDefaultSections) {
                    // Fallback to default sections
          const { defaultSectionsService } = await import('../services/default-sections')
          const defaultSections = defaultSectionsService.getDefaultSections(bookCode)
          
          // Convert SectionInfo to TranslatorSection format
          return defaultSections.map(section => ({
            start: section.start,
            end: section.end
          }))
        }
        
                // Use workspace sections if they're meaningful
        return workspaceSections!
      },

      // ========================================================================
      // HISTORY NAVIGATION ACTIONS
      // ========================================================================
      
      canGoBack: () => {
        const state = get();
        return state.historyIndex > 0 && state.navigationHistory.length > 0;
      },

      canGoForward: () => {
        const state = get();
        return state.historyIndex >= 0 && state.historyIndex < state.navigationHistory.length - 1;
      },

      goBack: () => {
        const state = get();
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          const targetReference = state.navigationHistory[newIndex];
          
          set((draft) => {
            draft.historyIndex = newIndex;
            draft.currentBook = targetReference.book;
            draft.currentReference = targetReference;
          });
          
          // Update URL without adding to history
          get().updateURL(targetReference);
          
          // Save navigation state to persist history position
          get().saveNavigationState();
          
          
        }
      },

      goForward: () => {
        const state = get();
        if (state.historyIndex < state.navigationHistory.length - 1) {
          const newIndex = state.historyIndex + 1;
          const targetReference = state.navigationHistory[newIndex];
          
          set((draft) => {
            draft.historyIndex = newIndex;
            draft.currentBook = targetReference.book;
            draft.currentReference = targetReference;
          });
          
          // Update URL without adding to history
          get().updateURL(targetReference);
          
          // Save navigation state to persist history position
          get().saveNavigationState();
          
          
        }
      },

      clearHistory: () => {
        const currentRef = get().currentReference;
        set((state) => {
          state.navigationHistory = [{ ...currentRef }];
          state.historyIndex = 0;
        });
        
        // Save navigation state to persist cleared history
        get().saveNavigationState();
        
        
      },

      getHistoryAt: (index: number) => {
        const state = get();
        if (index >= 0 && index < state.navigationHistory.length) {
          return state.navigationHistory[index];
        }
        return null;
      },

      getHistoryLength: () => {
        return get().navigationHistory.length;
      },

      getCurrentHistoryIndex: () => {
        return get().historyIndex;
      },

      // ========================================================================
      // PERSISTENCE ACTIONS
      // ========================================================================

      saveNavigationState: async () => {
        const state = get();
        if (state.isRestoring) {
          
          return;
        }

        try {
          const persistedState: PersistedNavigationState = {
            version: NAVIGATION_STATE_VERSION,
            currentBook: state.currentBook,
            currentReference: { ...state.currentReference },
            availableBooks: [...state.availableBooks],
            navigationHistory: [...state.navigationHistory],
            historyIndex: state.historyIndex,
            lastUpdated: new Date().toISOString()
          };

          // Use a debounced save to prevent excessive writes
          const currentState = get() as any;
          if (currentState.saveTimeout) {
            clearTimeout(currentState.saveTimeout);
          }
          
          const timeoutId = setTimeout(async () => {
            try {
              await AsyncStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(persistedState));
            } catch (error) {
              console.warn('❌ Failed to save navigation state:', error);
            }
          }, 500); // Debounce saves by 500ms
          
          set((state: any) => {
            state.saveTimeout = timeoutId;
          });
        } catch (error) {
          console.warn('❌ Failed to save navigation state:', error);
        }
      },

      loadNavigationState: async (): Promise<PersistedNavigationState | null> => {
        try {
          const stored = await AsyncStorage.getItem(NAVIGATION_STORAGE_KEY);
          if (!stored) {
            
            return null;
          }

          const persistedState = JSON.parse(stored) as PersistedNavigationState;
          
          // Validate version
          if (persistedState.version !== NAVIGATION_STATE_VERSION) {
            
            return null;
          }

          // Validate state structure
          if (!persistedState.currentBook || !persistedState.currentReference) {
            
            return null;
          }

          return persistedState;
        } catch (error) {
          console.warn('❌ Failed to load navigation state:', error);
          return null;
        }
      },

      restoreNavigationState: async (persistedState: PersistedNavigationState) => {

        
        // Single state update to minimize re-renders
        set((state) => {
          state.isRestoring = true;
          state.currentBook = persistedState.currentBook;
          state.currentReference = { ...persistedState.currentReference };
          state.availableBooks = [...persistedState.availableBooks];
          state.navigationHistory = [...persistedState.navigationHistory];
          state.historyIndex = persistedState.historyIndex;
          
          // Clear restoration flag immediately to prevent blocking
          state.isRestoring = false;
        });

        // Update URL to match restored state
        get().updateURL(persistedState.currentReference);

      },

      clearNavigationState: async () => {
        try {
          await AsyncStorage.removeItem(NAVIGATION_STORAGE_KEY);
          
        } catch (error) {
          console.warn('❌ Failed to clear navigation state:', error);
        }
      },

      setInitialized: (initialized: boolean) => {
        // Only update if the value actually changed to prevent unnecessary re-renders
        const currentState = get();
        if (currentState.isInitialized !== initialized) {
          set((state) => {
            state.isInitialized = initialized;
          });
        }
      }
    })),
    { name: 'navigation-store' }
  )
)

// ============================================================================
// CONTEXT DEFINITION
// ============================================================================

const NavigationContext = createContext<NavigationStore | null>(null)

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function NavigationProvider({ 
  children, 
  initialBook = 'tit',
  initialReference
}: NavigationProviderProps) {
  const store = useNavigationStore()
  
  // Use selector hooks to prevent unnecessary re-renders
  const anchorResource = useWorkspaceSelector(state => state.anchorResource)
  const anchorResourceId = useWorkspaceSelector(state => state.anchorResourceId)
  const setNavigationReady = useWorkspaceSelector(state => state.setNavigationReady)
  
  // Get stable references to functions to prevent infinite loops
  const getOrFetchContentRef = useRef<any>(null)
  const loadInitialAnchorContentRef = useRef<any>(null)
  
  // Update the refs when workspace store changes (using a more stable selector)
  useEffect(() => {
    const workspaceStore = useWorkspaceStore.getState()
    getOrFetchContentRef.current = workspaceStore.getOrFetchContent
    loadInitialAnchorContentRef.current = workspaceStore.loadInitialAnchorContent
  }, [anchorResource?.id, anchorResourceId]) // Only update when these change

  
  // Update available books from anchor resource
  useEffect(() => {
    if (anchorResource?.toc?.books) {
            store.setAvailableBooks(anchorResource.toc.books)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorResource?.id, anchorResource?.toc?.books?.length]) // Depend on stable values

  // getOrFetchContent is now obtained via selector above
  
  // Use useRef to create a stable function reference and cache loaded content
  const loadBookContentWithWorkspaceRef = useRef<((bookCode: string) => Promise<any>) | null>(null)
  const contentCacheRef = useRef<Map<string, any>>(new Map())
  
  // Clear cache when anchor resource changes
  useEffect(() => {
    contentCacheRef.current.clear()
  }, [anchorResource?.id, anchorResourceId]) // Use stable ID instead of full object
  
  // Update the function only when dependencies actually change
  useEffect(() => {
    if (anchorResource && anchorResourceId && getOrFetchContentRef.current) {
      loadBookContentWithWorkspaceRef.current = async (bookCode: string) => {
        // Check cache first
        const cacheKey = `${anchorResource.server}/${anchorResource.owner}/${anchorResource.language}/${anchorResourceId}/${bookCode}`
        if (contentCacheRef.current.has(cacheKey)) {
                    return contentCacheRef.current.get(cacheKey)
        }
        
                
        try {
          // Get content from ResourceManager via WorkspaceContext
          const content = await getOrFetchContentRef.current(cacheKey, ResourceType.SCRIPTURE)
          
          if (content) {
                        // Cache the content
            contentCacheRef.current.set(cacheKey, content)
            return content
          }
          
          return null
        } catch (error) {
          console.error(`❌ Failed to load content for ${bookCode}:`, error)
          return null
        }
      }
      
      // Expose to global only when we have a valid function
      (global as any).loadBookContentWithWorkspace = loadBookContentWithWorkspaceRef.current
    }
  }, [anchorResource?.id, anchorResourceId]) // Only depend on stable IDs, not functions
   

  // Note: URL updating is now handled directly in the updateURL action using updateRouteParams

  // Capture initial values to avoid dependency issues
  const initialValuesRef = useRef({ initialBook, initialReference })
  
  // Initialize navigation from URL or props - wait for anchor resource to be available
  const hasInitialized = useRef(false)
  useEffect(() => {
    // Don't initialize navigation until anchor resource is available
    if (!anchorResource) {
            return
    }
    
    // Only initialize once
    if (hasInitialized.current) {
            return
    }
    
    hasInitialized.current = true
        
    // Simplified initialization - state-only approach
    const initializeNavigation = async () => {
      try {
        // Try to restore from persisted state
        const persistedState = await store.loadNavigationState()
        
        if (persistedState) {
          await store.restoreNavigationState(persistedState)
          
          // Wait for navigation state to propagate before loading content
                    await new Promise(resolve => setTimeout(resolve, 100))
          
          // Load initial content for the restored book
          if (persistedState.currentBook && loadInitialAnchorContentRef.current) {
                        loadInitialAnchorContentRef.current(persistedState.currentBook).catch((error: unknown) => {
              console.warn(`⚠️ Failed to load initial content for restored book ${persistedState.currentBook}:`, error)
            })
          }
        } else {
          // No persisted state, use initial book or default
          const bookToUse = initialBook || 'tit'
                    store.navigateToBook(bookToUse)
          
          // Wait for navigation state to propagate before loading content
                    await new Promise(resolve => setTimeout(resolve, 100))
          
          // Load initial content
          if (loadInitialAnchorContentRef.current) {
                        loadInitialAnchorContentRef.current(bookToUse).catch((error: unknown) => {
              console.warn(`⚠️ Failed to load initial content for ${bookToUse}:`, error)
            })
          }
        }
        
        // Mark as initialized
        store.setInitialized(true)
        
        // Signal that navigation is ready
        setNavigationReady(true)
        
      } catch (error) {
        console.error(`❌ Failed to initialize navigation:`, error)
        // Fallback to default book
        store.navigateToBook('tit')
        store.setInitialized(true)
        
        // Signal that navigation is ready even with fallback
        setNavigationReady(true)
      }
    }
    
    initializeNavigation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorResource?.id]) // Only depend on stable anchorResource ID to prevent infinite loops

  return (
    <NavigationContext.Provider value={store}>
      {children}
    </NavigationContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export function useNavigation(): NavigationStore {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
}

// ============================================================================
// SELECTOR HOOKS FOR PERFORMANCE
// ============================================================================

/**
 * Hook to subscribe to specific parts of the navigation state
 */
export function useNavigationSelector<T>(selector: (state: NavigationStore) => T): T {
  return useNavigationStore(selector)
}

// Stable selector functions to prevent infinite loops
const currentNavigationSelector = (state: NavigationStore) => ({
  currentBook: state.currentBook,
  currentReference: state.currentReference,
  bookInfo: state.getBookInfo(state.currentBook)
})

const availableBooksSelector = (state: NavigationStore) => ({
  books: state.availableBooks,
  getBookInfo: state.getBookInfo
})

const navigationActionsSelector = (state: NavigationStore) => ({
  navigateToBook: state.navigateToBook,
  navigateToReference: state.navigateToReference,
  navigateToChapter: state.navigateToChapter,
  navigateToVerse: state.navigateToVerse,
  navigateToRange: state.navigateToRange,
  
  // History navigation
  canGoBack: state.canGoBack,
  canGoForward: state.canGoForward,
  goBack: state.goBack,
  goForward: state.goForward,
  clearHistory: state.clearHistory,
  getHistoryAt: state.getHistoryAt,
  getHistoryLength: state.getHistoryLength,
  getCurrentHistoryIndex: state.getCurrentHistoryIndex
})

const historyIndexSelector = (state: NavigationStore) => state.historyIndex

/**
 * Hook to get current navigation state
 */
export function useCurrentNavigation() {
  return useNavigationSelector(currentNavigationSelector)
}

/**
 * Hook to get available books
 */
export function useAvailableBooks() {
  return useNavigationSelector(availableBooksSelector)
}

/**
 * Hook to get navigation actions
 */
export function useNavigationActions() {
  return useNavigationSelector(navigationActionsSelector)
}

/**
 * Hook to get history index
 */
export function useNavigationHistoryIndex() {
  return useNavigationSelector(historyIndexSelector)
}

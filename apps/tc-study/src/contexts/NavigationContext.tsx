/**
 * NavigationContext - Manages BCV navigation state
 * 
 * Responsibilities:
 * - Current reference (book, chapter, verse, ranges)
 * - Available books (from anchor resource TOC)
 * - Navigation history (back/forward)
 * - Broadcast reference changes to all resources
 */

import type { PassageLeaf, PassageSetNode, RefRange } from '@bt-synergy/passage-sets'
import type { TranslatorSection } from '@bt-synergy/usfm-processor'
import { createContext, ReactNode, useContext, useEffect } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { BCVReference, BookInfo, NavigationMode, PassageSet } from './types'

/** Flatten passage set root to a list of BCV references for navigation */
function flattenPassageSetToBCV(root: PassageSetNode[]): BCVReference[] {
  const out: BCVReference[] = []
  function walk(nodes: PassageSetNode[]) {
    for (const node of nodes) {
      if (node.type === 'passage') {
        const leaf = node as PassageLeaf
        for (const p of leaf.passages ?? []) {
          const ref = typeof p.ref === 'string' ? undefined : (p.ref as RefRange)
          out.push({
            book: p.bookCode,
            chapter: ref?.startChapter ?? 1,
            verse: ref?.startVerse ?? 1,
            endChapter: ref?.endChapter,
            endVerse: ref?.endVerse,
          })
        }
      }
      if (node.type === 'group' && 'children' in node) {
        walk((node as { children: PassageSetNode[] }).children)
      }
    }
  }
  walk(root)
  return out
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

interface NavigationState {
  currentReference: BCVReference
  availableBooks: BookInfo[]
  navigationHistory: BCVReference[]
  historyIndex: number
  maxHistorySize: number
  
  // Section Navigation
  currentSections: TranslatorSection[]
  currentSectionIndex: number
  
  // Passage Set Navigation
  currentPassageSet: PassageSet | null
  /** Flat list of BCV refs derived from currentPassageSet.root */
  currentPassageList: BCVReference[]
  currentPassageIndex: number
  navigationMode: NavigationMode
}

interface NavigationActions {
  navigateToReference: (ref: BCVReference) => void
  navigateToBook: (bookCode: string) => void
  setAvailableBooks: (books: BookInfo[]) => void
  updateBookVerseCount: (bookCode: string, verses: number[]) => void
  getBookInfo: (bookCode: string) => BookInfo | null
  goBack: () => void
  goForward: () => void
  goToHistoryIndex: (index: number) => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  
  // Verse/Chapter Navigation
  nextVerse: () => void
  previousVerse: () => void
  nextChapter: () => void
  previousChapter: () => void
  canGoToNextVerse: () => boolean
  canGoToPreviousVerse: () => boolean
  canGoToNextChapter: () => boolean
  canGoToPreviousChapter: () => boolean
  
  // Section Navigation
  setBookSections: (bookCode: string, sections: TranslatorSection[]) => void
  nextSection: () => void
  previousSection: () => void
  canGoToNextSection: () => boolean
  canGoToPreviousSection: () => boolean
  
  // Passage Set Navigation
  loadPassageSet: (passageSet: PassageSet) => void
  clearPassageSet: () => void
  nextPassage: () => void
  previousPassage: () => void
  canGoToNextPassage: () => boolean
  canGoToPreviousPassage: () => boolean
  setNavigationMode: (mode: NavigationMode) => void
  
  // Navigation availability
  hasNavigationSource: () => boolean
}

export type NavigationStore = NavigationState & NavigationActions

// Storage key for persisting navigation state
const NAVIGATION_STORAGE_KEY = 'bt-synergy:navigation-state'

// Load persisted navigation state from localStorage
const loadPersistedState = (): Partial<NavigationState> => {
  try {
    const saved = localStorage.getItem(NAVIGATION_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      console.log('📍 Restored navigation state from localStorage:', parsed.currentReference)
      return parsed
    }
  } catch (err) {
    console.warn('Failed to load persisted navigation state:', err)
  }
  return {}
}

// Save navigation state to localStorage
const persistState = (state: NavigationState) => {
  try {
    const toPersist = {
      currentReference: state.currentReference,
      navigationHistory: state.navigationHistory,
      historyIndex: state.historyIndex,
      navigationMode: state.navigationMode,
    }
    localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(toPersist))
  } catch (err) {
    console.warn('Failed to persist navigation state:', err)
  }
}

const persistedState = loadPersistedState()

const useNavigationStore = create<NavigationStore>()(
  immer((set, get) => ({
  // Initial state - restore from localStorage or use defaults
  currentReference: persistedState.currentReference || {
    book: 'tit',
    chapter: 1,
    verse: 1,
  },
  availableBooks: [
    { code: 'tit', name: 'Titus', testament: 'NT', chapters: 3, verses: [16, 15, 15] },
  ],
  navigationHistory: persistedState.navigationHistory || [],
  historyIndex: persistedState.historyIndex ?? -1,
  maxHistorySize: 50,
  
  // Section state
  currentSections: [],
  currentSectionIndex: -1,
  
  // Passage Set state
  currentPassageSet: null,
  currentPassageList: [] as BCVReference[],
  currentPassageIndex: -1,
  navigationMode: persistedState.navigationMode || 'verse',

  // Actions
  navigateToReference: (ref: BCVReference) => {
    const current = get().currentReference
    const historyLength = get().navigationHistory.length

    // Check if same reference (but allow if history is empty - for initial navigation)
    const isSame =
      current.book === ref.book &&
      current.chapter === ref.chapter &&
      current.verse === ref.verse &&
      current.endChapter === ref.endChapter &&
      current.endVerse === ref.endVerse

    if (isSame && historyLength > 0) return

    set((state) => {
      // Add to history
      if (state.navigationHistory.length === 0) {
        state.navigationHistory = [{ ...ref }]
        state.historyIndex = 0
      } else {
        // Remove forward history
        state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1)
        state.navigationHistory.push({ ...ref })

        // Maintain max size
        if (state.navigationHistory.length > state.maxHistorySize) {
          state.navigationHistory = state.navigationHistory.slice(-state.maxHistorySize)
        }

        state.historyIndex = state.navigationHistory.length - 1
      }

      state.currentReference = ref
      
      // Persist to localStorage
      persistState(state)
    })

    console.log('📍 Navigated to:', ref)
  },

  navigateToBook: (bookCode: string) => {
    const bookInfo = get().getBookInfo(bookCode)
    if (!bookInfo) {
      console.warn('❌ Book not found:', bookCode)
      return
    }

    get().navigateToReference({
      book: bookCode,
      chapter: 1,
      verse: 1,
    })
  },

  setAvailableBooks: (books: BookInfo[]) => {
    set({ availableBooks: books })
    console.log('📚 Available books updated:', books.length, 'books')
  },

  updateBookVerseCount: (bookCode: string, verses: number[]) => {
    set((state) => {
      const bookIndex = state.availableBooks.findIndex(b => b.code === bookCode)
      if (bookIndex >= 0) {
        state.availableBooks[bookIndex].verses = verses
        state.availableBooks[bookIndex].chapters = verses.length
        console.log('📊 Updated verse counts for', bookCode, ':', verses.length, 'chapters')
      }
    })
  },

  getBookInfo: (bookCode: string) => {
    return get().availableBooks.find((b) => b.code === bookCode) || null
  },

  goBack: () => {
    const { navigationHistory, historyIndex } = get()
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      set((state) => {
        state.currentReference = navigationHistory[newIndex]
        state.historyIndex = newIndex
        persistState(state)
      })
      console.log('⬅️ Navigated back')
    }
  },

  goForward: () => {
    const { navigationHistory, historyIndex } = get()
    if (historyIndex < navigationHistory.length - 1) {
      const newIndex = historyIndex + 1
      set((state) => {
        state.currentReference = navigationHistory[newIndex]
        state.historyIndex = newIndex
        persistState(state)
      })
      console.log('➡️ Navigated forward')
    }
  },

  goToHistoryIndex: (index: number) => {
    const { navigationHistory } = get()
    if (index >= 0 && index < navigationHistory.length) {
      set((state) => {
        state.currentReference = navigationHistory[index]
        state.historyIndex = index
        persistState(state)
      })
      console.log(`🎯 Jumped to history index ${index}`)
    }
  },

  canGoBack: () => {
    return get().historyIndex > 0
  },

  canGoForward: () => {
    const { navigationHistory, historyIndex } = get()
    return historyIndex < navigationHistory.length - 1
  },

  // Verse/Chapter Navigation
  nextVerse: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo || !bookInfo.verses) {
      console.warn('❌ Cannot navigate: no book info available')
      return
    }
    
    const currentChapter = currentReference.chapter
    const currentVerse = currentReference.verse
    const versesInChapter = bookInfo.verses[currentChapter - 1] || 0
    
    // If there's a next verse in the current chapter
    if (currentVerse < versesInChapter) {
      get().navigateToReference({
        book: currentReference.book,
        chapter: currentChapter,
        verse: currentVerse + 1,
      })
    } 
    // Try to go to first verse of next chapter
    else if (currentChapter < (bookInfo.chapters ?? 0)) {
      get().navigateToReference({
        book: currentReference.book,
        chapter: currentChapter + 1,
        verse: 1,
      })
    }
    // Try to go to the first verse of the next book
    else {
      const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
      if (currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1) {
        const nextBook = availableBooks[currentBookIndex + 1]
        get().navigateToReference({
          book: nextBook.code,
          chapter: 1,
          verse: 1,
        })
      }
    }
  },

  previousVerse: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo || !bookInfo.verses) {
      console.warn('❌ Cannot navigate: no book info available')
      return
    }
    
    const currentChapter = currentReference.chapter
    const currentVerse = currentReference.verse
    
    // If there's a previous verse in the current chapter
    if (currentVerse > 1) {
      get().navigateToReference({
        book: currentReference.book,
        chapter: currentChapter,
        verse: currentVerse - 1,
      })
    }
    // Try to go to last verse of previous chapter
    else if (currentChapter > 1) {
      const previousChapterVerses = bookInfo.verses[currentChapter - 2] || 1
      get().navigateToReference({
        book: currentReference.book,
        chapter: currentChapter - 1,
        verse: previousChapterVerses,
      })
    }
    // Try to go to the last verse of the previous book
    else {
      const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
      if (currentBookIndex > 0) {
        const previousBook = availableBooks[currentBookIndex - 1]
        const previousBookInfo = get().getBookInfo(previousBook.code)
        if (previousBookInfo && previousBookInfo.verses) {
          const lastChapter = previousBookInfo.chapters ?? 1
          const lastVerse = previousBookInfo.verses[lastChapter - 1] ?? 1
          get().navigateToReference({
            book: previousBook.code,
            chapter: lastChapter,
            verse: lastVerse,
          })
        }
      }
    }
  },

  nextChapter: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo) {
      console.warn('❌ Cannot navigate: no book info available')
      return
    }
    
    const currentChapter = currentReference.chapter
    
    // If there's a next chapter in this book
    const chapters = bookInfo.chapters ?? 0
    if (currentChapter < chapters) {
      get().navigateToReference({
        book: currentReference.book,
        chapter: currentChapter + 1,
        verse: 1,
      })
    }
    // Try to go to the first chapter of the next book
    else {
      const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
      if (currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1) {
        const nextBook = availableBooks[currentBookIndex + 1]
        get().navigateToReference({
          book: nextBook.code,
          chapter: 1,
          verse: 1,
        })
      }
    }
  },

  previousChapter: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo) {
      console.warn('❌ Cannot navigate: no book info available')
      return
    }
    
    const currentChapter = currentReference.chapter
    
    // If there's a previous chapter in this book
    if (currentChapter > 1) {
      get().navigateToReference({
        book: currentReference.book,
        chapter: currentChapter - 1,
        verse: 1,
      })
    }
    // Try to go to the last chapter of the previous book
    else {
      const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
      if (currentBookIndex > 0) {
        const previousBook = availableBooks[currentBookIndex - 1]
        const previousBookInfo = get().getBookInfo(previousBook.code)
        if (previousBookInfo) {
          get().navigateToReference({
            book: previousBook.code,
            chapter: previousBookInfo.chapters ?? 1,
            verse: 1,
          })
        }
      }
    }
  },

  canGoToNextVerse: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo || !bookInfo.verses) return false
    
    const currentChapter = currentReference.chapter
    const currentVerse = currentReference.verse
    const versesInChapter = bookInfo.verses[currentChapter - 1] || 0
    
    // Can go to next verse in current chapter
    if (currentVerse < versesInChapter) return true
    
    // Can go to next chapter
    if (currentChapter < (bookInfo.chapters ?? 0)) return true
    
    // Can go to next book
    const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
    return currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1
  },

  canGoToPreviousVerse: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo || !bookInfo.verses) return false
    
    const currentChapter = currentReference.chapter
    const currentVerse = currentReference.verse
    
    // Can go to previous verse in current chapter
    if (currentVerse > 1) return true
    
    // Can go to previous chapter
    if (currentChapter > 1) return true
    
    // Can go to previous book
    const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
    return currentBookIndex > 0
  },

  canGoToNextChapter: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    if (!bookInfo) return false
    const currentChapter = currentReference.chapter
    if (currentChapter < (bookInfo.chapters ?? 0)) return true
    const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
    return currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1
  },

  canGoToPreviousChapter: () => {
    const { currentReference, availableBooks } = get()
    const bookInfo = get().getBookInfo(currentReference.book)
    
    if (!bookInfo) return false
    
    const currentChapter = currentReference.chapter
    
    // Can go to previous chapter in current book
    if (currentChapter > 1) return true
    
    // Can go to previous book
    const currentBookIndex = availableBooks.findIndex(b => b.code === currentReference.book)
    return currentBookIndex > 0
  },

  // Section Navigation Actions
  setBookSections: (bookCode: string, sections: TranslatorSection[]) => {
    set((state) => {
      state.currentSections = sections
      
      // Find current section index based on current reference
      const currentRef = state.currentReference
      if (currentRef.book === bookCode && sections.length > 0) {
        const sectionIndex = sections.findIndex(section => {
          const refChapter = currentRef.chapter
          const refVerse = currentRef.verse
          
          // Check if current reference is within this section
          if (refChapter < section.start.chapter) return false
          if (refChapter > section.end.chapter) return false
          
          if (refChapter === section.start.chapter && refChapter === section.end.chapter) {
            return refVerse >= section.start.verse && refVerse <= section.end.verse
          }
          
          if (refChapter === section.start.chapter) {
            return refVerse >= section.start.verse
          }
          
          if (refChapter === section.end.chapter) {
            return refVerse <= section.end.verse
          }
          
          return true
        })
        
        state.currentSectionIndex = sectionIndex
      } else {
        state.currentSectionIndex = -1
      }
    })
    
    console.log(`📋 Sections set for ${bookCode}:`, sections.length, 'sections')
  },

  nextSection: () => {
    const { currentSections, currentSectionIndex } = get()
    
    if (currentSections.length === 0) {
      console.warn('❌ Cannot navigate: no sections available')
      return
    }
    
    const nextIndex = currentSectionIndex + 1
    if (nextIndex < currentSections.length) {
      const nextSection = currentSections[nextIndex]
      get().navigateToReference({
        book: get().currentReference.book,
        chapter: nextSection.start.chapter,
        verse: nextSection.start.verse,
        endChapter: nextSection.end.chapter !== nextSection.start.chapter ? nextSection.end.chapter : undefined,
        endVerse: nextSection.end.verse,
      })
      
      set((state) => {
        state.currentSectionIndex = nextIndex
      })
    } else {
      console.log('📋 At last section')
    }
  },

  previousSection: () => {
    const { currentSections, currentSectionIndex } = get()
    
    if (currentSections.length === 0) {
      console.warn('❌ Cannot navigate: no sections available')
      return
    }
    
    const prevIndex = currentSectionIndex - 1
    if (prevIndex >= 0) {
      const prevSection = currentSections[prevIndex]
      get().navigateToReference({
        book: get().currentReference.book,
        chapter: prevSection.start.chapter,
        verse: prevSection.start.verse,
        endChapter: prevSection.end.chapter !== prevSection.start.chapter ? prevSection.end.chapter : undefined,
        endVerse: prevSection.end.verse,
      })
      
      set((state) => {
        state.currentSectionIndex = prevIndex
      })
    } else {
      console.log('📋 At first section')
    }
  },

  canGoToNextSection: () => {
    const { currentSections, currentSectionIndex } = get()
    return currentSections.length > 0 && currentSectionIndex < currentSections.length - 1
  },

  canGoToPreviousSection: () => {
    const { currentSectionIndex } = get()
    return currentSectionIndex > 0
  },

  // Passage Set Actions
  loadPassageSet: (passageSet: PassageSet) => {
    const flat = flattenPassageSetToBCV(passageSet.root ?? [])
    set((state) => {
      state.currentPassageSet = passageSet
      state.currentPassageList = flat
      state.currentPassageIndex = 0
      state.navigationMode = 'passage-set'
      if (flat.length > 0) {
        state.currentReference = flat[0]
      }
    })
    console.log('📋 Passage set loaded:', passageSet.name, `(${flat.length} passages)`)
  },

  clearPassageSet: () => {
    set((state) => {
      state.currentPassageSet = null
      state.currentPassageList = []
      state.currentPassageIndex = -1
      if (state.availableBooks.length === 0) {
        state.navigationMode = 'verse'
      }
    })
    console.log('📋 Passage set cleared')
  },

  nextPassage: () => {
    const { currentPassageList, currentPassageIndex } = get()
    if (currentPassageList.length === 0 || currentPassageIndex >= currentPassageList.length - 1) {
      return
    }
    const newIndex = currentPassageIndex + 1
    set((state) => {
      state.currentPassageIndex = newIndex
      state.currentReference = currentPassageList[newIndex]
      persistState(state)
    })
    console.log('➡️ Next passage:', newIndex + 1, 'of', currentPassageList.length)
  },

  previousPassage: () => {
    const { currentPassageList, currentPassageIndex } = get()
    if (currentPassageList.length === 0 || currentPassageIndex <= 0) {
      return
    }
    const newIndex = currentPassageIndex - 1
    set((state) => {
      state.currentPassageIndex = newIndex
      state.currentReference = currentPassageList[newIndex]
      persistState(state)
    })
    console.log('⬅️ Previous passage:', newIndex + 1, 'of', currentPassageList.length)
  },

  canGoToNextPassage: () => {
    const { currentPassageList, currentPassageIndex } = get()
    return currentPassageList.length > 0 && currentPassageIndex < currentPassageList.length - 1
  },

  canGoToPreviousPassage: () => {
    const { currentPassageList, currentPassageIndex } = get()
    return currentPassageList.length > 0 && currentPassageIndex > 0
  },

  setNavigationMode: (mode: NavigationMode) => {
    set((state) => {
      state.navigationMode = mode
      persistState(state)
    })
    console.log('🔀 Navigation mode changed to:', mode)
  },

  hasNavigationSource: () => {
    const { availableBooks, currentPassageSet } = get()
    return availableBooks.length > 0 || !!currentPassageSet
  },
})))

// ============================================================================
// CONTEXT
// ============================================================================

const NavigationContext = createContext<NavigationStore | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const store = useNavigationStore()

  // Initialize with first reference in history
  useEffect(() => {
    if (store.navigationHistory.length === 0) {
      store.navigateToReference(store.currentReference)
    }
  }, [])

  return <NavigationContext.Provider value={store}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationStore {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}

// Selector hooks for performance
export function useCurrentReference() {
  return useNavigationStore((state) => state.currentReference)
}

export function useAvailableBooks() {
  return useNavigationStore((state) => state.availableBooks)
}

export function useCurrentPassageSet() {
  return useNavigationStore((state) => state.currentPassageSet)
}

export function useNavigationMode() {
  return useNavigationStore((state) => state.navigationMode)
}

export function useHasNavigationSource() {
  return useNavigationStore((state) => state.hasNavigationSource())
}

export function useNavigationHistory() {
  return useNavigationStore((state) => state.navigationHistory)
}

export function useNavigationHistoryIndex() {
  return useNavigationStore((state) => state.historyIndex)
}

export function useCurrentSections() {
  return useNavigationStore((state) => state.currentSections)
}

export function useCurrentSectionIndex() {
  return useNavigationStore((state) => state.currentSectionIndex)
}

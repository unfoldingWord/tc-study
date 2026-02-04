/**
 * Study store instance for tc-study
 */

import { create } from 'zustand'

interface ModalState {
  isOpen: boolean
  isMinimized: boolean
  resourceKey: string | null
  history: string[]
  historyIndex: number
  navigationStatus: 'idle' | 'navigating' | 'success' | 'warning' | 'error'
}

interface StudyStore {
  modal: ModalState
  openModal: (resourceKey: string) => void
  closeModal: () => void
  minimizeModal: () => void
  restoreModal: () => void
  setNavigationStatus: (status: 'idle' | 'navigating' | 'success' | 'warning' | 'error') => void
  modalGoBack: () => void
  modalGoForward: () => void
  canModalGoBack: () => boolean
  canModalGoForward: () => boolean
}

export const useStudyStore = create<StudyStore>((set, get) => ({
  modal: {
    isOpen: false,
    isMinimized: false,
    resourceKey: null,
    history: [],
    historyIndex: -1,
    navigationStatus: 'idle',
  },

  openModal: (resourceKey: string) => {
    set((state) => {
      const { modal } = state
      
      // Check if the new resourceKey is the same as the current one (deduplication)
      const currentResourceKey = modal.history[modal.historyIndex]
      if (currentResourceKey === resourceKey && modal.isOpen) {
        // Same entry, just restore if minimized
        return {
          modal: {
            ...modal,
            isMinimized: false,
          },
        }
      }
      
      // Add to history (removing any forward history if we're not at the end)
      const newHistory = [
        ...modal.history.slice(0, modal.historyIndex + 1),
        resourceKey,
      ]

      return {
        modal: {
          ...modal,
          isOpen: true,
          isMinimized: false,
          resourceKey,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        },
      }
    })
  },

  closeModal: () => {
    set((state) => ({
      modal: {
        ...state.modal,
        isOpen: false,
        isMinimized: false,
        resourceKey: null,
      },
    }))
  },

  minimizeModal: () => {
    set((state) => ({
      modal: {
        ...state.modal,
        isMinimized: true,
      },
    }))
  },

  restoreModal: () => {
    set((state) => ({
      modal: {
        ...state.modal,
        isMinimized: false,
      },
    }))
  },

  setNavigationStatus: (status) => {
    set((state) => ({
      modal: {
        ...state.modal,
        navigationStatus: status,
      },
    }))
  },

  modalGoBack: () => {
    const { modal } = get()
    if (modal.historyIndex > 0) {
      set((state) => {
        const newIndex = modal.historyIndex - 1
        return {
          modal: {
            ...state.modal,
            historyIndex: newIndex,
            resourceKey: modal.history[newIndex],
          },
        }
      })
    }
  },

  modalGoForward: () => {
    const { modal } = get()
    if (modal.historyIndex < modal.history.length - 1) {
      set((state) => {
        const newIndex = modal.historyIndex + 1
        return {
          modal: {
            ...state.modal,
            historyIndex: newIndex,
            resourceKey: modal.history[newIndex],
          },
        }
      })
    }
  },

  canModalGoBack: () => {
    const { modal } = get()
    return modal.historyIndex > 0
  },

  canModalGoForward: () => {
    const { modal } = get()
    return modal.historyIndex < modal.history.length - 1
  },
}))

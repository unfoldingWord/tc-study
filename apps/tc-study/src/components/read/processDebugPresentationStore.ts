/**
 * Shared process-debug presentation so the Read shell can reserve bottom space when
 * docked, while DownloadIndicator only dispatches open/dock/close.
 */

import { create } from 'zustand'
import {
  nextProcessDebugPresentation,
  type ProcessDebugPresentation,
  type ProcessDebugPresentationAction,
} from './processDebugPresentation'

/** Reserved height for the in-flow docked bottom panel (layout shrinks main content). */
export const PROCESS_DEBUG_DOCK_HEIGHT_CSS = 'min(40vh, 360px)'

interface ProcessDebugPresentationStore {
  presentation: ProcessDebugPresentation
  dispatch: (action: ProcessDebugPresentationAction) => void
}

export const useProcessDebugPresentationStore = create<ProcessDebugPresentationStore>((set, get) => ({
  presentation: 'closed',
  dispatch: (action) => {
    set({ presentation: nextProcessDebugPresentation(get().presentation, action) })
  },
}))

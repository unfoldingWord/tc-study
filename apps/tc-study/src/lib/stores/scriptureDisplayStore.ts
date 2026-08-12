/**
 * Scripture display preferences (layout mode).
 * Persisted in localStorage — independent of workspace package layout.
 */

import { create } from 'zustand'

export type ScriptureLayoutMode = 'verse-block' | 'formatted'

const STORAGE_KEY = 'tc-study:scripture-layout-mode'
const DEFAULT_MODE: ScriptureLayoutMode = 'verse-block'

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function loadMode(): ScriptureLayoutMode {
  if (!canUseStorage()) return DEFAULT_MODE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'formatted' || raw === 'verse-block') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_MODE
}

function saveMode(mode: ScriptureLayoutMode): void {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

interface ScriptureDisplayStore {
  layoutMode: ScriptureLayoutMode
  setLayoutMode: (mode: ScriptureLayoutMode) => void
  toggleLayoutMode: () => void
}

export const useScriptureDisplayStore = create<ScriptureDisplayStore>((set, get) => ({
  layoutMode: loadMode(),
  setLayoutMode: (mode) => {
    saveMode(mode)
    set({ layoutMode: mode })
  },
  toggleLayoutMode: () => {
    const next: ScriptureLayoutMode =
      get().layoutMode === 'verse-block' ? 'formatted' : 'verse-block'
    saveMode(next)
    set({ layoutMode: next })
  },
}))

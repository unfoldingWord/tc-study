/**
 * Panel Store - placeholder
 */

import { create } from 'zustand'

export interface BibleReference {
  book: string
  chapter: number
  verse?: number
}

export interface PanelResource {
  id: string
  title: string
}

interface PanelStore {
  panels: any[]
  activePanel: string | null
}

export const usePanelStore = create<PanelStore>((set) => ({
  panels: [],
  activePanel: null
}))

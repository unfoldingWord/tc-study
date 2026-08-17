/**
 * Per-panel Read state. Each panel’s languageCode is independent — never a
 * shared scripture-language store keyed only by the URL.
 */

import { create } from 'zustand'
import { writePersistedHelpsLanguage } from './defaultHelpsLanguage'
import { inheritEmptyPanelLanguage } from './readColdStartPolicy'
import {
  applyPanelLanguage,
  applyPanelMode,
  applySeedBothLanguages,
  shouldSeedBothPanelLanguages,
  type ReadPanelId,
  type ReadPanelMode,
  type ReadPanelModels,
} from './readPanelModel'
import {
  readPersistedReadPanels,
  writePersistedReadPanels,
  type PersistedReadPanels,
  type ReadLayoutMode,
} from './readPanelPersistence'

export interface ReadPanelStore extends PersistedReadPanels {
  seedBothLanguages: (languageCode: string) => void
  setPanelLanguage: (panelId: ReadPanelId, languageCode: string) => void
  inheritEmptyLanguage: () => ReadPanelId | null
  setPanelMode: (panelId: ReadPanelId, mode: ReadPanelMode) => void
  setLayout: (layout: ReadLayoutMode, userChosen?: boolean) => void
  setCollapsedPanelId: (panelId: ReadPanelId | null) => void
  setSplitPercent: (percent: number) => void
}

function persist(state: ReadPanelStore): void {
  writePersistedReadPanels({
    panels: state.panels,
    layout: state.layout,
    collapsedPanelId: state.collapsedPanelId,
    splitPercent: state.splitPercent,
    layoutUserChosen: state.layoutUserChosen,
    seededBoth: state.seededBoth,
  })
}

const initial = readPersistedReadPanels()

export const useReadPanelStore = create<ReadPanelStore>((set, get) => ({
  ...initial,
  seedBothLanguages: (languageCode) => {
    set((state) => ({
      panels: applySeedBothLanguages(state.panels, languageCode),
      seededBoth: true,
    }))
    writePersistedHelpsLanguage(languageCode)
    persist(get())
  },
  setPanelLanguage: (panelId, languageCode) => {
    set((state) => ({
      panels: applyPanelLanguage(state.panels, panelId, languageCode),
    }))
    const { panels } = get()
    if (panels[panelId].mode === 'helps') writePersistedHelpsLanguage(languageCode)
    persist(get())
  },
  inheritEmptyLanguage: () => {
    const plan = inheritEmptyPanelLanguage(get().panels)
    if (!plan) return null
    set({ panels: plan.panels })
    if (plan.panels[plan.inheritedPanelId].mode === 'helps') {
      writePersistedHelpsLanguage(plan.languageCode)
    }
    persist(get())
    return plan.inheritedPanelId
  },
  setPanelMode: (panelId, mode) => {
    set((state) => ({
      panels: applyPanelMode(state.panels, panelId, mode),
    }))
    persist(get())
  },
  setLayout: (layout, userChosen = true) => {
    set({
      layout,
      layoutUserChosen: userChosen || get().layoutUserChosen,
      collapsedPanelId: layout === 'one' ? null : get().collapsedPanelId,
    })
    persist(get())
  },
  setCollapsedPanelId: (panelId) => {
    set({ collapsedPanelId: panelId })
    persist(get())
  },
  setSplitPercent: (percent) => {
    set({ splitPercent: percent })
    persist(get())
  },
}))

export function readPanelModelsSnapshot(): ReadPanelModels {
  return useReadPanelStore.getState().panels
}

export function canSeedBothPanelLanguages(): boolean {
  return shouldSeedBothPanelLanguages(useReadPanelStore.getState().panels)
}

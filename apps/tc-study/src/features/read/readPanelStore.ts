/**
 * Per-panel Read state. Each panel’s languageCode is independent — never a
 * shared scripture-language store keyed only by the URL.
 */

import { create } from 'zustand'
import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'
import { writePersistedHelpsLanguage } from './defaultHelpsLanguage'
import {
  hydrateReadLanguagesFromHint,
  hydrateReadLanguagesFromParsedUrl,
  inheritEmptyPanelLanguage,
} from './readColdStartPolicy'
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
  hydrateLanguagesFromHint: (hintLanguage?: string | null) => ReadPanelId | null
  hydrateLanguagesFromUrl: (langs: string[]) => ReadPanelId | null
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
    const resolved = canonicalReadLanguageCode(languageCode)
    set((state) => ({
      panels: applySeedBothLanguages(state.panels, resolved),
      seededBoth: true,
    }))
    writePersistedHelpsLanguage(resolved)
    persist(get())
  },
  setPanelLanguage: (panelId, languageCode) => {
    const resolved = canonicalReadLanguageCode(languageCode)
    set((state) => ({
      panels: applyPanelLanguage(state.panels, panelId, resolved),
    }))
    const { panels } = get()
    if (panels[panelId].mode === 'helps') writePersistedHelpsLanguage(resolved)
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
  hydrateLanguagesFromHint: (hintLanguage) => {
    return get().hydrateLanguagesFromUrl(hintLanguage ? [hintLanguage] : [])
  },
  hydrateLanguagesFromUrl: (langs) => {
    const current = get().panels
    const plan = langs.length
      ? hydrateReadLanguagesFromParsedUrl({ panels: current, langs })
      : hydrateReadLanguagesFromHint({ panels: current, hintLanguage: null })
    const unchanged =
      plan.panels['panel-1'].languageCode === current['panel-1'].languageCode &&
      plan.panels['panel-2'].languageCode === current['panel-2'].languageCode
    if (unchanged) return plan.inheritedPanelId
    set({ panels: plan.panels })
    const helpsCode =
      plan.panels['panel-2'].mode === 'helps' ? plan.panels['panel-2'].languageCode : null
    if (helpsCode) writePersistedHelpsLanguage(helpsCode)
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

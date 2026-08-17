/**
 * Dual-mode Read panel model (epic #28).
 *
 * Each panel is an independent `{ mode, languageCode }` surface.
 * Two scripture panels are never clones: language is per-panel, never a
 * shared “text language” store. Cold start may seed the same *initial*
 * code onto both; pickers never sync after that.
 */

export type ReadPanelId = 'panel-1' | 'panel-2'
export type ReadPanelMode = 'scripture' | 'helps'

export interface ReadPanelModel {
  mode: ReadPanelMode
  languageCode: string | null
}

export type ReadPanelModels = Record<ReadPanelId, ReadPanelModel>

export const READ_PANEL_IDS: ReadPanelId[] = ['panel-1', 'panel-2']

export const DEFAULT_READ_PANEL_MODELS: ReadPanelModels = {
  'panel-1': { mode: 'scripture', languageCode: null },
  'panel-2': { mode: 'helps', languageCode: null },
}

export function otherReadPanelId(panelId: ReadPanelId): ReadPanelId {
  return panelId === 'panel-1' ? 'panel-2' : 'panel-1'
}

export function modeForContentRole(contentRole: string | undefined): ReadPanelMode {
  return contentRole === 'primary' ? 'scripture' : 'helps'
}

export function catalogTargetForMode(mode: ReadPanelMode): 'text' | 'helps' {
  return mode === 'scripture' ? 'text' : 'helps'
}

export function defaultDestPanelIdForTarget(target: 'text' | 'helps' | 'both'): ReadPanelId {
  return target === 'helps' ? 'panel-2' : 'panel-1'
}

export function panelIdsForMode(panels: ReadPanelModels, mode: ReadPanelMode): ReadPanelId[] {
  return READ_PANEL_IDS.filter((id) => panels[id].mode === mode)
}

/**
 * True when neither panel has a language yet — one picker seeds both.
 * One-empty / one-set is inheritEmptyPanelLanguage in readColdStartPolicy.
 */
export function shouldSeedBothPanelLanguages(panels: ReadPanelModels): boolean {
  return !panels['panel-1'].languageCode && !panels['panel-2'].languageCode
}

/** Seed the same initial language onto both panels. Does not change modes. */
export function applySeedBothLanguages(panels: ReadPanelModels, languageCode: string): ReadPanelModels {
  return {
    'panel-1': { ...panels['panel-1'], languageCode },
    'panel-2': { ...panels['panel-2'], languageCode },
  }
}

/** Change one panel’s language only. The other panel is untouched. */
export function applyPanelLanguage(
  panels: ReadPanelModels,
  panelId: ReadPanelId,
  languageCode: string
): ReadPanelModels {
  return {
    ...panels,
    [panelId]: { ...panels[panelId], languageCode },
  }
}

/** Change one panel’s mode only. Language on both panels is untouched. */
export function applyPanelMode(
  panels: ReadPanelModels,
  panelId: ReadPanelId,
  mode: ReadPanelMode
): ReadPanelModels {
  return {
    ...panels,
    [panelId]: { ...panels[panelId], mode },
  }
}

export interface PanelCatalogTarget {
  languageCode: string
  target: 'text' | 'helps'
  destPanelId: ReadPanelId
}

/**
 * One catalog search per panel that has a language.
 * Same mode + different languages → two independent loads (never a shared
 * scripture language). Same language on both still yields two dest panels.
 */
export function catalogTargetsForPanelModels(panels: ReadPanelModels): PanelCatalogTarget[] {
  const out: PanelCatalogTarget[] = []
  for (const destPanelId of READ_PANEL_IDS) {
    const panel = panels[destPanelId]
    const languageCode = panel.languageCode?.trim()
    if (!languageCode) continue
    out.push({
      languageCode,
      target: catalogTargetForMode(panel.mode),
      destPanelId,
    })
  }
  return out
}

/** URL / BCV nav follows panel-1 when it is scripture; otherwise the first scripture panel. */
export function navigationLanguageCode(panels: ReadPanelModels): string | null {
  if (panels['panel-1'].mode === 'scripture' && panels['panel-1'].languageCode) {
    return panels['panel-1'].languageCode
  }
  for (const id of READ_PANEL_IDS) {
    if (panels[id].mode === 'scripture' && panels[id].languageCode) return panels[id].languageCode
  }
  return panels['panel-1'].languageCode
}

/** First helps-mode panel language (back-compat for CombinedHelps / download tokens). */
export function firstHelpsLanguageCode(panels: ReadPanelModels): string | null {
  for (const id of READ_PANEL_IDS) {
    if (panels[id].mode === 'helps' && panels[id].languageCode) return panels[id].languageCode
  }
  return null
}

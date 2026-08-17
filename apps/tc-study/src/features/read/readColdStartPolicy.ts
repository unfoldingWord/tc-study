/**
 * Cold-start language for dual Read panels.
 *
 * Both empty → one picker seeds both ({@link shouldSeedBothPanelLanguages}).
 * One empty → inherit the other panel’s language (do not leave the empty copy).
 * Both set → leave them; pickers may diverge after inherit.
 */

import {
  applyPanelLanguage,
  type ReadPanelId,
  type ReadPanelMode,
  type ReadPanelModels,
} from './readPanelModel'

/** Persist/runtime may omit languageCode; treat missing the same as null. */
export type InheritPanelLanguageSnapshot = Record<
  ReadPanelId,
  { mode: ReadPanelMode; languageCode?: string | null }
>

function trimmedPanelLanguage(code: string | null | undefined): string | null {
  const trimmed = code?.trim()
  return trimmed || null
}

export interface InheritEmptyPanelLanguageResult {
  panels: ReadPanelModels
  inheritedPanelId: ReadPanelId
  languageCode: string
}

/**
 * When exactly one pane has a language, copy it onto the empty pane.
 * Modes are unchanged. Returns null when both are empty or both are set.
 */
export function inheritEmptyPanelLanguage(
  panels: InheritPanelLanguageSnapshot
): InheritEmptyPanelLanguageResult | null {
  const asModels = panels as ReadPanelModels
  const p1 = trimmedPanelLanguage(panels['panel-1'].languageCode)
  const p2 = trimmedPanelLanguage(panels['panel-2'].languageCode)
  if (p1 && !p2) {
    return {
      panels: applyPanelLanguage(asModels, 'panel-2', p1),
      inheritedPanelId: 'panel-2',
      languageCode: p1,
    }
  }
  if (p2 && !p1) {
    return {
      panels: applyPanelLanguage(asModels, 'panel-1', p2),
      inheritedPanelId: 'panel-1',
      languageCode: p2,
    }
  }
  return null
}

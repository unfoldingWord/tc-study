/**
 * Per-panel catalog load. Two scripture panels never share one dest / one language.
 */

import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import {
  catalogTargetForMode,
  type ReadPanelId,
  type ReadPanelModels,
} from './readPanelModel'

export interface ReadPanelCatalogLoad {
  textLanguageCode: string
  helpsLanguageCode: string
  loadTarget: CatalogLoadTarget
  destPanelId?: ReadPanelId
}

export function catalogLoadForSinglePanel(
  panels: ReadPanelModels,
  panelId: ReadPanelId
): ReadPanelCatalogLoad | null {
  const panel = panels[panelId]
  const languageCode = panel.languageCode?.trim()
  if (!languageCode) return null
  const otherId = panelId === 'panel-1' ? 'panel-2' : 'panel-1'
  const other = panels[otherId]
  const textLanguageCode =
    panel.mode === 'scripture' ? languageCode : other.languageCode || languageCode
  const helpsLanguageCode =
    panel.mode === 'helps' ? languageCode : other.languageCode || languageCode
  return {
    textLanguageCode,
    helpsLanguageCode,
    loadTarget: catalogTargetForMode(panel.mode),
    destPanelId: panelId,
  }
}

/** Default p1=scripture p2=helps can still dual-load without cloning languages. */
export function catalogLoadForDefaultPair(panels: ReadPanelModels): ReadPanelCatalogLoad | null {
  const p1 = panels['panel-1']
  const p2 = panels['panel-2']
  if (p1.mode !== 'scripture' || p2.mode !== 'helps') return null
  if (!p1.languageCode || !p2.languageCode) return null
  return {
    textLanguageCode: p1.languageCode,
    helpsLanguageCode: p2.languageCode,
    loadTarget: 'both',
  }
}

/**
 * Cold-start / first-pick catalog jobs. Default scripture+helps pair is one
 * `both` load so helps does not wait on a sequential panel-1 scripture fetch.
 */
export function coldStartCatalogLoads(panels: ReadPanelModels): ReadPanelCatalogLoad[] {
  const pair = catalogLoadForDefaultPair(panels)
  if (pair) return [pair]
  const loads: ReadPanelCatalogLoad[] = []
  for (const panelId of ['panel-1', 'panel-2'] as const) {
    const one = catalogLoadForSinglePanel(panels, panelId)
    if (one) loads.push(one)
  }
  return loads
}

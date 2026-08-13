/**
 * Per-panel catalog spinner — never hang when membership is already present.
 */

import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { ReadPanelId } from './readPanelModel'

export function destPanelsForCatalogLoad(options: {
  loadTarget: CatalogLoadTarget
  destPanelId?: ReadPanelId
}): ReadPanelId[] {
  if (options.destPanelId) return [options.destPanelId]
  if (options.loadTarget === 'text') return ['panel-1']
  if (options.loadTarget === 'helps') return ['panel-2']
  return ['panel-1', 'panel-2']
}

/**
 * Panel-level spinner only while that panel is fetching and still empty.
 * Membership (including `ult#2`) means hydrate already assigned — do not spin.
 */
export function isPanelCatalogSpinner(options: {
  catalogLoading: boolean
  hasMembership: boolean
}): boolean {
  if (options.hasMembership) return false
  return options.catalogLoading
}

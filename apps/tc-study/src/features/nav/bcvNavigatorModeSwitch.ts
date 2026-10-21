/**
 * BCV Bible ↔ Stories apply is an explicit mode tap (issue #25).
 * Language pick must not go through this path.
 */

import type { ScripturePickerGrain } from './ScopeTabs'

export type NavigatorCatalogScope = 'scripture' | 'obs'

/** Initial scripture grain: an explicit picker mode wins, else follow navigation mode. */
export function resolveScripturePickerGrain(
  mode: 'verse' | 'section' | 'chapter' | undefined,
  navigationMode: string
): ScripturePickerGrain {
  if (mode === 'section' || mode === 'chapter' || mode === 'verse') return mode
  if (navigationMode === 'section') return 'section'
  if (navigationMode === 'chapter') return 'chapter'
  return 'verse'
}

/** Scope to report after Apply, or null when the picker stayed on the current mode. */
export function navigatorCommittedScope(options: {
  previousScope: string
  pickerScope: NavigatorCatalogScope
}): NavigatorCatalogScope | null {
  return options.previousScope === options.pickerScope ? null : options.pickerScope
}

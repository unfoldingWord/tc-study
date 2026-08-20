/**
 * BCV Bible ↔ Stories apply is an explicit mode tap (issue #25).
 * Language pick must not go through this path.
 */

export type NavigatorCatalogScope = 'scripture' | 'obs'

/** Scope to report after Apply, or null when the picker stayed on the current mode. */
export function navigatorCommittedScope(options: {
  previousScope: string
  pickerScope: NavigatorCatalogScope
}): NavigatorCatalogScope | null {
  return options.previousScope === options.pickerScope ? null : options.pickerScope
}

/**
 * Bible vs OBS helps catalog scope for a mode switch.
 * Nav/URL can lag the visible OBS pane — also trust primary OBS keys.
 */

import type { HelpsScope } from '../helps/combinedHelpsInjection'
import { resolveCatalogNavigationScope } from './textModeMismatch'

export function panelHasObsPrimaryContent(
  resourceKeys: readonly string[],
  resources: { get(key: string): { type?: string } | undefined }
): boolean {
  return resourceKeys.some((key) => {
    const r = resources.get(key) || resources.get(key.replace(/#\d+$/, ''))
    return String(r?.type || '') === 'obs'
  })
}

export function resolveHelpsCatalogScope(options: {
  navigationScope: string
  pathname?: string
  currentBook?: string
  thisPaneHasObsPrimary?: boolean
  siblingPaneHasObsPrimary?: boolean
}): HelpsScope {
  if (options.currentBook === 'obs') return 'obs'
  const nav = resolveCatalogNavigationScope({
    pathname: options.pathname ?? '',
    storeScope: options.navigationScope,
  })
  if (nav === 'obs') return 'obs'
  if (options.thisPaneHasObsPrimary || options.siblingPaneHasObsPrimary) return 'obs'
  return 'scripture'
}

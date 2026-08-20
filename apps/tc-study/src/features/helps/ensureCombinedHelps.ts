/**
 * Thin CombinedHelps-named alias — callers stay stable.
 * The algorithm lives in ensureCompositions (iterates panel entry compositions).
 */

import type { ResourceInfo } from '../../contexts/types'
import {
  ensureCompositions,
  guessGatewayLanguage as guessGatewayLanguageFromCompositions,
  type WorkspacePanelLike,
} from './ensureCompositions'

export type { WorkspacePanelLike }

export function ensureCombinedHelpsInWorkspace(options: {
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  languageCode?: string
  panelId?: string
  forceHelpsPanel?: boolean
}): {
  resources: Map<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  injected: string[]
  removed: string[]
} {
  return ensureCompositions(options)
}

export function guessGatewayLanguage(
  resources: Map<string, ResourceInfo>,
  panels: WorkspacePanelLike[]
): string {
  return guessGatewayLanguageFromCompositions(resources, panels)
}

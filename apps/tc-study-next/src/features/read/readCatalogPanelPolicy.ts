/**
 * Which catalog hits belong on the text pane vs the helps pane.
 *
 * Role → mode → dest panel. Default dest is p1=scripture / p2=helps so
 * existing bootstrap stays green. Dual-mode loads pass `destPanelId` so two
 * scripture panels are never forced onto panel-1.
 */

import {
  defaultDestPanelIdForTarget,
  type ReadPanelId,
} from './readPanelModel'

export type CatalogLoadTarget = 'text' | 'helps' | 'both'

export type PanelAssignment =
  | { kind: 'panel'; panelId: ReadPanelId }
  | { kind: 'skip' }
  | { kind: 'packageOnly' }

/**
 * Primary (scripture/OBS) → dest scripture panel. Companion/shared → dest helps panel.
 * When `destPanelId` is omitted, dest follows the default mapping (text→panel-1, helps→panel-2).
 */
export function panelAssignmentForContentRole(
  contentRole: string | undefined,
  target: CatalogLoadTarget,
  hasViewer: boolean,
  destPanelId?: ReadPanelId
): PanelAssignment {
  const isPrimary = contentRole === 'primary'
  const dest = destPanelId ?? defaultDestPanelIdForTarget(target)

  if (target === 'text') {
    if (!isPrimary) return { kind: 'skip' }
    return hasViewer ? { kind: 'panel', panelId: dest } : { kind: 'packageOnly' }
  }

  if (target === 'helps') {
    if (isPrimary) return { kind: 'skip' }
    return hasViewer ? { kind: 'panel', panelId: dest } : { kind: 'packageOnly' }
  }

  const panelId = destPanelId ?? (isPrimary ? 'panel-1' : 'panel-2')
  return hasViewer ? { kind: 'panel', panelId } : { kind: 'packageOnly' }
}

export function catalogTargetsForLoad(options: {
  textLanguageCode: string
  helpsLanguageCode: string
  loadTarget: CatalogLoadTarget
}): Array<{ languageCode: string; target: CatalogLoadTarget }> {
  const { textLanguageCode, helpsLanguageCode, loadTarget } = options

  if (loadTarget === 'text') {
    return [{ languageCode: textLanguageCode, target: 'text' }]
  }
  if (loadTarget === 'helps') {
    return [{ languageCode: helpsLanguageCode, target: 'helps' }]
  }
  if (textLanguageCode === helpsLanguageCode) {
    return [{ languageCode: textLanguageCode, target: 'both' }]
  }
  return [
    { languageCode: textLanguageCode, target: 'text' },
    { languageCode: helpsLanguageCode, target: 'helps' },
  ]
}

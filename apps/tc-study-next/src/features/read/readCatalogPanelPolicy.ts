/**
 * Which catalog hits belong on the text pane vs the helps pane.
 */

export type CatalogLoadTarget = 'text' | 'helps' | 'both'

export type PanelAssignment =
  | { kind: 'panel'; panelId: 'panel-1' | 'panel-2' }
  | { kind: 'skip' }
  | { kind: 'packageOnly' }

/**
 * Primary (scripture/OBS) → panel-1. Companion/shared → panel-2.
 * When loading one side only, skip the other side's roles so a minority
 * text language cannot blank (or pollute) gateway helps, and vice versa.
 */
export function panelAssignmentForContentRole(
  contentRole: string | undefined,
  target: CatalogLoadTarget,
  hasViewer: boolean
): PanelAssignment {
  const isPrimary = contentRole === 'primary'

  if (target === 'text') {
    if (!isPrimary) return { kind: 'skip' }
    return hasViewer ? { kind: 'panel', panelId: 'panel-1' } : { kind: 'packageOnly' }
  }

  if (target === 'helps') {
    if (isPrimary) return { kind: 'skip' }
    return hasViewer ? { kind: 'panel', panelId: 'panel-2' } : { kind: 'packageOnly' }
  }

  const panelId = isPrimary ? 'panel-1' : 'panel-2'
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

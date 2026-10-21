/**
 * Presentation for the process/download debug UI.
 * - closed: not visible
 * - modal: centered ModalPortal dialog (overlay)
 * - docked: in-flow full-width bottom panel in the Read shell
 *   (sibling of NavigationBar + panels; middle flex-1 shrinks — not a LinkedPanel)
 */
export type ProcessDebugPresentation = 'closed' | 'modal' | 'docked'

export type ProcessDebugPresentationAction = 'open' | 'close' | 'dock' | 'undock'

export function nextProcessDebugPresentation(
  current: ProcessDebugPresentation,
  action: ProcessDebugPresentationAction
): ProcessDebugPresentation {
  switch (action) {
    case 'open':
      return current === 'docked' ? 'docked' : 'modal'
    case 'close':
      return 'closed'
    case 'dock':
      return current === 'closed' ? 'closed' : 'docked'
    case 'undock':
      return current === 'docked' ? 'modal' : current
    default:
      return current
  }
}

export function isProcessDebugOpen(presentation: ProcessDebugPresentation): boolean {
  return presentation !== 'closed'
}

export function isProcessDebugDocked(presentation: ProcessDebugPresentation): boolean {
  return presentation === 'docked'
}

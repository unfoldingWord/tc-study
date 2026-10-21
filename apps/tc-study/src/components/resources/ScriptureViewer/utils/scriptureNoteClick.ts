import type { BCVReference } from '../../../../contexts/types-only'
import { parseScriptureRefsFromText } from '../../TranslationNotesViewer/utils/parseScriptureLink'

export function scriptureNoteClickTarget(
  kind: 'note' | 'xref',
  text: string,
  currentBook: string
): { action: 'navigate'; ref: BCVReference } | { action: 'popover' } {
  if (kind === 'xref') {
    const refs = parseScriptureRefsFromText(text, currentBook)
    if (refs.length === 1) return { action: 'navigate', ref: refs[0]! }
  }
  return { action: 'popover' }
}

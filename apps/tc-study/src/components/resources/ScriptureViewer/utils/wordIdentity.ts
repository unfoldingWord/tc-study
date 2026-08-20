/**
 * Linked-panels word identity — Pipeline contract (2026-08-12).
 * Match key: \`${verseRef}:${content}:${occurrence}\`
 */
import {
  semanticIdFor,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { semanticIdMatchKey } from '../../../../features/helps/semanticIdMatchKey'

export { semanticIdFor }
export type { UsjWordToken }
export const semanticIdKey = semanticIdMatchKey

export type ScriptureRenderToken = Pick<
  UsjWordToken,
  'semanticId' | 'content' | 'occurrence' | 'verseRef' | 'alignedOriginalWordIds'
> & {
  /** NFD-folded once at load. Paint path must not re-normalize. */
  foldedSemanticId?: string
  foldedAlignedIds?: string[]
}

export function attachFoldedMatchKeys(token: ScriptureRenderToken): ScriptureRenderToken {
  token.foldedSemanticId = semanticIdKey(token.semanticId)
  token.foldedAlignedIds = token.alignedOriginalWordIds.map(semanticIdKey)
  return token
}

export function attachFoldedMatchKeysToViewModel(
  viewModel: UsjScriptureViewModel
): UsjScriptureViewModel {
  for (const chapter of viewModel.chapters) {
    for (const verse of chapter.verses) {
      for (const token of verse.tokens) attachFoldedMatchKeys(token)
    }
  }
  return viewModel
}

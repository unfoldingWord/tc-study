/**
 * Studio STATE signal contracts — owned by `@bt-synergy/resource-panels`.
 *
 * P1 keys/ownership must not change:
 * - SCRIPTURE_TOKENS (single owner)
 * - NOTES_TOKEN_GROUPS_TN / _TWL (per-publisher; scripture merges)
 * - OBS_FRAME_QUOTES_TN / _TWL (per-publisher; ObsViewer merges)
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import type {
  NotesTokenGroupsStateSignal,
  ObsFrameQuotesStateSignal,
  ScriptureTokensStateSignal,
} from '@bt-synergy/resource-panels'

export type {
  NotesTokenGroupEntry,
  NotesTokenGroupsStateKey,
  NotesTokenGroupsStateSignal,
  ObsFrameQuoteEntry,
  ObsFrameQuotesStateKey,
  ObsFrameQuotesStateSignal,
  ScriptureTokensStateSignal,
} from '@bt-synergy/resource-panels'

/** App widen of package STATE — tokens typed as OptimizedToken[]. */
export interface ScriptureTokensBroadcastSignal extends ScriptureTokensStateSignal {
  tokens: OptimizedToken[]
}

/** App alias for NotesTokenGroupsStateSignal (historical name). */
export type NotesTokenGroupsSignal = NotesTokenGroupsStateSignal

/** App alias for ObsFrameQuotesStateSignal (historical name). */
export type ObsFrameQuotesSignal = ObsFrameQuotesStateSignal

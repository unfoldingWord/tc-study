/**
 * Studio signals facade — re-exports EVENT + STATE contracts.
 *
 * - STATE: `@bt-synergy/resource-panels` via `studioStateSignals`
 * - EVENT: `studioEventSignals`
 * - Docs registry: `studioSignalRegistry`
 */

export type {
  BookNavigationSignal,
  ContentChangeSignal,
  CrossReferenceSignal,
  EntryLinkClickSignal,
  ObsFrameHighlightSignal,
  ResourceErrorSignal,
  ResourceLoadedSignal,
  ScriptureContentRequestSignal,
  ScriptureContentResponseSignal,
  ScrollSyncSignal,
  TextSelectionSignal,
  TokenClickSignal,
  VerseFilterSignal,
  VerseNavigationSignal,
} from './studioEventSignals'

export type {
  NotesTokenGroupEntry,
  NotesTokenGroupsSignal,
  NotesTokenGroupsStateKey,
  NotesTokenGroupsStateSignal,
  ObsFrameQuoteEntry,
  ObsFrameQuotesSignal,
  ObsFrameQuotesStateKey,
  ObsFrameQuotesStateSignal,
  ScriptureTokensBroadcastSignal,
  ScriptureTokensStateSignal,
} from './studioStateSignals'

export { STUDIO_SIGNAL_REGISTRY } from './studioSignalRegistry'

import type {
  BookNavigationSignal,
  ContentChangeSignal,
  CrossReferenceSignal,
  EntryLinkClickSignal,
  ObsFrameHighlightSignal,
  ResourceErrorSignal,
  ResourceLoadedSignal,
  ScriptureContentRequestSignal,
  ScriptureContentResponseSignal,
  ScrollSyncSignal,
  TextSelectionSignal,
  TokenClickSignal,
  VerseFilterSignal,
  VerseNavigationSignal,
} from './studioEventSignals'
import type {
  NotesTokenGroupsSignal,
  ObsFrameQuotesSignal,
  ScriptureTokensBroadcastSignal,
} from './studioStateSignals'

/** Union of studio signals for multi-signal handlers */
export type StudioSignal =
  | VerseNavigationSignal
  | BookNavigationSignal
  | TokenClickSignal
  | VerseFilterSignal
  | TextSelectionSignal
  | EntryLinkClickSignal
  | CrossReferenceSignal
  | ScriptureTokensBroadcastSignal
  | NotesTokenGroupsSignal
  | ScriptureContentRequestSignal
  | ScriptureContentResponseSignal
  | ResourceLoadedSignal
  | ResourceErrorSignal
  | ContentChangeSignal
  | ScrollSyncSignal
  | ObsFrameQuotesSignal
  | ObsFrameHighlightSignal

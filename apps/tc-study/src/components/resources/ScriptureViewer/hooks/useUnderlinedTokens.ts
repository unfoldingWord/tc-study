/**
 * Subscribes to TN and TWL broadcasts of original-language semantic IDs for passive underlining in scripture.
 * Separate state keys so both resources can contribute without overwriting.
 */

import { useCurrentState } from 'linked-panels'
import { useMemo } from 'react'
import type { NotesTokenGroupsSignal } from '../../../../signals/studioSignals'

const EMPTY_SET = new Set<string>()

function flattenGroups(state: NotesTokenGroupsSignal | null | undefined, into: Set<string>) {
  if (!state?.tokenGroups?.length) return
  for (const g of state.tokenGroups) {
    for (const id of g.semanticIds) {
      into.add(id.toLowerCase())
    }
  }
}

export function useUnderlinedTokens(resourceId: string): Set<string> {
  const tnState = useCurrentState<NotesTokenGroupsSignal>(resourceId, 'current-notes-token-groups-tn')
  const twlState = useCurrentState<NotesTokenGroupsSignal>(resourceId, 'current-notes-token-groups-twl')

  return useMemo(() => {
    const next = new Set<string>()
    flattenGroups(tnState, next)
    flattenGroups(twlState, next)
    if (next.size === 0) return EMPTY_SET
    return next
  }, [tnState, twlState])
}

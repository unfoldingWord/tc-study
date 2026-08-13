/**
 * Subscribes to TN and TWL broadcasts of original-language semantic IDs for passive underlining in scripture.
 * Separate state keys so both resources can contribute without overwriting.
 */

import { RESOURCE_STATE_KEYS, useResourceState } from '@bt-synergy/resource-panels'
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
  const tnState = useResourceState<NotesTokenGroupsSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TN
  )
  const twlState = useResourceState<NotesTokenGroupsSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TWL
  )

  return useMemo(() => {
    const next = new Set<string>()
    flattenGroups(tnState, next)
    flattenGroups(twlState, next)
    if (next.size === 0) return EMPTY_SET
    return next
  }, [tnState, twlState])
}

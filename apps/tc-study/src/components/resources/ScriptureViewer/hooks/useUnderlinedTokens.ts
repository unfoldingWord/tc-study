/**
 * Subscribes to TN and TWL broadcasts of original-language semantic IDs for passive underlining in scripture.
 * Separate state keys so both resources can contribute without overwriting.
 *
 * Fold IDs once when the helps signal changes. Paint is Set.has only.
 */

import { RESOURCE_STATE_KEYS, useResourceState } from '@bt-synergy/resource-panels'
import { useMemo } from 'react'
import type { NotesTokenGroupsSignal } from '../../../../signals/studioSignals'
import {
  markScripturePerfEnd,
  markScripturePerfStart,
} from '../../../../features/perf/scripturePerf'
import { resolveMatchIndices } from '../../../../features/scripture/scripturePreparer'
import { semanticIdKey } from '../utils/wordIdentity'

const EMPTY_UNDERLINE_SET: Set<string> = new Set()
const EMPTY_INDEX_SET: Set<number> = new Set()

function foldUnderlineIds(state: NotesTokenGroupsSignal | null | undefined, into: Set<string>) {
  if (!state?.tokenGroups?.length) return
  for (const g of state.tokenGroups) {
    for (const id of g.semanticIds) {
      into.add(semanticIdKey(id))
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
    markScripturePerfStart('underline-signal')
    const next = new Set<string>()
    foldUnderlineIds(tnState, next)
    foldUnderlineIds(twlState, next)
    const result = next.size === 0 ? EMPTY_UNDERLINE_SET : next
    markScripturePerfEnd('underline-signal')
    return result
  }, [tnState, twlState])
}

/** Map folded underline set through a chapter matchKeys table → integer indices. */
export function mapUnderlinesToIndices(
  matchKeys: readonly string[],
  foldedSet: ReadonlySet<string>
): Set<number> {
  if (!matchKeys.length || foldedSet.size === 0) return EMPTY_INDEX_SET
  return resolveMatchIndices(matchKeys, foldedSet)
}

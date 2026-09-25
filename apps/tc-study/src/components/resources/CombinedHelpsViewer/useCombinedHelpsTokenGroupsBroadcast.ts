/**
 * Broadcast TN/TWL notes-token-groups STATE for CombinedHelps (scripture scope).
 */

import { RESOURCE_STATE_KEYS, useResourceStateSender } from '@bt-synergy/resource-panels'
import { useEffect, useRef } from 'react'
import {
  shouldResetTokenGroupsDedupe,
  tokenGroupsBroadcastDedupeKey,
} from '../../../features/helps/scriptureReadyUnderlineRebind'
import { shouldBroadcastUnderlineGroups } from '../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../features/nav/usePinnedHelpsReference'
import type { NotesTokenGroupsSignal } from '../../../signals/studioSignals'
import { useScriptureContentRevision } from '../WordsLinksViewer/hooks'
import type { HelpsKindFilter } from './types'

export interface UseCombinedHelpsTokenGroupsBroadcastParams {
  resourceId: string
  resourceKey: string
  tnKey: string
  twlKey: string
  helpsScope: 'scripture' | 'obs'
  kindFilter: HelpsKindFilter
  underlineTnGroups: { sourceId: string; semanticIds: string[] }[]
  underlineTwlGroups: { sourceId: string; semanticIds: string[] }[]
}

export function useCombinedHelpsTokenGroupsBroadcast({
  resourceId,
  resourceKey,
  tnKey,
  twlKey,
  helpsScope,
  kindFilter,
  underlineTnGroups,
  underlineTwlGroups,
}: UseCombinedHelpsTokenGroupsBroadcastParams) {
  // Leave/unmount: clearResourceState via useResourceStateSender clearOnUnmount (no empty sendToAll).
  const { sendState: sendTnTokenGroups } = useResourceStateSender<NotesTokenGroupsSignal>(
    'notes-token-groups',
    resourceId,
    RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TN,
    'combined-helps'
  )
  const { sendState: sendTwlTokenGroups } = useResourceStateSender<NotesTokenGroupsSignal>(
    'notes-token-groups',
    resourceId,
    RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TWL,
    'combined-helps'
  )
  const lastTnKeyRef = useRef<string | null>(null)
  const lastTwlKeyRef = useRef<string | null>(null)
  const lastRevisionRef = useRef<string | null>(null)
  const wasUnsettledRef = useRef(false)
  const scriptureRevision = useScriptureContentRevision(resourceId)
  const scrollActivity = useChapterScrollActivity()

  useEffect(() => {
    if (helpsScope === 'obs') return

    const activeTn = kindFilter === 'twl' ? [] : underlineTnGroups
    const activeTwl = kindFilter === 'notes' ? [] : underlineTwlGroups
    const groupCount = activeTn.length + activeTwl.length

    if (scrollActivity.unsettled) {
      wasUnsettledRef.current = true
      // Keep non-empty quote underlines painted while scrolling; never flash empty.
      if (
        !shouldBroadcastUnderlineGroups({
          unsettled: true,
          groupCount,
        })
      ) {
        return
      }
    } else if (wasUnsettledRef.current) {
      // After settle, force a fresh broadcast so scripture rebinds.
      lastTnKeyRef.current = null
      lastTwlKeyRef.current = null
      wasUnsettledRef.current = false
    }

    if (
      shouldResetTokenGroupsDedupe({
        previousRevision: lastRevisionRef.current,
        nextRevision: scriptureRevision,
      })
    ) {
      lastTnKeyRef.current = null
      lastTwlKeyRef.current = null
    }
    lastRevisionRef.current = scriptureRevision

    const tnKeyDedupe = tokenGroupsBroadcastDedupeKey(kindFilter, activeTn, scriptureRevision)
    if (tnKeyDedupe !== lastTnKeyRef.current) {
      lastTnKeyRef.current = tnKeyDedupe
      const parts = (tnKey || resourceKey).split('/')
      const language = parts[1]?.split('_')[0] || ''
      sendTnTokenGroups({
        tokenGroups: activeTn,
        resourceMetadata: { id: tnKey || resourceKey, language, type: 'tn' },
      })
    }

    const twlKeyDedupe = tokenGroupsBroadcastDedupeKey(kindFilter, activeTwl, scriptureRevision)
    if (twlKeyDedupe !== lastTwlKeyRef.current) {
      lastTwlKeyRef.current = twlKeyDedupe
      const parts = (twlKey || resourceKey).split('/')
      const language = parts[1]?.split('_')[0] || ''
      sendTwlTokenGroups({
        tokenGroups: activeTwl,
        resourceMetadata: { id: twlKey || resourceKey, language, type: 'words-links' },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendState refs stable; keys dedupe
  }, [
    resourceId,
    tnKey,
    twlKey,
    resourceKey,
    underlineTnGroups,
    underlineTwlGroups,
    kindFilter,
    helpsScope,
    scriptureRevision,
    scrollActivity.unsettled,
  ])
}

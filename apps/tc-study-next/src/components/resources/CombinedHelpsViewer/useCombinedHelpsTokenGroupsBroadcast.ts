/**
 * Broadcast TN/TWL notes-token-groups STATE for CombinedHelps (scripture scope).
 */

import { RESOURCE_STATE_KEYS, useResourceStateSender } from '@bt-synergy/resource-panels'
import { useEffect, useRef } from 'react'
import { tokenGroupsBroadcastDedupeKey } from '../../../features/helps/scriptureReadyUnderlineRebind'
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
  const scriptureRevision = useScriptureContentRevision(resourceId)

  useEffect(() => {
    if (helpsScope === 'obs') return
    const activeGroups = kindFilter === 'twl' ? [] : underlineTnGroups
    const key = tokenGroupsBroadcastDedupeKey(kindFilter, activeGroups, scriptureRevision)
    if (key === lastTnKeyRef.current) return
    lastTnKeyRef.current = key
    const parts = (tnKey || resourceKey).split('/')
    const language = parts[1]?.split('_')[0] || ''
    sendTnTokenGroups({
      tokenGroups: activeGroups,
      resourceMetadata: { id: tnKey || resourceKey, language, type: 'tn' },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sendState ref is stable; key dedupes
  }, [resourceId, tnKey, resourceKey, underlineTnGroups, kindFilter, helpsScope, scriptureRevision])

  useEffect(() => {
    if (helpsScope === 'obs') return
    const activeGroups = kindFilter === 'notes' ? [] : underlineTwlGroups
    const key = tokenGroupsBroadcastDedupeKey(kindFilter, activeGroups, scriptureRevision)
    if (key === lastTwlKeyRef.current) return
    lastTwlKeyRef.current = key
    const parts = (twlKey || resourceKey).split('/')
    const language = parts[1]?.split('_')[0] || ''
    sendTwlTokenGroups({
      tokenGroups: activeGroups,
      resourceMetadata: { id: twlKey || resourceKey, language, type: 'words-links' },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, twlKey, resourceKey, underlineTwlGroups, kindFilter, helpsScope, scriptureRevision])

}

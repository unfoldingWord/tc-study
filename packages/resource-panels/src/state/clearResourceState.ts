/**
 * Clear a STATE key without sendToAll (avoids "Sender resource does not exist"
 * when the source has already left the linked-panels resource map).
 */

import { getLinkedPanelsStore } from 'linked-panels'

/**
 * Tombstone / clear broadcast STATE for `stateKey`.
 *
 * Only clears when the current message was published by `resourceId` (or there
 * is no current message). Safe to call from React unmount cleanup.
 */
export function clearResourceState(resourceId: string, stateKey: string): void {
  let store: ReturnType<typeof getLinkedPanelsStore>
  try {
    store = getLinkedPanelsStore()
  } catch {
    // Outside LinkedPanelsContainer (unit tests / early unmount) — no-op
    return
  }

  const state = store.getState()
  const current = state.messagingSystem.getCurrentState(resourceId, stateKey)
  const sourceId = (current?.content as { sourceResourceId?: string } | undefined)
    ?.sourceResourceId
  if (sourceId && sourceId !== resourceId) {
    return
  }

  state.messagingSystem.clearState(resourceId, stateKey)

  // Refresh message snapshots so useCurrentState subscribers drop the key
  const resourceIds = Object.keys(state.resources)
  store.setState((draft) => {
    for (const id of resourceIds) {
      draft.resourceMessages[id] = state.messagingSystem.getMessages(id)
    }
  })
}

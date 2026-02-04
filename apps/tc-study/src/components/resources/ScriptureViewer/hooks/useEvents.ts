/**
 * Hook for handling inter-panel events
 */

import { useEvents } from 'linked-panels'
import type { VerseReferenceFilterEvent } from '../../../../plugins/types'

export function useScriptureEvents(resourceId: string) {
  // Listen for verse-filter events
  useEvents<VerseReferenceFilterEvent>(
    resourceId,
    ['verse-filter'],
    () => {
      // Handle verse-filter events
    }
  )
}



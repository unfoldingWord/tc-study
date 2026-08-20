import {
  RESOURCE_STATE_KEYS,
  mergeObsFrameQuotesStates,
  useResourceState,
} from '@bt-synergy/resource-panels'
import { useMemo } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { useWorkspaceStore } from '../../../../lib/stores/workspaceStore'
import { OBS_COMBINED_HELPS_RESOURCE_ID } from '../../../../features/helps/combinedHelpsIds'
import type { ObsFrameQuoteEntry, ObsFrameQuotesSignal } from '../../../../signals/studioSignals'
import { isPanel2KeyQuoteCapable } from '../obsHighlightHelpers'

/**
 * Per-publisher TN/TWL keys — merge so neither last-writer-wins the other.
 */
export function useObsFrameQuotes(params: {
  resourceId: string
  storyNum: number
  frameNum: number
  isRange: boolean
}) {
  const { resourceId, storyNum, frameNum, isRange } = params

  const panel2ActiveKey = useWorkspaceStore((s) => {
    const panel = s.currentPackage?.panels.find((p) => p.id === 'panel-2')
    if (!panel?.resourceKeys?.length) return null
    return panel.resourceKeys[panel.activeIndex ?? 0] ?? null
  })
  const loadedResources = useAppStore((s) => s.loadedResources)

  const isPanel2QuoteCapable = useMemo(
    () =>
      isPanel2KeyQuoteCapable(
        panel2ActiveKey,
        loadedResources[panel2ActiveKey ?? '']?.type,
        OBS_COMBINED_HELPS_RESOURCE_ID
      ),
    [panel2ActiveKey, loadedResources]
  )

  const obsQuotesTn = useResourceState<ObsFrameQuotesSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TN
  )
  const obsQuotesTwl = useResourceState<ObsFrameQuotesSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TWL
  )
  const obsQuotesState = useMemo(
    () => mergeObsFrameQuotesStates(obsQuotesTn, obsQuotesTwl),
    [obsQuotesTn, obsQuotesTwl]
  )

  const quotesForFrame: ObsFrameQuoteEntry[] = useMemo(() => {
    if (isRange || !isPanel2QuoteCapable) return []
    const s = obsQuotesState
    if (!s || s.quotes === undefined) return []
    if (s.storyNumber !== storyNum || s.frameNumber !== frameNum) return []
    return s.quotes
  }, [obsQuotesState, storyNum, frameNum, isPanel2QuoteCapable, isRange])

  return { isPanel2QuoteCapable, obsQuotesState, quotesForFrame }
}

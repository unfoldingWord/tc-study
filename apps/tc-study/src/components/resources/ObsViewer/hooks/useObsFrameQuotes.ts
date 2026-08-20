import {
  RESOURCE_STATE_KEYS,
  mergeObsFrameQuotesStates,
  useResourceState,
} from '@bt-synergy/resource-panels'
import { useMemo, useSyncExternalStore } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { OBS_COMBINED_HELPS_RESOURCE_ID } from '../../../../features/helps/combinedHelpsIds'
import { preferHydratedObsQuotes } from '../../../../lib/obs/buildObsFrameQuotes'
import {
  getObsFrameQuotes,
  subscribeObsFrameQuotes,
} from '../../../../lib/obs/obsFrameQuotesStore'
import { useWorkspaceStore } from '../../../../lib/stores/workspaceStore'
import type { ObsFrameQuoteEntry, ObsFrameQuotesSignal } from '../../../../signals/studioSignals'
import { panelKeysAreObsQuoteCapable } from '../obsHighlightHelpers'

/** Zustand selectors must return a cached value — a fresh empty array every call loops. */
const EMPTY_PANEL_KEYS: readonly string[] = []

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

  const panel2Keys = useWorkspaceStore((s) => {
    const panel = s.currentPackage?.panels.find((p) => p.id === 'panel-2')
    return panel?.resourceKeys ?? EMPTY_PANEL_KEYS
  })
  const loadedResources = useAppStore((s) => s.loadedResources)

  const isPanel2QuoteCapable = useMemo(
    () =>
      panelKeysAreObsQuoteCapable(
        panel2Keys,
        (key) => loadedResources[key]?.type,
        OBS_COMBINED_HELPS_RESOURCE_ID
      ),
    [panel2Keys, loadedResources]
  )

  const obsQuotesTn = useResourceState<ObsFrameQuotesSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TN
  )
  const obsQuotesTwl = useResourceState<ObsFrameQuotesSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TWL
  )
  const publishedQuotes = useSyncExternalStore(
    subscribeObsFrameQuotes,
    getObsFrameQuotes,
    getObsFrameQuotes
  )
  const obsQuotesState = useMemo(
    () =>
      preferHydratedObsQuotes(
        mergeObsFrameQuotesStates(obsQuotesTn, obsQuotesTwl),
        publishedQuotes
      ),
    [obsQuotesTn, obsQuotesTwl, publishedQuotes]
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

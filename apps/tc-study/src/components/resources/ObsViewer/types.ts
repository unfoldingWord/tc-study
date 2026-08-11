import type { ObsFrameQuoteEntry } from '../../../signals/studioSignals'

export interface ObsViewerProps {
  resourceId: string
  resourceKey: string
  resource: { title?: string; language?: string }
  isAnchor?: boolean
}

export type ActiveHl = {
  quote?: string
  occurrence?: number
  rowId?: string
  frameNumber?: number
  wordIndex?: number
  overlappingSourceIds?: string[]
}

export type { ObsFrameQuoteEntry }

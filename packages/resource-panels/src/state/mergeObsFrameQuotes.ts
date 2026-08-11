/**
 * Merge TN + TWL OBS frame-quote STATE payloads for ObsViewer.
 */

import type { ObsFrameQuoteEntry, ObsFrameQuotesStateSignal } from './types'

export interface MergedObsFrameQuotes {
  storyNumber: number
  frameNumber: number
  quotes: ObsFrameQuoteEntry[]
  frameQuoteMap: Record<number, ObsFrameQuoteEntry[]>
  /** True when at least one publisher contributed a matching story/frame */
  hasQuotes: boolean
}

function mergeFrameMaps(
  a?: Record<number, ObsFrameQuoteEntry[]>,
  b?: Record<number, ObsFrameQuoteEntry[]>
): Record<number, ObsFrameQuoteEntry[]> {
  const out: Record<number, ObsFrameQuoteEntry[]> = {}
  for (const [k, entries] of Object.entries(a || {})) {
    const n = Number(k)
    out[n] = [...(entries || [])]
  }
  for (const [k, entries] of Object.entries(b || {})) {
    const n = Number(k)
    out[n] = [...(out[n] || []), ...(entries || [])]
  }
  return out
}

/**
 * Deterministic merge of per-publisher OBS quote STATE (TN then TWL).
 * Prefers story/frame from the first non-empty publisher; concatenates quotes.
 */
export function mergeObsFrameQuotesStates(
  tn: ObsFrameQuotesStateSignal | null | undefined,
  twl: ObsFrameQuotesStateSignal | null | undefined
): MergedObsFrameQuotes | null {
  if (!tn && !twl) return null

  const storyNumber = tn?.storyNumber || twl?.storyNumber || 0
  const frameNumber = tn?.frameNumber || twl?.frameNumber || 0

  const tnMatch =
    tn && tn.storyNumber === storyNumber && tn.frameNumber === frameNumber
      ? tn.quotes || []
      : []
  const twlMatch =
    twl && twl.storyNumber === storyNumber && twl.frameNumber === frameNumber
      ? twl.quotes || []
      : []

  const quotes = [...tnMatch, ...twlMatch]
  const frameQuoteMap = mergeFrameMaps(tn?.frameQuoteMap, twl?.frameQuoteMap)

  return {
    storyNumber,
    frameNumber,
    quotes,
    frameQuoteMap,
    hasQuotes: quotes.length > 0 || Object.keys(frameQuoteMap).length > 0,
  }
}

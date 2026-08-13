import type { FrameSpan } from '../../../../lib/obs/highlightFrameText'
import { resolveObsHighlightSpans } from '../../../../lib/obs/resolveObsHighlightSpans'
import type { ObsFrame, ParsedObsStory } from '../../../../lib/obs/parseObsMarkdown'
import type { MergedObsFrameQuotes } from '@bt-synergy/resource-panels'
import type { ObsFrameQuoteEntry } from '../../../../signals/studioSignals'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import type { ActiveHl } from '../types'
import { ObsQuoteSpans } from './ObsQuoteSpans'

export function ObsRangeView(props: {
  storyNum: number
  endStory: number
  frameNum: number
  endFrame: number
  isStoryMode: boolean
  storyMap: Record<number, ParsedObsStory>
  isPanel2QuoteCapable: boolean
  obsQuotesState: MergedObsFrameQuotes | null | undefined
  activeHighlight: ActiveHl | null
  activateWordSpan: (
    span: FrameSpan,
    sNum: number,
    fNum: number,
    enriched: ObsFrameQuoteEntry[]
  ) => void
  toggleRangeHighlight: (sNum: number, frameNumber: number, entry: ObsFrameQuoteEntry) => void
}) {
  const {
    storyNum,
    endStory,
    frameNum,
    endFrame,
    isStoryMode,
    storyMap,
    isPanel2QuoteCapable,
    obsQuotesState,
    activeHighlight,
    activateWordSpan,
    toggleRangeHighlight,
  } = props

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {Array.from({ length: endStory - storyNum + 1 }, (_, i) => storyNum + i).map((sNum) => {
        const storyData = storyMap[sNum]
        if (!storyData) {
          return (
            <div key={sNum} className="flex items-center gap-2 py-2">
              <LoadingSpinner size="sm" label={`Loading story ${sNum}`} className="text-blue-600" />
            </div>
          )
        }

        const framesInRange: ObsFrame[] = isStoryMode
          ? storyData.frames
          : storyData.frames.filter((f) => {
              if (sNum === storyNum && f.frameNumber < frameNum) return false
              if (sNum === endStory && f.frameNumber > endFrame) return false
              return true
            })

        return (
          <div key={sNum}>
            <h3 className="text-base font-bold text-gray-700 border-b border-gray-200 pb-1 mb-5">
              {storyData.title}
            </h3>
            <div className="space-y-8">
              {framesInRange.map((frame) => {
                const frameEntries: ObsFrameQuoteEntry[] = isPanel2QuoteCapable
                  ? (obsQuotesState?.frameQuoteMap?.[frame.frameNumber] ?? [])
                  : []
                const resolved =
                  frameEntries.length > 0
                    ? resolveObsHighlightSpans(frame.text, frameEntries)
                    : null
                return (
                  <div key={frame.frameNumber} className="space-y-3">
                    <p className="text-xs text-gray-400 font-medium">
                      {sNum} · {frame.frameNumber}
                    </p>
                    {resolved ? (
                      <div className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                        <ObsQuoteSpans
                          spans={resolved.spans}
                          enriched={resolved.enriched}
                          activeHighlight={activeHighlight}
                          frameNumber={frame.frameNumber}
                          useWordMode={resolved.useWordMode}
                          storyNum={sNum}
                          onActivateWord={activateWordSpan}
                          onToggleEntry={(entry) =>
                            toggleRangeHighlight(sNum, frame.frameNumber, entry)
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                        {frame.text}
                      </p>
                    )}
                    {(frame.resolvedSrc || frame.imageUrl) && (
                      <img
                        src={frame.resolvedSrc || frame.imageUrl}
                        alt=""
                        className="w-full rounded-lg border border-gray-200 shadow-sm bg-gray-50"
                        loading="lazy"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

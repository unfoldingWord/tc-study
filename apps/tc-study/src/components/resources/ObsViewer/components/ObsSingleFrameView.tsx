import type { RefObject } from 'react'
import type { FrameSpan } from '../../../../lib/obs/highlightFrameText'
import type { ObsFrame } from '../../../../lib/obs/parseObsMarkdown'
import type { ObsFrameQuoteEntry } from '../../../../signals/studioSignals'
import type { ActiveHl } from '../types'
import { ObsQuoteSpans } from './ObsQuoteSpans'

export function ObsSingleFrameView(props: {
  currentFrame: ObsFrame
  spans: FrameSpan[]
  enrichedQuotes: ObsFrameQuoteEntry[]
  activeHighlight: ActiveHl | null
  frameNum: number
  storyNum: number
  useWordUnderline: boolean
  frameTextRef: RefObject<HTMLDivElement | null>
  activateWordSpan: (
    span: FrameSpan,
    sNum: number,
    fNum: number,
    enriched: ObsFrameQuoteEntry[]
  ) => void
  toggleHighlightEntry: (entry: ObsFrameQuoteEntry) => void
}) {
  const {
    currentFrame,
    spans,
    enrichedQuotes,
    activeHighlight,
    frameNum,
    storyNum,
    useWordUnderline,
    frameTextRef,
    activateWordSpan,
    toggleHighlightEntry,
  } = props

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div
        ref={frameTextRef}
        className="prose prose-base max-w-none text-gray-900 whitespace-pre-wrap leading-relaxed"
      >
        <ObsQuoteSpans
          spans={spans}
          enriched={enrichedQuotes}
          activeHighlight={activeHighlight}
          frameNumber={frameNum}
          useWordMode={useWordUnderline}
          storyNum={storyNum}
          onActivateWord={activateWordSpan}
          onToggleEntry={toggleHighlightEntry}
        />
      </div>
      {currentFrame.resolvedSrc || currentFrame.imageUrl ? (
        <img
          src={currentFrame.resolvedSrc || currentFrame.imageUrl}
          alt=""
          className="w-full rounded-lg border border-gray-200 shadow-sm bg-gray-50"
          loading="lazy"
        />
      ) : null}
    </div>
  )
}

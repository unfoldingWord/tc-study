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
  onFrameClick: (storyNum: number, frameNumber: number) => void
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
    onFrameClick,
  } = props

  return (
    <div
      className="max-w-2xl mx-auto space-y-4 cursor-pointer"
      title={`Frame ${storyNum} · ${frameNum}`}
      data-obs-frame={`${storyNum}:${frameNum}`}
      onClick={() => onFrameClick(storyNum, frameNum)}
    >
      <div
        ref={frameTextRef}
        className="prose prose-base max-w-none text-scripture-fg prose-p:text-scripture-fg prose-headings:text-scripture-fg whitespace-pre-wrap leading-relaxed"
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
          className="w-full rounded-lg border border-border shadow-sm bg-muted"
          loading="lazy"
        />
      ) : null}
    </div>
  )
}

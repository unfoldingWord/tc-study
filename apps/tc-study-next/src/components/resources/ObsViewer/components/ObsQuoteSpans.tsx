import clsx from 'clsx'
import type { FrameSpan } from '../../../../lib/obs/highlightFrameText'
import type { ObsFrameQuoteEntry } from '../../../../signals/studioSignals'
import type { ActiveHl } from '../types'
import {
  QUOTE_BUTTON_ACTIVE_CLASS,
  QUOTE_BUTTON_IDLE_CLASS,
  isObsEntryActive,
} from '../obsHighlightHelpers'

export function ObsQuoteSpans(props: {
  spans: FrameSpan[]
  enriched: ObsFrameQuoteEntry[]
  activeHighlight: ActiveHl | null
  frameNumber: number
  useWordMode: boolean
  storyNum: number
  onActivateWord: (
    span: FrameSpan,
    storyNum: number,
    frameNumber: number,
    enriched: ObsFrameQuoteEntry[]
  ) => void
  onToggleEntry: (entry: ObsFrameQuoteEntry) => void
}) {
  const {
    spans,
    enriched,
    activeHighlight,
    frameNumber,
    useWordMode,
    storyNum,
    onActivateWord,
    onToggleEntry,
  } = props

  return (
    <>
      {spans.map((span, idx) => {
        if (span.quoteIndex === undefined) {
          return <span key={`t-${idx}`}>{span.text}</span>
        }
        const entry = enriched[span.quoteIndex]
        if (!entry) return <span key={`t-${idx}`}>{span.text}</span>
        const active =
          isObsEntryActive(activeHighlight, entry, frameNumber) ||
          !!(
            span.parentQuoteIndices?.some((pqi) => {
              const pe = enriched[pqi]
              return pe ? isObsEntryActive(activeHighlight, pe, frameNumber) : false
            }) ?? false
          )
        return (
          <button
            key={`t-${idx}`}
            type="button"
            data-obs-quote-active={active ? 'true' : undefined}
            className={clsx(
              'inline align-baseline cursor-pointer px-px font-inherit text-inherit whitespace-pre-wrap transition-colors',
              active ? QUOTE_BUTTON_ACTIVE_CLASS : QUOTE_BUTTON_IDLE_CLASS
            )}
            onClick={() =>
              useWordMode &&
              span.startWord != null &&
              span.endWord != null &&
              span.quoteIndex != null
                ? onActivateWord(span, storyNum, frameNumber, enriched)
                : onToggleEntry(entry)
            }
          >
            {span.text}
          </button>
        )
      })}
    </>
  )
}

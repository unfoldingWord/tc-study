/**
 * ObsViewer — Open Bible Stories viewer.
 * - Single frame: shows the current frame (interactivity / quote highlighting).
 * - Range: shows every frame from start to end across stories; image below text.
 */

import { BookMarked } from 'lucide-react'
import { useMemo } from 'react'
import { useCurrentReference, useNavigationMode } from '../../../contexts'
import { enrichObsFrameQuoteEntries } from '../../../lib/obs/enrichObsFrameQuotes'
import { computeFrameSpans } from '../../../lib/obs/highlightFrameText'
import { computeFrameWordSpans } from '../../../lib/obs/highlightFrameWords'
import { LoadingSpinner } from '../../../shared/LoadingSpinner'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { ObsRangeView } from './components/ObsRangeView'
import { ObsSingleFrameView } from './components/ObsSingleFrameView'
import { useObsFrameQuotes } from './hooks/useObsFrameQuotes'
import { useObsHighlight } from './hooks/useObsHighlight'
import { useObsStories } from './hooks/useObsStories'
import type { ObsViewerProps } from './types'

export type { ObsViewerProps } from './types'

export function ObsViewer({ resourceId, resourceKey, resource }: ObsViewerProps) {
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const storyNum = currentRef.book === 'obs' ? currentRef.chapter : 1
  const frameNum = currentRef.book === 'obs' ? currentRef.verse : 1
  // Story mode: chapter navigation for OBS — show every frame of the current story.
  const isStoryMode = navigationMode === 'chapter' && currentRef.book === 'obs'

  // In story mode ignore endChapter entirely: always show only the current story.
  const endStory = isStoryMode
    ? storyNum
    : currentRef.book === 'obs' && currentRef.endChapter != null
      ? currentRef.endChapter
      : storyNum
  const endFrame = isStoryMode
    ? frameNum
    : currentRef.book === 'obs' && currentRef.endVerse != null
      ? currentRef.endVerse
      : frameNum

  const isRange = isStoryMode || endStory > storyNum || (endStory === storyNum && endFrame > frameNum)

  const { storyMap, loading, error } = useObsStories({
    resourceKey,
    storyNum,
    endStory,
    book: currentRef.book,
  })

  const { isPanel2QuoteCapable, obsQuotesState, quotesForFrame } = useObsFrameQuotes({
    resourceId,
    storyNum,
    frameNum,
    isRange,
  })

  const {
    activeHighlight,
    frameTextRef,
    activateWordSpan,
    toggleHighlightEntry,
    toggleRangeHighlight,
  } = useObsHighlight({
    resourceId,
    resourceKey,
    resourceLanguage: resource.language,
    book: currentRef.book,
    storyNum,
    frameNum,
    isRange,
    isPanel2QuoteCapable,
  })

  const story = storyMap[storyNum] ?? null
  const currentFrame =
    story?.frames.find((f) => f.frameNumber === frameNum) ?? story?.frames[0]

  const subtitle =
    currentRef.book === 'obs'
      ? isStoryMode
        ? `${storyNum}${story?.title ? ` — ${story.title}` : ''}`
        : isRange
          ? `${storyNum} · ${frameNum} – ${endStory} · ${endFrame}`
          : `${storyNum} · ${frameNum}${story?.title ? ` — ${story.title}` : ''}`
      : 'Select Open Bible Stories in the book navigator'

  const specs = useMemo(
    () =>
      !isRange
        ? quotesForFrame.map((q) => ({ quote: q.quote, occurrence: q.occurrence }))
        : [],
    [quotesForFrame, isRange]
  )

  const enrichedQuotes = useMemo(
    () =>
      currentFrame?.text && quotesForFrame.length
        ? enrichObsFrameQuoteEntries(currentFrame.text, quotesForFrame)
        : quotesForFrame,
    [currentFrame?.text, quotesForFrame]
  )

  const useWordUnderline =
    !isRange &&
    enrichedQuotes.length > 0 &&
    enrichedQuotes.every(
      (e) =>
        (e.startWord != null && e.endWord != null) ||
        (e.wordRanges != null && e.wordRanges.length > 0)
    )

  const spans = useMemo(() => {
    if (!currentFrame?.text) return []
    if (!quotesForFrame.length) return [{ text: currentFrame.text }]
    if (useWordUnderline) return computeFrameWordSpans(currentFrame.text, enrichedQuotes)
    return computeFrameSpans(currentFrame.text, specs)
  }, [currentFrame?.text, quotesForFrame.length, specs, useWordUnderline, enrichedQuotes])

  return (
    <div className="h-full flex flex-col">
      <ResourceViewerHeader
        title={resource.title || 'Open Bible Stories'}
        subtitle={subtitle}
        icon={BookMarked}
        direction="ltr"
      />
      <div className="flex-1 min-h-0 overflow-auto p-4 bg-white">
        {loading && (
          <LoadingSpinner
            centered
            label={isRange ? 'Loading stories' : 'Loading story'}
            className="text-blue-600"
            containerClassName="h-40"
          />
        )}
        {error && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-4">
            {error}
          </div>
        )}
        {!loading && !error && currentRef.book !== 'obs' && (
          <p className="text-gray-600 text-sm">
            Switch the navigation scope to <strong>Open Bible Stories</strong> and pick a story,
            or use the Bible / OBS tab in the book navigator.
          </p>
        )}

        {!loading && !error && currentRef.book === 'obs' && isRange && (
          <ObsRangeView
            storyNum={storyNum}
            endStory={endStory}
            frameNum={frameNum}
            endFrame={endFrame}
            isStoryMode={isStoryMode}
            storyMap={storyMap}
            isPanel2QuoteCapable={isPanel2QuoteCapable}
            obsQuotesState={obsQuotesState}
            activeHighlight={activeHighlight}
            activateWordSpan={activateWordSpan}
            toggleRangeHighlight={toggleRangeHighlight}
          />
        )}

        {!loading && !error && currentRef.book === 'obs' && !isRange && currentFrame && (
          <ObsSingleFrameView
            currentFrame={currentFrame}
            spans={spans}
            enrichedQuotes={enrichedQuotes}
            activeHighlight={activeHighlight}
            frameNum={frameNum}
            storyNum={storyNum}
            useWordUnderline={useWordUnderline}
            frameTextRef={frameTextRef}
            activateWordSpan={activateWordSpan}
            toggleHighlightEntry={toggleHighlightEntry}
          />
        )}

        {!loading && !error && currentRef.book === 'obs' && !isRange && story && !currentFrame && (
          <p className="text-amber-800 text-sm">
            No frame {frameNum} in this story (try another frame).
          </p>
        )}
      </div>
    </div>
  )
}

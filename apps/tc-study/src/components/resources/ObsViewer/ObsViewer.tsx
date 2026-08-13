/**
 * ObsViewer — Open Bible Stories viewer.
 * - Single frame: shows the current frame (interactivity / quote highlighting).
 * - Range: shows every frame from start to end across stories; image below text.
 */

import { BookMarked } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigationMode } from '../../../contexts'
import { resolvePaneDirection } from '../../../features/read/paneDirection'
import { resolveObsHighlightSpans } from '../../../lib/obs/resolveObsHighlightSpans'
import { useWizardStore } from '../../../lib/stores/wizardStore'
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
  const catalogManager = useCatalogManager()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(
    null
  )
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

  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager])

  const languageCode = resource.language ?? resource.languageCode ?? ''
  const languageDirection = resolvePaneDirection({
    languageCode,
    availableLanguages,
    catalogDirection: catalogMetadata?.languageDirection ?? resource.languageDirection,
  })

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

  const { spans, enriched: enrichedQuotes, useWordMode: useWordUnderline } = useMemo(
    () =>
      !isRange && currentFrame?.text
        ? resolveObsHighlightSpans(currentFrame.text, quotesForFrame)
        : { spans: [], enriched: quotesForFrame, useWordMode: false },
    [isRange, currentFrame?.text, quotesForFrame]
  )

  return (
    <div className="h-full flex flex-col" dir={languageDirection}>
      <ResourceViewerHeader
        title={resource.title || 'Open Bible Stories'}
        subtitle={subtitle}
        icon={BookMarked}
        direction={languageDirection}
        infoResource={resource}
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

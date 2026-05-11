/**
 * ObsViewer — Open Bible Stories viewer.
 * - Single frame: shows the current frame (interactivity / quote highlighting).
 * - Range: shows every frame from start to end across stories; image below text.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import clsx from 'clsx'
import { BookMarked } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCurrentState } from 'linked-panels'
import { useCatalogManager, useCurrentReference, useNavigation, useNavigationMode } from '../../../contexts'
import { useAppStore } from '../../../contexts/AppContext'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import { enrichObsFrameQuoteEntries } from '../../../lib/obs/enrichObsFrameQuotes'
import type { FrameSpan } from '../../../lib/obs/highlightFrameText'
import { computeFrameSpans } from '../../../lib/obs/highlightFrameText'
import { computeFrameWordSpans, overlappingEntriesForWordRange } from '../../../lib/obs/highlightFrameWords'
import type { ObsFrame, ParsedObsStory } from '../../../lib/obs/parseObsMarkdown'
import type { ObsFrameHighlightSignal, ObsFrameQuoteEntry, ObsFrameQuotesSignal } from '../../../signals/studioSignals'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { OBS_COMBINED_HELPS_RESOURCE_ID } from '../CombinedHelpsViewer/constants'

export interface ObsViewerProps {
  resourceId: string
  resourceKey: string
  resource: { title?: string; language?: string }
  isAnchor?: boolean
}

type ActiveHl = {
  quote?: string
  occurrence?: number
  rowId?: string
  frameNumber?: number
  wordIndex?: number
  overlappingSourceIds?: string[]
}

function sortedSourceIdsKey(ids: string[]): string {
  return [...ids].sort().join('\0')
}

function isObsEntryActive(a: ActiveHl | null, e: ObsFrameQuoteEntry, currentFrameNum: number): boolean {
  if (!a) return false
  if (a.frameNumber !== undefined && a.frameNumber !== currentFrameNum) return false
  if (a.overlappingSourceIds?.length) return a.overlappingSourceIds.includes(e.sourceId)
  if (a.quote === undefined || a.occurrence === undefined) return false
  if (a.quote !== e.quote || a.occurrence !== e.occurrence) return false
  if (a.rowId !== undefined && a.rowId !== e.sourceId) return false
  return true
}

/** Types (by resource type string or key suffix) that broadcast obs-frame-quotes. */
const OBS_QUOTE_CAPABLE_TYPES = new Set(['obs-notes', 'obs-words-links'])

export function ObsViewer({ resourceId, resourceKey, resource }: ObsViewerProps) {
  const catalogManager = useCatalogManager()
  const navigation = useNavigation()
  const currentRef = useCurrentReference()

  const navigationMode = useNavigationMode()
  const storyNum = currentRef.book === 'obs' ? currentRef.chapter : 1
  const frameNum = currentRef.book === 'obs' ? currentRef.verse : 1
  // Story mode: chapter navigation for OBS — show every frame of the current story.
  // The reference is a single frame (verse=1, no endVerse), but we display all frames.
  const isStoryMode = navigationMode === 'chapter' && currentRef.book === 'obs'

  // In story mode ignore endChapter entirely: always show only the current story.
  // Carrying over a stale endChapter (e.g. from a previous range) would make the
  // effect load multiple stories on every arrow click, cascading store updates.
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

  // Multi-frame view is active either for a cross-frame/cross-story range, or story mode.
  const isRange = isStoryMode || endStory > storyNum || (endStory === storyNum && endFrame > frameNum)

  // Map of story number → loaded story (holds all stories in range)
  const [storyMap, setStoryMap] = useState<Record<number, ParsedObsStory>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeHighlight, setActiveHighlight] = useState<ActiveHl | null>(null)

  const frameTextRef = useRef<HTMLDivElement>(null)

  // Stable ref to navigation actions — prevents the load effect from re-running on
  // every setObsStoryFrameCount call (Immer recreates the store object each time,
  // which would change the `navigation` reference and re-trigger the effect in a loop).
  const navigationActionsRef = useRef(navigation)
  useEffect(() => {
    navigationActionsRef.current = navigation
  })

  // Companion panel quote-capability detection (for single-frame highlighting)
  const panel2ActiveKey = useWorkspaceStore((s) => {
    const panel = s.currentPackage?.panels.find((p) => p.id === 'panel-2')
    if (!panel?.resourceKeys?.length) return null
    return panel.resourceKeys[panel.activeIndex ?? 0] ?? null
  })
  const loadedResources = useAppStore((s) => s.loadedResources)

  const isPanel2QuoteCapable = useMemo(() => {
    if (!panel2ActiveKey) return false
    if (panel2ActiveKey === OBS_COMBINED_HELPS_RESOURCE_ID) return true
    const type = String(loadedResources[panel2ActiveKey]?.type ?? '')
    if (OBS_QUOTE_CAPABLE_TYPES.has(type)) return true
    const idSegment = panel2ActiveKey.split('/')[2] ?? ''
    return (
      idSegment === 'obs-tn' ||
      idSegment === 'obs-twl' ||
      idSegment.startsWith('obs-tn') ||
      idSegment.startsWith('obs-twl')
    )
  }, [panel2ActiveKey, loadedResources])

  const obsQuotesState = useCurrentState<ObsFrameQuotesSignal>(
    resourceId,
    'current-obs-frame-quotes'
  ) as ObsFrameQuotesSignal | null | undefined

  const quotesForFrame: ObsFrameQuoteEntry[] = useMemo(() => {
    if (isRange || !isPanel2QuoteCapable) return []
    const s = obsQuotesState
    if (!s || s.quotes === undefined) return []
    if (s.storyNumber !== storyNum || s.frameNumber !== frameNum) return []
    return s.quotes
  }, [obsQuotesState, storyNum, frameNum, isPanel2QuoteCapable, isRange])

  const resourceMetadata = useMemo(
    () => ({
      type: 'obs' as const,
      language: resource.language || '',
      tags: ['obs'],
    }),
    [resource.language]
  )

  const { sendToAll: sendObsHighlight } = useSignal<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    resourceMetadata
  )

  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (currentRef.book !== 'obs') { setActiveHighlight(null); return }
        if (!signal.highlight) { setActiveHighlight(null); return }
        const h = signal.highlight
        if (h.storyNumber !== storyNum) return
        // In range/story mode accept any frame in the current story; in single-frame mode require exact match
        if (!isRange && h.frameNumber !== frameNum) return
        if (h.overlappingSourceIds?.length) {
          setActiveHighlight({
            overlappingSourceIds: h.overlappingSourceIds,
            wordIndex: h.wordIndex,
            frameNumber: h.frameNumber,
            quote: h.quote,
            occurrence: h.occurrence,
            rowId: h.rowId,
          })
          return
        }
        if (h.quote !== undefined && h.occurrence !== undefined) {
          setActiveHighlight({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId, frameNumber: h.frameNumber })
        }
      },
      [resourceId, currentRef.book, storyNum, frameNum, isRange]
    ),
    { debug: false, resourceMetadata }
  )

  useEffect(() => {
    setActiveHighlight(null)
  }, [storyNum, frameNum, resourceKey])

  useEffect(() => {
    if (!isPanel2QuoteCapable) setActiveHighlight(null)
  }, [isPanel2QuoteCapable])

  // Load all stories in range (or just the single story)
  useEffect(() => {
    if (currentRef.book !== 'obs') {
      setStoryMap({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const storiesToLoad: number[] = []
    for (let s = storyNum; s <= endStory; s++) storiesToLoad.push(s)

    void Promise.all(
      storiesToLoad.map((num) =>
        catalogManager
          .loadContent(resourceKey, String(num))
          .then((content) => ({ num, story: content as ParsedObsStory }))
      )
    )
      .then((results) => {
        if (cancelled) return
        const map: Record<number, ParsedObsStory> = {}
        for (const { num, story } of results) {
          map[num] = story
          navigationActionsRef.current.setObsStoryFrameCount(num, story.frames.length)
        }
        setStoryMap(map)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setStoryMap({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  // `navigation` excluded from deps — see navigationActionsRef comment above.
  // `endFrame`/`frameNum` excluded — they only affect which frames to show,
  // not which stories to load (the story content is the same regardless).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceKey, storyNum, endStory, currentRef.book, catalogManager])

  // Derived: first story + current frame for single-frame mode
  const story = storyMap[storyNum] ?? null
  const currentFrame =
    story?.frames.find((f) => f.frameNumber === frameNum) ?? story?.frames[0]

  const subtitle = currentRef.book === 'obs'
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

  const activateWordSpan = useCallback(
    (span: FrameSpan, sNum: number, fNum: number, enriched: ObsFrameQuoteEntry[]) => {
      if (span.startWord == null || span.endWord == null || span.quoteIndex == null) return
      const entry = enriched[span.quoteIndex]
      if (!entry) return
      const overlap = overlappingEntriesForWordRange(enriched, span.startWord, span.endWord)
      const ids = [...new Set(overlap.map((e) => e.sourceId))]
      const samePick =
        activeHighlight &&
        (activeHighlight.frameNumber ?? fNum) === fNum &&
        activeHighlight.wordIndex === span.startWord &&
        sortedSourceIdsKey(activeHighlight.overlappingSourceIds ?? []) === sortedSourceIdsKey(ids)
      if (samePick) {
        sendObsHighlight({ lifecycle: 'event', highlight: null })
        setActiveHighlight(null)
        return
      }
      sendObsHighlight({
        lifecycle: 'event',
        highlight: {
          storyNumber: sNum,
          frameNumber: fNum,
          wordIndex: span.startWord,
          overlappingSourceIds: ids,
          quote: entry.quote,
          occurrence: entry.occurrence,
          rowId: entry.sourceId,
          kind: entry.kind,
        },
      })
      setActiveHighlight({
        wordIndex: span.startWord,
        overlappingSourceIds: ids,
        frameNumber: fNum,
        quote: entry.quote,
        occurrence: entry.occurrence,
        rowId: entry.sourceId,
      })
    },
    [activeHighlight, sendObsHighlight]
  )

  // Single-frame toggle (substring mode when word enrichment is incomplete)
  const toggleHighlightEntry = useCallback(
    (entry: ObsFrameQuoteEntry) => {
      const matchesActive =
        !!activeHighlight &&
        !activeHighlight.overlappingSourceIds?.length &&
        isObsEntryActive(activeHighlight, entry, frameNum)
      if (matchesActive) {
        sendObsHighlight({ lifecycle: 'event', highlight: null })
        setActiveHighlight(null)
        return
      }
      sendObsHighlight({
        lifecycle: 'event',
        highlight: {
          storyNumber: storyNum,
          frameNumber: frameNum,
          quote: entry.quote,
          occurrence: entry.occurrence,
          rowId: entry.sourceId,
          kind: entry.kind,
        },
      })
      setActiveHighlight({ quote: entry.quote, occurrence: entry.occurrence, rowId: entry.sourceId, frameNumber: frameNum })
    },
    [activeHighlight, frameNum, sendObsHighlight, storyNum]
  )

  // Range/story-mode toggle (substring mode)
  const toggleRangeHighlight = useCallback(
    (sNum: number, frameNumber: number, entry: ObsFrameQuoteEntry) => {
      const matchesActive =
        !!activeHighlight &&
        !activeHighlight.overlappingSourceIds?.length &&
        isObsEntryActive(activeHighlight, entry, frameNumber)
      if (matchesActive) {
        sendObsHighlight({ lifecycle: 'event', highlight: null })
        setActiveHighlight(null)
        return
      }
      sendObsHighlight({
        lifecycle: 'event',
        highlight: {
          storyNumber: sNum,
          frameNumber,
          quote: entry.quote,
          occurrence: entry.occurrence,
          rowId: entry.sourceId,
          kind: entry.kind,
        },
      })
      setActiveHighlight({
        quote: entry.quote,
        occurrence: entry.occurrence,
        rowId: entry.sourceId,
        frameNumber,
      })
    },
    [activeHighlight, sendObsHighlight]
  )

  const quoteButtonActiveClass =
    'bg-yellow-100 underline decoration-dotted decoration-amber-500 decoration-1 underline-offset-2 rounded-sm'
  const quoteButtonIdleClass =
    'underline decoration-dotted decoration-gray-400 decoration-1 underline-offset-2 hover:bg-gray-100/60 rounded-sm'

  useLayoutEffect(() => {
    if (!activeHighlight) return
    // Works for both single-frame (frameTextRef) and range/story mode (document-wide search)
    const root = frameTextRef.current ?? document.documentElement
    const el = root.querySelector('[data-obs-quote-active="true"]')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeHighlight])

  function isEntryActive(entry: ObsFrameQuoteEntry): boolean {
    return isObsEntryActive(activeHighlight, entry, frameNum)
  }

  return (
    <div className="h-full flex flex-col">
      <ResourceViewerHeader
        title={resource.title || 'Open Bible Stories'}
        subtitle={subtitle}
        icon={BookMarked}
        direction="ltr"
      />
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            Loading{isRange ? ' stories' : ' story'}…
          </div>
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

        {/* ── Range view: all frames from start to end ── */}
        {!loading && !error && currentRef.book === 'obs' && isRange && (
          <div className="max-w-2xl mx-auto space-y-10">
            {Array.from({ length: endStory - storyNum + 1 }, (_, i) => storyNum + i).map((sNum) => {
              const storyData = storyMap[sNum]
              if (!storyData) {
                return (
                  <div key={sNum} className="text-gray-400 text-sm italic">
                    Loading story {sNum}…
                  </div>
                )
              }

              const framesInRange: ObsFrame[] = isStoryMode
                ? storyData.frames  // all frames — no start/end clipping in story mode
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
                      const frameSpecs = frameEntries.map((q) => ({ quote: q.quote, occurrence: q.occurrence }))
                      const frameEnriched =
                        frameEntries.length > 0 ? enrichObsFrameQuoteEntries(frame.text, frameEntries) : frameEntries
                      const frameWordMode =
                        frameEntries.length > 0 &&
                        frameEnriched.every((e) => e.startWord != null && e.endWord != null)
                      const frameSpans =
                        frameSpecs.length > 0
                          ? frameWordMode
                            ? computeFrameWordSpans(frame.text, frameEnriched)
                            : computeFrameSpans(frame.text, frameSpecs)
                          : null
                      return (
                        <div key={frame.frameNumber} className="space-y-3">
                          <p className="text-xs text-gray-400 font-medium">
                            {sNum} · {frame.frameNumber}
                          </p>
                          {frameSpans ? (
                            <div className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                              {frameSpans.map((span, idx) => {
                                if (span.quoteIndex === undefined) {
                                  return <span key={`t-${idx}`}>{span.text}</span>
                                }
                                const entry = frameEnriched[span.quoteIndex]
                                if (!entry) return <span key={`t-${idx}`}>{span.text}</span>
                                const active =
                                  isObsEntryActive(activeHighlight, entry, frame.frameNumber) ||
                                  !!(span.parentQuoteIndices?.some((pqi) => {
                                    const pe = frameEnriched[pqi]
                                    return pe ? isObsEntryActive(activeHighlight, pe, frame.frameNumber) : false
                                  }))
                                return (
                                  <button
                                    key={`t-${idx}`}
                                    type="button"
                                    data-obs-quote-active={active ? 'true' : undefined}
                                    className={clsx(
                                      'inline align-baseline cursor-pointer px-px font-inherit text-inherit whitespace-pre-wrap transition-colors',
                                      active ? quoteButtonActiveClass : quoteButtonIdleClass
                                    )}
                                    onClick={() =>
                                      frameWordMode &&
                                      span.startWord != null &&
                                      span.endWord != null &&
                                      span.quoteIndex != null
                                        ? activateWordSpan(span, sNum, frame.frameNumber, frameEnriched)
                                        : toggleRangeHighlight(sNum, frame.frameNumber, entry)
                                    }
                                  >
                                    {span.text}
                                  </button>
                                )
                              })}
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
        )}

        {/* ── Single-frame view ── */}
        {!loading && !error && currentRef.book === 'obs' && !isRange && currentFrame && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div
              ref={frameTextRef}
              className="prose prose-base max-w-none text-gray-900 whitespace-pre-wrap leading-relaxed"
            >
              {spans.map((span, idx) => {
                if (span.quoteIndex === undefined) {
                  return <span key={`t-${idx}`}>{span.text}</span>
                }
                const entry = enrichedQuotes[span.quoteIndex]
                if (!entry) return <span key={`t-${idx}`}>{span.text}</span>
                const active =
                  isEntryActive(entry) ||
                  (span.parentQuoteIndices?.some((pqi) => {
                    const parentEntry = enrichedQuotes[pqi]
                    return parentEntry ? isObsEntryActive(activeHighlight, parentEntry, frameNum) : false
                  }) ?? false)
                return (
                  <button
                    key={`t-${idx}`}
                    type="button"
                    data-obs-quote-active={active ? 'true' : undefined}
                    className={clsx(
                      'inline align-baseline cursor-pointer px-px font-inherit text-inherit whitespace-pre-wrap transition-colors',
                      active ? quoteButtonActiveClass : quoteButtonIdleClass
                    )}
                    onClick={() =>
                      useWordUnderline &&
                      span.startWord != null &&
                      span.endWord != null &&
                      span.quoteIndex != null
                        ? activateWordSpan(span, storyNum, frameNum, enrichedQuotes)
                        : toggleHighlightEntry(entry)
                    }
                  >
                    {span.text}
                  </button>
                )
              })}
            </div>
            {(currentFrame.resolvedSrc || currentFrame.imageUrl) ? (
              <img
                src={currentFrame.resolvedSrc || currentFrame.imageUrl}
                alt=""
                className="w-full rounded-lg border border-gray-200 shadow-sm bg-gray-50"
                loading="lazy"
              />
            ) : null}
          </div>
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

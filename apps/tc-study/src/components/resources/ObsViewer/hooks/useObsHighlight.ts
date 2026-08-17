import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FrameSpan } from '../../../../lib/obs/highlightFrameText'
import { overlappingEntriesForWordRange } from '../../../../lib/obs/highlightFrameWords'
import type {
  ObsFrameHighlightSignal,
  ObsFrameQuoteEntry,
  VerseFilterSignal,
} from '../../../../signals/studioSignals'
import type { ActiveHl } from '../types'
import {
  isObsEntryActive,
  obsFrameFilterFromHelpsPayload,
  obsFrameVerseFilter,
  scrollObsFrameIntoView,
  sortedSourceIdsKey,
  type ObsVerseFilterRef,
} from '../obsHighlightHelpers'

export function useObsHighlight(params: {
  resourceId: string
  resourceKey: string
  resourceLanguage: string | undefined
  book: string
  storyNum: number
  frameNum: number
  isRange: boolean
  isPanel2QuoteCapable: boolean
}) {
  const {
    resourceId,
    resourceKey,
    resourceLanguage,
    book,
    storyNum,
    frameNum,
    isRange,
    isPanel2QuoteCapable,
  } = params

  const [activeHighlight, setActiveHighlight] = useState<ActiveHl | null>(null)
  const [activeFrameFilter, setActiveFrameFilter] = useState<ObsVerseFilterRef | null>(null)
  const frameTextRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const pendingFrameScrollRef = useRef(false)

  const resourceMetadata = {
    type: 'obs' as const,
    language: resourceLanguage || '',
    tags: ['obs'],
  }

  const { sendToAll: sendObsHighlight } = useSignal<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    resourceMetadata
  )
  const { sendToAll: sendVerseFilter } = useSignal<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    resourceMetadata
  )

  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (book !== 'obs') {
          setActiveHighlight(null)
          return
        }
        if (!signal.highlight) {
          setActiveHighlight(null)
          return
        }
        const h = signal.highlight
        const frameFilter = obsFrameFilterFromHelpsPayload(h)
        if (frameFilter) {
          pendingFrameScrollRef.current = true
          setActiveFrameFilter(frameFilter)
        }
        if (h.storyNumber !== storyNum) return
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
          setActiveHighlight({
            quote: h.quote,
            occurrence: h.occurrence,
            rowId: h.rowId,
            frameNumber: h.frameNumber,
          })
        }
      },
      [resourceId, book, storyNum, frameNum, isRange]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (signal.filter === null || signal.filter.verse === undefined) {
          setActiveFrameFilter(null)
          return
        }
        pendingFrameScrollRef.current = true
        setActiveFrameFilter({
          chapter: signal.filter.chapter,
          verse: signal.filter.verse,
        })
      },
      [resourceId]
    ),
    { debug: false, resourceMetadata }
  )

  useEffect(() => {
    setActiveHighlight(null)
    setActiveFrameFilter(null)
  }, [storyNum, frameNum, resourceKey])

  useEffect(() => {
    if (!isPanel2QuoteCapable) setActiveHighlight(null)
  }, [isPanel2QuoteCapable])

  useLayoutEffect(() => {
    if (!activeHighlight) return
    const root = frameTextRef.current ?? paneRef.current ?? document.documentElement
    const el = root.querySelector('[data-obs-quote-active="true"]')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeHighlight])

  useLayoutEffect(() => {
    if (!activeFrameFilter || !pendingFrameScrollRef.current) return
    pendingFrameScrollRef.current = false
    scrollObsFrameIntoView(paneRef.current, activeFrameFilter)
  }, [activeFrameFilter])

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
      setActiveHighlight({
        quote: entry.quote,
        occurrence: entry.occurrence,
        rowId: entry.sourceId,
        frameNumber: frameNum,
      })
    },
    [activeHighlight, frameNum, sendObsHighlight, storyNum]
  )

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

  const selectFrame = useCallback(
    (sNum: number, fNum: number) => {
      const filter = obsFrameVerseFilter(sNum, fNum)
      sendVerseFilter({ lifecycle: 'event', filter })
      setActiveFrameFilter(filter)
    },
    [sendVerseFilter]
  )

  return {
    activeHighlight,
    activeFrameFilter,
    frameTextRef,
    paneRef,
    activateWordSpan,
    toggleHighlightEntry,
    toggleRangeHighlight,
    selectFrame,
  }
}

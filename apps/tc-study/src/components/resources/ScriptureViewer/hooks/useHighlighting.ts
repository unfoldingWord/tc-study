import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { UsjWordToken } from '@bt-synergy/scripture-loader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentReference, useNavigationStore } from '../../../../contexts'
import {
  getPersistedHelpsHighlight,
  isHelpsHighlightApplied,
  markHelpsHighlightApplied,
  parseTokenVerseRef,
  persistHelpsHighlight,
  replayHelpsHighlight,
  resolveVisibleHelpsHighlight,
  shouldApplyHelpsHighlightOnTokensReady,
  shouldClearHelpsHighlightOnTokenNull,
  shouldClearHelpsHighlightOnVerseFilter,
  shouldNavigateToHelpsHighlight,
  subscribeHelpsHighlightPersist,
} from '../../../../features/helps/helpsCardScriptureNav'
import { getChapterScrollActivity } from '../../../../features/nav/chapterScrollActivity'
import {
  markScripturePerfEnd,
  markScripturePerfStart,
} from '../../../../features/perf/scripturePerf'
import { markReadNavigationInternal } from '../../../../features/read/replaceReadUrlFromUi'
import {
  rawSemanticIdForToken,
  type InternedToken,
} from '../../../../features/scripture/scripturePreparer'
import type { TokenClickSignal, VerseFilterSignal } from '../../../../signals/studioSignals'
import type { OriginalLanguageToken } from '../types'
import { foldHighlightTarget, tokenMatchesHighlightTarget } from '../utils/tokenHighlight'
import { semanticIdKey } from '../utils/wordIdentity'

function targetFromSignalToken(
  token: NonNullable<TokenClickSignal['token']>
): OriginalLanguageToken {
  return foldHighlightTarget({
    semanticId: token.semanticId,
    alignedSemanticIds: token.alignedSemanticIds,
    content: token.content,
    verseRef: token.verseRef,
    strong: token.strong,
    lemma: token.lemma,
    morph: token.morph,
  })!
}

/** Rebuild a UsjWordToken from an InternedToken at click time. */
export function usjWordFromInterned(
  verseRef: string,
  token: InternedToken,
  matchKeys: readonly string[]
): UsjWordToken {
  return {
    semanticId: rawSemanticIdForToken(verseRef, token),
    content: token.c,
    occurrence: token.o,
    totalOccurrences: 1,
    verseRef,
    alignedOriginalWordIds: (token.a ?? [])
      .map((i) => matchKeys[i])
      .filter((id): id is string => typeof id === 'string'),
  }
}

export function useHighlighting(
  resourceId: string,
  language?: string,
  underlinedSemanticIds?: Set<string>,
  tokensReady = false,
) {
  const currentRef = useCurrentReference()

  const resourceMetadata = {
    type: 'scripture' as const,
    language: language || 'en',
    tags: ['bible'],
  }

  const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId, resourceMetadata)
  const { sendToAll: sendVerseFilter } = useSignal<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    resourceMetadata
  )

  const [highlightTarget, setHighlightTarget] = useState<OriginalLanguageToken | null>(() => {
    // Restore IDs even before tokens exist — remount must not drop the click.
    const persisted = resolveVisibleHelpsHighlight({
      visibleBook: currentRef.book,
      visibleChapter: currentRef.chapter,
      tokensReady: false,
    })
    return persisted ? foldHighlightTarget({ ...persisted }) : null
  })
  const currentRefRef = useRef(currentRef)
  currentRefRef.current = currentRef
  const underlinedRef = useRef(underlinedSemanticIds)
  underlinedRef.current = underlinedSemanticIds
  const highlightTargetRef = useRef(highlightTarget)
  highlightTargetRef.current = highlightTarget
  const tokensReadyRef = useRef(tokensReady)
  tokensReadyRef.current = tokensReady
  /** True when the active selection also owns a scripture-driven verse filter (uncovered click). */
  const ownsVerseFilterRef = useRef(false)

  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal) => {
      if (signal.sourceResourceId === resourceId) return
      markScripturePerfStart('highlight-signal')
      if (signal.token === null) {
        if (!shouldClearHelpsHighlightOnTokenNull()) {
          markScripturePerfEnd('highlight-signal')
          return
        }
        ownsVerseFilterRef.current = false
        persistHelpsHighlight(null)
        setHighlightTarget(null)
        markScripturePerfEnd('highlight-signal')
        return
      }
      const live = currentRefRef.current
      const target = parseTokenVerseRef(signal.token.verseRef)
      const pending = getPersistedHelpsHighlight()
      const samePending =
        Boolean(pending) &&
        pending!.verseRef === signal.token.verseRef &&
        pending!.semanticId === signal.token.semanticId
      const alreadyApplied = isHelpsHighlightApplied()
      const needsNav = Boolean(
        target &&
          shouldNavigateToHelpsHighlight({
            current: live,
            target,
            userScrolling: getChapterScrollActivity().unsettled,
            highlightAlreadyApplied: alreadyApplied && samePending,
          })
      )
      if (target && needsNav) {
        markReadNavigationInternal()
        useNavigationStore.getState().navigateToReference({
          book: target.book || live.book,
          chapter: target.chapter,
          verse: target.verse,
        })
      }
      // Same persist click already wrote the row — do not bump epoch / un-apply
      // (that would look like a new click and re-scroll).
      if (!samePending) persistHelpsHighlight(signal.token)
      // Same-chapter: paint now. Off-chapter: keep IDs in state; replay when tokens land.
      setHighlightTarget(targetFromSignalToken(signal.token))
      markScripturePerfEnd('highlight-signal')
    }, [resourceId]),
    { debug: false, resourceMetadata }
  )

  useEffect(() => {
    let raf = 0
    let attempts = 0
    const replay = () => {
      const live = currentRefRef.current
      const matching = replayHelpsHighlight({
        visibleBook: live.book,
        visibleChapter: live.chapter,
        tokensReady: tokensReadyRef.current,
      })
      const persisted =
        matching ??
        resolveVisibleHelpsHighlight({
          visibleBook: live.book,
          visibleChapter: live.chapter,
          tokensReady: tokensReadyRef.current,
        })
      if (!persisted) return
      setHighlightTarget(foldHighlightTarget({ ...persisted }))
      if (
        matching &&
        shouldApplyHelpsHighlightOnTokensReady({
          tokensReady: tokensReadyRef.current,
        }) &&
        !isHelpsHighlightApplied()
      ) {
        markHelpsHighlightApplied(live.book, live.chapter)
        return
      }
      if (isHelpsHighlightApplied()) return
      if (attempts++ < 24) {
        raf = window.requestAnimationFrame(replay)
      }
    }
    replay()
    const unsubscribe = subscribeHelpsHighlightPersist(() => {
      attempts = 0
      replay()
    })
    return () => {
      unsubscribe()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [currentRef.book, currentRef.chapter, tokensReady])

  const handleTokenClick = useCallback(
    (token: UsjWordToken) => {
      try {
        const currentRefSnapshot = currentRefRef.current
        const underlinedSnapshot = underlinedRef.current
        const { semanticId, verseRef, content: tokenContent } = token
        const alignedSemanticIds =
          token.alignedOriginalWordIds.length > 0
            ? [...token.alignedOriginalWordIds]
            : undefined

        // Toggle-off: clicking the active highlight clears selection + owned filters.
        if (tokenMatchesHighlightTarget(token, highlightTargetRef.current)) {
          persistHelpsHighlight(null)
          setHighlightTarget(null)
          sendToAll({ lifecycle: 'event', token: null })
          if (ownsVerseFilterRef.current) {
            sendVerseFilter({ lifecycle: 'event', filter: null })
            ownsVerseFilterRef.current = false
          }
          return
        }

        const tokenKey = semanticIdKey(semanticId)
        const alignedKeys = alignedSemanticIds?.map(semanticIdKey) ?? []
        const hasCoverage =
          underlinedSnapshot && underlinedSnapshot.size > 0
            ? underlinedSnapshot.has(tokenKey) ||
              alignedKeys.some((k) => underlinedSnapshot.has(k))
            : false

        const effectiveAlignedIds = alignedSemanticIds ?? [semanticId]

        const next = foldHighlightTarget({
          semanticId,
          content: tokenContent,
          verseRef,
          alignedSemanticIds: effectiveAlignedIds,
        })
        persistHelpsHighlight(next)
        setHighlightTarget(next)

        ownsVerseFilterRef.current = !hasCoverage

        sendToAll({
          lifecycle: 'event',
          token: {
            id: semanticId,
            content: tokenContent,
            semanticId,
            verseRef,
            position: 0,
            alignedSemanticIds: effectiveAlignedIds,
            hasHelpsCoverage: hasCoverage,
          },
        })

        if (!hasCoverage) {
          const refMatch = verseRef.match(/\w+\s+(\d+):(\d+)/)
          const chapter = refMatch ? parseInt(refMatch[1], 10) : currentRefSnapshot.chapter
          const verse = refMatch ? parseInt(refMatch[2], 10) : undefined
          sendVerseFilter({ lifecycle: 'event', filter: { chapter, verse } })
        }
      } catch (error) {
        console.error('❌ Error in handleTokenClick:', error)
      }
    },
    [sendToAll, sendVerseFilter]
  )

  const handleInternedTokenClick = useCallback(
    (verseRef: string, token: InternedToken, matchKeys: readonly string[]) => {
      handleTokenClick(usjWordFromInterned(verseRef, token, matchKeys))
    },
    [handleTokenClick]
  )

  const handleVerseFilter = useCallback(
    (chapter: number, verse?: number) => {
      const pending = getPersistedHelpsHighlight()
      if (
        shouldClearHelpsHighlightOnVerseFilter({
          highlightVerseRef: pending?.verseRef ?? highlightTargetRef.current?.verseRef,
          visibleChapter: currentRefRef.current.chapter,
          tokensReady: tokensReadyRef.current,
        })
      ) {
        persistHelpsHighlight(null)
        setHighlightTarget(null)
      }
      ownsVerseFilterRef.current = false
      sendVerseFilter({ lifecycle: 'event', filter: { chapter, verse } })
    },
    [sendVerseFilter]
  )

  return {
    highlightTarget,
    selectedTokenId: highlightTarget?.semanticId || null,
    handleTokenClick,
    handleInternedTokenClick,
    handleVerseFilter,
  }
}
